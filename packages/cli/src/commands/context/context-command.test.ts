// Mock @gitgov/core FIRST to avoid import.meta issues in Jest
jest.mock('@gitgov/core', () => ({
  Config: {
    ConfigManager: jest.fn()
  },
  Records: {}
}));

// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { ContextCommand } from './context-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import { Config } from '@gitgov/core';
import type { ActorRecord } from '@gitgov/core';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('ContextCommand - Complete Unit Tests', () => {
  let contextCommand: ContextCommand;
  let mockConfigManager: {
    getActorContext: jest.MockedFunction<(actorId: string) => Promise<{
      actorId: string;
      activeCycleId: string | null;
      activeTaskId: string | null;
      rootCycle: string | null;
      projectInfo: { id: string; name: string } | null;
    }>>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
  };
  let mockDependencyService: {
    getIdentityAdapter: jest.MockedFunction<() => Promise<typeof mockIdentityAdapter>>;
  };

  const sampleActor: ActorRecord = {
    id: 'human:test-user',
    displayName: 'Test User',
    type: 'human',
    publicKey: 'test-public-key-base64',
    roles: ['developer']
  };

  const sampleContext = {
    actorId: 'human:test-user',
    activeCycleId: '1757789000-cycle-test-cycle',
    activeTaskId: '1757789000-task-test-task',
    rootCycle: '1757789000-cycle-root',
    projectInfo: {
      id: 'test-project',
      name: 'Test Project'
    }
  };

  const sampleContextNoActive = {
    actorId: 'human:test-user',
    activeCycleId: null,
    activeTaskId: null,
    rootCycle: '1757789000-cycle-root',
    projectInfo: {
      id: 'test-project',
      name: 'Test Project'
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock ConfigManager
    mockConfigManager = {
      getActorContext: jest.fn()
    };

    // Create mock IdentityAdapter
    mockIdentityAdapter = {
      getCurrentActor: jest.fn()
    };

    // Create mock dependency service
    mockDependencyService = {
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter)
    };

    // Mock DependencyInjectionService.getInstance()
    (DependencyInjectionService.getInstance as jest.Mock).mockReturnValue(mockDependencyService);

    // Mock Config.ConfigManager constructor
    (Config.ConfigManager as unknown as jest.Mock).mockImplementation(() => mockConfigManager);

    // Create ContextCommand
    contextCommand = new ContextCommand();

    // Setup default mock returns
    mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
    mockConfigManager.getActorContext.mockResolvedValue(sampleContext);
  });

  afterEach(() => {
    // Reset mocks after each test
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('Basic Context Query (EARS 1-4)', () => {
    it('[EARS-1] should query context for current actor by default', async () => {
      await contextCommand.execute({});

      expect(mockIdentityAdapter.getCurrentActor).toHaveBeenCalled();
      expect(mockConfigManager.getActorContext).toHaveBeenCalledWith('human:test-user');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: human:test-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📁 Project: Test Project'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: 1757789000-cycle-root'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: 1757789000-cycle-test-cycle'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: 1757789000-task-test-task'));
    });

    it('[EARS-2] should output JSON format when --json flag is provided', async () => {
      await contextCommand.execute({ json: true });

      expect(mockConfigManager.getActorContext).toHaveBeenCalledWith('human:test-user');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify(sampleContext, null, 2)
      );
    });

    it('[EARS-3] should query context for specific actor when --actor flag is provided', async () => {
      const otherActorContext = {
        actorId: 'agent:alice:cursor',
        activeCycleId: '1757789000-cycle-alice-cycle',
        activeTaskId: null,
        rootCycle: '1757789000-cycle-root',
        projectInfo: {
          id: 'test-project',
          name: 'Test Project'
        }
      };

      mockConfigManager.getActorContext.mockResolvedValue(otherActorContext);

      await contextCommand.execute({ actor: 'agent:alice:cursor' });

      // Should NOT call getCurrentActor when --actor is provided
      expect(mockIdentityAdapter.getCurrentActor).not.toHaveBeenCalled();
      expect(mockConfigManager.getActorContext).toHaveBeenCalledWith('agent:alice:cursor');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: agent:alice:cursor'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: 1757789000-cycle-alice-cycle'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-4] should query context for specific actor with JSON output', async () => {
      const otherActorContext = {
        actorId: 'agent:bob:assistant',
        activeCycleId: null,
        activeTaskId: '1757789000-task-bob-task',
        rootCycle: '1757789000-cycle-root',
        projectInfo: {
          id: 'test-project',
          name: 'Test Project'
        }
      };

      mockConfigManager.getActorContext.mockResolvedValue(otherActorContext);

      await contextCommand.execute({
        actor: 'agent:bob:assistant',
        json: true
      });

      expect(mockIdentityAdapter.getCurrentActor).not.toHaveBeenCalled();
      expect(mockConfigManager.getActorContext).toHaveBeenCalledWith('agent:bob:assistant');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify(otherActorContext, null, 2)
      );
    });
  });

  describe('Null Values and Edge Cases (EARS 5-7)', () => {
    it('[EARS-5] should display "none" for null values in human-readable output', async () => {
      mockConfigManager.getActorContext.mockResolvedValue(sampleContextNoActive);

      await contextCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: none'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-5] should return null (not "none") for null values in JSON output', async () => {
      mockConfigManager.getActorContext.mockResolvedValue(sampleContextNoActive);

      await contextCommand.execute({ json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.activeCycleId).toBeNull();
      expect(parsed.activeTaskId).toBeNull();
      expect(parsed.activeCycleId).not.toBe('none');
      expect(parsed.activeTaskId).not.toBe('none');
    });

    it('[EARS-6] should handle null projectInfo gracefully in human-readable output', async () => {
      const contextWithoutProject = {
        actorId: 'human:test-user',
        activeCycleId: null,
        activeTaskId: null,
        rootCycle: null,
        projectInfo: null
      };

      mockConfigManager.getActorContext.mockResolvedValue(contextWithoutProject);

      await contextCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: human:test-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: none'));
      // Should not log project info if null
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('📁 Project:'));
    });

    it('[EARS-6] should return null for projectInfo in JSON output', async () => {
      const contextWithoutProject = {
        actorId: 'human:test-user',
        activeCycleId: null,
        activeTaskId: null,
        rootCycle: null,
        projectInfo: null
      };

      mockConfigManager.getActorContext.mockResolvedValue(contextWithoutProject);

      await contextCommand.execute({ json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.projectInfo).toBeNull();
    });

    it('[EARS-7] should handle context with only rootCycle in human-readable output (show "none" for missing values)', async () => {
      const rootOnlyContext = {
        actorId: 'human:test-user',
        activeCycleId: null,
        activeTaskId: null,
        rootCycle: '1757789000-cycle-root',
        projectInfo: {
          id: 'test-project',
          name: 'Test Project'
        }
      };

      mockConfigManager.getActorContext.mockResolvedValue(rootOnlyContext);

      await contextCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: 1757789000-cycle-root'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: none'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-7] should handle context with only rootCycle in JSON output (return null for missing values)', async () => {
      const rootOnlyContext = {
        actorId: 'human:test-user',
        activeCycleId: null,
        activeTaskId: null,
        rootCycle: '1757789000-cycle-root',
        projectInfo: {
          id: 'test-project',
          name: 'Test Project'
        }
      };

      mockConfigManager.getActorContext.mockResolvedValue(rootOnlyContext);

      await contextCommand.execute({ json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.rootCycle).toBe('1757789000-cycle-root');
      expect(parsed.activeCycleId).toBeNull();
      expect(parsed.activeTaskId).toBeNull();
    });
  });

  describe('Error Handling (EARS 8-12)', () => {
    it('[EARS-8] should handle error when getCurrentActor fails', async () => {
      const error = new Error('Failed to get current actor');
      mockIdentityAdapter.getCurrentActor.mockRejectedValue(error);

      await contextCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Failed to get current actor'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-9] should handle error when getActorContext fails', async () => {
      const error = new Error('Failed to get actor context');
      mockConfigManager.getActorContext.mockRejectedValue(error);

      await contextCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Failed to get actor context'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-10] should output error in JSON format when --json flag is provided', async () => {
      const error = new Error('Config file not found');
      mockConfigManager.getActorContext.mockRejectedValue(error);

      await contextCommand.execute({ json: true });

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          success: false,
          error: 'Config file not found'
        }, null, 2)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-11] should handle unknown error type gracefully', async () => {
      mockConfigManager.getActorContext.mockRejectedValue('Unknown error string');

      await contextCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Unknown error occurred');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-12] should handle error when querying specific actor that does not exist', async () => {
      const error = new Error('Actor not found in session');
      mockConfigManager.getActorContext.mockRejectedValue(error);

      await contextCommand.execute({ actor: 'agent:nonexistent:agent' });

      expect(mockIdentityAdapter.getCurrentActor).not.toHaveBeenCalled();
      expect(mockConfigManager.getActorContext).toHaveBeenCalledWith('agent:nonexistent:agent');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Actor not found in session'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Additional Edge Cases (EARS 13)', () => {
    it('[EARS-13] should handle empty actor state in human-readable output (show null values and rootCycle)', async () => {
      const emptyContext = {
        actorId: 'human:new-user',
        activeCycleId: null,
        activeTaskId: null,
        rootCycle: '1757789000-cycle-root',
        projectInfo: {
          id: 'test-project',
          name: 'Test Project'
        }
      };

      mockConfigManager.getActorContext.mockResolvedValue(emptyContext);

      await contextCommand.execute({ actor: 'human:new-user' });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: human:new-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: 1757789000-cycle-root'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: none'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-13] should handle empty actor state in JSON output (return null values and rootCycle)', async () => {
      const emptyContext = {
        actorId: 'human:new-user',
        activeCycleId: null,
        activeTaskId: null,
        rootCycle: '1757789000-cycle-root',
        projectInfo: {
          id: 'test-project',
          name: 'Test Project'
        }
      };

      mockConfigManager.getActorContext.mockResolvedValue(emptyContext);

      await contextCommand.execute({ actor: 'human:new-user', json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.actorId).toBe('human:new-user');
      expect(parsed.rootCycle).toBe('1757789000-cycle-root');
      expect(parsed.activeCycleId).toBeNull();
      expect(parsed.activeTaskId).toBeNull();
    });
  });
});

