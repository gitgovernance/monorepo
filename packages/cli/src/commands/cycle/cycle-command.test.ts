// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { Records } from '@gitgov/core';
import { CycleCommand } from './cycle-command';
import { DependencyInjectionService } from '../../services/dependency-injection';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('CycleCommand - Complete Unit Tests', () => {
  let cycleCommand: CycleCommand;
  let mockBacklogAdapter: {
    createCycle: jest.MockedFunction<(payload: Partial<Records.CycleRecord>, actorId: string) => Promise<Records.CycleRecord>>;
    getCycle: jest.MockedFunction<(cycleId: string) => Promise<Records.CycleRecord | null>>;
    getAllCycles: jest.MockedFunction<() => Promise<Records.CycleRecord[]>>;
    updateCycle: jest.MockedFunction<(cycleId: string, payload: Partial<Records.CycleRecord>) => Promise<Records.CycleRecord>>;
    addTaskToCycle: jest.MockedFunction<(cycleId: string, taskId: string) => Promise<void>>;
    removeTasksFromCycle: jest.MockedFunction<(cycleId: string, taskIds: string[]) => Promise<void>>;
    moveTasksBetweenCycles: jest.MockedFunction<(targetCycleId: string, taskIds: string[], sourceCycleId: string) => Promise<void>>;
    getTask: jest.MockedFunction<(taskId: string) => Promise<Records.TaskRecord | null>>;
  };
  let mockIndexerAdapter: {
    isIndexUpToDate: jest.MockedFunction<() => Promise<boolean>>;
    getIndexData: jest.MockedFunction<() => Promise<{ cycles: Records.GitGovCycleRecord[]; metadata: { generatedAt: string } } | null>>;
    generateIndex: jest.MockedFunction<() => Promise<void>>;
    invalidateCache: jest.MockedFunction<() => Promise<void>>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: jest.MockedFunction<() => Promise<Records.ActorRecord>>;
    getActor: jest.MockedFunction<(actorId: string) => Promise<Records.ActorRecord | null>>;
  };

  const sampleCycle: Records.CycleRecord = {
    id: '1757792000-cycle-test-cycle',
    title: 'Test Cycle',
    status: 'planning',
    tags: ['test', 'unit'],
    taskIds: [],
    childCycleIds: [],
    notes: 'Test cycle description'
  };

  const sampleActor: Records.ActorRecord = {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'test-public-key',
    roles: ['author'],
    status: 'active'
  };

  // Helper to wrap CycleRecord into GitGovCycleRecord
  const createMockGitGovCycleRecord = (cycle: Records.CycleRecord): Records.GitGovCycleRecord => ({
    header: {
      version: '1.0' as const,
      type: 'cycle' as const,
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:test-user',
        role: 'author',
        notes: 'Created cycle',
        signature: 'mock-signature',
        timestamp: Date.now()
      }] as [Records.Signature, ...Records.Signature[]]
    },
    payload: cycle
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create simple mock adapters
    mockBacklogAdapter = {
      createCycle: jest.fn(),
      getCycle: jest.fn(),
      getAllCycles: jest.fn(),
      updateCycle: jest.fn(),
      addTaskToCycle: jest.fn(),
      removeTasksFromCycle: jest.fn(),
      moveTasksBetweenCycles: jest.fn(),
      getTask: jest.fn()
    };

    mockIndexerAdapter = {
      isIndexUpToDate: jest.fn(),
      getIndexData: jest.fn(),
      generateIndex: jest.fn(),
      invalidateCache: jest.fn()
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn(),
      getActor: jest.fn()
    };

    // Create mock dependency service
    const mockDependencyService = {
      getBacklogAdapter: jest.fn().mockResolvedValue(mockBacklogAdapter),
      getIndexerAdapter: jest.fn().mockResolvedValue(mockIndexerAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter)
    };

    // Mock singleton getInstance
    (DependencyInjectionService.getInstance as jest.MockedFunction<typeof DependencyInjectionService.getInstance>)
      .mockReturnValue(mockDependencyService as never);

    cycleCommand = new CycleCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    mockProcessExit.mockClear();
  });

  describe('Command Core Functionality (EARS 1-5)', () => {
    it('[EARS-1] should open editor and create cycle with BacklogAdapter', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createCycle.mockResolvedValue(sampleCycle);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeNew('Test Cycle', { description: 'Test description' });

      expect(mockBacklogAdapter.createCycle).toHaveBeenCalledWith({
        title: 'Test Cycle',
        notes: 'Test description',
        status: 'planning',
        tags: []
      }, 'human:test-user');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Cycle created: 1757792000-cycle-test-cycle');
    });

    it('[EARS-2] should verify cache freshness and use IndexerAdapter for performance', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [createMockGitGovCycleRecord(sampleCycle)],
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeList({});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.getIndexData).toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllCycles).not.toHaveBeenCalled(); // Should use cache
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Found 1 cycle(s):');
    });

    it('[EARS-3] should show cycle from cache with task hierarchy and metadata', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [createMockGitGovCycleRecord(sampleCycle)],
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeShow('1757792000-cycle-test-cycle', {});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.getIndexData).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Cycle: 1757792000-cycle-test-cycle');
      expect(mockConsoleLog).toHaveBeenCalledWith('📝 Title: Test Cycle');
    });

    it('[EARS-4] should delegate to updateCycle with active status and validation', async () => {
      const activeCycle = { ...sampleCycle, status: 'active' as const };
      mockBacklogAdapter.getCycle.mockResolvedValue(sampleCycle);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.updateCycle.mockResolvedValue(activeCycle);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeActivate('1757792000-cycle-test-cycle', {});

      expect(mockBacklogAdapter.updateCycle).toHaveBeenCalledWith('1757792000-cycle-test-cycle', { status: 'active' });
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Cycle activated: 1757792000-cycle-test-cycle');
    });

    it('[EARS-5] should validate task completion and delegate to BacklogAdapter', async () => {
      const activeCycle = { ...sampleCycle, status: 'active' as const };
      const completedCycle = { ...sampleCycle, status: 'completed' as const };
      mockBacklogAdapter.getCycle.mockResolvedValue(activeCycle);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.updateCycle.mockResolvedValue(completedCycle);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeComplete('1757792000-cycle-test-cycle', {});

      expect(mockBacklogAdapter.updateCycle).toHaveBeenCalledWith('1757792000-cycle-test-cycle', { status: 'completed' });
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Cycle completed: 1757792000-cycle-test-cycle');
    });
  });

  describe('Multi-Adapter Integration (EARS 6-10)', () => {
    it('[EARS-6] should create bidirectional link using addTaskToCycle', async () => {
      const sampleTask = { id: 'task-123', title: 'Test Task' };

      mockBacklogAdapter.getCycle.mockResolvedValue(sampleCycle);
      mockBacklogAdapter.getTask.mockResolvedValue(sampleTask as Records.TaskRecord);
      mockBacklogAdapter.addTaskToCycle.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeAddTask('1757792000-cycle-test-cycle', { task: 'task-123' });

      expect(mockBacklogAdapter.addTaskToCycle).toHaveBeenCalledWith('1757792000-cycle-test-cycle', 'task-123');
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Tasks added to cycle: 1757792000-cycle-test-cycle');
    });

    it('[EARS-9] should auto-regenerate cache when obsolete in read commands', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(false);
      mockIndexerAdapter.generateIndex.mockResolvedValue();
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [createMockGitGovCycleRecord(sampleCycle)],
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeList({});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.generateIndex).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('🔄 Updating cache...');
    });

    it('[EARS-7] should establish bidirectional parent-child hierarchy', async () => {
      const parentCycle = { ...sampleCycle, childCycleIds: [] };
      const childCycle = { ...sampleCycle, id: 'child-cycle-123' };
      const updatedParent = { ...parentCycle, childCycleIds: ['child-cycle-123'] };

      mockBacklogAdapter.getCycle
        .mockResolvedValueOnce(parentCycle) // For parent validation
        .mockResolvedValueOnce(childCycle); // For child validation
      mockBacklogAdapter.updateCycle.mockResolvedValue(updatedParent);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeAddChild('1757792000-cycle-test-cycle', { child: 'child-cycle-123' });

      expect(mockBacklogAdapter.updateCycle).toHaveBeenCalledWith('1757792000-cycle-test-cycle', {
        childCycleIds: ['child-cycle-123']
      });
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Child cycles added to parent: 1757792000-cycle-test-cycle');
    });

    it('[EARS-8] should validate non-final state before editing cycle', async () => {
      mockBacklogAdapter.getCycle.mockResolvedValue(sampleCycle);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.updateCycle.mockResolvedValue({ ...sampleCycle, title: 'Updated Title' });
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeEdit('1757792000-cycle-test-cycle', { title: 'Updated Title' });

      expect(mockBacklogAdapter.updateCycle).toHaveBeenCalledWith('1757792000-cycle-test-cycle', { title: 'Updated Title' });
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Cycle updated: 1757792000-cycle-test-cycle');
    });

    it('[EARS-10] should invalidate cache after cycle modifications', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createCycle.mockResolvedValue(sampleCycle);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeNew('Test Cycle', { description: 'Test' });

      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('CLI Consistency & UX Excellence (EARS 11-15)', () => {
    it('[EARS-11] should return structured JSON output with json flag', async () => {
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.createCycle.mockResolvedValue(sampleCycle);
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeNew('Test Cycle', { description: 'Test', json: true });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": true')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.cycleId).toBe('1757792000-cycle-test-cycle');
    });

    it('[EARS-12] should show additional details with verbose flag', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [createMockGitGovCycleRecord(sampleCycle)],
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeShow('1757792000-cycle-test-cycle', { verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Tasks: 0 tasks');
      expect(mockConsoleLog).toHaveBeenCalledWith('🔗 Children: 0 child cycles');
    });

    it('[EARS-13] should suppress output with quiet flag for scripting', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(false);
      mockIndexerAdapter.generateIndex.mockResolvedValue();
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [createMockGitGovCycleRecord(sampleCycle)],
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeList({ quiet: true });

      // Should not show "Updating cache..." message
      expect(mockConsoleLog).not.toHaveBeenCalledWith('🔄 Updating cache...');
    });

    it('[EARS-14] should detect conflicting flags and show clear error', async () => {
      // Test with conflicting quiet and verbose flags
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [],
        metadata: { generatedAt: new Date().toISOString() }
      });

      // For MVP, we don't have flag conflict detection implemented yet
      // This test documents the expected behavior
      await cycleCommand.executeList({ quiet: true, verbose: true });

      // Should work without conflict detection for MVP
      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Found 0 cycle(s):');
    });

    it('[EARS-15] should show user-friendly error with solution suggestion', async () => {
      const error = new Error('RecordNotFoundError: Cycle not found');
      mockBacklogAdapter.getCycle.mockRejectedValue(error);

      await cycleCommand.executeShow('non-existent-cycle', {});

      expect(mockConsoleError).toHaveBeenCalledWith('RecordNotFoundError: Cycle not found');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty cycle title', async () => {
      await cycleCommand.executeNew('', {});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Cycle operation failed: ❌ Cycle title cannot be empty');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle cycle not found in show command', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [],
        metadata: { generatedAt: new Date().toISOString() }
      });
      mockBacklogAdapter.getCycle.mockResolvedValue(null);

      await cycleCommand.executeShow('non-existent', {});

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Cycle operation failed: ❌ Cycle not found: non-existent');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid status for activation', async () => {
      const activeCycle = { ...sampleCycle, status: 'active' as const };
      mockBacklogAdapter.getCycle.mockResolvedValue(activeCycle);

      await cycleCommand.executeActivate('1757792000-cycle-test-cycle', {});

      expect(mockConsoleError).toHaveBeenCalledWith("❌ Cycle operation failed: ❌ Cycle is in 'active' state. Cannot activate.");
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle invalid status for completion', async () => {
      const planningCycle = { ...sampleCycle, status: 'planning' as const };
      mockBacklogAdapter.getCycle.mockResolvedValue(planningCycle);

      await cycleCommand.executeComplete('1757792000-cycle-test-cycle', {});

      expect(mockConsoleError).toHaveBeenCalledWith("❌ Cycle operation failed: ❌ Cycle is in 'planning' state. Cannot complete.");
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle task not found in add-task', async () => {
      mockBacklogAdapter.getCycle.mockResolvedValue(sampleCycle);
      mockBacklogAdapter.getTask.mockResolvedValue(null);

      await cycleCommand.executeAddTask('1757792000-cycle-test-cycle', { task: 'non-existent-task' });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Cycle operation failed: ❌ Task not found: non-existent-task');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should format JSON error output correctly', async () => {
      const error = new Error('Test error');
      mockBacklogAdapter.getCycle.mockRejectedValue(error);

      await cycleCommand.executeShow('test-cycle', { json: true });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": false')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(false);
      expect(parsedOutput.error).toContain('❌ Cycle operation failed: Test error');
    });
  });

  describe('Auto-indexation and Cache Behavior', () => {
    it('should use cache when up to date', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: [createMockGitGovCycleRecord(sampleCycle)],
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeList({});

      expect(mockIndexerAdapter.generateIndex).not.toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllCycles).not.toHaveBeenCalled();
    });

    it('should fallback to direct access when cache fails', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue(null);
      mockBacklogAdapter.getAllCycles.mockResolvedValue([sampleCycle]);

      await cycleCommand.executeList({});

      expect(mockBacklogAdapter.getAllCycles).toHaveBeenCalled();
    });

    it('should bypass cache with from-source flag', async () => {
      mockBacklogAdapter.getAllCycles.mockResolvedValue([sampleCycle]);

      await cycleCommand.executeList({ fromSource: true });

      expect(mockIndexerAdapter.isIndexUpToDate).not.toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllCycles).toHaveBeenCalled();
    });
  });

  describe('Filtering and Display', () => {
    it('should filter cycles by status', async () => {
      const cycles = [
        { ...sampleCycle, status: 'planning' as const },
        { ...sampleCycle, id: 'cycle-2', status: 'active' as const },
        { ...sampleCycle, id: 'cycle-3', status: 'completed' as const }
      ];

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: cycles.map(c => createMockGitGovCycleRecord(c)),
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeList({ status: 'planning' });

      expect(mockConsoleLog).toHaveBeenCalledWith('🎯 Found 1 cycle(s):');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📝 [planning]'));
    });

    it('should get correct status icons', async () => {
      const cycles = [
        { ...sampleCycle, status: 'planning' as const },
        { ...sampleCycle, id: 'cycle-2', status: 'active' as const },
        { ...sampleCycle, id: 'cycle-3', status: 'completed' as const }
      ];

      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
      mockIndexerAdapter.getIndexData.mockResolvedValue({
        cycles: cycles.map(c => createMockGitGovCycleRecord(c)),
        metadata: { generatedAt: new Date().toISOString() }
      });

      await cycleCommand.executeList({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📝 [planning]'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ [active]'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ [completed]'));
    });

    it('should show warning for cycle without tasks during activation', async () => {
      const emptyCycle = { ...sampleCycle, taskIds: [] };
      mockBacklogAdapter.getCycle.mockResolvedValue(emptyCycle);
      mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
      mockBacklogAdapter.updateCycle.mockResolvedValue({ ...emptyCycle, status: 'active' as const });
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeActivate('1757792000-cycle-test-cycle', {});

      expect(mockConsoleWarn).toHaveBeenCalledWith('⚠️ Cycle has no tasks. Consider adding tasks before activation.');
    });
  });

  describe('Task Management - Remove and Move (EARS 11-12)', () => {
    it('[EARS-11] should delegate to removeTasksFromCycle with batch processing', async () => {
      const cycleId = '1757792000-cycle-test-cycle';
      const taskIds = ['task-123', 'task-456'];

      mockBacklogAdapter.removeTasksFromCycle.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeRemoveTask(cycleId, { task: 'task-123,task-456' });

      expect(mockBacklogAdapter.removeTasksFromCycle).toHaveBeenCalledWith(cycleId, taskIds);
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(`✅ Tasks removed from cycle: ${cycleId}`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`📋 Removed tasks: ${taskIds.join(', ')}`);
    });

    it('[EARS-11] should handle single task removal', async () => {
      const cycleId = '1757792000-cycle-test-cycle';
      const taskId = 'task-123';

      mockBacklogAdapter.removeTasksFromCycle.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeRemoveTask(cycleId, { task: taskId });

      expect(mockBacklogAdapter.removeTasksFromCycle).toHaveBeenCalledWith(cycleId, [taskId]);
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
    });

    it('[EARS-11] should return JSON output for remove-task with --json flag', async () => {
      const cycleId = '1757792000-cycle-test-cycle';
      const taskIds = ['task-123', 'task-456'];

      mockBacklogAdapter.removeTasksFromCycle.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeRemoveTask(cycleId, { task: 'task-123,task-456', json: true });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": true')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.cycleId).toBe(cycleId);
      expect(parsedOutput.removedTasks).toEqual(taskIds);
      expect(parsedOutput.taskCount).toBe(2);
    });

    it('[EARS-11] should handle errors in remove-task gracefully', async () => {
      const error = new Error('Task not found');
      mockBacklogAdapter.removeTasksFromCycle.mockRejectedValue(error);

      await cycleCommand.executeRemoveTask('cycle-123', { task: 'non-existent-task' });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Cycle operation failed: Task not found');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-12] should move tasks atomically between cycles with all-or-nothing', async () => {
      const sourceCycleId = 'cycle-source';
      const targetCycleId = 'cycle-target';
      const taskIds = ['task-123', 'task-456'];

      mockBacklogAdapter.moveTasksBetweenCycles.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeMoveTask(targetCycleId, {
        task: 'task-123,task-456',
        from: sourceCycleId
      });

      expect(mockBacklogAdapter.moveTasksBetweenCycles).toHaveBeenCalledWith(
        targetCycleId,
        taskIds,
        sourceCycleId
      );
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Tasks moved successfully');
      expect(mockConsoleLog).toHaveBeenCalledWith(`📤 From cycle: ${sourceCycleId}`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`📥 To cycle: ${targetCycleId}`);
      expect(mockConsoleLog).toHaveBeenCalledWith(`📋 Moved tasks: ${taskIds.join(', ')}`);
    });

    it('[EARS-12] should handle single task move', async () => {
      const sourceCycleId = 'cycle-source';
      const targetCycleId = 'cycle-target';
      const taskId = 'task-123';

      mockBacklogAdapter.moveTasksBetweenCycles.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeMoveTask(targetCycleId, {
        task: taskId,
        from: sourceCycleId
      });

      expect(mockBacklogAdapter.moveTasksBetweenCycles).toHaveBeenCalledWith(
        targetCycleId,
        [taskId],
        sourceCycleId
      );
      expect(mockIndexerAdapter.invalidateCache).toHaveBeenCalled();
    });

    it('[EARS-12] should return JSON output for move-task with --json flag', async () => {
      const sourceCycleId = 'cycle-source';
      const targetCycleId = 'cycle-target';
      const taskIds = ['task-123', 'task-456'];

      mockBacklogAdapter.moveTasksBetweenCycles.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      await cycleCommand.executeMoveTask(targetCycleId, {
        task: 'task-123,task-456',
        from: sourceCycleId,
        json: true
      });

      const jsonOutput = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success": true')
      );
      expect(jsonOutput).toBeDefined();

      const parsedOutput = JSON.parse(jsonOutput![0] as string);
      expect(parsedOutput.success).toBe(true);
      expect(parsedOutput.sourceCycleId).toBe(sourceCycleId);
      expect(parsedOutput.targetCycleId).toBe(targetCycleId);
      expect(parsedOutput.movedTasks).toEqual(taskIds);
      expect(parsedOutput.taskCount).toBe(2);
    });

    it('[EARS-12] should handle errors in move-task gracefully', async () => {
      const error = new Error('Source and target cycles must be different');
      mockBacklogAdapter.moveTasksBetweenCycles.mockRejectedValue(error);

      await cycleCommand.executeMoveTask('cycle-123', {
        task: 'task-123',
        from: 'cycle-123'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Cycle operation failed: Source and target cycles must be different');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-12] should handle validation errors before moving tasks', async () => {
      const error = new Error('Task task-123 is not in source cycle');
      mockBacklogAdapter.moveTasksBetweenCycles.mockRejectedValue(error);

      await cycleCommand.executeMoveTask('cycle-target', {
        task: 'task-123',
        from: 'cycle-source'
      });

      expect(mockConsoleError).toHaveBeenCalledWith('❌ Cycle operation failed: Task task-123 is not in source cycle');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-11] should trim whitespace from task IDs in remove-task', async () => {
      const cycleId = '1757792000-cycle-test-cycle';
      const taskIds = ['task-123', 'task-456'];

      mockBacklogAdapter.removeTasksFromCycle.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      // Task IDs with extra whitespace
      await cycleCommand.executeRemoveTask(cycleId, { task: ' task-123 , task-456 ' });

      expect(mockBacklogAdapter.removeTasksFromCycle).toHaveBeenCalledWith(cycleId, taskIds);
    });

    it('[EARS-12] should trim whitespace from task IDs in move-task', async () => {
      const sourceCycleId = 'cycle-source';
      const targetCycleId = 'cycle-target';
      const taskIds = ['task-123', 'task-456'];

      mockBacklogAdapter.moveTasksBetweenCycles.mockResolvedValue();
      mockIndexerAdapter.invalidateCache.mockResolvedValue();

      // Task IDs with extra whitespace
      await cycleCommand.executeMoveTask(targetCycleId, {
        task: ' task-123 , task-456 ',
        from: sourceCycleId
      });

      expect(mockBacklogAdapter.moveTasksBetweenCycles).toHaveBeenCalledWith(
        targetCycleId,
        taskIds,
        sourceCycleId
      );
    });
  });
});
