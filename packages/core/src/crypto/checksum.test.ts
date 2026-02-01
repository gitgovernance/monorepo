import { calculatePayloadChecksum } from "./checksum";
import type { TaskRecord } from "../record_types";
import type { CycleRecord } from "../record_types";
import type { ActorRecord } from "../record_types";
import type { AgentRecord } from "../record_types";
import type { ExecutionRecord } from "../record_types";
import type { ChangelogRecord } from "../record_types";
import type { FeedbackRecord } from "../record_types";
import type { GitGovRecordPayload, GitGovRecordType } from "../record_types";

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
        id: 'agent:test-agent', status: 'active',
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
        id: '1752707800-changelog-test-deliverable',
        title: 'Test Deliverable Completion',
        description: 'Successfully completed the test task with all requirements',
        relatedTasks: ['1752274500-task-test-task'],
        completedAt: 1752707800,
        version: 'v1.0.0'
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
    it('[EARS-1] should produce deterministic checksum for complex ChangelogRecord with nested arrays', () => {
      // Create complex changelog v2 with all optional fields
      const complexChangelog1: ChangelogRecord = {
        id: '1752707800-changelog-payment-gateway-hotfix',
        title: 'Critical Payment Gateway Hotfix v2.1.5',
        description: 'Fixed critical payment processing issue affecting 15% of transactions due to third-party API latency',
        relatedTasks: ['1752274500-task-payment-fix', '1752274600-task-monitoring-improvement'],
        completedAt: 1752707800,
        relatedCycles: ['1752600000-cycle-payment-stability'],
        relatedExecutions: ['1752707750-exec-hotfix-implementation'],
        version: 'v2.1.5',
        tags: ['hotfix', 'critical', 'payment'],
        files: ['src/payment/gateway.ts', 'src/payment/processor.ts'],
        commits: ['abc123def', 'def456ghi'],
        notes: 'Emergency hotfix deployed. Payment failures spiked to 15%. Affected services: payment-gateway, order-service, notification-service. Downtime: 5 minutes. Users affected: ~25000.'
      };

      // Create same object with keys in different order
      const complexChangelog2: ChangelogRecord = {
        notes: 'Emergency hotfix deployed. Payment failures spiked to 15%. Affected services: payment-gateway, order-service, notification-service. Downtime: 5 minutes. Users affected: ~25000.',
        commits: ['abc123def', 'def456ghi'],
        files: ['src/payment/gateway.ts', 'src/payment/processor.ts'],
        tags: ['hotfix', 'critical', 'payment'],
        version: 'v2.1.5',
        relatedExecutions: ['1752707750-exec-hotfix-implementation'],
        relatedCycles: ['1752600000-cycle-payment-stability'],
        completedAt: 1752707800,
        relatedTasks: ['1752274500-task-payment-fix', '1752274600-task-monitoring-improvement'],
        description: 'Fixed critical payment processing issue affecting 15% of transactions due to third-party API latency',
        title: 'Critical Payment Gateway Hotfix v2.1.5',
        id: '1752707800-changelog-payment-gateway-hotfix'
      };

      const checksum1 = calculatePayloadChecksum(complexChangelog1);
      const checksum2 = calculatePayloadChecksum(complexChangelog2);

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256 hex
    });

    it('[EARS-1] should produce different checksums for different ChangelogRecord v2 content', () => {
      const changelog1: ChangelogRecord = {
        id: '1752707800-changelog-task-feature-a',
        title: 'Feature A Completed',
        description: 'Successfully implemented feature A with all requirements',
        relatedTasks: ['1752274500-task-feature-a'],
        completedAt: 1752707800,
        version: 'v1.0.0'
      };

      const changelog2: ChangelogRecord = {
        id: '1752707800-changelog-task-feature-b',
        title: 'Feature B Completed',
        description: 'Successfully implemented feature B with all requirements',
        relatedTasks: ['1752274500-task-feature-b'],
        completedAt: 1752707800,
        version: 'v1.0.0'
      };

      const checksum1 = calculatePayloadChecksum(changelog1);
      const checksum2 = calculatePayloadChecksum(changelog2);

      expect(checksum1).not.toBe(checksum2);
      expect(checksum1).toMatch(/^[a-f0-9]{64}$/);
      expect(checksum2).toMatch(/^[a-f0-9]{64}$/);
    });
  });
}); 