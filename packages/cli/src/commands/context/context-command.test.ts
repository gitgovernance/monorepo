/**
 * ContextCommand Unit Tests
 *
 * EARS Coverage:
 * - §4.1 Consulta de Contexto Básica (EARS-A1 to A4)
 * - §4.2 Manejo de Valores Nulos y Edge Cases (EARS-B1 to B3)
 * - §4.3 Manejo de Errores (EARS-C1 to C5)
 * - §4.4 Edge Cases Adicionales (EARS-D1)
 */

// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { ContextCommand } from './context-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { ActorRecord } from '@gitgov/core';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('ContextCommand', () => {
  let contextCommand: ContextCommand;
  let mockIdentityAdapter: {
    getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
  };
  let mockConfigManager: {
    getProjectInfo: jest.MockedFunction<() => Promise<{ id: string; name: string } | null>>;
    getRootCycle: jest.MockedFunction<() => Promise<string | null>>;
  };
  let mockSessionManager: {
    getActorState: jest.MockedFunction<() => Promise<unknown>>;
  };
  let mockDependencyService: {
    getIdentityAdapter: jest.MockedFunction<() => Promise<typeof mockIdentityAdapter>>;
    getConfigManager: jest.MockedFunction<() => Promise<typeof mockConfigManager>>;
    getSessionManager: jest.MockedFunction<() => Promise<typeof mockSessionManager>>;
    getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
  };

  const sampleActor: ActorRecord = {
    id: 'human:test-user',
    displayName: 'Test User',
    type: 'human',
    publicKey: 'test-public-key-base64',
    roles: ['developer']
  };

  const sampleProjectInfo = {
    id: 'test-project',
    name: 'Test Project'
  };

  const sampleActorState = {
    activeCycleId: '1757789000-cycle-test-cycle',
    activeTaskId: '1757789000-task-test-task',
    syncStatus: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockIdentityAdapter = {
      getCurrentActor: jest.fn()
    };

    mockConfigManager = {
      getProjectInfo: jest.fn(),
      getRootCycle: jest.fn(),
    };

    mockSessionManager = {
      getActorState: jest.fn(),
    };

    mockDependencyService = {
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter),
      getConfigManager: jest.fn().mockResolvedValue(mockConfigManager),
      getSessionManager: jest.fn().mockResolvedValue(mockSessionManager),
      getCurrentActor: jest.fn().mockResolvedValue(sampleActor),
    };

    (DependencyInjectionService.getInstance as jest.Mock).mockReturnValue(mockDependencyService);

    contextCommand = new ContextCommand();

    // Setup default mock returns
    mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
    mockConfigManager.getProjectInfo.mockResolvedValue(sampleProjectInfo);
    mockConfigManager.getRootCycle.mockResolvedValue('1757789000-cycle-root');
    mockSessionManager.getActorState.mockResolvedValue(sampleActorState);
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  // ============================================================================
  // §4.1. Consulta de Contexto Básica (EARS-A1 to A4)
  // ============================================================================
  describe('4.1. Consulta de Contexto Básica (EARS-A1 to A4)', () => {
    it('[EARS-A1] should query context for current actor by default', async () => {
      await contextCommand.execute({});

      expect(mockDependencyService.getCurrentActor).toHaveBeenCalled();
      expect(mockSessionManager.getActorState).toHaveBeenCalledWith('human:test-user');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: human:test-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📁 Project: Test Project'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: 1757789000-cycle-root'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: 1757789000-cycle-test-cycle'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: 1757789000-task-test-task'));
    });

    it('[EARS-A2] should output JSON format when --json flag is provided', async () => {
      await contextCommand.execute({ json: true });

      expect(mockSessionManager.getActorState).toHaveBeenCalledWith('human:test-user');
      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.actorId).toBe('human:test-user');
      expect(parsed.projectInfo).toEqual(sampleProjectInfo);
      expect(parsed.rootCycle).toBe('1757789000-cycle-root');
      expect(parsed.activeCycleId).toBe('1757789000-cycle-test-cycle');
      expect(parsed.activeTaskId).toBe('1757789000-task-test-task');
    });

    it('[EARS-A3] should query context for specific actor when --actor is provided', async () => {
      mockSessionManager.getActorState.mockResolvedValue({
        activeCycleId: '1757789000-cycle-alice-cycle',
        activeTaskId: null,
        syncStatus: null,
      });

      await contextCommand.execute({ actor: 'agent:alice:cursor' });

      expect(mockDependencyService.getCurrentActor).not.toHaveBeenCalled();
      expect(mockSessionManager.getActorState).toHaveBeenCalledWith('agent:alice:cursor');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: agent:alice:cursor'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: 1757789000-cycle-alice-cycle'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-A4] should query context for specific actor with JSON output', async () => {
      mockSessionManager.getActorState.mockResolvedValue({
        activeCycleId: null,
        activeTaskId: '1757789000-task-bob-task',
        syncStatus: null,
      });

      await contextCommand.execute({
        actor: 'agent:bob:assistant',
        json: true
      });

      expect(mockDependencyService.getCurrentActor).not.toHaveBeenCalled();
      expect(mockSessionManager.getActorState).toHaveBeenCalledWith('agent:bob:assistant');

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.actorId).toBe('agent:bob:assistant');
      expect(parsed.activeCycleId).toBeNull();
      expect(parsed.activeTaskId).toBe('1757789000-task-bob-task');
      expect(parsed.rootCycle).toBe('1757789000-cycle-root');
      expect(parsed.projectInfo).toEqual(sampleProjectInfo);
    });
  });

  // ============================================================================
  // §4.2. Manejo de Valores Nulos y Edge Cases (EARS-B1 to B3)
  // ============================================================================
  describe('4.2. Manejo de Valores Nulos y Edge Cases (EARS-B1 to B3)', () => {
    it('[EARS-B1] should display "none" for null values in human-readable output', async () => {
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: none'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-B1] should return null (not "none") for null values in JSON output', async () => {
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({ json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.activeCycleId).toBeNull();
      expect(parsed.activeTaskId).toBeNull();
      expect(parsed.activeCycleId).not.toBe('none');
      expect(parsed.activeTaskId).not.toBe('none');
    });

    it('[EARS-B2] should handle null projectInfo gracefully in human-readable output', async () => {
      mockConfigManager.getProjectInfo.mockResolvedValue(null);
      mockConfigManager.getRootCycle.mockResolvedValue(null);
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: human:test-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: none'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('📁 Project:'));
    });

    it('[EARS-B2] should return null for projectInfo in JSON output', async () => {
      mockConfigManager.getProjectInfo.mockResolvedValue(null);
      mockConfigManager.getRootCycle.mockResolvedValue(null);
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({ json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.projectInfo).toBeNull();
    });

    it('[EARS-B3] should handle context with only rootCycle in human-readable output', async () => {
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: 1757789000-cycle-root'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: none'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-B3] should handle context with only rootCycle in JSON output', async () => {
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({ json: true });

      expect(mockConsoleLog.mock.calls[0]).toBeDefined();
      const output = mockConsoleLog.mock.calls[0]![0];
      const parsed = JSON.parse(output as string);

      expect(parsed.rootCycle).toBe('1757789000-cycle-root');
      expect(parsed.activeCycleId).toBeNull();
      expect(parsed.activeTaskId).toBeNull();
    });
  });

  // ============================================================================
  // §4.3. Manejo de Errores (EARS-C1 to C5)
  // ============================================================================
  describe('4.3. Manejo de Errores (EARS-C1 to C5)', () => {
    it('[EARS-C1] should handle error when getCurrentActor fails', async () => {
      const error = new Error('Failed to get current actor');
      mockDependencyService.getCurrentActor.mockRejectedValue(error);

      await contextCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Failed to get current actor'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-C2] should handle error when getActorState fails', async () => {
      const error = new Error('Failed to get actor state');
      mockSessionManager.getActorState.mockRejectedValue(error);

      await contextCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Failed to get actor state'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-C3] should output error in JSON format when --json flag is provided', async () => {
      const error = new Error('Config file not found');
      mockConfigManager.getProjectInfo.mockRejectedValue(error);

      await contextCommand.execute({ json: true });

      expect(mockConsoleError).toHaveBeenCalledWith(
        JSON.stringify({
          success: false,
          error: 'Config file not found'
        }, null, 2)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-C4] should handle unknown error type gracefully', async () => {
      mockSessionManager.getActorState.mockRejectedValue('Unknown error string');

      await contextCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Unknown error occurred');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-C5] should handle error when querying specific actor not found', async () => {
      const error = new Error('Actor not found in session');
      mockSessionManager.getActorState.mockRejectedValue(error);

      await contextCommand.execute({ actor: 'agent:nonexistent:agent' });

      expect(mockDependencyService.getCurrentActor).not.toHaveBeenCalled();
      expect(mockSessionManager.getActorState).toHaveBeenCalledWith('agent:nonexistent:agent');
      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Actor not found in session'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  // ============================================================================
  // §4.4. Edge Cases Adicionales (EARS-D1)
  // ============================================================================
  describe('4.4. Edge Cases Adicionales (EARS-D1)', () => {
    it('[EARS-D1] should handle empty actor state in human-readable output', async () => {
      mockSessionManager.getActorState.mockResolvedValue(null);

      await contextCommand.execute({ actor: 'human:new-user' });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: human:new-user'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔗 Root Cycle: 1757789000-cycle-root'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ Active Cycle: none'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Active Task: none'));
    });

    it('[EARS-D1] should handle empty actor state in JSON output', async () => {
      mockSessionManager.getActorState.mockResolvedValue(null);

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
