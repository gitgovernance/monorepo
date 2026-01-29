/**
 * InitCommand Unit Tests
 *
 * Blueprint: packages/blueprints/03_products/cli/specs/init_command.md
 * All EARS prefixes map to init_command.md §4.1-4.4
 *
 * EARS Coverage:
 * - §4.1 Bootstrap Core Functionality (EARS-A1 to A5)
 * - §4.2 ProjectAdapter Integration (EARS-B1 to B5)
 * - §4.3 CLI Excellence & Demo Impact (EARS-C1 to C5)
 * - §4.4 Error Handling & UX Excellence (EARS-D1 to D3)
 */

// Mock @gitgov/core with all required modules
jest.doMock('@gitgov/core', () => ({
  Adapters: {
    ProjectAdapter: jest.fn().mockImplementation(() => ({
      initializeProject: jest.fn(),
      validateEnvironment: jest.fn()
    })),
    IdentityAdapter: jest.fn().mockImplementation(() => ({})),
    BacklogAdapter: jest.fn().mockImplementation(() => ({})),
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
    FeedbackAdapter: jest.fn().mockImplementation(() => ({})),
    ExecutionAdapter: jest.fn().mockImplementation(() => ({})),
    ChangelogAdapter: jest.fn().mockImplementation(() => ({
      create: jest.fn().mockResolvedValue({
        id: 'test-changelog',
        name: 'Test Changelog',
        description: 'Description for test changelog',
        createdAt: '2023-10-27T10:00:00Z',
        updatedAt: '2023-10-27T10:00:00Z',
        createdBy: 'human:test-user',
        updatedBy: 'human:test-user',
        version: 1,
        cycles: [],
        tasks: []
      }),
      getAllChangelogs: jest.fn().mockResolvedValue([])
    })),
    MetricsAdapter: jest.fn().mockImplementation(() => ({}))
  },
  EventBus: {
    EventBus: jest.fn().mockImplementation(() => ({
      publish: jest.fn(),
      subscribe: jest.fn().mockReturnValue({ id: 'mock-subscription' }),
      unsubscribe: jest.fn()
    }))
  },
  Store: {
    RecordStore: jest.fn().mockImplementation(() => ({}))
  },
  Modules: {
    EventBus: jest.fn().mockImplementation(() => ({}))
  },
  EventBusModule: {
    EventBus: jest.fn().mockImplementation(() => ({}))
  },
  Config: {
    ConfigManager: {
      findProjectRoot: jest.fn(),
      findGitgovRoot: jest.fn(),
      getGitgovPath: jest.fn(),
      isGitgovProject: jest.fn()
    },
    createConfigManager: jest.fn().mockImplementation(() => ({
      loadConfig: jest.fn(),
      loadSession: jest.fn(),
      saveConfig: jest.fn(),
      saveSession: jest.fn(),
      getRootCycle: jest.fn()
    }))
  },
  Records: {},
  Factories: {
    loadTaskRecord: jest.fn((data) => data),
    loadCycleRecord: jest.fn((data) => data),
    loadActorRecord: jest.fn((data) => data),
    loadAgentRecord: jest.fn((data) => data),
    loadFeedbackRecord: jest.fn((data) => data),
    loadExecutionRecord: jest.fn((data) => data),
    loadChangelogRecord: jest.fn((data) => data)
  }
}));

// Mock @gitgov/core/fs for FsProjectInitializer
jest.doMock('@gitgov/core/fs', () => ({
  FsProjectInitializer: jest.fn().mockImplementation(() => ({
    createProjectStructure: jest.fn().mockResolvedValue(undefined),
    isInitialized: jest.fn().mockResolvedValue(false),
    writeConfig: jest.fn().mockResolvedValue(undefined),
    initializeSession: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    validateEnvironment: jest.fn().mockResolvedValue({
      isValid: true,
      isGitRepo: true,
      hasWritePermissions: true,
      isAlreadyInitialized: false,
      warnings: [],
      suggestions: []
    }),
    readFile: jest.fn().mockResolvedValue('{}'),
    copyAgentPrompt: jest.fn().mockResolvedValue(undefined),
    setupGitIntegration: jest.fn().mockResolvedValue(undefined),
    getActorPath: jest.fn().mockReturnValue('/test/.gitgov/actors/test.json')
  })),
  FsStore: jest.fn().mockImplementation(() => ({})),
  FsKeyProvider: jest.fn().mockImplementation(() => ({})),
  FsFileLister: jest.fn().mockImplementation(() => ({}))
}));

// Mock child_process for git config
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

import { InitCommand } from './init-command';
import { execSync } from 'child_process';
import type { EnvironmentValidation, ProjectInitResult } from '@gitgov/core';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('InitCommand', () => {
  let initCommand: InitCommand;
  let mockProjectAdapter: {
    initializeProject: jest.MockedFunction<(options: any) => Promise<ProjectInitResult>>;
    validateEnvironment: jest.MockedFunction<() => Promise<EnvironmentValidation>>;
  };

  const sampleInitResult: ProjectInitResult = {
    success: true,
    projectId: 'test-project',
    projectName: 'Test Project',
    rootCycle: '1757789000-cycle-test-project',
    actor: {
      id: 'human:test-user',
      displayName: 'Test User',
      publicKeyPath: '/test/.gitgov/actors/human-test-user.json'
    },
    initializationTime: 250,
    nextSteps: [
      "Run 'gitgov status' to see your project overview",
      "Use 'gitgov task create' to add your first task"
    ]
  };

  const sampleValidEnvironment: EnvironmentValidation = {
    isValid: true,
    isGitRepo: true,
    hasWritePermissions: true,
    isAlreadyInitialized: false,
    warnings: [],
    suggestions: []
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mocked ProjectAdapter from the unified mock
    const { Adapters } = require('@gitgov/core');
    const MockedProjectAdapter = Adapters.ProjectAdapter as jest.MockedClass<any>;

    // Create a mock instance
    mockProjectAdapter = {
      initializeProject: jest.fn(),
      validateEnvironment: jest.fn()
    };

    // Configure the mock to return our instance
    MockedProjectAdapter.mockImplementation(() => mockProjectAdapter);

    // Mock execSync for git config
    (execSync as jest.MockedFunction<typeof execSync>).mockReturnValue('Test User\n');

    // Create InitCommand
    initCommand = new InitCommand();

    // SPY on getProjectAdapter to return our mock
    jest.spyOn(
      initCommand as unknown as { getProjectAdapter: () => Promise<typeof mockProjectAdapter> },
      'getProjectAdapter'
    ).mockResolvedValue(mockProjectAdapter);

    // Setup default mock returns for ALL tests
    mockProjectAdapter.validateEnvironment.mockResolvedValue(sampleValidEnvironment);
    mockProjectAdapter.initializeProject.mockResolvedValue(sampleInitResult);
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    mockProcessExit.mockClear();
  });

  // ============================================================================
  // §4.1. Bootstrap Core Functionality (EARS-A1 to A5)
  // ============================================================================
  describe('4.1. Bootstrap Core Functionality (EARS-A1 to A5)', () => {
    it('[EARS-A1] should create complete gitgov structure and trust root', async () => {
      await initCommand.execute({
        name: 'Test Project',
        actorName: 'Test User'
      });

      expect(mockProjectAdapter.validateEnvironment).toHaveBeenCalled();
      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith({
        name: 'Test Project',
        template: undefined,
        actorName: 'Test User',
        actorEmail: undefined,
        methodology: undefined,
        skipValidation: undefined,
        verbose: undefined
      });
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🚀 Initializing GitGovernance Project...'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ GitGovernance initialized successfully!'));
    });

    it('[EARS-A2] should create root cycle and configure in config.json', async () => {
      const customResult = {
        ...sampleInitResult,
        projectName: 'My Project',
        rootCycle: '1757789000-cycle-my-project'
      };
      mockProjectAdapter.initializeProject.mockResolvedValue(customResult);

      await initCommand.execute({
        name: 'My Project',
        methodology: 'scrum'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Project',
          methodology: 'scrum'
        })
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🎯 Root Cycle Created:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('My Project'));
    });

    it('[EARS-A3] should process template when specified', async () => {
      const resultWithTemplate = {
        ...sampleInitResult,
        template: {
          processed: true,
          cyclesCreated: 2,
          tasksCreated: 5
        }
      };
      mockProjectAdapter.initializeProject.mockResolvedValue(resultWithTemplate);

      await initCommand.execute({
        name: 'SaaS Project',
        template: 'saas-mvp'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'saas-mvp'
        })
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Blueprint Template Processed:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('2 cycles created'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('5 tasks created'));
    });

    it('[EARS-A4] should configure methodology according to flag', async () => {
      await initCommand.execute({
        name: 'Scrum Project',
        methodology: 'scrum'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          methodology: 'scrum'
        })
      );
    });

    it('[EARS-A5] should use defaults when no options provided', async () => {
      await initCommand.execute({});

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          actorName: 'Test User' // From mocked git config
        })
      );
    });
  });

  // ============================================================================
  // §4.2. ProjectAdapter Integration (EARS-B1 to B5)
  // ============================================================================
  describe('4.2. ProjectAdapter Integration (EARS-B1 to B5)', () => {
    it('[EARS-B1] should delegate to ProjectAdapter for complete orchestration', async () => {
      await initCommand.execute({
        name: 'Integration Test',
        actorName: 'Integration User',
        methodology: 'scrum',
        template: 'basic'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith({
        name: 'Integration Test',
        template: 'basic',
        actorName: 'Integration User',
        actorEmail: undefined,
        methodology: 'scrum',
        skipValidation: undefined,
        verbose: undefined
      });
    });

    it('[EARS-B2] should handle ProjectAdapter validation errors', async () => {
      const invalidEnvironment: EnvironmentValidation = {
        isValid: false,
        isGitRepo: false,
        hasWritePermissions: true,
        isAlreadyInitialized: false,
        warnings: ['Not a Git repository'],
        suggestions: ["Run 'git init' to initialize a Git repository first"]
      };
      mockProjectAdapter.validateEnvironment.mockResolvedValue(invalidEnvironment);

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Environment validation failed:');
      expect(mockConsoleError).toHaveBeenCalledWith('  • Not a Git repository');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-B3] should handle ProjectAdapter initialization failures', async () => {
      const initError = new Error('BacklogAdapter connection failed');
      mockProjectAdapter.initializeProject.mockRejectedValue(initError);

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Initialization failed: BacklogAdapter connection failed');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-B4] should show performance metrics in output', async () => {
      await initCommand.execute({
        name: 'Performance Test'
      });

      expect(mockConsoleLog).toHaveBeenCalledWith('⚡ Performance Optimized:');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('250ms'));
    });

    it('[EARS-B5] should rollback automatically when adapter fails during init', async () => {
      const initError = new Error('IdentityAdapter creation failed');
      mockProjectAdapter.initializeProject.mockRejectedValue(initError);

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Initialization failed: IdentityAdapter creation failed');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================================
  // §4.3. CLI Excellence & Demo Impact (EARS-C1 to C5)
  // ============================================================================
  describe('4.3. CLI Excellence & Demo Impact (EARS-C1 to C5)', () => {
    it('[EARS-C1] should show detailed progress with verbose flag', async () => {
      await initCommand.execute({
        name: 'Test Project',
        verbose: true
      });

      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Environment validation passed');
      expect(mockProjectAdapter.validateEnvironment).toHaveBeenCalled();
      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          verbose: true
        })
      );
    });

    it('[EARS-C2] should return structured JSON output with json flag', async () => {
      await initCommand.execute({
        name: 'Test Project',
        json: true
      });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": true')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.project.id).toBe('test-project');
      expect(parsedOutput.actor.displayName).toBe('Test User');
    });

    it('[EARS-C3] should suppress output with quiet flag for scripting', async () => {
      await initCommand.execute({
        name: 'Test Project',
        quiet: true
      });

      expect(mockConsoleLog).not.toHaveBeenCalledWith('🚀 Initializing GitGovernance Project...');
      expect(mockConsoleLog).not.toHaveBeenCalledWith('🎉 GitGovernance initialization completed successfully!');
    });

    it('[EARS-C4] should show visually impactful output when initialization complete', async () => {
      await initCommand.execute({
        name: 'Demo Project',
        actorName: 'Demo User'
      });

      expect(mockConsoleLog).toHaveBeenCalledWith('✅ GitGovernance initialized successfully!\n');
      expect(mockConsoleLog).toHaveBeenCalledWith('🏗️  Project Structure Created:');
      expect(mockConsoleLog).toHaveBeenCalledWith('🔐 Cryptographic Trust Established:');
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Root Cycle Created:');
      expect(mockConsoleLog).toHaveBeenCalledWith('⚡ Performance Optimized:');
      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Next Steps:');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 Pro Tips:');
    });

    it('[EARS-C5] should show user-friendly error when already initialized', async () => {
      const invalidEnvironment: EnvironmentValidation = {
        isValid: false,
        isGitRepo: true,
        hasWritePermissions: true,
        isAlreadyInitialized: true,
        warnings: ['GitGovernance already initialized in this directory'],
        suggestions: ["Use 'gitgov status' to check current state or choose a different directory"]
      };
      mockProjectAdapter.validateEnvironment.mockResolvedValue(invalidEnvironment);

      await initCommand.execute({ name: 'Test Project' });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Environment validation failed:');
      expect(mockConsoleError).toHaveBeenCalledWith('  • GitGovernance already initialized in this directory');
      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 Suggestions:');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================================
  // §4.4. Error Handling & UX Excellence (EARS-D1 to D3)
  // ============================================================================
  describe('4.4. Error Handling & UX Excellence (EARS-D1 to D3)', () => {
    it('[EARS-D1] should handle all flag combinations correctly', async () => {
      await initCommand.execute({
        name: 'Full Test',
        template: 'enterprise',
        methodology: 'scrum',
        actorName: 'Full User',
        actorEmail: 'user@example.com',
        verbose: true,
        cache: false
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith({
        name: 'Full Test',
        template: 'enterprise',
        actorName: 'Full User',
        actorEmail: 'user@example.com',
        methodology: 'scrum',
        skipValidation: undefined,
        verbose: true
      });
    });

    it('[EARS-D2] should show user-friendly error messages with troubleshooting suggestions', async () => {
      const testCases = [
        {
          error: new Error('Environment validation failed: Not a Git repository'),
          expectedMessage: 'Environment validation failed: Not a Git repository'
        },
        {
          error: new Error('GitGovernance already initialized'),
          expectedMessage: '❌ GitGovernance already initialized. Use --force to re-initialize.'
        },
        {
          error: new Error('Not a Git repository'),
          expectedMessage: "❌ Not a Git repository. Please run 'git init' first."
        },
        {
          error: new Error('Template saas-enterprise not found'),
          expectedMessage: '❌ Template not found. Available: basic, saas-mvp, ai-product, enterprise.'
        }
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockProjectAdapter.initializeProject.mockRejectedValue(testCase.error);

        await initCommand.execute({ name: 'Test Project' });

        expect(mockConsoleError).toHaveBeenCalledWith(testCase.expectedMessage);
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    });

    it('[EARS-D3] should use interactive prompts and intelligent defaults for UX excellence', async () => {
      (execSync as jest.MockedFunction<typeof execSync>).mockReturnValue('John Doe\n');

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          actorName: 'John Doe'
        })
      );
    });

    // Additional tests for D3 edge cases
    it('[EARS-D3] should fallback to default actor name when git config fails', async () => {
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation(() => {
        throw new Error('git config failed');
      });

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          actorName: 'Project Owner'
        })
      );
    });

    it('[EARS-D3] should use provided options over defaults', async () => {
      await initCommand.execute({
        name: 'Custom Project',
        actorName: 'Custom User',
        methodology: 'kanban',
        template: 'enterprise'
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith({
        name: 'Custom Project',
        template: 'enterprise',
        actorName: 'Custom User',
        actorEmail: undefined,
        methodology: 'kanban',
        skipValidation: undefined,
        verbose: undefined
      });
    });
  });

  // ============================================================================
  // Additional Helper Tests (not EARS-mapped, support coverage)
  // ============================================================================
  describe('Additional Coverage', () => {
    it('should skip validation with --skip-validation flag', async () => {
      await initCommand.execute({
        name: 'Test Project',
        skipValidation: true
      });

      expect(mockProjectAdapter.validateEnvironment).not.toHaveBeenCalled();
      expect(mockProjectAdapter.initializeProject).toHaveBeenCalled();
    });

    it('should handle template errors', async () => {
      const templateError = new Error('Template saas-mvp not found');
      mockProjectAdapter.initializeProject.mockRejectedValue(templateError);

      await initCommand.execute({
        name: 'Test Project',
        template: 'invalid-template'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Template not found. Available: basic, saas-mvp, ai-product, enterprise.');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should format JSON error output correctly', async () => {
      const error = new Error('Test initialization error');
      mockProjectAdapter.initializeProject.mockRejectedValue(error);

      await initCommand.execute({
        name: 'Test Project',
        json: true
      });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(false);
      expect(parsedOutput.error).toContain('❌ Initialization failed: Test initialization error');
    });

    it('should show troubleshooting suggestions on error', async () => {
      const error = new Error('Permission denied');
      mockProjectAdapter.initializeProject.mockRejectedValue(error);

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockConsoleLog).toHaveBeenCalledWith('\n💡 Troubleshooting:');
      expect(mockConsoleLog).toHaveBeenCalledWith("   • Ensure you're in a Git repository");
      expect(mockConsoleLog).toHaveBeenCalledWith('   • Check file permissions in current directory');
    });

    it('should handle --force flag (future implementation)', async () => {
      await initCommand.execute({
        name: 'Force Test',
        force: true
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalled();
    });

    it('should handle --no-cache flag', async () => {
      await initCommand.execute({
        name: 'No Cache Test',
        cache: false
      });

      expect(mockProjectAdapter.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'No Cache Test'
        })
      );
    });

    it('should show template processing details when template used', async () => {
      const resultWithTemplate = {
        ...sampleInitResult,
        template: {
          processed: true,
          cyclesCreated: 3,
          tasksCreated: 8
        }
      };
      mockProjectAdapter.initializeProject.mockResolvedValue(resultWithTemplate);

      await initCommand.execute({
        name: 'Template Project',
        template: 'saas-mvp'
      });

      expect(mockConsoleLog).toHaveBeenCalledWith('📋 Blueprint Template Processed:');
      expect(mockConsoleLog).toHaveBeenCalledWith('   ✅ 3 cycles created');
      expect(mockConsoleLog).toHaveBeenCalledWith('   ✅ 8 tasks created');
    });
  });
});
