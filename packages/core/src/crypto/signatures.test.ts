import { generateKeys, signPayload, verifySignatures } from './signatures';
import type { GitGovRecord, GitGovRecordPayload, GitGovRecordType } from '../types';
import type { ActorRecord } from '../types';
import type { AgentRecord } from '../types';
import type { TaskRecord } from '../types';
import type { CycleRecord } from '../types';
import type { ExecutionRecord } from '../types';
import type { ChangelogRecord } from '../types';
import type { FeedbackRecord } from '../types';
import { calculatePayloadChecksum } from './checksum';

describe('Crypto Module (Signatures)', () => {
  let mainActorKeys: { publicKey: string; privateKey: string; };
  let maliciousActorKeys: { publicKey: string; privateKey: string; };
  let mainActor: ActorRecord;

  const getActorPublicKey = async (keyId: string): Promise<string | null> => {
    if (keyId === 'actor:main') return mainActorKeys.publicKey;
    return null;
  };

  beforeAll(async () => {
    mainActorKeys = await generateKeys();
    maliciousActorKeys = await generateKeys();
    mainActor = {
      id: 'actor:main', type: 'human', displayName: 'Main Actor',
      publicKey: mainActorKeys.publicKey, roles: ['author'], status: 'active',
    };
  });

  const recordTestCases: { name: string; type: GitGovRecordType; payload: GitGovRecordPayload }[] = [
    {
      name: 'ActorRecord',
      type: 'actor',
      payload: {
        id: 'actor:payload', type: 'human', displayName: 'Payload Actor',
        publicKey: 'payload-key', roles: ['guest'], status: 'active'
      } as ActorRecord
    },
    {
      name: 'AgentRecord',
      type: 'agent',
      payload: {
        id: 'agent:test-agent', status: 'active',
        engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
        triggers: [], knowledge_dependencies: [], prompt_engine_requirements: {}
      } as AgentRecord
    },
    {
      name: 'TaskRecord',
      type: 'task',
      payload: {
        id: '1752274500-task-test-task', title: 'Test Task',
        status: 'draft', priority: 'medium', description: 'A test task for signature validation', tags: ['test']
      } as TaskRecord
    },
    {
      name: 'CycleRecord',
      type: 'cycle',
      payload: {
        id: '1754400000-cycle-test-cycle', title: 'Test Cycle',
        status: 'planning', taskIds: ['1752274500-task-test-task'], tags: ['test']
      } as CycleRecord
    },
    {
      name: 'ExecutionRecord',
      type: 'execution',
      payload: {
        id: '1752275500-exec-test-execution', taskId: '1752274500-task-test-task',
        result: 'Successfully implemented the feature', type: 'progress'
      } as ExecutionRecord
    },
    {
      name: 'ChangelogRecord',
      type: 'changelog',
      payload: {
        id: '1752707800-changelog-task-test-task',
        title: 'Test Task Completion',
        description: 'Successfully completed the test task with all requirements',
        relatedTasks: ['1752274500-task-test-task'],
        completedAt: 1752707800,
        version: 'v1.0.0'
      } as ChangelogRecord
    },
    {
      name: 'FeedbackRecord',
      type: 'feedback',
      payload: {
        id: '1752788100-feedback-blocking-issue', entityType: 'task', entityId: '1752274500-task-test-task',
        type: 'blocking', status: 'open', content: 'This task has a blocking issue'
      } as FeedbackRecord
    }
  ];

  describe('Happy Path (Parametrized)', () => {
    for (const tc of recordTestCases) {
      it(`[EARS-2, EARS-5] should create a valid signature for a ${tc.name} that can be verified`, async () => {
        const signature = signPayload(tc.payload, mainActorKeys.privateKey, mainActor.id, 'author', 'Test signature');
        const record = {
          header: {
            version: '1.0', type: tc.type,
            payloadChecksum: calculatePayloadChecksum(tc.payload),
            signatures: [signature],
          },
          payload: tc.payload,
        } as GitGovRecord;
        await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(true);
      });
    }
  });

  describe('Security Failure Cases (ActorRecord)', () => {
    const actorPayload: ActorRecord = {
      id: 'actor:payload', type: 'human', displayName: 'Original Actor',
      publicKey: 'payload-key', roles: ['guest'], status: 'active'
    };

    it('[EARS-4] should FAIL verification if an ActorRecord payload is tampered with', async () => {
      const signature = signPayload(actorPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Actor record signature');
      const tamperedPayload = { ...actorPayload, displayName: 'TAMPERED' };
      const record = {
        header: {
          version: '1.0', type: 'actor', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-3] should FAIL verification if the signature role is tampered with', async () => {
      const signature = signPayload(actorPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Actor record signature');
      signature.role = 'approver'; // Tamper
      const record = {
        header: {
          version: '1.0', type: 'actor', payloadChecksum: calculatePayloadChecksum(actorPayload),
          signatures: [signature],
        },
        payload: actorPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-3] should FAIL verification if the signature itself is invalid', async () => {
      const signature = signPayload(actorPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Actor record signature');
      signature.role = 'approver'; // Tamper
      const record = {
        header: {
          version: '1.0', type: 'actor', payloadChecksum: calculatePayloadChecksum(actorPayload),
          signatures: [signature],
        },
        payload: actorPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(actorPayload, maliciousActorKeys.privateKey, 'actor:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'actor', payloadChecksum: calculatePayloadChecksum(actorPayload),
          signatures: [signature],
        },
        payload: actorPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });

  describe('Security Failure Cases (AgentRecord)', () => {
    const agentPayload: AgentRecord = {
      id: 'agent:test-agent', status: 'active',
      engine: { type: 'local', runtime: 'typescript', entrypoint: 'test.ts', function: 'run' },
      triggers: [], knowledge_dependencies: [], prompt_engine_requirements: {}
    };

    it('[EARS-4] should FAIL verification if an AgentRecord payload is tampered with', async () => {
      const signature = signPayload(agentPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Agent record signature');
      const tamperedPayload = { ...agentPayload, status: 'archived' as const }; // Tamper status
      const record = {
        header: {
          version: '1.0', type: 'agent', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-3] should FAIL verification if the signature role is tampered with', async () => {
      const signature = signPayload(agentPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Agent record signature');
      signature.role = 'approver'; // Tamper
      const record = {
        header: {
          version: '1.0', type: 'agent', payloadChecksum: calculatePayloadChecksum(agentPayload),
          signatures: [signature],
        },
        payload: agentPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(agentPayload, maliciousActorKeys.privateKey, 'agent:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'agent', payloadChecksum: calculatePayloadChecksum(agentPayload),
          signatures: [signature],
        },
        payload: agentPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });

  describe('Security Failure Cases (TaskRecord)', () => {
    const taskPayload: TaskRecord = {
      id: '1752274500-task-test-task', title: 'Test Task',
      status: 'draft', priority: 'medium', description: 'A test task for security validation', tags: ['test']
    };

    it('[EARS-4] should FAIL verification if a TaskRecord payload is tampered with', async () => {
      const signature = signPayload(taskPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Task record signature');
      const tamperedPayload = { ...taskPayload, title: 'TAMPERED TASK' }; // Tamper title
      const record = {
        header: {
          version: '1.0', type: 'task', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-3] should FAIL verification if the signature role is tampered with', async () => {
      const signature = signPayload(taskPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Task record signature');
      signature.role = 'approver'; // Tamper
      const record = {
        header: {
          version: '1.0', type: 'task', payloadChecksum: calculatePayloadChecksum(taskPayload),
          signatures: [signature],
        },
        payload: taskPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(taskPayload, maliciousActorKeys.privateKey, 'actor:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'task', payloadChecksum: calculatePayloadChecksum(taskPayload),
          signatures: [signature],
        },
        payload: taskPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });

  describe('Security Failure Cases (CycleRecord)', () => {
    const cyclePayload: CycleRecord = {
      id: '1754400000-cycle-test-cycle', title: 'Test Cycle',
      status: 'planning', taskIds: ['1752274500-task-test-task'], tags: ['test']
    };

    it('[EARS-4] should FAIL verification if a CycleRecord payload is tampered with', async () => {
      const signature = signPayload(cyclePayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Cycle record signature');
      const tamperedPayload = { ...cyclePayload, title: 'TAMPERED CYCLE' }; // Tamper title
      const record = {
        header: {
          version: '1.0', type: 'cycle', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-3] should FAIL verification if the signature role is tampered with', async () => {
      const signature = signPayload(cyclePayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Cycle record signature');
      signature.role = 'approver'; // Tamper
      const record = {
        header: {
          version: '1.0', type: 'cycle', payloadChecksum: calculatePayloadChecksum(cyclePayload),
          signatures: [signature],
        },
        payload: cyclePayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(cyclePayload, maliciousActorKeys.privateKey, 'actor:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'cycle', payloadChecksum: calculatePayloadChecksum(cyclePayload),
          signatures: [signature],
        },
        payload: cyclePayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });

  describe('Security Failure Cases (ExecutionRecord)', () => {
    const executionPayload: ExecutionRecord = {
      id: '1752275500-exec-test-execution', taskId: '1752274500-task-test-task',
      type: 'progress', title: 'Test Execution',
      result: 'Successfully implemented the feature'
    };

    it('[EARS-4] should FAIL verification if an ExecutionRecord payload is tampered with', async () => {
      const signature = signPayload(executionPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Execution record signature');
      const tamperedPayload = { ...executionPayload, result: 'TAMPERED RESULT' }; // Tamper result
      const record = {
        header: {
          version: '1.0', type: 'execution', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(executionPayload, maliciousActorKeys.privateKey, 'actor:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'execution', payloadChecksum: calculatePayloadChecksum(executionPayload),
          signatures: [signature],
        },
        payload: executionPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });

  describe('Security Failure Cases (ChangelogRecord)', () => {
    const changelogPayload: ChangelogRecord = {
      id: '1752707800-changelog-task-test-task',
      title: 'Test Task Completion',
      description: 'Successfully completed the test task with all requirements',
      relatedTasks: ['1752274500-task-test-task'],
      completedAt: 1752707800,
      version: 'v1.0.0'
    };

    it('[EARS-4] should FAIL verification if a ChangelogRecord payload is tampered with', async () => {
      const signature = signPayload(changelogPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Changelog record signature');
      const tamperedPayload = { ...changelogPayload, description: 'TAMPERED DESCRIPTION' }; // Tamper description
      const record = {
        header: {
          version: '1.0', type: 'changelog', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(changelogPayload, maliciousActorKeys.privateKey, 'actor:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'changelog', payloadChecksum: calculatePayloadChecksum(changelogPayload),
          signatures: [signature],
        },
        payload: changelogPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });

  describe('Security Failure Cases (FeedbackRecord)', () => {
    const feedbackPayload: FeedbackRecord = {
      id: '1752788100-feedback-blocking-issue', entityType: 'task', entityId: '1752274500-task-test-task',
      type: 'blocking', status: 'open', content: 'This task has a blocking issue'
    };

    it('[EARS-4] should FAIL verification if a FeedbackRecord payload is tampered with', async () => {
      const signature = signPayload(feedbackPayload, mainActorKeys.privateKey, mainActor.id, 'author', 'Feedback record signature');
      const tamperedPayload = { ...feedbackPayload, content: 'TAMPERED CONTENT' }; // Tamper content
      const record = {
        header: {
          version: '1.0', type: 'feedback', payloadChecksum: calculatePayloadChecksum(tamperedPayload),
          signatures: [signature],
        },
        payload: tamperedPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });

    it('[EARS-6] should FAIL verification if the signature is from a malicious (unknown) actor', async () => {
      const signature = signPayload(feedbackPayload, maliciousActorKeys.privateKey, 'actor:malicious', 'author', 'Malicious signature attempt');
      const record = {
        header: {
          version: '1.0', type: 'feedback', payloadChecksum: calculatePayloadChecksum(feedbackPayload),
          signatures: [signature],
        },
        payload: feedbackPayload,
      } as GitGovRecord;
      await expect(verifySignatures(record, getActorPublicKey)).resolves.toBe(false);
    });
  });
});
