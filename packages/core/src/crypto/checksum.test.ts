import { calculatePayloadChecksum } from "./checksum";
import type { TaskRecord } from "../record_types";
import type { CycleRecord } from "../record_types";
import type { ActorRecord } from "../record_types";
import type { AgentRecord } from "../record_types";
import type { ExecutionRecord } from "../record_types";
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
}); 