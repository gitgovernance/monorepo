/**
 * GitHubProjectInitializer Unit Tests
 *
 * Tests the seventh sibling of @gitgov/core/github against the
 * github_project_initializer blueprint (GPI01-GPI13).
 *
 * Tests mock IGitModule and ConfigStore directly — this keeps the suite
 * isolated from Octokit/network details. The real Octokit interaction is
 * exercised indirectly through github_git_module.test.ts and
 * github_config_store.test.ts.
 */

import { GitHubProjectInitializer } from './github_project_initializer';
import type { IGitModule, CommitAuthor } from '../../git';
import type { ConfigStore } from '../../config_store';
import type { GitGovConfig } from '../../config_manager';

// ==================== Mock Helpers ====================

type MockGitModule = {
  [K in keyof IGitModule]: jest.MockedFunction<IGitModule[K] extends (...args: infer A) => infer R ? (...args: A) => R : never>;
};

function createMockGitModule(): MockGitModule {
  return {
    exec: jest.fn(),
    init: jest.fn(),
    getRepoRoot: jest.fn(),
    getCurrentBranch: jest.fn(),
    getCommitHash: jest.fn(),
    setConfig: jest.fn(),
    getMergeBase: jest.fn(),
    getChangedFiles: jest.fn(),
    getStagedFiles: jest.fn(),
    getFileContent: jest.fn(),
    getCommitHistory: jest.fn(),
    getCommitHistoryRange: jest.fn(),
    getCommitMessage: jest.fn(),
    hasUncommittedChanges: jest.fn(),
    isRebaseInProgress: jest.fn(),
    branchExists: jest.fn(),
    listRemoteBranches: jest.fn(),
    isRemoteConfigured: jest.fn(),
    getBranchRemote: jest.fn(),
    getConflictedFiles: jest.fn(),
    checkoutBranch: jest.fn(),
    stash: jest.fn(),
    stashPop: jest.fn(),
    stashDrop: jest.fn(),
    checkoutOrphanBranch: jest.fn(),
    fetch: jest.fn(),
    pull: jest.fn(),
    pullRebase: jest.fn(),
    resetHard: jest.fn(),
    checkoutFilesFromBranch: jest.fn(),
    add: jest.fn(),
    rm: jest.fn(),
    commit: jest.fn(),
    commitAllowEmpty: jest.fn(),
    push: jest.fn(),
    pushWithUpstream: jest.fn(),
    setUpstream: jest.fn(),
    rebaseContinue: jest.fn(),
    rebaseAbort: jest.fn(),
    createBranch: jest.fn(),
    deleteBranch: jest.fn(),
    rebase: jest.fn(),
  } as unknown as MockGitModule;
}

type MockConfigStore = {
  loadConfig: jest.MockedFunction<() => Promise<GitGovConfig | null>>;
  saveConfig: jest.MockedFunction<(config: GitGovConfig) => Promise<unknown>>;
};

function createMockConfigStore(): MockConfigStore {
  return {
    loadConfig: jest.fn(),
    saveConfig: jest.fn(),
  };
}

const FIXTURE_CONFIG: GitGovConfig = {
  protocolVersion: '1.0',
  projectId: 'myorg/myrepo',
  projectName: 'myrepo',
  rootCycle: 'cycle-001',
  saasUrl: 'https://example.com',
  state: { branch: 'gitgov-state' },
};

function createInitializer(
  gitModule: MockGitModule,
  configStore: MockConfigStore,
  overrides: Partial<{
    branch: string;
    basePath: string;
    commitMessage: string;
    commitAuthor: CommitAuthor;
  }> = {},
): GitHubProjectInitializer {
  return new GitHubProjectInitializer(
    gitModule as unknown as IGitModule,
    configStore as unknown as ConfigStore<unknown>,
    {
      owner: 'myorg',
      repo: 'myrepo',
      ...overrides,
    },
  );
}

// ==================== Tests ====================

describe('GitHubProjectInitializer', () => {
  let gitModule: MockGitModule;
  let configStore: MockConfigStore;

  beforeEach(() => {
    gitModule = createMockGitModule();
    configStore = createMockConfigStore();
  });

  describe('4.2. Branch Management + Staging (GPI01-GPI03)', () => {
    it('[GPI01] should create branch and set branchCreatedByThisInit flag', async () => {
      gitModule.branchExists.mockResolvedValue(false);
      const initializer = createInitializer(gitModule, configStore);

      await initializer.createProjectStructure();

      expect(gitModule.branchExists).toHaveBeenCalledWith('gitgov-state');
      expect(gitModule.createBranch).toHaveBeenCalledWith('gitgov-state', undefined);

      // Verify rollback deletes the branch (flag must have been set)
      await initializer.rollback();
      expect(gitModule.deleteBranch).toHaveBeenCalledWith('gitgov-state');
    });

    it('[GPI02] should skip createBranch when branch already exists', async () => {
      gitModule.branchExists.mockResolvedValue(true);
      const initializer = createInitializer(gitModule, configStore);

      await initializer.createProjectStructure();

      expect(gitModule.branchExists).toHaveBeenCalledWith('gitgov-state');
      expect(gitModule.createBranch).not.toHaveBeenCalled();

      // Verify rollback is a no-op (flag was never set)
      await initializer.rollback();
      expect(gitModule.deleteBranch).not.toHaveBeenCalled();
    });

    it('[GPI03] should stage policy.yml with default content in gitModule buffer', async () => {
      gitModule.branchExists.mockResolvedValue(true);
      const initializer = createInitializer(gitModule, configStore);

      await initializer.createProjectStructure();

      expect(gitModule.add).toHaveBeenCalledWith(
        ['.gitgov/policy.yml'],
        {
          contentMap: { '.gitgov/policy.yml': 'version: "1.0"\nfailOn: critical\n' },
        },
      );
    });
  });

  describe('4.3. Rollback Simétrico (GPI04)', () => {
    it('[GPI04] should call deleteBranch and reset flag when branch was created', async () => {
      gitModule.branchExists.mockResolvedValue(false);
      const initializer = createInitializer(gitModule, configStore);

      await initializer.createProjectStructure();
      await initializer.rollback();

      expect(gitModule.deleteBranch).toHaveBeenCalledWith('gitgov-state');
      expect(gitModule.deleteBranch).toHaveBeenCalledTimes(1);

      // Second rollback should be a no-op (flag was reset)
      await initializer.rollback();
      expect(gitModule.deleteBranch).toHaveBeenCalledTimes(1);
    });

    it('[GPI04] should be no-op when branch preexisted (flag false)', async () => {
      gitModule.branchExists.mockResolvedValue(true);
      const initializer = createInitializer(gitModule, configStore);

      await initializer.createProjectStructure();
      await initializer.rollback();

      expect(gitModule.deleteBranch).not.toHaveBeenCalled();
    });
  });

  describe('4.4. Staging de Config + Lectura (GPI05-GPI06)', () => {
    it('[GPI05] should stage config.json with JSON.stringify(config, null, 2)', async () => {
      const initializer = createInitializer(gitModule, configStore);

      await initializer.writeConfig(FIXTURE_CONFIG);

      const expectedContent = JSON.stringify(FIXTURE_CONFIG, null, 2);
      expect(gitModule.add).toHaveBeenCalledWith(
        ['.gitgov/config.json'],
        {
          contentMap: { '.gitgov/config.json': expectedContent },
        },
      );
    });

    it('[GPI05] should NOT call configStore.saveConfig to avoid immediate commit', async () => {
      const initializer = createInitializer(gitModule, configStore);

      await initializer.writeConfig(FIXTURE_CONFIG);

      expect(configStore.saveConfig).not.toHaveBeenCalled();
    });

    it('[GPI06] should delegate readFile to gitModule.getFileContent with branch', async () => {
      gitModule.getFileContent.mockResolvedValue('file contents');
      const initializer = createInitializer(gitModule, configStore);

      const result = await initializer.readFile('.gitgov/config.json');

      expect(result).toBe('file contents');
      expect(gitModule.getFileContent).toHaveBeenCalledWith(
        'gitgov-state',
        '.gitgov/config.json',
      );
    });
  });

  describe('4.5. Remote-Agnostic No-ops (GPI07-GPI09)', () => {
    it('[GPI07] should complete initializeSession without gitModule or configStore calls', async () => {
      const initializer = createInitializer(gitModule, configStore);

      await initializer.initializeSession('human:alice');

      expect(gitModule.add).not.toHaveBeenCalled();
      expect(gitModule.commit).not.toHaveBeenCalled();
      expect(gitModule.createBranch).not.toHaveBeenCalled();
      expect(gitModule.deleteBranch).not.toHaveBeenCalled();
      expect(configStore.saveConfig).not.toHaveBeenCalled();
      expect(configStore.loadConfig).not.toHaveBeenCalled();
    });

    it('[GPI08] should complete copyAgentPrompt without gitModule or configStore calls', async () => {
      const initializer = createInitializer(gitModule, configStore);

      await initializer.copyAgentPrompt();

      expect(gitModule.add).not.toHaveBeenCalled();
      expect(gitModule.commit).not.toHaveBeenCalled();
      expect(gitModule.createBranch).not.toHaveBeenCalled();
      expect(gitModule.deleteBranch).not.toHaveBeenCalled();
      expect(configStore.saveConfig).not.toHaveBeenCalled();
      expect(configStore.loadConfig).not.toHaveBeenCalled();
    });

    it('[GPI09] should complete setupGitIntegration without gitModule or configStore calls', async () => {
      const initializer = createInitializer(gitModule, configStore);

      await initializer.setupGitIntegration();

      expect(gitModule.add).not.toHaveBeenCalled();
      expect(gitModule.commit).not.toHaveBeenCalled();
      expect(gitModule.createBranch).not.toHaveBeenCalled();
      expect(gitModule.deleteBranch).not.toHaveBeenCalled();
      expect(configStore.saveConfig).not.toHaveBeenCalled();
      expect(configStore.loadConfig).not.toHaveBeenCalled();
    });
  });

  describe('4.6. Inspection & Validation (GPI10-GPI12)', () => {
    it('[GPI10] should return true when branch exists and config.json is loadable', async () => {
      gitModule.branchExists.mockResolvedValue(true);
      configStore.loadConfig.mockResolvedValue(FIXTURE_CONFIG);
      const initializer = createInitializer(gitModule, configStore);

      const result = await initializer.isInitialized();

      expect(result).toBe(true);
    });

    it('[GPI10] should return false when branch does not exist', async () => {
      gitModule.branchExists.mockResolvedValue(false);
      const initializer = createInitializer(gitModule, configStore);

      const result = await initializer.isInitialized();

      expect(result).toBe(false);
      // Should short-circuit without loading config
      expect(configStore.loadConfig).not.toHaveBeenCalled();
    });

    it('[GPI10] should return false when branch exists but config is null', async () => {
      gitModule.branchExists.mockResolvedValue(true);
      configStore.loadConfig.mockResolvedValue(null);
      const initializer = createInitializer(gitModule, configStore);

      const result = await initializer.isInitialized();

      expect(result).toBe(false);
    });

    it('[GPI11] should return isAlreadyInitialized=false with isValid=true for fresh repo', async () => {
      gitModule.branchExists.mockResolvedValue(false);
      const initializer = createInitializer(gitModule, configStore);

      const validation = await initializer.validateEnvironment();

      expect(validation.isValid).toBe(true);
      expect(validation.isAlreadyInitialized).toBe(false);
      expect(validation.isGitRepo).toBe(true);
      expect(validation.hasWritePermissions).toBe(true);
      expect(validation.hasRemote).toBe(true);
      expect(validation.currentBranch).toBe('gitgov-state');
      expect(validation.warnings).toEqual([]);
    });

    it('[GPI11] should return isAlreadyInitialized=true with warning when config exists', async () => {
      gitModule.branchExists.mockResolvedValue(true);
      configStore.loadConfig.mockResolvedValue(FIXTURE_CONFIG);
      const initializer = createInitializer(gitModule, configStore);

      const validation = await initializer.validateEnvironment();

      expect(validation.isValid).toBe(false);
      expect(validation.isAlreadyInitialized).toBe(true);
      expect(validation.warnings.length).toBe(1);
      expect(validation.warnings[0]).toContain('already initialized');
      expect(validation.warnings[0]).toContain('.gitgov/config.json');
      expect(validation.warnings[0]).toContain('gitgov-state');
    });

    it('[GPI12] should return string literal basePath/actors/<actorId>.json', () => {
      const initializer = createInitializer(gitModule, configStore);

      const result = initializer.getActorPath('human:alice');

      expect(result).toBe('.gitgov/actors/human:alice.json');
    });
  });

  describe('4.7. Transaction Boundary (GPI13)', () => {
    it('[GPI13] should call gitModule.commit with configured commitMessage and author', async () => {
      gitModule.commit.mockResolvedValue('abc123');
      const customAuthor: CommitAuthor = { name: 'Test Bot', email: 'test@example.com' };
      const initializer = createInitializer(gitModule, configStore, {
        commitMessage: 'custom message',
        commitAuthor: customAuthor,
      });

      await initializer.finalize();

      expect(gitModule.commit).toHaveBeenCalledWith('custom message', customAuthor);
      expect(gitModule.commit).toHaveBeenCalledTimes(1);
    });

    it('[GPI13] should use default commitMessage and author when options omit them', async () => {
      gitModule.commit.mockResolvedValue('abc123');
      const initializer = createInitializer(gitModule, configStore);

      await initializer.finalize();

      expect(gitModule.commit).toHaveBeenCalledWith('gitgov: remote init', {
        name: 'gitgov bot',
        email: 'bot@gitgov.dev',
      });
    });

    it('[GPI13] should propagate errors from gitModule.commit to caller', async () => {
      gitModule.commit.mockRejectedValue(new Error('commit failed'));
      const initializer = createInitializer(gitModule, configStore);

      await expect(initializer.finalize()).rejects.toThrow('commit failed');
    });
  });
});
