import { calculatePayloadChecksum } from "./checksum";
import type { TaskRecord } from "../types/task_record";
import type { CycleRecord } from "../types/cycle_record";
import type { ActorRecord } from "../types/actor_record";
import type { AgentRecord } from "../types/agent_record";
import type { ExecutionRecord } from "../types/execution_record";
import type { ChangelogRecord } from "../types/changelog_record";
import type { FeedbackRecord } from "../types/feedback_record";
import type { GitGovRecordPayload, GitGovRecordType } from "../models";

describe("calculatePayloadChecksum", () => {
  const testCases: { name: GitGovRecordType; payload: GitGovRecordPayload }[] = [
    {
      name: 'actor',
      payload: {
        id: 'actor:test', type: 'human', displayName: 'Test User',
        publicKey: 'key', roles: ['user'], status: 'active',
      } as ActorRecord
    },
    {
      name: 'agent',
      payload: {
        id: 'agent:test-agent', guild: 'design', status: 'active',
        engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
        triggers: [], knowledge_dependencies: [], prompt_engine_requirements: {}
      } as AgentRecord
    },
    {
      name: 'task',
      payload: {
        id: '1752274500-task-test-task', title: 'Test Task',
        status: 'draft', priority: 'medium', description: 'A test task for checksum validation', tags: ['test']
      } as TaskRecord
    },
    {
      name: 'cycle',
      payload: {
        id: '1754400000-cycle-test-cycle', title: 'Test Cycle',
        status: 'planning', taskIds: ['1752274500-task-test-task'], tags: ['test']
      } as CycleRecord
    },
    {
      name: 'execution',
      payload: {
        id: '1752275500-exec-test-execution', taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature', type: 'progress'
      } as ExecutionRecord
    },
    {
      name: 'changelog',
      payload: {
        id: '1752707800-changelog-task-test-task',
        entityType: 'task',
        entityId: '1752274500-task-test-task',
        changeType: 'completion',
        title: 'Test Task Completion',
        description: 'Successfully completed the test task with all requirements',
        timestamp: 1752707800,
        trigger: 'manual',
        triggeredBy: 'human:developer',
        reason: 'All acceptance criteria met and code review passed',
        riskLevel: 'low'
      } as ChangelogRecord
    },
    {
      name: 'feedback',
      payload: {
        id: '1752788100-feedback-blocking-issue', entityType: 'task', entityId: '1752274500-task-test-task',
        type: 'blocking', status: 'open', content: 'This task has a blocking issue'
      } as FeedbackRecord
    }
  ];

  for (const tc of testCases) {
    it(`[EARS-1] should produce a deterministic checksum for a ${tc.name}`, () => {
      // Create two versions with disordered keys
      const payload1 = { ...tc.payload, z: 'last', a: 'first' };
      const payload2 = { a: 'first', ...tc.payload, z: 'last' };

      const checksum1 = calculatePayloadChecksum(payload1);
      const checksum2 = calculatePayloadChecksum(payload2);

      expect(checksum1).toBe(checksum2);
    });
  }

  describe('ChangelogRecord v2 Enhanced Determinism Tests', () => {
    it('[EARS-1] should produce deterministic checksum for complex ChangelogRecord with nested objects and arrays', () => {
      // Create complex changelog v2 with all optional fields
      const complexChangelog1: ChangelogRecord = {
        id: '1752707800-changelog-system-payment-gateway',
        entityType: 'system',
        entityId: 'payment-gateway',
        changeType: 'hotfix',
        title: 'Critical Payment Gateway Fix',
        description: 'Fixed critical payment processing issue affecting 15% of transactions',
        timestamp: 1752707800,
        trigger: 'emergency',
        triggeredBy: 'human:on-call-engineer',
        reason: 'Payment failures spiked to 15% due to third-party API latency',
        riskLevel: 'critical',
        // Complex nested structures
        affectedSystems: ['payment-gateway', 'order-service', 'notification-service'],
        usersAffected: 25000,
        downtime: 300,
        files: ['src/payment/gateway.ts', 'src/payment/processor.ts'],
        commits: ['abc123def', 'def456ghi'],
        rollbackInstructions: 'Revert to payment-gateway:v2.1.4 and restart services',
        references: {
          tasks: ['1752274500-task-payment-fix'],
          executions: ['1752707750-exec-hotfix-implementation'],
          cycles: ['1752600000-cycle-payment-stability']
        }
      };

      // Create same object with keys in different order
      const complexChangelog2: ChangelogRecord = {
        riskLevel: 'critical',
        references: {
          cycles: ['1752600000-cycle-payment-stability'],
          tasks: ['1752274500-task-payment-fix'],
          executions: ['1752707750-exec-hotfix-implementation']
        },
        rollbackInstructions: 'Revert to payment-gateway:v2.1.4 and restart services',
        commits: ['abc123def', 'def456ghi'],
        files: ['src/payment/gateway.ts', 'src/payment/processor.ts'],
        downtime: 300,
        usersAffected: 25000,
        affectedSystems: ['payment-gateway', 'order-service', 'notification-service'],
        reason: 'Payment failures spiked to 15% due to third-party API latency',
        triggeredBy: 'human:on-call-engineer',
        trigger: 'emergency',
        timestamp: 1752707800,
        description: 'Fixed critical payment processing issue affecting 15% of transactions',
        title: 'Critical Payment Gateway Fix',
        changeType: 'hotfix',
        entityId: 'payment-gateway',
        entityType: 'system',
        id: '1752707800-changelog-system-payment-gateway'
      };

      const checksum1 = calculatePayloadChecksum(complexChangelog1);
      const checksum2 = calculatePayloadChecksum(complexChangelog2);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256 hex
    });

    it('[EARS-1] should produce different checksums for different ChangelogRecord v2 content', () => {
      const changelog1: ChangelogRecord = {
        id: '1752707800-changelog-task-feature-a',
        entityType: 'task',
        entityId: '1752274500-task-feature-a',
        changeType: 'completion',
        title: 'Feature A Completed',
        description: 'Successfully implemented feature A',
        timestamp: 1752707800,
        trigger: 'manual',
        triggeredBy: 'human:developer',
        reason: 'All requirements met',
        riskLevel: 'low'
      };

      const changelog2: ChangelogRecord = {
        id: '1752707800-changelog-task-feature-b',
        entityType: 'task',
        entityId: '1752274500-task-feature-b',
        changeType: 'completion',
        title: 'Feature B Completed',
        description: 'Successfully implemented feature B',
        timestamp: 1752707800,
        trigger: 'manual',
        triggeredBy: 'human:developer',
        reason: 'All requirements met',
        riskLevel: 'low'
      };

      const checksum1 = calculatePayloadChecksum(changelog1);
      const checksum2 = calculatePayloadChecksum(changelog2);

      expect(checksum1).not.toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/);
      expect(checksum2).toMatch(/^[a-f0-9]{64}$/);
    });
  });
}); 