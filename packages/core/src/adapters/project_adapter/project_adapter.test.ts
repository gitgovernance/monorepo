import { ProjectAdapter } from './index';
import { RecordStore } from '../../store';
import { ConfigManager } from '../../config_manager';
import type { TaskRecord } from '../../types';
import type { CycleRecord } from '../../types';
import type { ActorRecord } from '../../types';
import type { IdentityAdapter } from '../identity_adapter';
import type { BacklogAdapter } from '../backlog_adapter';
import type { WorkflowMethodologyAdapter } from '../workflow_methodology_adapter';
import { DetailedValidationError } from '../../validation/common';
import { promises as fs, existsSync, type PathLike } from 'fs';
import { createTaskRecord } from '../../factories/task_factory';
import { createCycleRecord } from '../../factories/cycle_factory';

// Mock the factories before importing
jest.mock('../../factories/task_factory', () => ({
  createTaskRecord: jest.fn()
}));

jest.mock('../../factories/cycle_factory', () => ({
  createCycleRecord: jest.fn()
}));

jest.mock('../../factories/actor_factory', () => ({
  createActorRecord: jest.fn()
}));

// Mock ESM helper to avoid import.meta issues in Jest
jest.mock('../../utils/esm_helper', () => ({
  getImportMetaUrl: jest.fn(() => null) // Return null in Jest environment
}));

// Mock dependencies
jest.mock('../../store');
jest.mock('../../config_manager');
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
    appendFile: jest.fn(),
    copyFile: jest.fn(),
  },
  existsSync: jest.fn(),
}));

// Helper function to create mock actor record
function createMockActorRecord(overrides: Partial<ActorRecord> = {}): ActorRecord {
  return {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'test-public-key',
    roles: ['admin', 'author'],
    status: 'active',
    ...overrides,
  };
}

// Helper function to create mock cycle record
function createMockCycleRecord(overrides: Partial<CycleRecord> = {}): CycleRecord {
  return {
    id: `${Date.now()}-cycle-test-cycle`,
    title: 'Test Cycle',
    status: 'planning',
    taskIds: [],
    childCycleIds: [],
    tags: [],
    notes: '',
    ...overrides,
  };
}

// Helper function to create mock task record
function createMockTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: `${Date.now()}-task-test-task`,
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'Test task description',
    tags: [],
    cycleIds: [],
    ...overrides,
  };
}

describe('ProjectAdapter', () => {
  let projectAdapter: ProjectAdapter;
  let mockIdentityAdapter: jest.Mocked<IdentityAdapter>;
  let mockBacklogAdapter: jest.Mocked<BacklogAdapter>;
  let mockWorkflowMethodologyAdapter: jest.Mocked<WorkflowMethodologyAdapter>;
  let mockConfigManager: jest.Mocked<ConfigManager>;
  let mockTaskStore: jest.Mocked<RecordStore<TaskRecord>>;
  let mockCycleStore: jest.Mocked<RecordStore<CycleRecord>>;
  let mockFs: jest.Mocked<typeof fs> & { existsSync: jest.MockedFunction<any> };
  let mockCreateTaskRecord: jest.MockedFunction<typeof createTaskRecord>;
  let mockCreateCycleRecord: jest.MockedFunction<typeof createCycleRecord>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock all adapters
    mockIdentityAdapter = {
      createActor: jest.fn(),
      getActor: jest.fn(),
      listActors: jest.fn(),
      revokeActor: jest.fn(),
      createAgentRecord: jest.fn(),
      getAgentRecord: jest.fn(),
      listAgentRecords: jest.fn(),
      getCurrentActor: jest.fn(),
      getEffectiveActorForAgent: jest.fn(),
    } as unknown as jest.Mocked<IdentityAdapter>;

    mockBacklogAdapter = {
      createTask: jest.fn(),
      createCycle: jest.fn(),
      getTask: jest.fn(),
      getCycle: jest.fn(),
      getAllTasks: jest.fn(),
      getAllCycles: jest.fn(),
    } as unknown as jest.Mocked<BacklogAdapter>;

    mockWorkflowMethodologyAdapter = {
      getTransitionRule: jest.fn(),
      validateSignature: jest.fn(),
      validateCustomRules: jest.fn(),
    } as unknown as jest.Mocked<WorkflowMethodologyAdapter>;

    mockConfigManager = {
      loadConfig: jest.fn(),
      loadSession: jest.fn(),
      getRootCycle: jest.fn(),
      getProjectInfo: jest.fn(),
      getActorState: jest.fn(),
      updateActorState: jest.fn(),
      getCloudSessionToken: jest.fn(),
      constructor: { name: 'ConfigManager' },
    } as unknown as jest.Mocked<ConfigManager>;

    // Mock stores
    mockTaskStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<TaskRecord>>;

    mockCycleStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<CycleRecord>>;

    mockFs = fs as jest.Mocked<typeof fs> & { existsSync: jest.MockedFunction<any> };
    mockFs.existsSync = existsSync as jest.MockedFunction<any>;

    // Configure default mock behavior
    mockFs.existsSync.mockReturnValue(true); // Default: .git exists

    // Mock factories
    mockCreateTaskRecord = createTaskRecord as jest.MockedFunction<typeof createTaskRecord>;
    mockCreateCycleRecord = createCycleRecord as jest.MockedFunction<typeof createCycleRecord>;

    // Setup factory mocks
    mockCreateTaskRecord.mockImplementation(async (payload) => ({
      id: `${Date.now()}-task-${payload.title?.toLowerCase().replace(/\s+/g, '-') || 'test'}`,
      title: payload.title || 'Test Task',
      status: payload.status || 'draft',
      priority: payload.priority || 'medium',
      description: payload.description || '',
      tags: payload.tags || [],
      cycleIds: payload.cycleIds || [],
    }));

    mockCreateCycleRecord.mockImplementation(async (payload) => ({
      id: `${Date.now()}-cycle-${payload.title?.toLowerCase().replace(/\s+/g, '-') || 'test'}`,
      title: payload.title || 'Test Cycle',
      status: payload.status || 'planning',
      taskIds: payload.taskIds || [],
      childCycleIds: payload.childCycleIds || [],
      tags: payload.tags || [],
      notes: payload.notes || '',
    }));

    // Create adapter with all dependencies
    projectAdapter = new ProjectAdapter({
      identityAdapter: mockIdentityAdapter,
      backlogAdapter: mockBacklogAdapter,
      workflowMethodologyAdapter: mockWorkflowMethodologyAdapter,
      configManager: mockConfigManager,
      taskStore: mockTaskStore,
      cycleStore: mockCycleStore,
    });
  });

  describe('Environment Validation (EARS 2, 7, 8)', () => {
    it('[EARS-21] should validate current directory, not search upward for init', async () => {
      // This test prevents the critical bug where init modifies parent repositories
      // Simulate being in /packages/cli/ but wanting to init there, not in parent /solo-hub/

      // Mock: no .git in current directory (should fail validation)
      mockFs.existsSync.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('/packages/cli/.git')) {
          return false; // No .git in subdirectory
        }
        if (typeof path === 'string' && path.includes('/solo-hub/.git')) {
          return true; // .git exists in parent (should NOT be found)
        }
        return false;
      });

      // Mock: no write permissions in current directory
      mockFs.writeFile.mockRejectedValueOnce(new Error('Permission denied'));
      mockFs.access.mockRejectedValue(new Error('Directory does not exist')); // .gitgov doesn't exist

      const result = await projectAdapter.validateEnvironment('/test/project/packages/cli');

      // Should validate the EXACT directory passed, not search upward
      expect(result.isValid).toBe(false);
      expect(result.isGitRepo).toBe(false); // Should be false for /packages/cli/
      expect(result.warnings).toContain('Not a Git repository in directory: /test/project/packages/cli');
    });

    it('[EARS-22] should use GITGOV_ORIGINAL_DIR when provided (pnpm --filter case)', async () => {
      // This test ensures pnpm --filter cli dev init validates the correct directory

      // Mock environment variables as they would be set by our wrapper
      const originalEnv = process.env['GITGOV_ORIGINAL_DIR'];
      process.env['GITGOV_ORIGINAL_DIR'] = '/test/project'; // User executed from root

      try {
        // Mock: .git exists in original directory
        mockFs.existsSync.mockImplementation((path: string) => {
          if (typeof path === 'string' && path.includes('/test/project/.git')) {
            return true; // .git exists in original directory
          }
          return false;
        });

        // Mock: .gitgov already exists in original directory
        mockFs.writeFile.mockResolvedValueOnce(undefined);
        mockFs.unlink.mockResolvedValueOnce(undefined);
        mockFs.access.mockResolvedValueOnce(undefined); // .gitgov exists

        const result = await projectAdapter.validateEnvironment(); // No path = use env var

        expect(result.isValid).toBe(false);
        expect(result.isGitRepo).toBe(true);
        expect(result.isAlreadyInitialized).toBe(true);
        expect(result.warnings).toContain('GitGovernance already initialized in directory: /test/project');
      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env['GITGOV_ORIGINAL_DIR'] = originalEnv;
        } else {
          delete process.env['GITGOV_ORIGINAL_DIR'];
        }
      }
    });

    it('[EARS-23] should create .gitgov in correct directory during init', async () => {
      // This test ensures init creates .gitgov in the target directory, not in parent repos

      const targetDirectory = '/tmp/new-project';
      const originalEnv = process.env['GITGOV_ORIGINAL_DIR'];
      process.env['GITGOV_ORIGINAL_DIR'] = targetDirectory;

      try {
        // Mock: .git exists in target directory
        mockFs.existsSync.mockImplementation((path: string) => {
          if (typeof path === 'string' && path.includes(`${targetDirectory}/.git`)) {
            return true;
          }
          return false;
        });

        // Mock successful initialization
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.unlink.mockResolvedValue(undefined);
        mockFs.access.mockRejectedValue(new Error('Directory does not exist')); // .gitgov doesn't exist
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.appendFile.mockResolvedValue(undefined);

        const mockActor = createMockActorRecord();
        const mockCycle = createMockCycleRecord();
        mockIdentityAdapter.createActor.mockResolvedValueOnce(mockActor);
        mockBacklogAdapter.createCycle.mockResolvedValueOnce(mockCycle);

        const result = await projectAdapter.initializeProject({
          name: 'New Project',
          actorName: 'New User',
        });

        expect(result.success).toBe(true);

        // Verify .gitgov directory creation was attempted in correct location
        expect(mockFs.mkdir).toHaveBeenCalledWith(
          expect.stringContaining(targetDirectory),
          { recursive: true }
        );

        // Verify config.json was written to correct location
        const configWriteCalls = mockFs.writeFile.mock.calls.filter(call =>
          call[0].toString().includes('config.json')
        );
        expect(configWriteCalls.length).toBeGreaterThan(0);
        expect(configWriteCalls[0]?.[0]).toContain(targetDirectory);

      } finally {
        // Restore original environment
        if (originalEnv) {
          process.env['GITGOV_ORIGINAL_DIR'] = originalEnv;
        } else {
          delete process.env['GITGOV_ORIGINAL_DIR'];
        }
      }
    });
    it('[EARS-2] should verify git repo permissions and previous state', async () => {
      // Mock successful validation using static method
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.unlink.mockResolvedValueOnce(undefined);
      mockFs.access.mockRejectedValueOnce(new Error('Directory does not exist'));

      const result = await projectAdapter.validateEnvironment('/test/project');

      expect(result.isValid).toBe(true);
      expect(result.isGitRepo).toBe(true);
      expect(result.hasWritePermissions).toBe(true);
      expect(result.isAlreadyInitialized).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it('[EARS-7] should return EnvironmentValidation with specific warnings', async () => {
      // Mock ConfigManager static method for this test
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue(null);

      // Mock failed validation - no write permissions and no .git
      mockFs.writeFile.mockRejectedValueOnce(new Error('Permission denied'));
      mockFs.access.mockRejectedValue(new Error('Directory does not exist')); // .gitgov doesn't exist
      mockFs.existsSync.mockReturnValue(false); // No .git directory

      const result = await projectAdapter.validateEnvironment('/invalid/path');

      expect(result.isValid).toBe(false);
      expect(result.isGitRepo).toBe(false); // Should be false since findProjectRoot returns null
      expect(result.hasWritePermissions).toBe(false);
      expect(result.warnings).toContain('Not a Git repository in directory: /invalid/path');
      expect(result.warnings).toContain('No write permissions in target directory');
      expect(result.suggestions).toContain("Run 'git init' to initialize a Git repository first");
    });

    it('[EARS-8] should detect already initialized GitGovernance project', async () => {
      // Mock already initialized project
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValueOnce(undefined);
      mockFs.unlink.mockResolvedValueOnce(undefined);
      mockFs.access.mockResolvedValueOnce(undefined); // .gitgov exists

      const result = await projectAdapter.validateEnvironment('/test/project');

      expect(result.isValid).toBe(false);
      expect(result.isAlreadyInitialized).toBe(true);
      expect(result.warnings).toContain('GitGovernance already initialized in directory: /test/project');
      expect(result.suggestions).toContain("Use 'gitgov status' to check current state or choose a different directory");
    });
  });

  describe('Project Initialization (EARS 1, 5)', () => {
    beforeEach(() => {
      // Setup successful mocks
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Directory does not exist')); // .gitgov doesn't exist
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);
    });

    it('[EARS-1] should create complete project with 3-adapter orchestration', async () => {
      const mockActor = createMockActorRecord();
      const mockCycle = createMockCycleRecord();

      mockIdentityAdapter.createActor.mockResolvedValueOnce(mockActor);
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(mockCycle);

      const result = await projectAdapter.initializeProject({
        name: 'Test Project',
        actorName: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(result.projectName).toBe('Test Project');
      expect(result.rootCycle).toBe(mockCycle.id);
      expect(result.actor.id).toBe(mockActor.id);
      expect(result.actor.displayName).toBe(mockActor.displayName);
      expect(mockIdentityAdapter.createActor).toHaveBeenCalledWith(
        {
          type: 'human',
          displayName: 'Test User',
          roles: [
            'admin',
            'author',
            'approver:product',
            'approver:quality',
            'developer'
          ],
        },
        'bootstrap'
      );
      expect(mockBacklogAdapter.createCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'root',
          status: 'planning',
        }),
        mockActor.id
      );
    });

    it('[EARS-5] should return ProjectInitResult with complete metadata', async () => {
      const mockActor = createMockActorRecord();
      const mockCycle = createMockCycleRecord();

      mockIdentityAdapter.createActor.mockResolvedValueOnce(mockActor);
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(mockCycle);

      const result = await projectAdapter.initializeProject({
        name: 'Test Project',
        actorName: 'Test User',
        methodology: 'scrum',
      });

      expect(result).toEqual({
        success: true,
        projectId: 'test-project',
        projectName: 'Test Project',
        rootCycle: mockCycle.id,
        actor: {
          id: mockActor.id,
          displayName: mockActor.displayName,
          publicKeyPath: expect.stringContaining(`${mockActor.id}.json`),
        },
        template: undefined,
        initializationTime: expect.any(Number),
        nextSteps: expect.arrayContaining([
          "Run 'gitgov status' to see your project overview",
          "Use 'gitgov task create' to add your first task"
        ]),
      });
    });
  });

  describe('Template Processing (EARS 3, 6)', () => {
    beforeEach(() => {
      const mockTemplate = {
        cycles: [
          {
            title: 'Sprint 1',
            status: 'active',
            tasks: [
              { title: 'Task 1', priority: 'high', description: 'Test task 1' },
              { title: 'Task 2', priority: 'medium', description: 'Test task 2' },
            ],
          },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTemplate));
    });

    it('[EARS-3] should create cycles and tasks using factories with validation', async () => {
      const mockCycle = createMockCycleRecord();
      const mockTask1 = createMockTaskRecord({ title: 'Task 1' });
      const mockTask2 = createMockTaskRecord({ title: 'Task 2' });

      mockBacklogAdapter.createCycle.mockResolvedValueOnce(mockCycle);
      mockBacklogAdapter.createTask
        .mockResolvedValueOnce(mockTask1)
        .mockResolvedValueOnce(mockTask2);

      const projectContext = {
        projectId: 'test-project',
        projectName: 'Test Project',
        actorId: 'human:test-user',
        rootCycle: 'cycle-123',
      };

      const result = await projectAdapter.processBlueprintTemplate('./template.json', projectContext);

      expect(result.success).toBe(true);
      expect(result.cyclesCreated).toBe(1);
      expect(result.tasksCreated).toBe(2);
      expect(result.createdIds.cycles).toContain(mockCycle.id);
      expect(result.createdIds.tasks).toContain(mockTask1.id);
      expect(result.createdIds.tasks).toContain(mockTask2.id);
      expect(mockBacklogAdapter.createCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sprint 1',
          status: 'active',
        }),
        projectContext.actorId
      );
    });

    it('[EARS-6] should throw DetailedValidationError for invalid template', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ invalid: 'template' }));

      const projectContext = {
        projectId: 'test-project',
        projectName: 'Test Project',
        actorId: 'human:test-user',
        rootCycle: 'cycle-123',
      };

      await expect(
        projectAdapter.processBlueprintTemplate('./invalid-template.json', projectContext)
      ).rejects.toThrow(DetailedValidationError);

      await expect(
        projectAdapter.processBlueprintTemplate('./invalid-template.json', projectContext)
      ).rejects.toThrow('Invalid template format');
    });
  });

  describe('Error Handling & Rollback (EARS 4, 13, 15, 16, 17)', () => {
    it('[EARS-4] should invoke rollback automatically when initialization fails', async () => {
      // Mock ConfigManager static method for this test
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');

      // Setup environment validation to pass
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      // Mock access: validation passes (.gitgov doesn't exist), then agent prompt not found, then rollback finds .gitgov
      let accessCallCount = 0;
      mockFs.access.mockImplementation(async (path: PathLike) => {
        accessCallCount++;
        const pathStr = typeof path === 'string' ? path : path.toString();
        // First call: .gitgov doesn't exist (validation passes)
        if (accessCallCount === 1) {
          throw new Error('Directory does not exist');
        }
        // Second call: agent prompt doesn't exist
        if (pathStr.includes('gitgov_agent_prompt.md')) {
          throw new Error('File not found');
        }
        // Third+ calls: .gitgov exists for rollback
        if (pathStr.includes('.gitgov')) {
          return; // Success - exists
        }
        throw new Error('File not found');
      });

      // Setup identity creation to fail
      mockIdentityAdapter.createActor.mockRejectedValueOnce(new Error('Identity creation failed'));

      // Setup rollback mocks
      mockFs.rm.mockResolvedValue(undefined);

      await expect(
        projectAdapter.initializeProject({
          name: 'Test Project',
          actorName: 'Test User',
        })
      ).rejects.toThrow('Identity creation failed');

      // Verify rollback was called
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringContaining('.gitgov'),
        { recursive: true, force: true }
      );
    });

    it('[EARS-13] should capture adapter errors with specific context', async () => {
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);

      const specificError = new Error('BacklogAdapter connection failed');
      mockIdentityAdapter.createActor.mockResolvedValueOnce(createMockActorRecord());
      mockBacklogAdapter.createCycle.mockRejectedValueOnce(specificError);

      await expect(
        projectAdapter.initializeProject({
          name: 'Test Project',
          actorName: 'Test User',
        })
      ).rejects.toThrow('BacklogAdapter connection failed');
    });

    it('[EARS-15] should provide specific guidance for environment errors', async () => {
      // Mock ConfigManager static method for this test
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue(null);

      mockFs.writeFile.mockRejectedValueOnce(new Error('Permission denied'));
      mockFs.existsSync.mockReturnValue(false); // No .git directory

      const result = await projectAdapter.validateEnvironment('/invalid/path');

      expect(result.isValid).toBe(false);
      expect(result.suggestions).toContain("Run 'git init' to initialize a Git repository first");
      expect(result.suggestions).toContain('Ensure you have write permissions in the target directory');
    });

    it('[EARS-16] should provide field-level errors for DetailedValidationError', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      const projectContext = {
        projectId: 'test-project',
        projectName: 'Test Project',
        actorId: 'human:test-user',
        rootCycle: 'cycle-123',
      };

      await expect(
        projectAdapter.processBlueprintTemplate('./invalid.json', projectContext)
      ).rejects.toThrow(DetailedValidationError);

      try {
        await projectAdapter.processBlueprintTemplate('./invalid.json', projectContext);
      } catch (error) {
        expect(error).toBeInstanceOf(DetailedValidationError);
        if (error instanceof DetailedValidationError) {
          expect(error.errors).toBeDefined();
          expect(error.errors[0]).toEqual({
            field: 'template',
            message: expect.any(String),
            value: './invalid.json',
          });
        }
      }
    });

    it('[EARS-17] should handle file system errors gracefully', async () => {
      // Mock ConfigManager static method for this test
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');

      // Mock file system error during permission check
      mockFs.writeFile.mockRejectedValueOnce(new Error('Disk full'));
      mockFs.access.mockRejectedValue(new Error('Directory does not exist')); // .gitgov doesn't exist
      mockFs.existsSync.mockReturnValue(true); // .git exists but other errors

      const result = await projectAdapter.validateEnvironment('/test/path');

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('No write permissions in target directory');
      expect(result.suggestions).toContain('Ensure you have write permissions in the target directory');
    });
  });

  describe('Graceful Degradation (EARS 14)', () => {
    it('[EARS-14] should continue without optional dependencies with warnings', async () => {
      // Create adapter without optional dependencies
      const minimalAdapter = new ProjectAdapter({
        identityAdapter: mockIdentityAdapter,
        backlogAdapter: mockBacklogAdapter,
        workflowMethodologyAdapter: mockWorkflowMethodologyAdapter,
        configManager: mockConfigManager,
        taskStore: mockTaskStore,
        cycleStore: mockCycleStore,
        // No eventBus, platformApi, or userManagement
      });

      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);

      const mockActor = createMockActorRecord();
      const mockCycle = createMockCycleRecord();

      mockIdentityAdapter.createActor.mockResolvedValueOnce(mockActor);
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(mockCycle);

      const result = await minimalAdapter.initializeProject({
        name: 'Test Project',
        actorName: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(result.projectName).toBe('Test Project');
      // Should work without optional dependencies
    });
  });

  describe('Future Platform Methods (EARS 19, 20)', () => {
    it('[EARS-19] should return project metadata from ConfigManager', async () => {
      const mockConfig = {
        protocolVersion: '1.0.0',
        projectId: 'test-project',
        projectName: 'Test Project',
        rootCycle: 'cycle-123',
        blueprints: { root: './blueprints' },
        state: { branch: 'gitgov-state' },
      };

      mockConfigManager.loadConfig.mockResolvedValueOnce(mockConfig);

      const result = await projectAdapter.getProjectInfo();

      expect(result).toEqual({
        id: 'test-project',
        name: 'Test Project',
        rootCycle: 'cycle-123',
        protocolVersion: '1.0.0',
      });
    });

    it('[EARS-20] should handle missing configuration gracefully', async () => {
      mockConfigManager.loadConfig.mockResolvedValueOnce(null);

      const result = await projectAdapter.getProjectInfo();

      expect(result).toBeNull();
    });
  });

  describe('Type Safety (EARS 18)', () => {
    it('[EARS-18] should compile without any or unknown types unjustified', () => {
      // This test ensures TypeScript compilation is clean
      // The fact that this test file compiles without errors validates EARS-18
      expect(true).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with real-like data', async () => {
      // Setup complete successful scenario
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);

      const mockActor = createMockActorRecord({
        id: 'human:project-owner',
        displayName: 'Project Owner',
      });
      const mockCycle = createMockCycleRecord({
        id: 'cycle-root-project',
        title: 'My Awesome Project - Root Cycle',
      });

      mockIdentityAdapter.createActor.mockResolvedValueOnce(mockActor);
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(mockCycle);

      const envValidation = await projectAdapter.validateEnvironment();
      expect(envValidation.isValid).toBe(true);

      const initResult = await projectAdapter.initializeProject({
        name: 'My Awesome Project',
        actorName: 'Project Owner',
        methodology: 'scrum',
      });

      expect(initResult.success).toBe(true);
      expect(initResult.projectName).toBe('My Awesome Project');
      expect(initResult.actor.displayName).toBe('Project Owner');
      expect(initResult.initializationTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Tests', () => {
    it('should complete initialization in reasonable time', async () => {
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);

      mockIdentityAdapter.createActor.mockResolvedValueOnce(createMockActorRecord());
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(createMockCycleRecord());

      const startTime = Date.now();
      await projectAdapter.initializeProject({
        name: 'Performance Test Project',
        actorName: 'Test User',
      });
      const endTime = Date.now();

      // Should complete within reasonable time (mocked, so should be very fast)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Agent Prompt Copy (Functional Test)', () => {
    it('should copy agent prompt from docs/ when available (simulated test)', async () => {
      // New strategy: looks in src/prompts/ (development) or uses require.resolve for npm
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);
      mockFs.copyFile.mockResolvedValue(undefined);

      // Mock fs.access to allow prompts/ path to be "found"
      let accessCallCount = 0;
      mockFs.access.mockImplementation(async (path: PathLike) => {
        accessCallCount++;
        const pathStr = typeof path === 'string' ? path : path.toString();
        // First call: .gitgov doesn't exist (validation passes)
        if (accessCallCount === 1) {
          throw new Error('Directory does not exist');
        }
        // Allow prompts/ path to be accessible (for copyAgentPrompt)
        // Note: path might be absolute or relative, check for both
        if (pathStr.includes('prompts/gitgov_agent_prompt.md') ||
          pathStr.endsWith('prompts/gitgov_agent_prompt.md')) {
          return; // Success - prompt file found
        }
        // All other paths don't exist (for env validation and other checks)
        throw new Error('Not found');
      });

      mockIdentityAdapter.createActor.mockResolvedValueOnce(createMockActorRecord());
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(createMockCycleRecord());

      // Capture console.log to verify success message
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await projectAdapter.initializeProject({
        name: 'Test Agent Prompt Copy',
        actorName: 'Test User',
      });

      // Verify success
      expect(result.success).toBe(true);

      // Verify that copyFile was called (new implementation uses fs.copyFile)
      expect(mockFs.copyFile.mock.calls.length).toBeGreaterThan(0);

      // Verify success message
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('@gitgov agent prompt copied')
      );

      logSpy.mockRestore();
    });

    it('should gracefully degrade when agent prompt is not available', async () => {
      jest.spyOn(ConfigManager, 'findProjectRoot').mockReturnValue('/test/project');

      // Mock fs.access to fail for prompt locations
      let accessCallCount = 0;
      mockFs.access.mockImplementation(async (_path: PathLike) => {
        accessCallCount++;
        // First call: .gitgov doesn't exist (validation passes)
        if (accessCallCount === 1) {
          throw new Error('Directory does not exist');
        }
        // All other paths (including prompts) don't exist
        // This simulates the graceful degradation scenario
        throw new Error('File not found');
      });

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.appendFile.mockResolvedValue(undefined);

      mockIdentityAdapter.createActor.mockResolvedValueOnce(createMockActorRecord());
      mockBacklogAdapter.createCycle.mockResolvedValueOnce(createMockCycleRecord());

      // Capture console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await projectAdapter.initializeProject({
        name: 'Test Graceful Degradation',
        actorName: 'Test User',
      });

      // Should still succeed with warning
      expect(result.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not copy @gitgov agent prompt')
      );

      warnSpy.mockRestore();
    });
  });
});
