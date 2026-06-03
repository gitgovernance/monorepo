/**
 * DependencyInjectionService Unit Tests
 *
 *
 * EARS Coverage:
 * - §4.1 Singleton Pattern (EARS-A1 to A2)
 * - §4.2 Store Initialization & Bootstrap (EARS-B1 to B4)
 * - §4.3 Adapter Factories (EARS-C1 to C11)
 * - §4.4 Bootstrap Reindex (EARS-D1 to D2)
 * - §4.5 Error Handling (EARS-E1 to E4)
 * - §4.6 Validation (EARS-F1 to F2)
 */

// Mock all dependencies to avoid import-time execution
// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    access: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  }
}));

// Mock @gitgov/core with all required modules
vi.mock('@gitgov/core', () => {
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
    vi.fn().mockImplementation(function() { return {
      loadConfig: vi.fn().mockResolvedValue({
        protocolVersion: '1.0.0',
        projectId: 'test-project',
        projectName: 'Test Project'
      }),
      loadSession: vi.fn().mockResolvedValue({
        lastSession: {
          actorId: 'human:test-user',
          timestamp: new Date().toISOString()
        },
        actorState: {}
      }),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      saveSession: vi.fn().mockResolvedValue(undefined),
      updateActorState: vi.fn().mockResolvedValue(undefined)
    }; }),
    {
      // Static methods (legacy — code uses standalone functions from @gitgov/core/fs)
      findProjectRoot: vi.fn().mockReturnValue('/mock/project/root'),
      findGitgovRoot: vi.fn().mockReturnValue('/mock/project/root'),
      getGitgovPath: vi.fn().mockReturnValue('/mock/project/root/.gitgov'),
      isGitgovProject: vi.fn().mockReturnValue(true)
    }
  );

  return {
    // 🎭 MOCK CONFIG: Mock configuration management
    Config: {
      ConfigManager: ConfigManagerMock,
      createConfigManager: vi.fn().mockImplementation(function() { return {
        loadConfig: vi.fn().mockResolvedValue({
          protocolVersion: '1.0.0',
          projectId: 'test-project',
          projectName: 'Test Project'
        }),
        loadSession: vi.fn().mockResolvedValue({
          lastSession: {
            actorId: 'human:test-user',
            timestamp: new Date().toISOString()
          },
          actorState: {}
        }),
        saveConfig: vi.fn().mockResolvedValue(undefined),
        saveSession: vi.fn().mockResolvedValue(undefined),
        updateActorState: vi.fn().mockResolvedValue(undefined),
        getStateBranch: vi.fn().mockResolvedValue('gitgov-state'),
      }; })
    },

    // 🎭 MOCK STORE: Mock data persistence
    Store: {
      RecordStore: vi.fn().mockImplementation(function() { return {
        create: vi.fn().mockResolvedValue(undefined),
        read: vi.fn().mockResolvedValue(null),
        write: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([])
      }; }),
      FsStore: vi.fn().mockImplementation(function() { return {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue(false),
        list: vi.fn().mockResolvedValue([])
      }; })
    },

    // Direct RecordStore export (for verbatimModuleSyntax compatibility)
    RecordStore: vi.fn().mockImplementation(function() { return {
      create: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(null),
      write: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([])
    }; }),

    // 🎭 MOCK FACTORIES: Mock record loaders
    Factories: {
      loadTaskRecord: vi.fn((data) => data),
      loadCycleRecord: vi.fn((data) => data),
      loadFeedbackRecord: vi.fn((data) => data),
      loadExecutionRecord: vi.fn((data) => data),
      loadActorRecord: vi.fn((data) => data),
      loadAgentRecord: vi.fn((data) => data)
    },

    // 🎭 MOCK RECORD_PROJECTOR: Separate namespace (moved from Adapters)
    RecordProjection: {
      RecordProjector: vi.fn().mockImplementation(function() { return {
        generateIndex: vi.fn().mockResolvedValue({
          recordsProcessed: 146,
          generatedAt: Date.now()
        }),
        validateIntegrity: vi.fn().mockResolvedValue({
          isValid: true,
          errors: [],
          recordsValidated: 146
        }),
        getIndexData: vi.fn().mockResolvedValue({
          tasks: [],
          cycles: [],
          lastGenerated: Date.now()
        })
      }; }),
    },

    // 🎭 MOCK RECORD_METRICS: Separate namespace (moved from Adapters)
    RecordMetrics: {
      RecordMetrics: vi.fn().mockImplementation(function() { return {
        getSystemStatus: vi.fn().mockResolvedValue({
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
        getTaskHealth: vi.fn().mockResolvedValue({
          healthScore: 90,
          timeInCurrentStage: 2,
          recommendations: []
        }),
        getProductivityMetrics: vi.fn().mockResolvedValue({
          throughput: 12,
          leadTime: 5.2,
          cycleTime: 3.1
        })
      }; }),
    },

    // 🎭 MOCK ADAPTERS: Mock business logic behavior with valid data
    Adapters: {
      BacklogAdapter: vi.fn().mockImplementation(function() { return {
        createTask: vi.fn().mockImplementation((payload) =>
          Promise.resolve(createValidTaskRecord(payload))
        ),
        getAllTasks: vi.fn().mockResolvedValue([]),
        getTask: vi.fn().mockResolvedValue(null),
        submitTask: vi.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'review' }))
        ),
        approveTask: vi.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'ready' }))
        ),
        activateTask: vi.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'active' }))
        ),
        completeTask: vi.fn().mockImplementation((taskId) =>
          Promise.resolve(createValidTaskRecord({ id: taskId, status: 'done' }))
        )
      }; }),
      IdentityAdapter: vi.fn().mockImplementation(function() { return {
        getActor: vi.fn().mockResolvedValue({
          id: 'human:test-user',
          type: 'human',
          displayName: 'Test User',
          roles: ['author']
        }),
        createActor: vi.fn().mockResolvedValue({
          id: 'human:new-user',
          type: 'human',
          displayName: 'New User',
          roles: ['author']
        }),
        getCurrentActor: vi.fn().mockResolvedValue({
          id: 'human:current-user',
          type: 'human',
          displayName: 'Current User',
          roles: ['author']
        })
      }; }),
      FeedbackAdapter: vi.fn().mockImplementation(function() { return {
        create: vi.fn().mockResolvedValue({
          id: createValidId('feedback', 'test-feedback', Date.now()),
          entityType: 'task',
          entityId: 'task-123',
          type: 'comment',
          content: 'Test feedback'
        }),
        getAllFeedback: vi.fn().mockResolvedValue([])
      }; }),
      ExecutionAdapter: vi.fn().mockImplementation(function() { return {
        create: vi.fn().mockResolvedValue({
          id: createValidId('exec', 'test-execution', Date.now()),
          taskId: 'task-123',
          type: 'progress',
          status: 'completed'
        }),
        getAllExecutions: vi.fn().mockResolvedValue([])
      }; }),
      WorkflowAdapter: Object.assign(
        vi.fn().mockImplementation(function() { return {
          getTransitionRule: vi.fn().mockResolvedValue({
            to: 'active',
            conditions: { signatures: { __default__: { role: 'author' } } }
          }),
          validateSignature: vi.fn().mockResolvedValue(true)
        }; }),
        {
          createDefault: vi.fn().mockImplementation(function() { return {
            getTransitionRule: vi.fn().mockResolvedValue({
              to: 'active',
              conditions: { signatures: { __default__: { role: 'author' } } }
            }),
            validateSignature: vi.fn().mockResolvedValue(true)
          }; })
        }
      ),
      ProjectModule: vi.fn().mockImplementation(function() { return {
        initializeProject: vi.fn().mockResolvedValue({
          actorId: 'human:project-owner',
          productAgentId: 'agent:gitgov-audit',
          cycleId: createValidId('cycle', 'root-cycle', Date.now()),
        })
      }; })
    },

    // 🎭 MOCK MODULES: Mock infrastructure services
    EventBus: {
      EventBus: vi.fn().mockImplementation(function() { return {
        publish: vi.fn(),
        subscribe: vi.fn().mockReturnValue({ id: 'mock-subscription-' + Date.now() }),
        unsubscribe: vi.fn(),
        getActiveEventTypes: vi.fn().mockReturnValue(['task.created', 'task.status.changed']),
        getSubscriptionCount: vi.fn().mockReturnValue(3)
      }; })
    },

    // 🎭 MOCK KEY PROVIDER: Mock key storage operations
    KeyProvider: {
      FsKeyProvider: vi.fn().mockImplementation(function() { return {
        sign: vi.fn().mockResolvedValue(new Uint8Array(64)),
        getPrivateKey: vi.fn().mockResolvedValue('mock-private-key-base64'),
        setPrivateKey: vi.fn().mockResolvedValue(undefined),
        hasPrivateKey: vi.fn().mockResolvedValue(true),
        deletePrivateKey: vi.fn().mockResolvedValue(true)
      }; }),
      EnvKeyProvider: vi.fn().mockImplementation(function() { return {
        sign: vi.fn().mockResolvedValue(new Uint8Array(64)),
        getPrivateKey: vi.fn().mockResolvedValue('mock-private-key-base64'),
        setPrivateKey: vi.fn().mockResolvedValue(undefined),
        hasPrivateKey: vi.fn().mockResolvedValue(true),
        deletePrivateKey: vi.fn().mockResolvedValue(true)
      }; }),
      MockKeyProvider: vi.fn().mockImplementation(function() { return {
        sign: vi.fn().mockResolvedValue(new Uint8Array(64)),
        getPrivateKey: vi.fn().mockResolvedValue('mock-private-key-base64'),
        setPrivateKey: vi.fn().mockResolvedValue(undefined),
        hasPrivateKey: vi.fn().mockResolvedValue(true),
        deletePrivateKey: vi.fn().mockResolvedValue(true)
      }; }),
      KeyProviderError: class KeyProviderError extends Error {
        constructor(message: string, public code: string, public context: Record<string, unknown> = {}) {
          super(message);
          this.name = 'KeyProviderError';
        }
      }
    },

    // 🎭 MOCK GIT: Mock Git operations
    Git: {
      GitModule: vi.fn().mockImplementation(function() { return {
        getRepoRoot: vi.fn().mockResolvedValue('/mock/project/root'),
        getCurrentBranch: vi.fn().mockResolvedValue('main'),
        branchExists: vi.fn().mockResolvedValue(true),
        checkoutFilesFromBranch: vi.fn().mockResolvedValue(undefined),
        fetch: vi.fn().mockResolvedValue(undefined),
        listRemoteBranches: vi.fn().mockResolvedValue([]),
        checkoutBranch: vi.fn().mockResolvedValue(undefined),
        pushWithUpstream: vi.fn().mockResolvedValue(undefined),
        setUpstream: vi.fn().mockResolvedValue(undefined),
        getBranchRemote: vi.fn().mockResolvedValue(null),
        checkoutOrphanBranch: vi.fn().mockResolvedValue(undefined),
        pullRebase: vi.fn().mockResolvedValue(undefined),
        getChangedFiles: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue('mock-commit-hash'),
        push: vi.fn().mockResolvedValue(undefined),
        hasUncommittedChanges: vi.fn().mockResolvedValue(false),
        stash: vi.fn().mockResolvedValue('mock-stash-hash'),
        stashPop: vi.fn().mockResolvedValue(true),
        getConflictedFiles: vi.fn().mockResolvedValue([]),
        rebaseAbort: vi.fn().mockResolvedValue(undefined),
        isRebaseInProgress: vi.fn().mockResolvedValue(false),
        getCommitHistory: vi.fn().mockResolvedValue([]),
        getStagedFiles: vi.fn().mockResolvedValue([]),
        rebaseContinue: vi.fn().mockResolvedValue('mock-commit-hash'),
        commitAllowEmpty: vi.fn().mockResolvedValue('mock-commit-hash')
      }; })
    },

    // 🎭 MOCK SYNC STATE: Mock sync state operations
    SyncState: {
      DEFAULT_STATE_BRANCH: 'gitgov-state',
      SyncStateModule: Object.assign(
        vi.fn().mockImplementation(function() { return {
          pushState: vi.fn().mockResolvedValue({
            success: true,
            filesSynced: 0,
            sourceBranch: 'main',
            commitHash: 'mock-commit-hash',
            commitMessage: 'mock commit message',
            conflictDetected: false
          }),
          pullState: vi.fn().mockResolvedValue({
            success: true,
            hasChanges: false,
            filesUpdated: 0,
            reindexed: false,
            conflictDetected: false
          }),
          resolveConflict: vi.fn().mockResolvedValue({
            success: true,
            rebaseCommitHash: 'mock-rebase-hash',
            resolutionCommitHash: 'mock-resolution-hash',
            conflictsResolved: 0,
            resolvedBy: 'human:test-user',
            reason: 'test reason'
          }),
          auditState: vi.fn().mockResolvedValue({
            passed: true,
            scope: 'current',
            totalCommits: 0,
            rebaseCommits: 0,
            resolutionCommits: 0,
            integrityViolations: [],
            summary: 'Audit passed'
          }),
          ensureStateBranch: vi.fn().mockResolvedValue(undefined),
          getStateBranchName: vi.fn().mockResolvedValue('gitgov-state'),
          calculateStateDelta: vi.fn().mockResolvedValue([]),
          isRebaseInProgress: vi.fn().mockResolvedValue(false),
          checkConflictMarkers: vi.fn().mockResolvedValue([]),
          getConflictDiff: vi.fn().mockResolvedValue({
            files: [],
            message: 'No conflicted files found',
            resolutionSteps: []
          }),
          verifyResolutionIntegrity: vi.fn().mockResolvedValue([])
        }; }),
        {
          // Static method for bootstrapping from gitgov-state branch
          bootstrapFromStateBranch: vi.fn().mockResolvedValue({ success: false, error: 'State branch does not exist' })
        }
      )
    },

    // 🎭 MOCK LINT: Mock lint operations
    Lint: {
      LintModule: vi.fn().mockImplementation(function() { return {
        lint: vi.fn().mockResolvedValue({
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
        lintFile: vi.fn().mockResolvedValue({
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
        fix: vi.fn().mockResolvedValue({
          summary: {
            fixed: 0,
            failed: 0,
            backupsCreated: 0
          },
          fixes: []
        })
      }; }),
      FsLintModule: vi.fn().mockImplementation(function() { return {
        lint: vi.fn().mockResolvedValue({
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
        lintFile: vi.fn().mockResolvedValue({
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
        fix: vi.fn().mockResolvedValue({
          summary: {
            fixed: 0,
            failed: 0,
            backupsCreated: 0
          },
          fixes: []
        })
      }; })
    },

    // 📋 MOCK TYPES: Provide empty namespaces for type imports
    Records: {},
    Models: {},

    // 🔧 MOCK UTILS: Mock utilities (could add real ID generation later)
    Utils: {
      generateTaskId: vi.fn().mockImplementation((title) => createValidId('task', title, Date.now())),
      generateActorId: vi.fn().mockImplementation((type, name) => createValidId(type, name))
    },

    // ✅ MOCK VALIDATION: Mock validation functions
    Validation: {
      isTaskRecord: vi.fn().mockReturnValue(true),
      validateTaskRecordDetailed: vi.fn().mockReturnValue({ isValid: true, errors: [] })
    },

    // 🎭 MOCK AUDIT ORCHESTRATOR: Mock audit orchestration
    AuditOrchestrator: {
      createAuditOrchestrator: vi.fn().mockImplementation(function() { return {
        run: vi.fn().mockResolvedValue({
          findings: [],
          agentResults: [],
          l1AgentResults: [],
          policyDecision: { decision: 'pass', reason: 'No findings', blockingFindings: [], waivedFindings: [], summary: { critical: 0, high: 0, medium: 0, low: 0 }, rulesEvaluated: [], evaluatedAt: new Date().toISOString() },
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, suppressed: 0, agentsRun: 0, agentsFailed: 0 },
          executionIds: { scans: [], policy: 'exec-policy-1' },
        }),
      }; }),
    },

    // 🎭 MOCK POLICY EVALUATOR: Mock policy evaluation
    PolicyEvaluator: {
      createPolicyEvaluator: vi.fn().mockImplementation(function() { return {
        evaluate: vi.fn().mockReturnValue({ decision: 'pass', reason: 'No findings' }),
      }; }),
    },

    // 🎭 MOCK REDACTION: FindingRedactor for L1/L2 separation
    Redaction: {
      FindingRedactor: vi.fn().mockImplementation(function() { return {
        redact: vi.fn().mockImplementation((f: unknown) => f),
        redactSarif: vi.fn().mockImplementation((s: unknown) => s),
      }; }),
      DEFAULT_REDACTION_CONFIG: { sensitiveCategories: [], safeCategories: [], defaultBehavior: 'redact' },
    },

    // 🎭 MOCK SOURCE AUDITOR: Mock source auditor (for WaiverReader/WaiverWriter)
    SourceAuditor: {
      SourceAuditorModule: vi.fn(),
      WaiverReader: vi.fn().mockImplementation(function() { return {
        loadWaivers: vi.fn().mockResolvedValue([]),
      }; }),
      WaiverWriter: vi.fn().mockImplementation(function() { return {
        createWaiver: vi.fn().mockResolvedValue(undefined),
      }; }),
    },

    // 🎭 MOCK FINDING DETECTOR: Mock finding detection
    FindingDetector: {
      FindingDetectorModule: vi.fn().mockImplementation(function() { return {
        detect: vi.fn().mockResolvedValue([]),
      }; }),
    },

    // Standalone exports (imported directly, not via namespace)
    IdentityModule: vi.fn().mockImplementation(function() { return {
      getActor: vi.fn().mockResolvedValue({ id: 'human:test-user', type: 'human', displayName: 'Test User', publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', roles: ['author'] }),
      createActor: vi.fn().mockResolvedValue({ id: 'human:new-user', type: 'human', displayName: 'New User', publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=', roles: ['author'] }),
      getActorPublicKey: vi.fn().mockResolvedValue('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
      listActors: vi.fn().mockResolvedValue([]),
    }; }),
    RecordSigner: vi.fn().mockImplementation(function() { return {
      createSignedRecord: vi.fn().mockResolvedValue({ header: { version: '1.0', type: 'task', payloadChecksum: 'abc', signatures: [] }, payload: {} }),
    }; }),
    ProjectModule: vi.fn().mockImplementation(function() { return {
      initializeProject: vi.fn().mockResolvedValue({ actorId: 'human:test-user', productAgentId: 'agent:gitgov-audit', cycleId: 'cycle-root', commitSha: 'abc123' }),
    }; }),
    getCurrentActor: vi.fn().mockResolvedValue({ id: 'human:current-user', type: 'human', displayName: 'Current User', publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', roles: ['author'] }),
  };
});

// Mock @gitgov/core/fs — standalone functions + filesystem classes
vi.mock('@gitgov/core/fs', () => ({
  FsRecordProjection: vi.fn().mockImplementation(function() { return {
    persist: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(false),
    clear: vi.fn().mockResolvedValue(undefined),
  }; }),
  FsRecordStore: vi.fn().mockImplementation(function() { return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(false),
  }; }),
  FsFileLister: vi.fn().mockImplementation(function() { return {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(''),
    exists: vi.fn().mockResolvedValue(false),
    stat: vi.fn().mockResolvedValue({ isFile: true, isDirectory: false, size: 0, mtime: new Date() })
  }; }),
  FsProjectInitializer: vi.fn().mockImplementation(function() { return {}; }),
  FsLintModule: vi.fn().mockImplementation(function() { return {
    lint: vi.fn().mockResolvedValue({
      summary: { filesChecked: 0, errors: 0, warnings: 0, fixable: 0, executionTime: 0 },
      results: [],
      metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' }
    }),
    lintFile: vi.fn().mockResolvedValue({
      summary: { filesChecked: 1, errors: 0, warnings: 0, fixable: 0, executionTime: 0 },
      results: [],
      metadata: { timestamp: new Date().toISOString(), options: {}, version: '1.0.0' }
    }),
    fix: vi.fn().mockResolvedValue({
      summary: { fixed: 0, failed: 0, backupsCreated: 0 },
      fixes: []
    })
  }; }),
  FsWorktreeSyncStateModule: vi.fn().mockImplementation(function() { return {
    pushState: vi.fn().mockResolvedValue({
      success: true, filesSynced: 0, sourceBranch: 'main',
      commitHash: 'mock-commit-hash', commitMessage: 'mock commit message', conflictDetected: false
    }),
    pullState: vi.fn().mockResolvedValue({
      success: true, hasChanges: false, filesUpdated: 0, reindexed: false, conflictDetected: false
    }),
    resolveConflict: vi.fn().mockResolvedValue({ success: true }),
    auditState: vi.fn().mockResolvedValue({ passed: true, scope: 'current', totalCommits: 0 }),
    ensureStateBranch: vi.fn().mockResolvedValue(undefined),
    ensureWorktree: vi.fn().mockResolvedValue(undefined),
    getStateBranchName: vi.fn().mockResolvedValue('gitgov-state'),
    getWorktreePath: vi.fn().mockReturnValue('/mock/worktree/path'),
    isRebaseInProgress: vi.fn().mockResolvedValue(false),
    checkConflictMarkers: vi.fn().mockResolvedValue([]),
    calculateStateDelta: vi.fn().mockResolvedValue([]),
    getConflictDiff: vi.fn().mockResolvedValue({ files: [], message: '', resolutionSteps: [] }),
    verifyResolutionIntegrity: vi.fn().mockResolvedValue([]),
  }; }),
  GitModule: vi.fn().mockImplementation(function() { return {
    getRepoRoot: vi.fn().mockResolvedValue('/tmp/test-gitgov'),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
    branchExists: vi.fn().mockResolvedValue(true),
    checkoutFilesFromBranch: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(undefined),
    listRemoteBranches: vi.fn().mockResolvedValue([]),
    checkoutBranch: vi.fn().mockResolvedValue(undefined),
    pushWithUpstream: vi.fn().mockResolvedValue(undefined),
    setUpstream: vi.fn().mockResolvedValue(undefined),
    getBranchRemote: vi.fn().mockResolvedValue(null),
    checkoutOrphanBranch: vi.fn().mockResolvedValue(undefined),
    pullRebase: vi.fn().mockResolvedValue(undefined),
    getChangedFiles: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue('mock-commit-hash'),
    push: vi.fn().mockResolvedValue(undefined),
    hasUncommittedChanges: vi.fn().mockResolvedValue(false),
    stash: vi.fn().mockResolvedValue('mock-stash-hash'),
    stashPop: vi.fn().mockResolvedValue(true),
    getConflictedFiles: vi.fn().mockResolvedValue([]),
    rebaseAbort: vi.fn().mockResolvedValue(undefined),
    isRebaseInProgress: vi.fn().mockResolvedValue(false),
    getCommitHistory: vi.fn().mockResolvedValue([]),
    getStagedFiles: vi.fn().mockResolvedValue([]),
    rebaseContinue: vi.fn().mockResolvedValue('mock-commit-hash'),
    commitAllowEmpty: vi.fn().mockResolvedValue('mock-commit-hash'),
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  }; }),
  createAgentRunner: vi.fn().mockImplementation(function() { return {
    run: vi.fn().mockResolvedValue({ success: true }),
  }; }),
  createConfigManager: vi.fn().mockImplementation(function() { return {
    loadConfig: vi.fn().mockResolvedValue({
      protocolVersion: '1.0.0',
      projectId: 'test-project',
      projectName: 'Test Project'
    }),
    loadSession: vi.fn().mockResolvedValue({
      lastSession: {
        actorId: 'human:test-user',
        timestamp: new Date().toISOString()
      },
      actorState: {}
    }),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    saveSession: vi.fn().mockResolvedValue(undefined),
    updateActorState: vi.fn().mockResolvedValue(undefined),
    getStateBranch: vi.fn().mockResolvedValue('gitgov-state'),
  }; }),
  DEFAULT_ID_ENCODER: { encode: (id: string) => id, decode: (encoded: string) => encoded },
  findProjectRoot: vi.fn().mockReturnValue('/tmp/test-gitgov'),
  findGitgovRoot: vi.fn().mockReturnValue('/tmp/test-gitgov'),
  getWorktreeBasePath: vi.fn((repoRoot: string) => {
    const { createHash } = require('crypto');
    const hash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
    return require('path').join(require('os').homedir(), '.gitgov', 'worktrees', hash);
  }),
  createSessionManager: vi.fn().mockReturnValue({
    loadSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue(undefined),
  }),
  getKeysDir: vi.fn().mockImplementation((worktreePath: string) => require('path').join(worktreePath, '.gitgov', 'keys')),
}));

import { DependencyInjectionService } from './dependency-injection';

// Mocked module references — vitest hoists vi.mock, so imports resolve to mocks
import * as mockFsModule from 'fs';
import * as corefs from '@gitgov/core/fs';
import { Git, Adapters, KeyProvider, EventBus, RecordProjection, RecordMetrics, AuditOrchestrator as AuditOrchestratorMock, PolicyEvaluator as PolicyEvaluatorMock, SyncState } from '@gitgov/core';
const mockFs = vi.mocked(mockFsModule);

describe('DependencyInjectionService', () => {
  let diService: DependencyInjectionService;
  const mockRepoRoot = '/tmp/test-gitgov';
  // Worktree base path is computed from repoRoot via core's getWorktreeBasePath
  const mockWorktreeBasePath = corefs.getWorktreeBasePath(mockRepoRoot);

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset singleton for each test
    DependencyInjectionService.reset();

    // Reset @gitgov/core/fs function mocks to default
    corefs.findProjectRoot.mockReturnValue(mockRepoRoot);
    corefs.findGitgovRoot.mockReturnValue(mockRepoRoot);

    // Reset fs.access mock to success by default (worktree .gitgov exists)
    mockFs.promises.access.mockResolvedValue(undefined);

    // Create fresh instance
    diService = DependencyInjectionService.getInstance();
    diService.setStateBranchOverride(SyncState.DEFAULT_STATE_BRANCH);
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
      const projector = await diService.getRecordProjector();

      // Verify stores were created by checking adapter was created successfully
      expect(projector).toBeDefined();

      // Verify FsRecordStore constructor was called for each store type
      expect(corefs.FsRecordStore).toHaveBeenCalled();
    });

    // [EARS-B2] Bootstrap from gitgov-state → tested as [EARS-D1] in §4.4
    // [EARS-B3] Error when not initialized → tested as [EARS-E1] in §4.5

    it('[EARS-B4] should not reinitialize existing stores on subsequent calls', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);

      // First call - initializes stores
      await diService.getRecordProjector();

      // Clear mock call counts
      const callCountAfterFirst = corefs.FsRecordStore.mock.calls.length;

      // Second call - should use cached stores
      await diService.getBacklogAdapter();

      // FsRecordStore should not be called again (stores already initialized)
      expect(corefs.FsRecordStore.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  // ============================================================================
  // §4.3. Adapter Factories (EARS-C1 to C12)
  // ============================================================================
  describe('4.3. Adapter Factories (EARS-C1 to C15)', () => {
    it('[EARS-C1] should create IndexerAdapter with all dependencies', async () => {
      const projector = await diService.getRecordProjector();
      expect(projector).toBeDefined();
      expect(projector.generateIndex).toBeDefined();
    });

    it('[EARS-C2] should create BacklogAdapter with all dependencies', async () => {
      const backlogAdapter = await diService.getBacklogAdapter();
      expect(backlogAdapter).toBeDefined();
      expect(backlogAdapter.createTask).toBeDefined();
    });

    it('[EARS-C3] should create MetricsAdapter with stores', async () => {
      const recordMetrics = await diService.getRecordMetrics();

      expect(recordMetrics).toBeDefined();
      expect(recordMetrics.getSystemStatus).toBeDefined();
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

      // FeedbackAdapter is constructed with stores + signer + eventBus (no IdentityModule needed)
      expect(Adapters.FeedbackAdapter).toHaveBeenCalled();
    });

    it('[EARS-C6] should create LintModule with RecordProjector', async () => {
      const lintModule = await diService.getLintModule();

      expect(lintModule).toBeDefined();
    });

    it('[EARS-C7] should create SyncStateModule with all dependencies', async () => {
      const syncModule = await diService.getSyncStateModule();

      expect(syncModule).toBeDefined();
      expect(syncModule.pushState).toBeDefined();
      expect(syncModule.pullState).toBeDefined();

      // Verify FsWorktreeSyncStateModule was instantiated
      expect(corefs.FsWorktreeSyncStateModule).toHaveBeenCalled();
    });

    it('[EARS-C8] should return cached instance on subsequent calls', async () => {
      // First call creates new instance
      const indexer1 = await diService.getRecordProjector();
      const indexer2 = await diService.getRecordProjector();

      // Should be same instance (cached)
      expect(indexer1).toBe(indexer2);

      // Test caching for other adapters
      const backlog1 = await diService.getBacklogAdapter();
      const backlog2 = await diService.getBacklogAdapter();
      expect(backlog1).toBe(backlog2);

      const lint1 = await diService.getLintModule();
      const lint2 = await diService.getLintModule();
      expect(lint1).toBe(lint2);

      const sync1 = await diService.getSyncStateModule();
      const sync2 = await diService.getSyncStateModule();
      expect(sync1).toBe(sync2);
    });

    it('[EARS-C9] should create ConfigManager with projectRoot', async () => {
      const configManager = await diService.getConfigManager();

      expect(configManager).toBeDefined();
      expect(configManager.loadConfig).toBeDefined();

      // Verify createConfigManager was called with worktree base path
      expect(corefs.createConfigManager).toHaveBeenCalledWith(mockWorktreeBasePath);
    });

    it('[EARS-C10] should create SessionManager with projectRoot', async () => {
      const sessionManager = await diService.getSessionManager();

      expect(sessionManager).toBeDefined();

      // Verify createSessionManager was called with worktree base path
      expect(corefs.createSessionManager).toHaveBeenCalledWith(mockWorktreeBasePath);
    });

    it('[EARS-C11] should create AuditOrchestrator with all dependencies including FindingRedactor', async () => {
      const orchestrator = await diService.getAuditOrchestrator();

      expect(orchestrator).toBeDefined();
      expect(orchestrator.run).toBeDefined();

      // Verify AuditOrchestrator factory was called with redactor
      expect(AuditOrchestratorMock.createAuditOrchestrator).toHaveBeenCalled();
      const depsArg = (AuditOrchestratorMock.createAuditOrchestrator as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(depsArg).toBeDefined();
      expect(depsArg.redactor).toBeDefined();
      expect(depsArg.redactor.redactSarif).toBeDefined();
      expect(depsArg.agentRunner).toBeDefined();
      expect(depsArg.waiverReader).toBeDefined();
      expect(depsArg.recordStore).toBeDefined();

      // Verify PolicyEvaluator was created as dependency
      expect(PolicyEvaluatorMock.createPolicyEvaluator).toHaveBeenCalled();
    });

    it('[EARS-C12] should pass repoRoot as projectRoot to AgentRunner', async () => {
      // getAuditOrchestrator internally calls getAgentRunnerModule which calls createAgentRunner
      await diService.getAuditOrchestrator();

      // Verify createAgentRunner was called with repoRoot (not worktree path)
      const { createAgentRunner } = corefs;
      expect(createAgentRunner).toHaveBeenCalled();
      const callArgs = createAgentRunner.mock.calls[0][0];
      expect(callArgs.projectRoot).toBe(mockRepoRoot);
      expect(callArgs.gitgovPath).toContain('.gitgov');
    });

    it('[EARS-C13] should make keyProvider accessible via getKeyProvider after getIdentityAdapter', async () => {
      await diService.getIdentityAdapter();

      const keyProvider = diService.getKeyProvider();
      expect(keyProvider).toBeDefined();
      expect(keyProvider.hasPrivateKey).toBeDefined();
      expect(keyProvider.sign).toBeDefined();
    });

    it.todo('[EARS-C14] should prompt actor selection and save to session when multiple keys exist');
  });

  // ============================================================================
  // §4.4. Bootstrap Reindex (EARS-D1 to D2)
  // ============================================================================
  describe('4.4. Bootstrap Reindex (EARS-D1 to D2)', () => {
    it('[EARS-D1] should call generateIndex() after successful bootstrap from gitgov-state', async () => {
      // Mock fs.access to reject (no worktree .gitgov directory exists)
      mockFs.promises.access.mockRejectedValue(new Error('.gitgov directory not found'));

      // Mock GitModule to simulate worktree bootstrap
      const mockGitModule = new Git.GitModule({
        repoRoot: mockRepoRoot,
        execCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
      });
      mockGitModule.getRepoRoot = vi.fn().mockResolvedValue(mockRepoRoot);
      mockGitModule.branchExists = vi.fn().mockResolvedValue(true);
      mockGitModule.exec = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      diService.getGitModule = vi.fn().mockResolvedValue(mockGitModule);

      // Get the projector (this should trigger bootstrap + reindex)
      const projector = await diService.getRecordProjector();

      // Verify worktree creation was attempted via git exec
      expect(mockGitModule.exec).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['worktree', 'add']),
      );

      // Verify indexer.generateIndex() was called after bootstrap
      expect(projector.generateIndex).toHaveBeenCalledTimes(1);
    });

    it('[EARS-D2] should NOT call generateIndex() when .gitgov/ already exists (no bootstrap)', async () => {
      // Mock fs.access to succeed (worktree .gitgov exists)
      mockFs.promises.access.mockResolvedValue(undefined);

      // Get the projector (bootstrap should not be triggered)
      const projector = await diService.getRecordProjector();

      // Verify indexer.generateIndex() was NOT called
      expect(projector.generateIndex).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // §4.5. Error Handling (EARS-E1 to E4)
  // ============================================================================
  describe('4.5. Error Handling (EARS-E1 to E4)', () => {
    it('[EARS-E1] should throw error when project root not found (IndexerAdapter)', async () => {
      // Mock fs.access to reject (no worktree .gitgov directory)
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      // Mock GitModule — branch doesn't exist locally or remotely
      const mockGitModule = new Git.GitModule({
        repoRoot: mockRepoRoot,
        execCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
      });
      mockGitModule.branchExists = vi.fn().mockResolvedValue(false);
      mockGitModule.listRemoteBranches = vi.fn().mockResolvedValue([]);
      mockGitModule.getRepoRoot = vi.fn().mockResolvedValue(mockRepoRoot);

      diService.getGitModule = vi.fn().mockResolvedValue(mockGitModule);

      await expect(diService.getRecordProjector())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });

    it('[EARS-E1] should throw error when project root not found (BacklogAdapter)', async () => {
      // Mock fs.access to reject (no worktree .gitgov directory)
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      // Mock GitModule — branch doesn't exist locally or remotely
      const mockGitModule = new Git.GitModule({
        repoRoot: mockRepoRoot,
        execCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' })
      });
      mockGitModule.branchExists = vi.fn().mockResolvedValue(false);
      mockGitModule.listRemoteBranches = vi.fn().mockResolvedValue([]);
      mockGitModule.getRepoRoot = vi.fn().mockResolvedValue(mockRepoRoot);

      diService.getGitModule = vi.fn().mockResolvedValue(mockGitModule);

      await expect(diService.getBacklogAdapter())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });

    it('[EARS-E2] should throw cache system error with message', async () => {
      // Mock fs.access to succeed
      mockFs.promises.access.mockResolvedValue(undefined);

      // Mock RecordProjector constructor to throw
      RecordProjection.RecordProjector.mockImplementationOnce(function() {
        throw new Error('Connection failed');
      });

      await expect(diService.getRecordProjector())
        .rejects.toThrow('❌ Failed to initialize cache system: Connection failed');
    });

    it('[EARS-E3] should throw backlog system error with message', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);

      // Mock BacklogAdapter constructor to throw
      Adapters.BacklogAdapter.mockImplementationOnce(function() {
        throw new Error('Database connection failed');
      });

      await expect(diService.getBacklogAdapter())
        .rejects.toThrow('❌ Failed to initialize backlog system: Database connection failed');
    });

    it('[EARS-E4] should handle non-Error types gracefully', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);

      // Mock RecordProjector to throw a string instead of Error
      RecordProjection.RecordProjector.mockImplementationOnce(function() {
        throw 'String error instead of Error object';
      });

      await expect(diService.getRecordProjector())
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
      // Mock findProjectRoot to return null
      corefs.findProjectRoot.mockReturnValue(null);

      // Reset projectRoot by creating a fresh instance
      DependencyInjectionService.reset();
      diService = DependencyInjectionService.getInstance();

      const isValid = await diService.validateDependencies();

      expect(isValid).toBe(false);
    });
  });
});
