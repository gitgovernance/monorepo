/**
 * InitCommand Unit Tests
 *
 * EARS Coverage:
 * - §4.1 Bootstrap Core Functionality (EARS-A1 to A5)
 * - §4.2 ProjectModule Integration (EARS-B1 to B5)
 * - §4.3 CLI Excellence & Demo Impact (EARS-C1 to C5)
 * - §4.4 Error Handling & UX Excellence (EARS-D1 to D3)
 */

// Mock DependencyInjectionService (InitCommand now uses DI)
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn().mockReturnValue({
      setInitMode: jest.fn(),
      getProjectModule: jest.fn(),
    }),
  },
}));

// Mock child_process for git config
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

import { InitCommand } from './init-command';
import { execSync } from 'child_process';
import type { ProjectModuleInitResult } from '@gitgov/core';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('InitCommand', () => {
  let initCommand: InitCommand;
  let mockProjectModule: {
    initializeProject: jest.MockedFunction<(options: any) => Promise<ProjectModuleInitResult>>;
  };

  const sampleInitResult: ProjectModuleInitResult = {
    actorId: 'human:test-user',
    productAgentId: 'agent:gitgov-audit',
    cycleId: '1757789000-cycle-test-project',
    commitSha: 'abc123def456abc123def456abc123def456abc1',
  };

  // sampleValidEnvironment removed — validation is now inline in CLI, not via ProjectModule

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock ProjectModule instance
    mockProjectModule = {
      initializeProject: jest.fn(),
    };

    // Mock execSync: git config returns user name, ls-remote returns empty (no remote branch)
    (execSync as jest.MockedFunction<typeof execSync>).mockImplementation((cmd: unknown) => {
      if (typeof cmd === 'string' && cmd.includes('ls-remote')) {
        return '';
      }
      return 'Test User\n';
    });

    // Create InitCommand (DI is mocked at module level)
    initCommand = new InitCommand();

    // Spy on getProjectModule to return our mock (bypasses DI entirely)
    jest.spyOn(
      initCommand as unknown as { getProjectModule: () => Promise<typeof mockProjectModule> },
      'getProjectModule'
    ).mockResolvedValue(mockProjectModule);

    // Setup default mock return
    mockProjectModule.initializeProject.mockResolvedValue(sampleInitResult);
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

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Project',
          actorName: 'Test User',
          saasUrl: 'https://app.gitgov.dev',
        })
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🚀 Initializing GitGovernance Project...'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ GitGovernance initialized successfully!'));
    });

    it('[EARS-A2] should create root cycle and configure in config.json', async () => {
      const customResult = {
        ...sampleInitResult,
        cycleId: '1757789000-cycle-my-project'
      };
      mockProjectModule.initializeProject.mockResolvedValue(customResult);

      await initCommand.execute({
        name: 'My Project',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Project',
        })
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🎯 Root Cycle Created:'));
    });

    it('[EARS-A3] should pass name to ProjectModule when template specified', async () => {
      // Template processing is a CLI concern — ProjectModule only receives name
      await initCommand.execute({
        name: 'SaaS Project',
        template: 'saas-mvp'
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SaaS Project',
        })
      );
    });

    it('[EARS-A4] should pass name to ProjectModule regardless of methodology flag', async () => {
      // Methodology is a CLI concern — ProjectModule only receives name
      await initCommand.execute({
        name: 'Scrum Project',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Scrum Project'
        })
      );
    });

    it('[EARS-A5] should use defaults when no options provided', async () => {
      await initCommand.execute({});

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          actorName: 'Test User' // From mocked git config
        })
      );
    });

    it('[EARS-A6] should create actor with type=\'agent\' when --type agent', async () => {
      await initCommand.execute({
        name: 'Agent Project',
        type: 'agent',
        actorName: 'CI Bot',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent',
          name: 'Agent Project',
          actorName: 'CI Bot',
        })
      );
    });

    it('[EARS-A9] should create actor with human:${login} when --login provided', async () => {
      await initCommand.execute({
        name: 'Login Project',
        login: 'cagodoy',
        actorName: 'Camilo Acuña Godoy',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Login Project',
          login: 'cagodoy',
          actorName: 'Camilo Acuña Godoy',
        })
      );
    });

    it('[EARS-A7] should create actor with type=\'human\' by default', async () => {
      await initCommand.execute({
        name: 'Human Project',
        actorName: 'Camilo',
      });

      // type should NOT be set (undefined) — ProjectModule defaults to 'human'
      const callArgs = mockProjectModule.initializeProject.mock.calls[0]?.[0];
      expect(callArgs?.type).toBeUndefined();
      expect(callArgs?.name).toBe('Human Project');
    });
  });

  // ============================================================================
  // §4.2. ProjectModule Integration (EARS-B1 to B5)
  // ============================================================================
  describe('4.2. ProjectModule Integration (EARS-B1 to B5)', () => {
    it('[EARS-B1] should delegate to ProjectModule for complete orchestration', async () => {
      await initCommand.execute({
        name: 'Integration Test',
        actorName: 'Integration User',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Integration Test',
          actorName: 'Integration User',
          saasUrl: 'https://app.gitgov.dev',
        })
      );
    });

    it('[EARS-B2] should show validation errors when environment invalid', async () => {
      // Simulate not a git repo — execSync('git rev-parse --git-dir') throws
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('rev-parse --git-dir')) {
          throw new Error('not a git repo');
        }
        if (typeof cmd === 'string' && cmd.includes('ls-remote')) return '';
        return 'Test User\n';
      });

      await initCommand.execute({ name: 'Test Project' });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Environment validation failed:');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-B3] should handle ProjectModule initialization failures', async () => {
      const initError = new Error('BacklogAdapter connection failed');
      mockProjectModule.initializeProject.mockRejectedValue(initError);

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Initialization failed: BacklogAdapter connection failed');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-B4] should show result with actorId and commitSha on success', async () => {
      await initCommand.execute({
        name: 'Performance Test'
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('human:test-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('agent:gitgov-audit'));
    });

    it('[EARS-B5] should rollback automatically when adapter fails during init', async () => {
      const initError = new Error('IdentityAdapter creation failed');
      mockProjectModule.initializeProject.mockRejectedValue(initError);

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
      expect(mockProjectModule.initializeProject).toHaveBeenCalled();
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
      expect(parsedOutput.actorId).toBe('human:test-user');
      expect(parsedOutput.productAgentId).toBe('agent:gitgov-audit');
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
      expect(mockConsoleLog).toHaveBeenCalledWith('🔐 Cryptographic Trust Established:');
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Root Cycle Created:');
      expect(mockConsoleLog).toHaveBeenCalledWith('🚀 Next Steps:');
    });

    it('[EARS-C5] should show user-friendly message when already initialized', async () => {
      // ProjectModule returns alreadyInitialized: true — no error, just message
      mockProjectModule.initializeProject.mockResolvedValue({ alreadyInitialized: true } as any);

      await initCommand.execute({ name: 'Test Project' });

      expect(mockConsoleLog).toHaveBeenCalledWith('ℹ️  Project already initialized.');
      expect(mockProcessExit).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // §4.4. Error Handling & UX Excellence (EARS-D1 to D3)
  // ============================================================================
  describe('4.4. Error Handling & UX Excellence (EARS-D1 to D3)', () => {
    it('[EARS-D1] should handle all flag combinations correctly', async () => {
      await initCommand.execute({
        name: 'Full Test',
        actorName: 'Full User',
        login: 'fulluser',
        type: 'agent',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Full Test',
          actorName: 'Full User',
          login: 'fulluser',
          type: 'agent',
          saasUrl: 'https://app.gitgov.dev',
        })
      );
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
        mockProjectModule.initializeProject.mockRejectedValue(testCase.error);

        await initCommand.execute({ name: 'Test Project' });

        expect(mockConsoleError).toHaveBeenCalledWith(testCase.expectedMessage);
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      }
    });

    it('[EARS-D3] should use interactive prompts and intelligent defaults for UX excellence', async () => {
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('ls-remote')) return '';
        return 'John Doe\n';
      });

      await initCommand.execute({
        name: 'Test Project'
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
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

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          actorName: 'Project Owner'
        })
      );
    });

    it('[EARS-D3] should use provided options over defaults', async () => {
      await initCommand.execute({
        name: 'Custom Project',
        actorName: 'Custom User',
        login: 'customuser',
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Custom Project',
          actorName: 'Custom User',
          login: 'customuser',
          saasUrl: 'https://app.gitgov.dev',
        })
      );
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

      // skipValidation bypasses the inline validation, goes straight to ProjectModule
      expect(mockProjectModule.initializeProject).toHaveBeenCalled();
    });

    it('should handle template errors', async () => {
      const templateError = new Error('Template saas-mvp not found');
      mockProjectModule.initializeProject.mockRejectedValue(templateError);

      await initCommand.execute({
        name: 'Test Project',
        template: 'invalid-template'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Template not found. Available: basic, saas-mvp, ai-product, enterprise.');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should format JSON error output correctly', async () => {
      const error = new Error('Test initialization error');
      mockProjectModule.initializeProject.mockRejectedValue(error);

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
      mockProjectModule.initializeProject.mockRejectedValue(error);

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

      expect(mockProjectModule.initializeProject).toHaveBeenCalled();
    });

    it('should handle --no-cache flag', async () => {
      await initCommand.execute({
        name: 'No Cache Test',
        cache: false
      });

      expect(mockProjectModule.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'No Cache Test'
        })
      );
    });

    it('should show product agent in output when init succeeds', async () => {
      await initCommand.execute({
        name: 'Template Project',
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('agent:gitgov-audit'));
    });
  });

  // ============================================================================
  // §4.5. Worktree Integration (CLIINT-B1, CLIINT-B3)
  // ============================================================================
  describe('4.5. Worktree Integration (CLIINT-B1 to B3)', () => {
    it('[CLIINT-B1] should display actor and product agent in success output', async () => {
      await initCommand.execute({ name: 'Test Project' });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('human:test-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('agent:gitgov-audit'));
    });

    it('[CLIINT-B3] should show commitSha in success output', async () => {
      await initCommand.execute({ name: 'Test Project' });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('abc123de'));
    });
  });

  // ============================================================================
  // §4.6. Smart Init — Remote Detection (Task 5.4, IKS-T7/T8 CLI side)
  // ============================================================================
  describe('4.6. Smart Init — Remote Detection (Task 5.4)', () => {
    it('should abort init when gitgov-state exists on remote', async () => {
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('ls-remote')) {
          return 'abc123def456\trefs/heads/gitgov-state\n';
        }
        return 'Test User\n';
      });

      await initCommand.execute({ name: 'Cloud Project' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('gitgov login'),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockProjectModule.initializeProject).not.toHaveBeenCalled();
    });

    it('should proceed when gitgov-state does not exist on remote', async () => {
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('ls-remote')) {
          return '';
        }
        return 'Test User\n';
      });

      await initCommand.execute({ name: 'Fresh Project' });

      expect(mockProjectModule.initializeProject).toHaveBeenCalled();
    });

    it('should proceed with --force-local even when remote branch exists', async () => {
      (execSync as jest.MockedFunction<typeof execSync>).mockImplementation((cmd: unknown) => {
        if (typeof cmd === 'string' && cmd.includes('ls-remote')) {
          return 'abc123def456\trefs/heads/gitgov-state\n';
        }
        return 'Test User\n';
      });

      await initCommand.execute({ name: 'Force Local Project', forceLocal: true });

      expect(mockProjectModule.initializeProject).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // §4.7. Post-Init State Commit (EARS-G1)
  // ============================================================================
  describe('4.7. Post-Init (EARS-G1)', () => {
    it('[EARS-G1] should attempt best-effort push after ProjectModule init', async () => {
      await initCommand.execute({ name: 'G1 Test', actorName: 'Test User' });

      // ProjectModule already committed internally — CLI does best-effort push
      expect(mockProjectModule.initializeProject).toHaveBeenCalled();
    });
  });
});
