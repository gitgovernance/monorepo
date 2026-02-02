/**
 * Unit Tests for FsProjectInitializer Module
 *
 * Tests EARS from fs_project_initializer_module.md blueprint.
 *
 * FsProjectInitializer EARS:
 * - EARS-PI01 to PI05: Interface compliance (IProjectInitializer contract)
 * - EARS-FPI01 to FPI06: Filesystem-specific behavior
 * - EARS-FPI09 to FPI12: Filesystem operations (getActorPath, copyAgentPrompt, setupGitIntegration, readFile)
 * - EARS-FPI13: VCS status in validateEnvironment (hasRemote, hasCommits, currentBranch)
 *
 * @see fs_project_initializer_module.md for EARS specifications
 */

import * as path from 'path';
import type { GitGovConfig } from '../../config_manager';

// Mock ESM helper to avoid import.meta issues in Jest
jest.mock('../../utils/esm_helper', () => ({
  getImportMetaUrl: jest.fn(() => null)
}));

// Mock logger to avoid noise in tests
jest.mock('../../logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }))
}));

// Mock child_process for VCS checks
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Mock fs for controlled filesystem operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    rm: jest.fn(),
    unlink: jest.fn(),
    copyFile: jest.fn(),
    appendFile: jest.fn(),
  },
}));

// Import after mocks are set up
import { FsProjectInitializer } from './fs_project_initializer';

// ============================================================================
// Mock Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsMock = require('fs') as {
  existsSync: jest.MockedFunction<(path: string) => boolean>;
  promises: {
    mkdir: jest.MockedFunction<(path: string, options?: { recursive?: boolean }) => Promise<void>>;
    access: jest.MockedFunction<(path: string) => Promise<void>>;
    writeFile: jest.MockedFunction<(path: string, data: string, encoding?: string) => Promise<void>>;
    readFile: jest.MockedFunction<(path: string, encoding?: string) => Promise<string>>;
    rm: jest.MockedFunction<(path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>>;
    unlink: jest.MockedFunction<(path: string) => Promise<void>>;
    copyFile: jest.MockedFunction<(src: string, dest: string) => Promise<void>>;
    appendFile: jest.MockedFunction<(path: string, data: string) => Promise<void>>;
  };
};

const mockFs = fsMock.promises;
const mockExistsSync = fsMock.existsSync;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync: mockExecSync } = require('child_process') as {
  execSync: jest.MockedFunction<(cmd: string, opts?: object) => string | Buffer>;
};

/**
 * Creates a valid GitGovConfig for testing
 */
function createTestConfig(): GitGovConfig {
  return {
    protocolVersion: '1.0.0',
    projectId: 'test-project',
    projectName: 'Test Project',
    rootCycle: '1234567890-cycle-root',
    state: {
      branch: 'gitgov-state',
      sync: {
        strategy: 'manual',
        maxRetries: 3,
        pushIntervalSeconds: 30,
        batchIntervalSeconds: 60,
      },
      defaults: {
        pullScheduler: {
          defaultIntervalSeconds: 30,
          defaultEnabled: false,
          defaultContinueOnNetworkError: true,
          defaultStopOnConflict: false,
        },
        fileWatcher: {
          defaultDebounceMs: 300,
          defaultIgnoredPatterns: ['*.tmp', '.DS_Store', '*.swp'],
        },
      },
    },
  };
}

// ============================================================================
// Test Suite: FsProjectInitializer
// ============================================================================

describe('FsProjectInitializer', () => {
  const testRoot = '/tmp/gitgov-test-project';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 4.1. Interface Compliance (EARS-PI01 a PI05)
  // ==========================================================================

  describe('4.1. Interface Compliance (EARS-PI01 a PI05)', () => {
    let initializer: FsProjectInitializer;

    beforeEach(() => {
      initializer = new FsProjectInitializer(testRoot);
    });

    it('[EARS-PI01] should create project structure for backend', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await initializer.createProjectStructure();

      // Should create .gitgov/ and subdirectories
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'actors'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'cycles'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'tasks'),
        { recursive: true }
      );
    });

    it('[EARS-PI02] should return true when project is initialized', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await initializer.isInitialized();

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'config.json')
      );
    });

    it('[EARS-PI02] should return false when project is not initialized', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await initializer.isInitialized();

      expect(result).toBe(false);
    });

    it('[EARS-PI03] should write config in backend-specific format', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      const config = createTestConfig();

      await initializer.writeConfig(config);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'config.json'),
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    });

    it('[EARS-PI04] should create initial session state', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      const actorId = 'human:test-user';

      await initializer.initializeSession(actorId);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', '.session.json'),
        expect.stringContaining(actorId),
        'utf-8'
      );

      // Verify session structure
      const writeCall = mockFs.writeFile.mock.calls[0];
      const sessionContent = JSON.parse(writeCall?.[1] as string);
      expect(sessionContent.lastSession.actorId).toBe(actorId);
      expect(sessionContent.actorState[actorId]).toBeDefined();
      expect(sessionContent.actorState[actorId].syncStatus.status).toBe('synced');
    });

    it('[EARS-PI05] should clean up artifacts on rollback', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      await initializer.rollback();

      expect(mockFs.rm).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov'),
        { recursive: true, force: true }
      );
    });

    it('[EARS-PI05] should handle rollback when directory does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(initializer.rollback()).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // 4.2. FsProjectInitializer Specifics (EARS-FPI01 a FPI06)
  // ==========================================================================

  describe('4.2. FsProjectInitializer Specifics (EARS-FPI01 a FPI06)', () => {
    let initializer: FsProjectInitializer;

    beforeEach(() => {
      initializer = new FsProjectInitializer(testRoot);
    });

    it('[EARS-FPI01] should create all gitgov directories', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await initializer.createProjectStructure();

      const expectedDirs = [
        '.gitgov',
        '.gitgov/actors',
        '.gitgov/cycles',
        '.gitgov/tasks',
        '.gitgov/executions',
        '.gitgov/feedbacks',
        '.gitgov/changelogs',
      ];

      for (const dir of expectedDirs) {
        expect(mockFs.mkdir).toHaveBeenCalledWith(
          path.join(testRoot, dir),
          { recursive: true }
        );
      }

      // Total: 1 (.gitgov) + 6 subdirectories = 7 calls
      expect(mockFs.mkdir).toHaveBeenCalledTimes(7);
    });

    it('[EARS-FPI02] should check for config.json existence', async () => {
      mockFs.access.mockResolvedValue(undefined);

      await initializer.isInitialized();

      expect(mockFs.access).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'config.json')
      );
    });

    it('[EARS-FPI03] should validate git repo and write permissions', async () => {
      mockExistsSync.mockReturnValue(true); // .git exists
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT')); // config.json doesn't exist

      const validation = await initializer.validateEnvironment();

      expect(validation.isValid).toBe(true);
      expect(validation.isGitRepo).toBe(true);
      expect(validation.hasWritePermissions).toBe(true);
      expect(validation.isAlreadyInitialized).toBe(false);
    });

    it('[EARS-FPI04] should detect non-git directory', async () => {
      mockExistsSync.mockReturnValue(false); // .git doesn't exist
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const validation = await initializer.validateEnvironment();

      expect(validation.isValid).toBe(false);
      expect(validation.isGitRepo).toBe(false);
      expect(validation.warnings.some(w => w.includes('Not a Git repository'))).toBe(true);
    });

    it('[EARS-FPI05] should detect already initialized project', async () => {
      mockExistsSync.mockReturnValue(true); // .git exists
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // config.json exists

      const validation = await initializer.validateEnvironment();

      expect(validation.isValid).toBe(false);
      expect(validation.isAlreadyInitialized).toBe(true);
      expect(validation.gitgovPath).toBe(path.join(testRoot, '.gitgov'));
      expect(validation.warnings.some(w => w.includes('already initialized'))).toBe(true);
    });

    it('[EARS-FPI06] should remove .gitgov directory on rollback', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      await initializer.rollback();

      expect(mockFs.rm).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov'),
        { recursive: true, force: true }
      );
    });
  });

  // ==========================================================================
  // 4.3. Filesystem Operations (EARS-FPI07 a FPI12)
  // ==========================================================================

  describe('4.3. Filesystem Operations (EARS-FPI07 a FPI12)', () => {
    let initializer: FsProjectInitializer;

    beforeEach(() => {
      initializer = new FsProjectInitializer(testRoot);
    });

    it('[EARS-FPI09] should return actor path under .gitgov/actors/', () => {
      const actorId = 'human:test-user';

      const result = initializer.getActorPath(actorId);

      expect(result).toBe(
        path.join(testRoot, '.gitgov', 'actors', `${actorId}.json`)
      );
    });

    it('[EARS-FPI10] should copy agent prompt from accessible source', async () => {
      // First access call succeeds (source found)
      mockFs.access.mockResolvedValueOnce(undefined);
      mockFs.copyFile.mockResolvedValue(undefined);

      await initializer.copyAgentPrompt();

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        expect.stringContaining('gitgov_agent.md'),
        path.join(testRoot, 'gitgov')
      );
    });

    it('[EARS-FPI10] should warn gracefully when no source is accessible', async () => {
      // All access calls fail (no source found)
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await initializer.copyAgentPrompt();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not copy @gitgov agent prompt')
      );
      expect(mockFs.copyFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('[EARS-FPI11] should create .gitignore with GitGovernance entries', async () => {
      // .gitignore doesn't exist
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));
      mockFs.writeFile.mockResolvedValue(undefined);

      await initializer.setupGitIntegration();

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitignore'),
        expect.stringContaining('# GitGovernance')
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitignore'),
        expect.stringContaining('.gitgov/')
      );
    });

    it('[EARS-FPI11] should append to existing .gitignore without GitGovernance section', async () => {
      // .gitignore exists without GitGovernance
      mockFs.readFile.mockResolvedValueOnce('node_modules/\ndist/\n');
      mockFs.appendFile.mockResolvedValue(undefined);

      await initializer.setupGitIntegration();

      expect(mockFs.appendFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitignore'),
        expect.stringContaining('# GitGovernance')
      );
    });

    it('[EARS-FPI11] should not modify .gitignore if GitGovernance section already exists', async () => {
      // .gitignore already has GitGovernance section
      mockFs.readFile.mockResolvedValueOnce('node_modules/\n# GitGovernance\n.gitgov/\n');

      await initializer.setupGitIntegration();

      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(mockFs.appendFile).not.toHaveBeenCalled();
    });

    it('[EARS-FPI12] should read file with utf-8 encoding', async () => {
      const filePath = '/tmp/test-file.json';
      const fileContent = '{"key": "value"}';
      mockFs.readFile.mockResolvedValueOnce(fileContent);

      const result = await initializer.readFile(filePath);

      expect(result).toBe(fileContent);
      expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    });
  });

  // ==========================================================================
  // 4.4. VCS Status in validateEnvironment (EARS-FPI13)
  // ==========================================================================

  describe('4.4. VCS Status in validateEnvironment (EARS-FPI13)', () => {
    let initializer: FsProjectInitializer;

    beforeEach(() => {
      initializer = new FsProjectInitializer(testRoot);
      // Default: valid git repo with write permissions, not initialized
      mockExistsSync.mockReturnValue(true); // .git exists
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT')); // config.json doesn't exist
    });

    it('[EARS-FPI13] should return VCS status with remote, commits, and branch', async () => {
      mockExecSync
        .mockReturnValueOnce('https://github.com/org/repo.git')  // git remote get-url origin
        .mockReturnValueOnce('main\n')                            // git branch --show-current
        .mockReturnValueOnce('abc1234 Initial commit\n');         // git log --oneline -1

      const validation = await initializer.validateEnvironment();

      expect(validation.hasRemote).toBe(true);
      expect(validation.currentBranch).toBe('main');
      expect(validation.hasCommits).toBe(true);
    });

    it('[EARS-FPI13] should detect no remote configured', async () => {
      mockExecSync
        .mockImplementationOnce(() => { throw new Error('fatal: No such remote'); }) // git remote get-url origin
        .mockReturnValueOnce('main\n')                                                // git branch --show-current
        .mockReturnValueOnce('abc1234 Initial commit\n');                              // git log --oneline -1

      const validation = await initializer.validateEnvironment();

      expect(validation.hasRemote).toBe(false);
      expect(validation.currentBranch).toBe('main');
      expect(validation.hasCommits).toBe(true);
    });

    it('[EARS-FPI13] should detect no commits in repository', async () => {
      mockExecSync
        .mockReturnValueOnce('https://github.com/org/repo.git')                        // git remote get-url origin
        .mockReturnValueOnce('main\n')                                                  // git branch --show-current
        .mockImplementationOnce(() => { throw new Error('fatal: bad default revision'); }); // git log --oneline -1

      const validation = await initializer.validateEnvironment();

      expect(validation.hasRemote).toBe(true);
      expect(validation.currentBranch).toBe('main');
      expect(validation.hasCommits).toBe(false);
    });

    it('[EARS-FPI13] should skip VCS checks when not a git repo', async () => {
      mockExistsSync.mockReturnValue(false); // .git doesn't exist

      const validation = await initializer.validateEnvironment();

      expect(validation.hasRemote).toBe(false);
      expect(validation.hasCommits).toBe(false);
      expect(validation.currentBranch).toBe('');
      // execSync should NOT have been called
      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });
});
