// Mock all dependencies to avoid import-time execution
// Mock fs promises
jest.doMock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock @gitgov/core with all required modules
jest.doMock('@gitgov/core', () => {
  // 🎯 HYBRID STRATEGY: Mock Adapters + Valid Data Helpers
  // Create valid data using GitGovernance patterns without importing real factories

  // Helper to create valid IDs following GitGovernance patterns
  const createValidId = (type: string, title: string, timestamp?: number) => {
    const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    if (timestamp) {
      return `${timestamp}-${type}-${sanitizedTitle}`;
    }
    return `${type}:${sanitizedTitle}`;
  };

  // Helper to create valid TaskRecord following GitGovernance schema
  const createValidTaskRecord = (overrides = {}) => ({
    id: createValidId('task', 'test-task', Date.now()),
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'Test task description',
    tags: [],
    assignedTo: null,
    cycleIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  });

  // Create ConfigManager mock with static methods
  const ConfigManagerMock = Object.assign(
    jest.fn().mockImplementation(() => ({
      loadConfig: jest.fn().mockResolvedValue({
        protocolVersion: '1.0.0',
        projectId: 'test-project',
        projectName: 'Test Project'
      }),
      loadSession: jest.fn().mockResolvedValue({
        lastSession: {
          actorId: 'human:test-user',
          timestamp: new Date().toISOString()
        },
        actorState: {}
      }),
      saveConfig: jest.fn().mockResolvedValue(undefined),
      saveSession: jest.fn().mockResolvedValue(undefined),
      updateActorState: jest.fn().mockResolvedValue(undefined)
    })),
    {
      // Static methods
      findProjectRoot: jest.fn().mockReturnValue('/mock/project/root'),
      findGitgovRoot: jest.fn().mockReturnValue('/mock/project/root'),
      getGitgovPath: jest.fn().mockReturnValue('/mock/project/root/.gitgov'),
      isGitgovProject: jest.fn().mockReturnValue(true)
    }
  );

  return {
    // 🎭 MOCK CONFIG: Mock configuration management
    Config: {
      ConfigManager: ConfigManagerMock,
      createConfigManager: jest.fn().mockImplementation(() => ({
        loadConfig: jest.fn().mockResolvedValue({
          protocolVersion: '1.0.0',
          projectId: 'test-project',
          projectName: 'Test Project'
        }),
        loadSession: jest.fn().mockResolvedValue({
          lastSession: {
            actorId: 'human:test-user',
            timestamp: new Date().toISOString()
          },
          actorState: {}
        }),
        saveConfig: jest.fn().mockResolvedValue(undefined),
        saveSession: jest.fn().mockResolvedValue(undefined),
        updateActorState: jest.fn().mockResolvedValue(undefined)
      }))
    },

    // 🎭 MOCK STORE: Mock data persistence
    Store: {
      RecordStore: jest.fn().mockImplementation(() => ({
        create: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue(null),
        write: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        list: jest.fn().mockResolvedValue([])
      }))
    },

    // 🎭 MOCK FACTORIES: Mock record loaders
    Factories: {
      loadTaskRecord: jest.fn((data) => data),
      loadCycleRecord: jest.fn((data) => data),
      loadFeedbackRecord: jest.fn((data) => data),
      loadExecutionRecord: jest.fn((data) => data),
      loadChangelogRecord: jest.fn((data) => data),
      loadActorRecord: jest.fn((data) => data),
      loadAgentRecord: jest.fn((data) => data)
    },

    // 🎭 MOCK ADAPTERS: Mock business logic behavior with valid data
    Adapters: {
      FileIndexerAdapter: jest.fn().mockImplementation(() => ({
        generateIndex: jest.fn().mockResolvedValue({
          recordsProcessed: 146,
          cacheSize: 146000,
          generatedAt: Date.now()
        }),
        validateIntegrity: jest.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          recordsValidated: 146
        }),
        getIndexData: jest.fn().mockResolvedValue({
          tasks: [],
          cycles: [],
          lastGenerated: Date.now()
        })
      })),
      BacklogAdapter: jest.fn().mockImplementation(() => ({
        createTask: jest.fn().mockImplementation((payload) =>
          Promise.resolve(createValidTaskRecord(payload))
        ),
        getAllTasks: jest.fn().mockResolvedValue([]),
        getTask: jest.fn().mockResolvedValue(null),
        submitTask: jest.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'review' }))
        ),
        approveTask: jest.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'ready' }))
        ),
        activateTask: jest.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'active' }))
        ),
        completeTask: jest.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'done' }))
        )
      })),
      MetricsAdapter: jest.fn().mockImplementation(() => ({
        getSystemStatus: jest.fn().mockResolvedValue({
          health: {
            overallScore: 85,
            blockedTasks: 0,
            staleTasks: 1
          },
          tasks: {
            total: 146,
            byStatus: { draft: 10, review: 5, ready: 8, active: 12, done: 111 }
          }
        }),
        getTaskHealth: jest.fn().mockResolvedValue({
          healthScore: 90,
          timeInCurrentStage: 2,
          recommendations: []
        }),
        getProductivityMetrics: jest.fn().mockResolvedValue({
          throughput: 12,
          leadTime: 5.2,
          cycleTime: 3.1
        })
      })),
      IdentityAdapter: jest.fn().mockImplementation(() => ({
        getActor: jest.fn().mockResolvedValue({
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          roles: ['author']
        }),
        createActor: jest.fn().mockResolvedValue({
          id: 'human:new-user',
          type: 'human',
          displayName: 'New User',
          roles: ['author']
        }),
        getCurrentActor: jest.fn().mockResolvedValue({
          id: 'human:current-user',
          type: 'human',
          displayName: 'Current User',
          roles: ['author']
        })
      })),
      FeedbackAdapter: jest.fn().mockImplementation(() => ({
        create: jest.fn().mockResolvedValue({
          id: createValidId('feedback', 'test-feedback', Date.now()),
          entityType: 'task',
          entityId: 'task-123',
          type: 'comment',
          content: 'Test feedback'
        }),
        getAllFeedback: jest.fn().mockResolvedValue([])
      })),
      ExecutionAdapter: jest.fn().mockImplementation(() => ({
        create: jest.fn().mockResolvedValue({
          id: createValidId('exec', 'test-execution', Date.now()),
          taskId: 'task-123',
          type: 'progress',
          status: 'completed'
        }),
        getAllExecutions: jest.fn().mockResolvedValue([])
      })),
      ChangelogAdapter: jest.fn().mockImplementation(() => ({
        create: jest.fn().mockResolvedValue({
          id: createValidId('changelog', 'test-change', Date.now()),
          entityType: 'task',
          entityId: 'task-123',
          changeType: 'completion'
        }),
        getAllChangelogs: jest.fn().mockResolvedValue([])
      })),
      WorkflowMethodologyAdapter: Object.assign(
        jest.fn().mockImplementation(() => ({
          getTransitionRule: jest.fn().mockResolvedValue({
            to: 'active',
            conditions: { signatures: { __default__: { role: 'author' } } }
          }),
          validateSignature: jest.fn().mockResolvedValue(true)
        })),
        {
          createDefault: jest.fn().mockImplementation(() => ({
            getTransitionRule: jest.fn().mockResolvedValue({
              to: 'active',
              conditions: { signatures: { __default__: { role: 'author' } } }
            }),
            validateSignature: jest.fn().mockResolvedValue(true)
          }))
        }
      ),
      ProjectAdapter: jest.fn().mockImplementation(() => ({
        initializeProject: jest.fn().mockResolvedValue({
          projectId: 'test-project-' + Date.now(),
          rootCycle: createValidId('cycle', 'root-cycle', Date.now()),
          actor: {
            id: 'human:project-owner',
            displayName: 'Project Owner'
          }
        }),
        validateEnvironment: jest.fn().mockResolvedValue({
          isValid: true,
          warnings: [],
          suggestions: []
        })
      }))
    },

    // 🎭 MOCK MODULES: Mock infrastructure services
    EventBus: {
      EventBus: jest.fn().mockImplementation(() => ({
        publish: jest.fn(),
        subscribe: jest.fn().mockReturnValue({ id: 'mock-subscription-' + Date.now() }),
        unsubscribe: jest.fn(),
        getActiveEventTypes: jest.fn().mockReturnValue(['task.created', 'task.status.changed']),
        getSubscriptionCount: jest.fn().mockReturnValue(3)
      }))
    },

    // 🎭 MOCK GIT: Mock Git operations
    Git: {
      GitModule: jest.fn().mockImplementation(() => ({
        getRepoRoot: jest.fn().mockResolvedValue('/mock/project/root'),
        getCurrentBranch: jest.fn().mockResolvedValue('main'),
        branchExists: jest.fn().mockResolvedValue(true),
        checkoutFilesFromBranch: jest.fn().mockResolvedValue(undefined),
        fetch: jest.fn().mockResolvedValue(undefined),
        listRemoteBranches: jest.fn().mockResolvedValue([]),
        checkoutBranch: jest.fn().mockResolvedValue(undefined),
        pushWithUpstream: jest.fn().mockResolvedValue(undefined),
        setUpstream: jest.fn().mockResolvedValue(undefined),
        getBranchRemote: jest.fn().mockResolvedValue(null),
        checkoutOrphanBranch: jest.fn().mockResolvedValue(undefined),
        pullRebase: jest.fn().mockResolvedValue(undefined),
        getChangedFiles: jest.fn().mockResolvedValue([]),
        add: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue('mock-commit-hash'),
        push: jest.fn().mockResolvedValue(undefined),
        hasUncommittedChanges: jest.fn().mockResolvedValue(false),
        stash: jest.fn().mockResolvedValue('mock-stash-hash'),
        stashPop: jest.fn().mockResolvedValue(true),
        getConflictedFiles: jest.fn().mockResolvedValue([]),
        rebaseAbort: jest.fn().mockResolvedValue(undefined),
        isRebaseInProgress: jest.fn().mockResolvedValue(false),
        getCommitHistory: jest.fn().mockResolvedValue([]),
        getStagedFiles: jest.fn().mockResolvedValue([]),
        rebaseContinue: jest.fn().mockResolvedValue('mock-commit-hash'),
        commitAllowEmpty: jest.fn().mockResolvedValue('mock-commit-hash')
      }))
    },

    // 🎭 MOCK SYNC: Mock sync operations
    Sync: {
      SyncModule: Object.assign(
        jest.fn().mockImplementation(() => ({
          pushState: jest.fn().mockResolvedValue({
            success: true,
            filesSynced: 0,
            sourceBranch: 'main',
            commitHash: 'mock-commit-hash',
            commitMessage: 'mock commit message',
            conflictDetected: false
          }),
          pullState: jest.fn().mockResolvedValue({
            success: true,
            hasChanges: false,
            filesUpdated: 0,
            reindexed: false,
            conflictDetected: false
          }),
          resolveConflict: jest.fn().mockResolvedValue({
            success: true,
            rebaseCommitHash: 'mock-rebase-hash',
            resolutionCommitHash: 'mock-resolution-hash',
            conflictsResolved: 0,
            resolvedBy: 'human:test-user',
            reason: 'test reason'
          }),
          auditState: jest.fn().mockResolvedValue({
            passed: true,
            scope: 'current',
            totalCommits: 0,
            rebaseCommits: 0,
            resolutionCommits: 0,
            integrityViolations: [],
            summary: 'Audit passed'
          }),
          ensureStateBranch: jest.fn().mockResolvedValue(undefined),
          getStateBranchName: jest.fn().mockResolvedValue('gitgov-state'),
          calculateStateDelta: jest.fn().mockResolvedValue([]),
          isRebaseInProgress: jest.fn().mockResolvedValue(false),
          checkConflictMarkers: jest.fn().mockResolvedValue([]),
          getConflictDiff: jest.fn().mockResolvedValue({
            files: [],
            message: 'No conflicted files found',
            resolutionSteps: []
          }),
          verifyResolutionIntegrity: jest.fn().mockResolvedValue([])
        })),
        {
          // Static method for bootstrapping from gitgov-state branch
          bootstrapFromStateBranch: jest.fn().mockResolvedValue({ success: false, error: 'State branch does not exist' })
        }
      )
    },

    // 🎭 MOCK LINT: Mock lint operations
    Lint: {
      LintModule: jest.fn().mockImplementation(() => ({
        lint: jest.fn().mockResolvedValue({
          summary: {
            filesChecked: 0,
            errors: 0,
            warnings: 0,
            fixable: 0,
            executionTime: 0
          },
          results: [],
          metadata: {
            timestamp: new Date().toISOString(),
            options: {},
            version: '1.0.0'
          }
        }),
        lintFile: jest.fn().mockResolvedValue({
          summary: {
            filesChecked: 1,
            errors: 0,
            warnings: 0,
            fixable: 0,
            executionTime: 0
          },
          results: [],
          metadata: {
            timestamp: new Date().toISOString(),
            options: {},
            version: '1.0.0'
          }
        }),
        fix: jest.fn().mockResolvedValue({
          summary: {
            fixed: 0,
            failed: 0,
            backupsCreated: 0
          },
          fixes: []
        })
      }))
    },

    // 📋 MOCK TYPES: Provide empty namespaces for type imports
    Records: {},
    Models: {},

    // 🔧 MOCK UTILS: Mock utilities (could add real ID generation later)
    Utils: {
      generateTaskId: jest.fn().mockImplementation((title) => createValidId('task', title, Date.now())),
      generateActorId: jest.fn().mockImplementation((type, name) => createValidId(type, name))
    },

    // ✅ MOCK VALIDATION: Mock validation functions
    Validation: {
      isTaskRecord: jest.fn().mockReturnValue(true),
      validateTaskRecordDetailed: jest.fn().mockReturnValue({ isValid: true, errors: [] })
    }
  };
});

import { DependencyInjectionService } from './dependency-injection';
import { Config } from '@gitgov/core';

const mockedConfigManager = Config.ConfigManager as jest.Mocked<typeof Config.ConfigManager>;

describe('DependencyInjectionService', () => {
  let diService: DependencyInjectionService;
  const mockProjectRoot = '/tmp/test-gitgov';

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton for each test
    DependencyInjectionService.reset();

    // Mock ConfigManager
    mockedConfigManager.findProjectRoot.mockReturnValue(mockProjectRoot);
    mockedConfigManager.findGitgovRoot.mockReturnValue(mockProjectRoot);

    // Reset fs.access mock to success by default
    const mockFs = require('fs');
    mockFs.promises.access.mockResolvedValue(undefined);

    // Create fresh instance
    diService = DependencyInjectionService.getInstance();
  });

  afterEach(() => {
    DependencyInjectionService.reset();
  });

  describe('Singleton Pattern', () => {
    it('[EARS-1] should return same instance across multiple calls', () => {
      const instance1 = DependencyInjectionService.getInstance();
      const instance2 = DependencyInjectionService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(diService);
    });

    it('[EARS-2] should reset singleton instance correctly', () => {
      const instance1 = DependencyInjectionService.getInstance();

      DependencyInjectionService.reset();

      const instance2 = DependencyInjectionService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Error Handling', () => {
    it('[EARS-3] should throw error when project root not found', async () => {
      // Mock ConfigManager to return null
      mockedConfigManager.findGitgovRoot.mockReturnValue(null);
      mockedConfigManager.findProjectRoot.mockReturnValue(null);

      // Mock fs.access to reject (no .gitgov directory)
      const mockFs = require('fs');
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      // Mock GitModule to return false for branchExists('gitgov-state')
      const { Git } = require('@gitgov/core');
      const mockGitModule = new Git.GitModule({
        repoRoot: process.cwd(),
        execCommand: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
      });
      mockGitModule.branchExists = jest.fn().mockResolvedValue(false);
      mockGitModule.getRepoRoot = jest.fn().mockResolvedValue(process.cwd());

      // Override getGitModule to return our mock
      const originalGetGitModule = diService.getGitModule.bind(diService);
      diService.getGitModule = jest.fn().mockResolvedValue(mockGitModule);

      await expect(diService.getIndexerAdapter())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });

    it('[EARS-4] should throw error for BacklogAdapter when project root not found', async () => {
      // Mock ConfigManager to return null
      mockedConfigManager.findGitgovRoot.mockReturnValue(null);
      mockedConfigManager.findProjectRoot.mockReturnValue(null);

      // Mock fs.access to reject (no .gitgov directory)
      const mockFs = require('fs');
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      // Mock GitModule to return false for branchExists('gitgov-state')
      const { Git } = require('@gitgov/core');
      const mockGitModule = new Git.GitModule({
        repoRoot: process.cwd(),
        execCommand: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
      });
      mockGitModule.branchExists = jest.fn().mockResolvedValue(false);
      mockGitModule.getRepoRoot = jest.fn().mockResolvedValue(process.cwd());

      // Override getGitModule to return our mock
      diService.getGitModule = jest.fn().mockResolvedValue(mockGitModule);

      await expect(diService.getBacklogAdapter())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });
  });

  describe('Adapter Creation', () => {
    it('[EARS-5] should handle adapter creation when project root exists', async () => {
      mockedConfigManager.findProjectRoot.mockReturnValue(mockProjectRoot);

      // These should not throw for basic functionality
      await expect(diService.getIndexerAdapter()).resolves.toBeDefined();
      await expect(diService.getBacklogAdapter()).resolves.toBeDefined();
    });
  });

  describe('Dependency Validation', () => {
    it('[EARS-6] should return false when project root not found', async () => {
      // Mock fs.access to reject (no .gitgov directory)
      const mockFs = require('fs');
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      const isValid = await diService.validateDependencies();

      expect(isValid).toBe(false);
    });

    it('[EARS-7] should handle validation errors gracefully', async () => {
      mockedConfigManager.findProjectRoot.mockReturnValue(mockProjectRoot);

      // Should not throw, should return false on errors
      const isValid = await diService.validateDependencies();

      expect(typeof isValid).toBe('boolean');
    });
  });
});
