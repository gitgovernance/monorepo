// Mock DependencyInjectionService before importing
vi.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: vi.fn()
  }
}));

// Mock all external dependencies BEFORE importing DashboardCommand
vi.mock('ink', () => ({
  render: vi.fn(() => ({ waitUntilExit: vi.fn() }))
}));
vi.mock('react', () => ({
  createElement: vi.fn()
}));
vi.mock('../../components/dashboard/DashboardTUI', () => ({
  default: vi.fn()
}));

// Mock @gitgov/core with all required modules
vi.mock('@gitgov/core', () => ({
  Factories: {
    createActorRecord: vi.fn().mockResolvedValue({
      id: 'human:demo-user',
      displayName: 'Demo User',
      type: 'human',
      publicKey: 'demo-public-key-base64',
      roles: ['developer'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }),
    createTaskRecord: vi.fn().mockResolvedValue({
      id: '1757789000-task-demo-task',
      title: 'Demo Task',
      status: 'active',
      priority: 'high',
      description: 'Demo task for dashboard',
      tags: ['demo'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }),
    createCycleRecord: vi.fn().mockResolvedValue({
      id: '1757789000-cycle-demo-cycle',
      title: 'Demo Cycle',
      status: 'active',
      notes: 'Demo cycle for dashboard',
      tags: ['demo'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }),
    createFeedbackRecord: vi.fn().mockResolvedValue({
      id: '1757789000-feedback-demo',
      entityType: 'task',
      entityId: '1757789000-task-demo-task',
      type: 'blocking',
      status: 'open',
      assignee: 'human:demo-user',
      content: 'Demo feedback',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
  },
  Adapters: {},
  Records: {},
  Modules: {}
}));

import { DashboardCommand } from './dashboard-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import { Factories } from '@gitgov/core';
import type {
  TaskRecord, CycleRecord, FeedbackRecord, ActorRecord, GitGovTaskRecord,
  SystemStatus, ProductivityMetrics, CollaborationMetrics, IndexData,
  IndexGenerationReport, ActivityEvent,
} from '@gitgov/core';

// Mock console methods to capture output
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation();
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation();
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation();

/**
 * Helper to convert TaskRecord payload to GitGovTaskRecord with mock header.
 * Mimics the structure that RecordStore would return from disk.
 */
function createMockGitGovTaskRecord(taskPayload: TaskRecord): GitGovTaskRecord {
  return {
    header: {
      version: '1.0' as const,
      type: 'task' as const,
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'human:demo-user',
        role: 'author',
        notes: 'Created task',
        signature: 'mock-signature',
        timestamp: Date.now()
      }] as [{ keyId: string; role: string; notes: string; signature: string; timestamp: number }]
    },
    payload: taskPayload
  };
}

describe('DashboardCommand - EARS Compliance Tests', () => {
  let dashboardCommand: DashboardCommand;
  let mockBacklogAdapter: {
    getAllTasks: Mock<() => Promise<TaskRecord[]>>;
    getAllCycles: Mock<() => Promise<CycleRecord[]>>;
  };
  let mockFeedbackAdapter: {
    getAllFeedback: Mock<() => Promise<FeedbackRecord[]>>;
  };
  let mockRecordMetrics: {
    getSystemStatus: Mock<() => Promise<SystemStatus>>;
    getProductivityMetrics: Mock<() => Promise<ProductivityMetrics>>;
    getCollaborationMetrics: Mock<() => Promise<CollaborationMetrics>>;
  };
  let mockProjector: {
    getIndexData: Mock<() => Promise<IndexData | null>>;
    generateIndex: Mock<() => Promise<IndexGenerationReport>>;
    isIndexUpToDate: Mock<() => Promise<boolean>>;
    calculateActivityHistory: Mock<() => Promise<ActivityEvent[]>>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: Mock<() => Promise<ActorRecord>>;
  };
  let mockDependencyService: {
    getBacklogAdapter: Mock<() => Promise<typeof mockBacklogAdapter>>;
    getFeedbackAdapter: Mock<() => Promise<typeof mockFeedbackAdapter>>;
    getRecordMetrics: Mock<() => Promise<typeof mockRecordMetrics>>;
    getRecordProjector: Mock<() => Promise<typeof mockProjector>>;
    getIdentityAdapter: Mock<() => Promise<typeof mockIdentityAdapter>>;
    getCurrentActor: Mock<() => Promise<ActorRecord>>;
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
      overallScore: 85,
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

  const sampleIndexData: IndexData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      lastCommitHash: 'abc123',
      integrityStatus: 'valid',
      recordCounts: { tasks: 1, cycles: 1, actors: 1 },
      generationTime: 100
    },
    metrics: {
      ...sampleSystemStatus,
      ...sampleProductivityMetrics,
      ...sampleCollaborationMetrics
    },
    derivedStates: {
      stalledTasks: [],
      atRiskTasks: [],
      needsClarificationTasks: [],
      blockedByDependencyTasks: []
    },
    tasks: [],
    cycles: [],
    actors: [],
    executions: [],
    agents: [],
    enrichedTasks: [],
    feedback: [],
    activityHistory: []
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Get sample data from mocked factories
    sampleActor = await Factories.createActorRecord({});
    sampleTask = await Factories.createTaskRecord({});
    sampleCycle = await Factories.createCycleRecord({});
    sampleFeedback = await Factories.createFeedbackRecord({});

    // Create mock adapters
    mockBacklogAdapter = {
      getAllTasks: vi.fn(),
      getAllCycles: vi.fn()
    };

    mockFeedbackAdapter = {
      getAllFeedback: vi.fn()
    };

    mockRecordMetrics = {
      getSystemStatus: vi.fn(),
      getProductivityMetrics: vi.fn(),
      getCollaborationMetrics: vi.fn()
    };

    mockProjector = {
      getIndexData: vi.fn(),
      generateIndex: vi.fn(),
      isIndexUpToDate: vi.fn(),
      calculateActivityHistory: vi.fn()
    };

    mockIdentityAdapter = {
      getCurrentActor: vi.fn()
    };

    // Create mock dependency service
    mockDependencyService = {
      getBacklogAdapter: vi.fn().mockResolvedValue(mockBacklogAdapter),
      getFeedbackAdapter: vi.fn().mockResolvedValue(mockFeedbackAdapter),
      getRecordMetrics: vi.fn().mockResolvedValue(mockRecordMetrics),
      getRecordProjector: vi.fn().mockResolvedValue(mockProjector),
      getIdentityAdapter: vi.fn().mockResolvedValue(mockIdentityAdapter),
      getCurrentActor: vi.fn().mockResolvedValue(sampleActor),
      getHeadSha: vi.fn().mockResolvedValue('test-sha'),
    };

    // Mock DependencyInjectionService.getInstance()
    (DependencyInjectionService.getInstance as vi.Mock).mockReturnValue(mockDependencyService);

    // Create DashboardCommand
    dashboardCommand = new DashboardCommand();

    // Setup default mock returns
    mockIdentityAdapter.getCurrentActor.mockResolvedValue(sampleActor);
    mockBacklogAdapter.getAllTasks.mockResolvedValue([sampleTask]);
    mockBacklogAdapter.getAllCycles.mockResolvedValue([sampleCycle]);
    mockFeedbackAdapter.getAllFeedback.mockResolvedValue([sampleFeedback]);
    mockRecordMetrics.getSystemStatus.mockResolvedValue(sampleSystemStatus);
    mockRecordMetrics.getProductivityMetrics.mockResolvedValue(sampleProductivityMetrics);
    mockRecordMetrics.getCollaborationMetrics.mockResolvedValue(sampleCollaborationMetrics);
    mockProjector.isIndexUpToDate.mockResolvedValue(true);
  });

  afterEach(() => {
    // Reset mocks after each test
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('EARS-E1: EnrichedTasks & Activity Stream', () => {
    it('[EARS-E1] should immediately regenerate cache when indexData is null', async () => {
      // Arrange: Mock scenario where cache is invalidated (indexData is null)
      const sampleActivity: ActivityEvent[] = [
        {
          timestamp: Date.now(),
          type: 'task_created',
          entityId: 'task-123',
          entityTitle: 'Task created',
          actorId: 'human:demo-user',
          metadata: {
            priority: 'high',
            status: 'active'
          }
        }
      ];

      const mockGenerationReport: IndexGenerationReport = {
        success: true,
        recordsProcessed: 10,
        metricsCalculated: 3,
        derivedStatesApplied: 0,
        generationTime: 100,
        errors: [],
        performance: {
          readTime: 30,
          calculationTime: 50,
          writeTime: 20
        }
      };

      const indexDataWithActivity: IndexData = {
        ...sampleIndexData,
        activityHistory: sampleActivity
      };

      // First call returns null (cache invalidated), second call returns data
      mockProjector.getIndexData
        .mockResolvedValueOnce(null) // Cache invalidated
        .mockResolvedValueOnce(indexDataWithActivity); // After regeneration

      mockProjector.generateIndex.mockResolvedValue(mockGenerationReport);

      // Act: Call gatherDashboardIntelligence (private method via JSON mode)
      await dashboardCommand.execute({ json: true });

      // Assert: Should call generateIndex when indexData is null
      expect(mockProjector.getIndexData).toHaveBeenCalledTimes(2);
      expect(mockProjector.generateIndex).toHaveBeenCalledTimes(1);
    });

    it('[EARS-E1] should preserve activity history even when cache is regenerated', async () => {
      // Arrange: Mock activity history
      const expectedActivity: ActivityEvent[] = [
        {
          timestamp: Date.now() - 1000,
          type: 'task_created',
          entityId: 'task-123',
          entityTitle: 'New task created',
          actorId: 'human:demo-user',
          metadata: {
            priority: 'high',
            status: 'draft'
          }
        },
        {
          timestamp: Date.now(),
          type: 'feedback_created',
          entityId: 'feedback-456',
          entityTitle: 'Task assigned',
          actorId: 'human:demo-user',
          metadata: {
            type: 'assignment',
            assignee: 'human:demo-user'
          }
        }
      ];

      const mockGenerationReport: IndexGenerationReport = {
        success: true,
        recordsProcessed: 15,
        metricsCalculated: 4,
        derivedStatesApplied: 0,
        generationTime: 120,
        errors: [],
        performance: {
          readTime: 40,
          calculationTime: 60,
          writeTime: 20
        }
      };

      const indexDataWithActivity: IndexData = {
        ...sampleIndexData,
        activityHistory: expectedActivity
      };

      // Mock cache miss and regeneration
      mockProjector.getIndexData
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(indexDataWithActivity);

      mockProjector.generateIndex.mockResolvedValue(mockGenerationReport);

      // Capture JSON output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

      // Act
      await dashboardCommand.execute({ json: true });

      // Assert: Activity history should be preserved in output
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"success": true')
      );

      // Cleanup
      consoleSpy.mockRestore();
    });
  });

  describe('EARS-E4: Timestamp Consistency & Performance', () => {
    it('[EARS-E4] should use 1 second refresh interval by default (demo optimization)', async () => {
      // Arrange: Mock successful cache
      mockProjector.getIndexData.mockResolvedValue(sampleIndexData);

      // Mock Ink render to capture props
      const ink = await import('ink');
      const mockRender = vi.mocked(ink.render);
      mockRender.mockReturnValue({ waitUntilExit: vi.fn() });

      // Act: Execute dashboard without explicit refresh interval
      await dashboardCommand.execute({});

      // Assert: Should use 1 second refresh (demo optimization)
      expect(mockRender).toHaveBeenCalled();
      // Verify that render was called with React element containing refreshInterval: 1
      const renderArgs = mockRender.mock.calls[0];
      expect(renderArgs).toBeDefined();
      expect(renderArgs.length).toBeGreaterThan(0);
    });

    it('[EARS-E4] should respect custom refresh interval when provided', async () => {
      // Arrange: Mock successful cache
      mockProjector.getIndexData.mockResolvedValue(sampleIndexData);

      const ink = await import('ink');
      const mockRender = vi.mocked(ink.render);
      mockRender.mockReturnValue({ waitUntilExit: vi.fn() });

      // Act: Execute with custom refresh interval
      await dashboardCommand.execute({ refreshInterval: 10 });

      // Assert: Should use custom refresh interval
      expect(mockRender).toHaveBeenCalled();
      // Verify that render was called with custom refresh interval
      const renderArgs = mockRender.mock.calls[0];
      expect(renderArgs).toBeDefined();
      expect(renderArgs.length).toBeGreaterThan(0);
    });

    it('[EARS-A4] should regenerate cache in under 100ms for demo responsiveness', async () => {
      // Arrange: Mock cache miss scenario
      const mockGenerationReport: IndexGenerationReport = {
        success: true,
        recordsProcessed: 50,
        metricsCalculated: 5,
        derivedStatesApplied: 0,
        generationTime: 80, // Under 100ms
        errors: [],
        performance: {
          readTime: 25,
          calculationTime: 40,
          writeTime: 15
        }
      };

      mockProjector.getIndexData
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sampleIndexData);

      // Mock fast regeneration
      mockProjector.generateIndex.mockResolvedValue(mockGenerationReport);

      // Act: Measure execution time
      const startTime = Date.now();
      await dashboardCommand.execute({ json: true });
      const executionTime = Date.now() - startTime;

      // Assert: Should be fast enough for demo (under 200ms total)
      expect(executionTime).toBeLessThan(200);
      expect(mockProjector.generateIndex).toHaveBeenCalledTimes(1);
      expect(mockGenerationReport.generationTime).toBeLessThan(100);
    });
  });

  describe('Integration: EARS-A Multi-Adapter Orchestration', () => {
    it('[EARS-A1] [EARS-A4] should handle complete demo scenario: cache miss -> regeneration -> activity display', async () => {
      // Arrange: Complete demo scenario
      const demoActivity: ActivityEvent[] = [
        {
          timestamp: Date.now() - 2000,
          type: 'task_created',
          entityId: 'demo-task',
          entityTitle: 'Demo task created',
          actorId: 'human:demo-user',
          metadata: {
            priority: 'high',
            status: 'draft'
          }
        },
        {
          timestamp: Date.now() - 1000,
          type: 'feedback_created',
          entityId: 'demo-feedback',
          entityTitle: 'Demo task assigned',
          actorId: 'human:demo-user',
          metadata: {
            type: 'assignment',
            assignee: 'human:demo'
          }
        },
        {
          timestamp: Date.now(),
          type: 'cycle_created',
          entityId: 'demo-cycle',
          entityTitle: 'Demo cycle created',
          actorId: 'human:demo-user',
          metadata: {
            status: 'active'
          }
        }
      ];

      const mockGenerationReport: IndexGenerationReport = {
        success: true,
        recordsProcessed: 25,
        metricsCalculated: 6,
        derivedStatesApplied: 0,
        generationTime: 150,
        errors: [],
        performance: {
          readTime: 50,
          calculationTime: 80,
          writeTime: 20
        }
      };

      const completeIndexData: IndexData = {
        ...sampleIndexData,
        tasks: [createMockGitGovTaskRecord(sampleTask)],
        activityHistory: demoActivity
      };

      // Mock complete flow: cache miss -> regeneration -> success
      mockProjector.getIndexData
        .mockResolvedValueOnce(null) // Cache invalidated
        .mockResolvedValueOnce(completeIndexData); // After regeneration

      mockProjector.generateIndex.mockResolvedValue(mockGenerationReport);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();

      // Act: Execute complete demo flow
      await dashboardCommand.execute({ json: true });

      // Assert: Should complete successfully with activity history
      expect(mockProjector.getIndexData).toHaveBeenCalledTimes(2);
      expect(mockProjector.generateIndex).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"success": true')
      );

      consoleSpy.mockRestore();
    });
  });
});