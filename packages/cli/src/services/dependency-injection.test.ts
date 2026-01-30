/**
 * DependencyInjectionService Unit Tests
 *
 * Blueprint: packages/blueprints/03_products/cli/specs/dependency_injection_module.md
 * All EARS prefixes map to dependency_injection_module.md §4.1-4.6
 *
 * EARS Coverage:
 * - §4.1 Singleton Pattern (EARS-A1 to A2)
 * - §4.2 Store Initialization & Bootstrap (EARS-B1 to B4)
 * - §4.3 Adapter Factories (EARS-C1 to C10)
 * - §4.4 Bootstrap Reindex (EARS-D1 to D2)
 * - §4.5 Error Handling (EARS-E1 to E4)
 * - §4.6 Validation (EARS-F1 to F2)
 */

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
      // Static methods (legacy — code uses standalone functions from @gitgov/core/fs)
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
      })),
      FsStore: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(false),
        list: jest.fn().mockResolvedValue([])
      }))
    },

    // Direct RecordStore export (for verbatimModuleSyntax compatibility)
    RecordStore: jest.fn().mockImplementation(() => ({
      create: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      write: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([])
    })),

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
      IndexerAdapter: jest.fn().mockImplementation(() => ({
        generateIndex: jest.fn().mockResolvedValue({
          recordsProcessed: 146,
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

    // 🎭 MOCK KEY PROVIDER: Mock key storage operations
    KeyProvider: {
      FsKeyProvider: jest.fn().mockImplementation(() => ({
        getPrivateKey: jest.fn().mockResolvedValue('mock-private-key-base64'),
        setPrivateKey: jest.fn().mockResolvedValue(undefined),
        hasPrivateKey: jest.fn().mockResolvedValue(true),
        deletePrivateKey: jest.fn().mockResolvedValue(true)
      })),
      EnvKeyProvider: jest.fn().mockImplementation(() => ({
        getPrivateKey: jest.fn().mockResolvedValue('mock-private-key-base64'),
        setPrivateKey: jest.fn().mockResolvedValue(undefined),
        hasPrivateKey: jest.fn().mockResolvedValue(true),
        deletePrivateKey: jest.fn().mockResolvedValue(true)
      })),
      MockKeyProvider: jest.fn().mockImplementation(() => ({
        getPrivateKey: jest.fn().mockResolvedValue('mock-private-key-base64'),
        setPrivateKey: jest.fn().mockResolvedValue(undefined),
        hasPrivateKey: jest.fn().mockResolvedValue(true),
        deletePrivateKey: jest.fn().mockResolvedValue(true)
      })),
      KeyProviderError: class KeyProviderError extends Error {
        constructor(message: string, public code: string, public actorId?: string) {
          super(message);
          this.name = 'KeyProviderError';
        }
      }
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
      })),
      FsLintModule: jest.fn().mockImplementation(() => ({
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

// Mock @gitgov/core/fs — standalone functions + filesystem classes
jest.doMock('@gitgov/core/fs', () => ({
  FsRecordStore: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    put: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    exists: jest.fn().mockResolvedValue(false),
  })),
  FsFileLister: jest.fn().mockImplementation(() => ({
    list: jest.fn().mockResolvedValue([]),
    read: jest.fn().mockResolvedValue(''),
    exists: jest.fn().mockResolvedValue(false),
    stat: jest.fn().mockResolvedValue({ isFile: true, isDirectory: false, size: 0, mtime: new Date() })
  })),
  FsProjectInitializer: jest.fn().mockImplementation(() => ({})),
  FsLintModule: jest.fn().mockImplementation(() => ({
    lint: jest.fn().mockResolvedValue({
      summary: { filesChecked: 0, errors: 0, warnings: 0, fixable: 0, executionTime: 0 },
      results: [],
      metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' }
    }),
    lintFile: jest.fn().mockResolvedValue({
      summary: { filesChecked: 1, errors: 0, warnings: 0, fixable: 0, executionTime: 0 },
      results: [],
      metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' }
    }),
    fix: jest.fn().mockResolvedValue({
      summary: { fixed: 0, failed: 0, backupsCreated: 0 },
      fixes: []
    })
  })),
  GitModule: jest.fn().mockImplementation(() => ({
    getRepoRoot: jest.fn().mockResolvedValue('/tmp/test-gitgov'),
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
    commitAllowEmpty: jest.fn().mockResolvedValue('mock-commit-hash'),
    exec: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  })),
  createAgentRunner: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue({ success: true }),
  })),
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
  })),
  findProjectRoot: jest.fn().mockReturnValue('/tmp/test-gitgov'),
  findGitgovRoot: jest.fn().mockReturnValue('/tmp/test-gitgov'),
  createSessionManager: jest.fn().mockReturnValue({
    loadSession: jest.fn().mockResolvedValue(null),
    saveSession: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { DependencyInjectionService } from './dependency-injection';

// Mocked module references (require once after doMock, use everywhere)
const mockFs = require('fs');
const corefs = require('@gitgov/core/fs');
const { Config, Sync, Git, Adapters, KeyProvider, EventBus } = require('@gitgov/core');

describe('DependencyInjectionService', () => {
  let diService: DependencyInjectionService;
  const mockProjectRoot = '/tmp/test-gitgov';

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton for each test
    DependencyInjectionService.reset();

    // Reset @gitgov/core/fs function mocks to default
    corefs.findProjectRoot.mockReturnValue(mockProjectRoot);
    corefs.findGitgovRoot.mockReturnValue(mockProjectRoot);

    // Reset fs.access mock to success by default
    mockFs.promises.access.mockResolvedValue(undefined);

    // Create fresh instance
    diService = DependencyInjectionService.getInstance();
  });

  afterEach(() => {
    DependencyInjectionService.reset();
  });

  // ============================================================================
  // §4.1. Singleton Pattern (EARS-A1 to A2)
  // ============================================================================
  describe('4.1. Singleton Pattern (EARS-A1 to A2)', () => {
    it('[EARS-A1] should return same instance across multiple calls', () => {
      const instance1 = DependencyInjectionService.getInstance();
      const instance2 = DependencyInjectionService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(diService);
    });

    it('[EARS-A2] should reset singleton instance correctly', () => {
      const instance1 = DependencyInjectionService.getInstance();

      DependencyInjectionService.reset();

      const instance2 = DependencyInjectionService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  // ============================================================================
  // §4.2. Store Initialization & Bootstrap (EARS-B1 to B4)
  // ============================================================================
  describe('4.2. Store Initialization & Bootstrap (EARS-B1 to B4)', () => {
    it('[EARS-B1] should create RecordStores when .gitgov exists', async () => {
      // Mock fs.access to succeed (.gitgov exists)
      mockFs.promises.access.mockResolvedValue(undefined);

      // Getting any adapter triggers initializeStores
      const indexerAdapter = await diService.getIndexerAdapter();

      // Verify stores were created by checking adapter was created successfully
      expect(indexerAdapter).toBeDefined();

      // Verify FsRecordStore constructor was called for each store type
      expect(corefs.FsRecordStore).toHaveBeenCalled();
    });

    // [EARS-B2] Bootstrap from gitgov-state → tested as [EARS-D1] in §4.4
    // [EARS-B3] Error when not initialized → tested as [EARS-E1] in §4.5

    it('[EARS-B4] should not reinitialize existing stores on subsequent calls', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);

      // First call - initializes stores
      await diService.getIndexerAdapter();

      // Clear mock call counts
      const callCountAfterFirst = corefs.FsRecordStore.mock.calls.length;

      // Second call - should use cached stores
      await diService.getBacklogAdapter();

      // FsRecordStore should not be called again (stores already initialized)
      expect(corefs.FsRecordStore.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  // ============================================================================
  // §4.3. Adapter Factories (EARS-C1 to C10)
  // ============================================================================
  describe('4.3. Adapter Factories (EARS-C1 to C10)', () => {
    it('[EARS-C1] should create IndexerAdapter with all dependencies', async () => {
      const indexerAdapter = await diService.getIndexerAdapter();
      expect(indexerAdapter).toBeDefined();
      expect(indexerAdapter.generateIndex).toBeDefined();
    });

    it('[EARS-C2] should create BacklogAdapter with all dependencies', async () => {
      const backlogAdapter = await diService.getBacklogAdapter();
      expect(backlogAdapter).toBeDefined();
      expect(backlogAdapter.createTask).toBeDefined();
    });

    it('[EARS-C3] should create MetricsAdapter with stores', async () => {
      const metricsAdapter = await diService.getMetricsAdapter();

      expect(metricsAdapter).toBeDefined();
      expect(metricsAdapter.getSystemStatus).toBeDefined();
    });

    it('[EARS-C4] should create IdentityAdapter with KeyProvider and EventBus', async () => {
      const identityAdapter = await diService.getIdentityAdapter();

      expect(identityAdapter).toBeDefined();
      expect(identityAdapter.getActor).toBeDefined();

      // Verify KeyProvider was instantiated
      expect(KeyProvider.FsKeyProvider).toHaveBeenCalled();

      // Verify EventBus was instantiated
      expect(EventBus.EventBus).toHaveBeenCalled();
    });

    it('[EARS-C5] should create FeedbackAdapter with IdentityAdapter', async () => {
      const feedbackAdapter = await diService.getFeedbackAdapter();

      expect(feedbackAdapter).toBeDefined();
      expect(feedbackAdapter.create).toBeDefined();

      // Verify IdentityAdapter was created as dependency
      expect(Adapters.IdentityAdapter).toHaveBeenCalled();
    });

    it('[EARS-C6] should create LintModule with IndexerAdapter', async () => {
      const lintModule = await diService.getLintModule();

      expect(lintModule).toBeDefined();
    });

    it('[EARS-C7] should create SyncModule with all dependencies', async () => {
      const syncModule = await diService.getSyncModule();

      expect(syncModule).toBeDefined();
      expect(syncModule.pushState).toBeDefined();
      expect(syncModule.pullState).toBeDefined();
    });

    it('[EARS-C8] should return cached instance on subsequent calls', async () => {
      // First call creates new instance
      const indexer1 = await diService.getIndexerAdapter();
      const indexer2 = await diService.getIndexerAdapter();

      // Should be same instance (cached)
      expect(indexer1).toBe(indexer2);

      // Test caching for other adapters
      const backlog1 = await diService.getBacklogAdapter();
      const backlog2 = await diService.getBacklogAdapter();
      expect(backlog1).toBe(backlog2);

      const lint1 = await diService.getLintModule();
      const lint2 = await diService.getLintModule();
      expect(lint1).toBe(lint2);

      const sync1 = await diService.getSyncModule();
      const sync2 = await diService.getSyncModule();
      expect(sync1).toBe(sync2);
    });

    it('[EARS-C9] should create ConfigManager with projectRoot', async () => {
      const configManager = await diService.getConfigManager();

      expect(configManager).toBeDefined();
      expect(configManager.loadConfig).toBeDefined();

      // Verify createConfigManager was called with projectRoot
      expect(corefs.createConfigManager).toHaveBeenCalledWith(mockProjectRoot);
    });

    it('[EARS-C10] should create SessionManager with projectRoot', async () => {
      const sessionManager = await diService.getSessionManager();

      expect(sessionManager).toBeDefined();

      // Verify createSessionManager was called with projectRoot
      expect(corefs.createSessionManager).toHaveBeenCalledWith(mockProjectRoot);
    });
  });

  // ============================================================================
  // §4.4. Bootstrap Reindex (EARS-D1 to D2)
  // ============================================================================
  describe('4.4. Bootstrap Reindex (EARS-D1 to D2)', () => {
    it('[EARS-D1] should call generateIndex() after successful bootstrap from gitgov-state', async () => {
      // Mock fs.access to reject (no .gitgov directory exists in filesystem)
      mockFs.promises.access.mockRejectedValue(new Error('.gitgov directory not found'));

      // Mock bootstrap to succeed (gitgov-state branch exists)
      Sync.SyncModule.bootstrapFromStateBranch.mockResolvedValue({ success: true });

      // Get the indexer adapter (this should trigger bootstrap + reindex)
      const indexerAdapter = await diService.getIndexerAdapter();

      // Verify bootstrap was called
      expect(Sync.SyncModule.bootstrapFromStateBranch).toHaveBeenCalled();


      // Verify indexer.generateIndex() was called after bootstrap
      expect(indexerAdapter.generateIndex).toHaveBeenCalledTimes(1);
    });

    it('[EARS-D2] should NOT call generateIndex() when .gitgov/ already exists (no bootstrap)', async () => {
      // Mock fs.access to succeed (directory exists)
      mockFs.promises.access.mockResolvedValue(undefined);

      // Reset bootstrap mock
      Sync.SyncModule.bootstrapFromStateBranch.mockClear();

      // Get the indexer adapter (bootstrap should not be triggered)
      const indexerAdapter = await diService.getIndexerAdapter();

      // Verify bootstrap was NOT called
      expect(Sync.SyncModule.bootstrapFromStateBranch).not.toHaveBeenCalled();

      // Verify indexer.generateIndex() was NOT called
      expect(indexerAdapter.generateIndex).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // §4.5. Error Handling (EARS-E1 to E4)
  // ============================================================================
  describe('4.5. Error Handling (EARS-E1 to E4)', () => {
    it('[EARS-E1] should throw error when project root not found (IndexerAdapter)', async () => {
      // Mock fs.access to reject (no .gitgov directory)
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      // Mock bootstrap to fail (no gitgov-state branch either)
      Sync.SyncModule.bootstrapFromStateBranch.mockResolvedValue({ success: false });

      // Mock GitModule
      const mockGitModule = new Git.GitModule({
        repoRoot: process.cwd(),
        execCommand: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
      });
      mockGitModule.branchExists = jest.fn().mockResolvedValue(false);
      mockGitModule.getRepoRoot = jest.fn().mockResolvedValue(process.cwd());

      // Override getGitModule to return our mock
      diService.getGitModule = jest.fn().mockResolvedValue(mockGitModule);

      await expect(diService.getIndexerAdapter())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });

    it('[EARS-E1] should throw error when project root not found (BacklogAdapter)', async () => {
      // Mock fs.access to reject (no .gitgov directory)
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      // Mock bootstrap to fail (no gitgov-state branch either)
      Sync.SyncModule.bootstrapFromStateBranch.mockResolvedValue({ success: false });

      // Mock GitModule
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

    it('[EARS-E2] should throw cache system error with message', async () => {
      // Mock fs.access to succeed
      mockFs.promises.access.mockResolvedValue(undefined);

      // Mock IndexerAdapter constructor to throw
      Adapters.IndexerAdapter.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });

      await expect(diService.getIndexerAdapter())
        .rejects.toThrow('❌ Failed to initialize cache system: Connection failed');
    });

    it('[EARS-E3] should throw backlog system error with message', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);

      // Mock BacklogAdapter constructor to throw
      Adapters.BacklogAdapter.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      await expect(diService.getBacklogAdapter())
        .rejects.toThrow('❌ Failed to initialize backlog system: Database connection failed');
    });

    it('[EARS-E4] should handle non-Error types gracefully', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);

      // Mock IndexerAdapter to throw a string instead of Error
      Adapters.IndexerAdapter.mockImplementationOnce(() => {
        throw 'String error instead of Error object';
      });

      await expect(diService.getIndexerAdapter())
        .rejects.toThrow('❌ Unknown error initializing cache system.');
    });
  });

  // ============================================================================
  // §4.6. Validation (EARS-F1 to F2)
  // ============================================================================
  describe('4.6. Validation (EARS-F1 to F2)', () => {
    it('[EARS-F1] should return true when .gitgov exists', async () => {
      // Mock fs.access to succeed (.gitgov exists)
      mockFs.promises.access.mockResolvedValue(undefined);

      const isValid = await diService.validateDependencies();

      expect(isValid).toBe(true);
    });

    it('[EARS-F2] should return false when project root not found', async () => {
      // Mock findGitgovRoot to return null
      corefs.findGitgovRoot.mockReturnValue(null);

      // Reset projectRoot by creating a fresh instance
      DependencyInjectionService.reset();
      diService = DependencyInjectionService.getInstance();

      const isValid = await diService.validateDependencies();

      expect(isValid).toBe(false);
    });
  });
});
