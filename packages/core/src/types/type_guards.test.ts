import {
  isTaskPayload,
  isCyclePayload,
  isExecutionPayload,
  isActorPayload,
  isAgentPayload,
  isChangelogPayload,
  isFeedbackPayload
} from './type_guards';
import type { GitGovRecordPayload } from './index';

describe('Type Guards', () => {
  describe('isTaskPayload', () => {
    it('should return true for valid TaskRecord', () => {
      const task: GitGovRecordPayload = {
        id: '1234567890-task-test',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'A test task with enough characters to meet minimum.',
        tags: [],
        cycleIds: [],
        references: []
      };
      expect(isTaskPayload(task)).toBe(true);
    });

    it('should return false for CycleRecord (no priority)', () => {
      const cycle: GitGovRecordPayload = {
        id: '1234567890-cycle-test',
        title: 'Test Cycle',
        status: 'active',
        taskIds: []
      };
      expect(isTaskPayload(cycle)).toBe(false);
    });
  });

  describe('isCyclePayload', () => {
    it('should return true for valid CycleRecord', () => {
      const cycle: GitGovRecordPayload = {
        id: '1234567890-cycle-test',
        title: 'Test Cycle',
        status: 'active',
        taskIds: []
      };
      expect(isCyclePayload(cycle)).toBe(true);
    });

    it('should return false for TaskRecord (has priority)', () => {
      const task: GitGovRecordPayload = {
        id: '1234567890-task-test',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'A test task with enough characters to meet minimum.',
        tags: [],
        cycleIds: [],
        references: []
      };
      expect(isCyclePayload(task)).toBe(false);
    });
  });

  describe('isExecutionPayload', () => {
    it('should return true for valid ExecutionRecord', () => {
      const execution: GitGovRecordPayload = {
        id: '1234567890-exec-test',
        taskId: '1234567890-task-test',
        type: 'progress',
        title: 'Test Execution',
        result: 'Completed the test successfully with all checks passing.'
      };
      expect(isExecutionPayload(execution)).toBe(true);
    });

    it('should return false for TaskRecord', () => {
      const task: GitGovRecordPayload = {
        id: '1234567890-task-test',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'A test task with enough characters.',
        tags: [],
        cycleIds: [],
        references: []
      };
      expect(isExecutionPayload(task)).toBe(false);
    });
  });

  describe('isActorPayload', () => {
    it('should return true for valid human ActorRecord', () => {
      const actor: GitGovRecordPayload = {
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer Name',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        roles: ['developer']
      };
      expect(isActorPayload(actor)).toBe(true);
    });

    it('should return true for agent ActorRecord', () => {
      const agentActor: GitGovRecordPayload = {
        id: 'agent:code-reviewer',
        type: 'agent',
        displayName: 'Code Reviewer Agent',
        publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
        roles: ['reviewer']
      };
      expect(isActorPayload(agentActor)).toBe(true);
    });

    it('should return false for AgentRecord (manifest)', () => {
      const agentManifest: GitGovRecordPayload = {
        id: 'agent:code-reviewer',
        engine: { type: 'local' }
      };
      expect(isActorPayload(agentManifest)).toBe(false);
    });
  });

  describe('isAgentPayload', () => {
    it('should return true for valid AgentRecord (manifest)', () => {
      const agentManifest: GitGovRecordPayload = {
        id: 'agent:code-reviewer',
        engine: { type: 'local' }
      };
      expect(isAgentPayload(agentManifest)).toBe(true);
    });

    it('should return true for AgentRecord with api engine', () => {
      const agentManifest: GitGovRecordPayload = {
        id: 'agent:api-agent',
        engine: { type: 'api', url: 'https://api.example.com' }
      };
      expect(isAgentPayload(agentManifest)).toBe(true);
    });

    it('should return false for ActorRecord', () => {
      const actor: GitGovRecordPayload = {
        id: 'human:developer',
        type: 'human',
        displayName: 'Developer Name',
        publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        roles: ['developer']
      };
      expect(isAgentPayload(actor)).toBe(false);
    });
  });

  describe('isChangelogPayload', () => {
    it('should return true for valid ChangelogRecord', () => {
      const changelog: GitGovRecordPayload = {
        id: '1234567890-changelog-test-release',
        title: 'Test Release v1.0.0',
        description: 'This is a test release with many improvements and fixes.',
        relatedTasks: ['1234567890-task-implement-feature'],
        completedAt: 1234567890
      };
      expect(isChangelogPayload(changelog)).toBe(true);
    });

    it('should return false for TaskRecord', () => {
      const task: GitGovRecordPayload = {
        id: '1234567890-task-test',
        title: 'Test Task',
        status: 'draft',
        priority: 'medium',
        description: 'A test task with enough characters.',
        tags: [],
        cycleIds: [],
        references: []
      };
      expect(isChangelogPayload(task)).toBe(false);
    });
  });

  describe('isFeedbackPayload', () => {
    it('should return true for valid FeedbackRecord', () => {
      const feedback: GitGovRecordPayload = {
        id: '1234567890-feedback-blocking-api',
        entityType: 'task',
        entityId: '1234567890-task-test',
        type: 'blocking',
        status: 'open',
        content: 'This implementation needs to be reviewed before merging.'
      };
      expect(isFeedbackPayload(feedback)).toBe(true);
    });

    it('should return false for ChangelogRecord', () => {
      const changelog: GitGovRecordPayload = {
        id: '1234567890-changelog-test-release',
        title: 'Test Release v1.0.0',
        description: 'This is a test release with many improvements and fixes.',
        relatedTasks: ['1234567890-task-implement-feature'],
        completedAt: 1234567890
      };
      expect(isFeedbackPayload(changelog)).toBe(false);
    });
  });
});
