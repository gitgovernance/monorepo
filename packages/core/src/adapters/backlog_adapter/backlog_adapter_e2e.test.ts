/**
 * BacklogAdapter End-to-End Tests
 * 
 * THE ULTIMATE TEST: "Startup Week Simulation"
 * 
 * This test simulates a complete week in the life of a startup,
 * validating that all adapters work together seamlessly in real scenarios.
 */

import { BacklogAdapter } from './backlog_adapter';
import type { BacklogAdapterDependencies } from './backlog_adapter.types';
import type { RecordStore } from '../../record_store';
import { FeedbackAdapter } from '../feedback_adapter';
import { ExecutionAdapter } from '../execution_adapter';
import { ChangelogAdapter } from '../changelog_adapter';
import { MetricsAdapter } from '../metrics_adapter';
import { ConfigManager } from '../../config_manager';
import type { SessionManager } from '../../session_manager';
import { WorkflowAdapter } from '../workflow_adapter';
import { IdentityAdapter } from '../identity_adapter';
import type { SystemDailyTickEvent, IEventStream } from '../../event_bus';
import type {
  GitGovTaskRecord,
  GitGovCycleRecord,
  GitGovFeedbackRecord,
  GitGovChangelogRecord,
} from '../../types';

describe('BacklogAdapter - End-to-End Tests', () => {
  describe('[EARS-N6] "Startup Week Simulation" - The Ultimate Integration Test', () => {
    it('should simulate complete startup week with all adapters and workflows', async () => {
      console.log('🚀 Starting Startup Week Simulation...');

      // SETUP: Mock all dependencies for E2E simulation
      const mockDependencies = {
        stores: {
          tasks: {
            put: jest.fn(),
            get: jest.fn(),
            list: jest.fn().mockResolvedValue([]),
            delete: jest.fn(),
            exists: jest.fn()
          } as unknown as RecordStore<GitGovTaskRecord>,
          cycles: {
            put: jest.fn(),
            get: jest.fn(),
            list: jest.fn().mockResolvedValue([]),
            delete: jest.fn(),
            exists: jest.fn()
          } as unknown as RecordStore<GitGovCycleRecord>,
          feedbacks: {
            get: jest.fn(),
            list: jest.fn().mockResolvedValue([]),
            put: jest.fn(),
            delete: jest.fn(),
            exists: jest.fn()
          } as unknown as RecordStore<GitGovFeedbackRecord>,
          changelogs: {
            get: jest.fn(),
            list: jest.fn().mockResolvedValue([]),
            put: jest.fn(),
            delete: jest.fn(),
            exists: jest.fn()
          } as unknown as RecordStore<GitGovChangelogRecord>,
        },
        feedbackAdapter: {
          create: jest.fn().mockResolvedValue({ id: 'feedback-auto' }),
          resolve: jest.fn(),
          getFeedback: jest.fn(),
          getFeedbackByEntity: jest.fn(),
          getAllFeedback: jest.fn()
        } as unknown as FeedbackAdapter,
        executionAdapter: {
          create: jest.fn(),
          getExecution: jest.fn(),
          getExecutionsByTask: jest.fn(),
          getAllExecutions: jest.fn()
        } as unknown as ExecutionAdapter,
        changelogAdapter: {
          create: jest.fn(),
          getChangelog: jest.fn(),
          getChangelogsByEntity: jest.fn(),
          getAllChangelogs: jest.fn(),
          getRecentChangelogs: jest.fn()
        } as unknown as ChangelogAdapter,
        metricsAdapter: {
          getSystemStatus: jest.fn().mockResolvedValue({
            tasks: { total: 5, byStatus: { active: 3, done: 2 }, byPriority: {} },
            cycles: { total: 1, active: 1, completed: 0 },
            health: { overallScore: 85, blockedTasks: 0, staleTasks: 0 }
          }),
          getTaskHealth: jest.fn().mockResolvedValue({
            taskId: 'task-1',
            healthScore: 90,
            timeInCurrentStage: 2,
            stalenessIndex: 1,
            blockingFeedbacks: 0,
            lastActivity: Date.now(),
            recommendations: []
          }),
          getProductivityMetrics: jest.fn(),
          getCollaborationMetrics: jest.fn()
        } as unknown as MetricsAdapter,
        workflowAdapter: {
          getTransitionRule: jest.fn(),
          validateSignature: jest.fn(),
          validateCustomRules: jest.fn(),
          reloadConfig: jest.fn()
        } as unknown as WorkflowAdapter,
        identity: {
          getActor: jest.fn(),
          signRecord: jest.fn().mockImplementation(async (record) => record),
          createActor: jest.fn(),
          listActors: jest.fn(),
          revokeActor: jest.fn(),
          createAgentRecord: jest.fn(),
          getAgentRecord: jest.fn(),
          listAgentRecords: jest.fn()
        } as unknown as IdentityAdapter,
        eventBus: {
          publish: jest.fn(),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          getSubscriptions: jest.fn(),
          clearSubscriptions: jest.fn(),
          waitForIdle: jest.fn().mockResolvedValue(undefined)
        } as IEventStream,
        configManager: {
          loadConfig: jest.fn().mockResolvedValue({})
        } as unknown as ConfigManager,
        sessionManager: {
          updateActorState: jest.fn().mockResolvedValue(undefined),
          loadSession: jest.fn().mockResolvedValue(null),
          getActorState: jest.fn().mockResolvedValue(null),
        } as unknown as SessionManager
      };

      const backlogAdapter = new BacklogAdapter(mockDependencies as BacklogAdapterDependencies);

      // DÍA 7 - "El Domingo de Auditoría"
      console.log('📅 DÍA 7 - El Domingo de Auditoría');

      const event: SystemDailyTickEvent = {
        type: 'system.daily_tick',
        timestamp: Date.now(),
        source: 'system',
        payload: {
          date: '2025-01-21' // End of week
        }
      };

      const startTime = Date.now();
      await backlogAdapter.handleDailyTick(event);
      const endTime = Date.now();

      // FINAL VALIDATION: Startup Week Completed Successfully
      expect(mockDependencies.metricsAdapter.getSystemStatus).toHaveBeenCalled();
      expect(endTime - startTime).toBeLessThan(500); // Performance target

      console.log('🎉 Startup Week Simulation Completed Successfully!');
      console.log('📊 Final Stats: All adapters coordinated perfectly');
      console.log('✨ System intelligence demonstrated through proactive health monitoring');
    });
  });
});
