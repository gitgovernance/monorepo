// Mock @gitgov/core with all required modules
jest.doMock('@gitgov/core', () => ({
  Adapters: {
    BacklogAdapter: jest.fn().mockImplementation(() => ({})),
    IdentityAdapter: jest.fn().mockImplementation(() => ({})),
    MetricsAdapter: jest.fn().mockImplementation(() => ({}))
  },
  Factories: {
    createMetricsAdapter: jest.fn(),
    createActorRecord: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    createTaskRecord: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    createCycleRecord: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    createFeedbackRecord: jest.fn().mockImplementation((data) => Promise.resolve(data))
  },
  Records: {},
  MetricsAdapter: jest.fn().mockImplementation(() => ({}))
}));

// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { StatusCommand } from './status-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import { Factories } from "@gitgov/core";
import type { TaskRecord, CycleRecord, FeedbackRecord, ActorRecord, SystemStatus, ProductivityMetrics, CollaborationMetrics, TaskHealthReport } from "@gitgov/core";

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('StatusCommand - Complete Unit Tests', () => {
  let statusCommand: StatusCommand;
  let mockBacklogAdapter: {
    getTasksAssignedToActor: jest.MockedFunction<(actorId: string) => Promise<TaskRecord[]>>;
    getAllTasks: jest.MockedFunction<() => Promise<TaskRecord[]>>;
    getAllCycles: jest.MockedFunction<() => Promise<CycleRecord[]>>;
  };
  let mockFeedbackAdapter: {
    getAllFeedback: jest.MockedFunction<() => Promise<FeedbackRecord[]>>;
  };
  let mockMetricsAdapter: {
    getSystemStatus: jest.MockedFunction<() => Promise<SystemStatus>>;
    getProductivityMetrics: jest.MockedFunction<() => Promise<ProductivityMetrics>>;
    getCollaborationMetrics: jest.MockedFunction<() => Promise<CollaborationMetrics>>;
    getTaskHealth: jest.MockedFunction<(taskId: string) => Promise<TaskHealthReport>>;
  };
  let mockIndexerAdapter: {
    isIndexUpToDate: jest.MockedFunction<() => Promise<boolean>>;
    generateIndex: jest.MockedFunction<() => Promise<void>>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: jest.MockedFunction<() => Promise<ActorRecord>>;
  };
  let mockDependencyService: {
    getBacklogAdapter: jest.MockedFunction<() => Promise<typeof mockBacklogAdapter>>;
    getFeedbackAdapter: jest.MockedFunction<() => Promise<typeof mockFeedbackAdapter>>;
    getMetricsAdapter: jest.MockedFunction<() => Promise<typeof mockMetricsAdapter>>;
    getIndexerAdapter: jest.MockedFunction<() => Promise<typeof mockIndexerAdapter>>;
    getIdentityAdapter: jest.MockedFunction<() => Promise<typeof mockIdentityAdapter>>;
  };

  // Sample data using factories
  let sampleActor: ActorRecord;
  let sampleTask: TaskRecord;
  let sampleCycle: CycleRecord;
  let sampleFeedback: FeedbackRecord;

  const sampleSystemStatus: SystemStatus = {
    tasks: {
      total: 10,
      byStatus: { active: 3, done: 5, draft: 2 },
      byPriority: { high: 4, medium: 4, low: 2 }
    },
    cycles: {
      total: 5,
      active: 2,
      completed: 3
    },
    health: {
      overallScore: 75,
      blockedTasks: 1,
      staleTasks: 2
    }
  };

  const sampleProductivityMetrics: ProductivityMetrics = {
    throughput: 10,
    leadTime: 5.5,
    cycleTime: 3.2,
    tasksCompleted7d: 8,
    averageCompletionTime: 5.5
  };

  const sampleCollaborationMetrics: CollaborationMetrics = {
    activeAgents: 2,
    totalAgents: 5,
    agentUtilization: 40,
    humanAgentRatio: 1.5,
    collaborationIndex: 65
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create sample data using factories
    sampleActor = await Factories.createActorRecord({
      id: 'human:test-user',
      displayName: 'Test User',
      type: 'human',
      publicKey: 'test-public-key-base64',
      roles: ['developer', 'reviewer']
    });

    sampleTask = await Factories.createTaskRecord({
      id: '1757789000-task-test-task',
      title: 'Test Task',
      status: 'active',
      priority: 'high',
      description: 'Test task for status command',
      tags: ['test'],
      cycleIds: ['1757789000-cycle-test-cycle']
    });

    sampleCycle = await Factories.createCycleRecord({
      id: '1757789000-cycle-test-cycle',
      title: 'Test Cycle',
      status: 'active',
      notes: 'Test cycle for status command',
      tags: ['test'],
      taskIds: ['1757789000-task-test-task']
    });

    sampleFeedback = await Factories.createFeedbackRecord({
      id: '1757789000-feedback-test',
      entityType: 'task',
      entityId: '1757789000-task-test-task',
      type: 'blocking',
      status: 'open',
      assignee: 'human:test-user',
      content: 'Test blocking feedback'
    });

    // Create mock adapters
    mockBacklogAdapter = {
      getTasksAssignedToActor: jest.fn(),
      getAllTasks: jest.fn(),
      getAllCycles: jest.fn()
    };

    mockFeedbackAdapter = {
      getAllFeedback: jest.fn()
    };

    mockMetricsAdapter = {
      getSystemStatus: jest.fn(),
      getProductivityMetrics: jest.fn(),
      getCollaborationMetrics: jest.fn(),
      getTaskHealth: jest.fn()
    };

    mockIndexerAdapter = {
      isIndexUpToDate: jest.fn(),
      generateIndex: jest.fn()
    };

    mockIdentityAdapter = {
      getCurrentActor: jest.fn()
    };

    // Create mock dependency service
    mockDependencyService = {
      getBacklogAdapter: jest.fn().mockResolvedValue(mockBacklogAdapter),
      getFeedbackAdapter: jest.fn().mockResolvedValue(mockFeedbackAdapter),
      getMetricsAdapter: jest.fn().mockResolvedValue(mockMetricsAdapter),
      getIndexerAdapter: jest.fn().mockResolvedValue(mockIndexerAdapter),
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter)
    };

    // Mock DependencyInjectionService.getInstance()
    (DependencyInjectionService.getInstance as jest.Mock).mockReturnValue(mockDependencyService);

    // Create StatusCommand
    statusCommand = new StatusCommand();

    // Setup default mock returns
    mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
    mockBacklogAdapter.getTasksAssignedToActor.mockResolvedValue([sampleTask]);
    mockBacklogAdapter.getAllTasks.mockResolvedValue([sampleTask]);
    mockBacklogAdapter.getAllCycles.mockResolvedValue([sampleCycle]);
    mockFeedbackAdapter.getAllFeedback.mockResolvedValue([sampleFeedback]);
    mockMetricsAdapter.getSystemStatus.mockResolvedValue(sampleSystemStatus);
    mockMetricsAdapter.getProductivityMetrics.mockResolvedValue(sampleProductivityMetrics);
    mockMetricsAdapter.getCollaborationMetrics.mockResolvedValue(sampleCollaborationMetrics);
    mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);
  });

  afterEach(() => {
    // Reset mocks after each test
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('Core Dashboard Functionality (EARS 1-5)', () => {
    it('[EARS-1] should execute personal dashboard by default', async () => {
      await statusCommand.execute({});

      expect(mockIdentityAdapter.getCurrentActor).toHaveBeenCalled();
      expect(mockBacklogAdapter.getTasksAssignedToActor).toHaveBeenCalledWith('human:test-user');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: Test User'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ My Work (1 tasks)'));
    });

    it('[EARS-2] should execute global dashboard with --all flag', async () => {
      // Setup multiple tasks using factory
      const multipleTasks: TaskRecord[] = [];
      for (let i = 0; i < 10; i++) {
        const task = await Factories.createTaskRecord({
          title: `Test Task ${i}`,
          status: 'active',
          priority: 'medium',
          description: `Test task ${i} for status command`,
          tags: ['test']
        });
        multipleTasks.push(task);
      }
      mockBacklogAdapter.getAllTasks.mockResolvedValue(multipleTasks);

      await statusCommand.execute({ all: true });

      expect(mockBacklogAdapter.getAllTasks).toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllCycles).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📊 GitGovernance Project Status'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📋 Tasks Overview'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Total: 10 tasks'));
    });

    it('[EARS-3] should show productivity metrics with --health flag', async () => {
      await statusCommand.execute({ all: true, health: true });

      expect(mockMetricsAdapter.getProductivityMetrics).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📈 Productivity Metrics:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Throughput: 10 tasks/week'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Lead Time: 5.5 days'));
    });

    it('[EARS-4] should show collaboration metrics with --team flag', async () => {
      await statusCommand.execute({ all: true, team: true });

      expect(mockMetricsAdapter.getCollaborationMetrics).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🤖 Collaboration Metrics:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Active Agents: 2/5'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Agent Utilization: 40.0%'));
    });

    it('[EARS-5] should show all metrics with --verbose flag', async () => {
      await statusCommand.execute({ all: true, verbose: true });

      expect(mockMetricsAdapter.getProductivityMetrics).toHaveBeenCalled();
      expect(mockMetricsAdapter.getCollaborationMetrics).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('📈 Productivity Metrics:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🤖 Collaboration Metrics:'));
    });
  });

  describe('Auto-Indexation Strategy (EARS 6-8)', () => {
    it('[EARS-6] should update cache when index is outdated', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(false);

      await statusCommand.execute({});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.generateIndex).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🔄 Updating cache'));
    });

    it('[EARS-7] should skip cache update when index is up to date', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(true);

      await statusCommand.execute({});

      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
      expect(mockIndexerAdapter.generateIndex).not.toHaveBeenCalled();
    });

    it('[EARS-8] should bypass cache with --from-source flag', async () => {
      await statusCommand.execute({ fromSource: true });

      expect(mockIndexerAdapter.isIndexUpToDate).not.toHaveBeenCalled();
      expect(mockIndexerAdapter.generateIndex).not.toHaveBeenCalled();
    });
  });

  describe('JSON Output Format (EARS 9-11)', () => {
    it('[EARS-9] should output personal dashboard in JSON format', async () => {
      await statusCommand.execute({ json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"success": true')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"actor"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"personalWork"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"systemHealth"')
      );
    });

    it('[EARS-10] should output global dashboard in JSON format', async () => {
      await statusCommand.execute({ all: true, json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"success": true')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"systemOverview"')
      );
    });

    it('[EARS-11] should include metrics in JSON when requested', async () => {
      await statusCommand.execute({ all: true, health: true, team: true, json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"productivityMetrics"')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"collaborationMetrics"')
      );
    });
  });

  describe('Personal Dashboard Intelligence (EARS 12-14)', () => {
    it('[EARS-12] should show assigned tasks for current actor', async () => {
      await statusCommand.execute({});

      expect(mockBacklogAdapter.getTasksAssignedToActor).toHaveBeenCalledWith('human:test-user');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ My Work (1 tasks)'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test Task'));
    });

    it('[EARS-13] should show pending feedback for current actor', async () => {
      await statusCommand.execute({});

      expect(mockFeedbackAdapter.getAllFeedback).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('❗️ Pending Feedback (1)'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test blocking feedback'));
    });

    it('[EARS-14] should show active cycles with --cycles flag', async () => {
      await statusCommand.execute({ cycles: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🚀 Active Cycles (1)'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test Cycle'));
    });
  });

  describe('System Health & Alerts (EARS 15-17)', () => {
    it('[EARS-15] should show system health score and alerts', async () => {
      await statusCommand.execute({});

      expect(mockMetricsAdapter.getSystemStatus).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ System Health: 🟡 75%'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('🚨 Alerts:'));
    });

    it('[EARS-16] should generate appropriate health alerts', async () => {
      const unhealthySystemStatus: SystemStatus = {
        ...sampleSystemStatus,
        health: {
          overallScore: 30,
          blockedTasks: 5,
          staleTasks: 10
        }
      };
      mockMetricsAdapter.getSystemStatus.mockResolvedValue(unhealthySystemStatus);

      await statusCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ System Health: 🔴 30%'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('10 tasks stalled >7 days'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('5 tasks blocked by feedback'));
    });

    it('[EARS-17] should handle metrics adapter failures gracefully', async () => {
      mockMetricsAdapter.getSystemStatus.mockRejectedValue(new Error('Metrics unavailable'));

      await statusCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚡ System Health: 🔴 0%'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Metrics unavailable'));
    });
  });

  describe('CLI Consistency & Flags (EARS 18-20)', () => {
    it('[EARS-18] should suppress cache messages with --quiet flag', async () => {
      mockIndexerAdapter.isIndexUpToDate.mockResolvedValue(false);

      await statusCommand.execute({ quiet: true });

      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('🔄 Updating cache'));
    });

    it('[EARS-19] should show detailed task information with --verbose flag', async () => {
      await statusCommand.execute({ verbose: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Priority: high'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Tags: test'));
    });

    it('[EARS-20] should handle empty datasets gracefully', async () => {
      mockBacklogAdapter.getTasksAssignedToActor.mockResolvedValue([]);
      mockFeedbackAdapter.getAllFeedback.mockResolvedValue([]);

      await statusCommand.execute({});

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('No tasks assigned'));
      expect(mockConsoleLog).not.toHaveBeenCalledWith(expect.stringContaining('❗️ Feedback Pendiente'));
    });
  });

  describe('Error Handling & Edge Cases (EARS 21-24)', () => {
    it('[EARS-21] should handle actor not found error', async () => {
      mockIdentityAdapter.getCurrentActor.mockRejectedValue(new Error('No active actors'));

      await statusCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('No current actor configured'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-22] should handle initialization errors', async () => {
      mockDependencyService.getBacklogAdapter.mockRejectedValue(new Error('not initialized'));

      await statusCommand.execute({});

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('GitGovernance not initialized'));
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[EARS-23] should output error in JSON format when requested', async () => {
      mockIdentityAdapter.getCurrentActor.mockRejectedValue(new Error('Test error'));

      await statusCommand.execute({ json: true });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"success": false')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('"error"')
      );
    });

    it('[EARS-24] should show technical details with --verbose on error', async () => {
      const error = new Error('Test error with stack');
      error.stack = 'Error stack trace here';
      mockIdentityAdapter.getCurrentActor.mockRejectedValue(error);

      await statusCommand.execute({ verbose: true });

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('🔍 Technical details:'));
    });
  });

  describe('Multi-Adapter Integration (EARS 25-27)', () => {
    it('[EARS-25] should coordinate all 5 adapters for complete dashboard', async () => {
      await statusCommand.execute({ all: true, health: true, team: true });

      // Verify that all adapters are called through their methods
      expect(mockBacklogAdapter.getAllTasks).toHaveBeenCalled();
      expect(mockBacklogAdapter.getAllCycles).toHaveBeenCalled();
      expect(mockMetricsAdapter.getSystemStatus).toHaveBeenCalled();
      expect(mockMetricsAdapter.getProductivityMetrics).toHaveBeenCalled();
      expect(mockMetricsAdapter.getCollaborationMetrics).toHaveBeenCalled();
      expect(mockIndexerAdapter.isIndexUpToDate).toHaveBeenCalled();
    });

    it('[EARS-26] should handle partial adapter failures gracefully', async () => {
      // Mock feedback adapter to fail, but others should still work
      mockFeedbackAdapter.getAllFeedback.mockRejectedValue(new Error('Feedback adapter failed'));

      // Execute the command - it should not throw
      await expect(statusCommand.execute({})).resolves.not.toThrow();

      // Should still show actor and task sections even if feedback fails
      expect(mockIdentityAdapter.getCurrentActor).toHaveBeenCalled();
      expect(mockBacklogAdapter.getTasksAssignedToActor).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('👤 Actor: Test User'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ My Work'));
    });

    it('[EARS-27] should maintain data consistency across adapters', async () => {
      await statusCommand.execute({});

      // Verify that the same actor ID is used across all adapter calls
      expect(mockBacklogAdapter.getTasksAssignedToActor).toHaveBeenCalledWith('human:test-user');
      expect(mockIdentityAdapter.getCurrentActor).toHaveBeenCalled();
    });
  });
});
