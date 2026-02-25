import {
  extractRecordIdFromPath,
  getEntityTypeFromPath,
  inferEntityTypeFromId,
  parseTimestampedId,
  parseActorId,
  isValidTimestampedId
} from './id_parser';

describe('ID Parsers', () => {
  describe('extractRecordIdFromPath (EARS-A1)', () => {
    it('[EARS-A1] should extract ID from standard path', () => {
      expect(extractRecordIdFromPath('.gitgov/tasks/123-task-foo.json')).toBe('123-task-foo');
    });

    it('[EARS-A1] should extract ID from absolute path', () => {
      expect(extractRecordIdFromPath('/abs/path/.gitgov/actors/human_dev.json')).toBe('human_dev');
    });

    it('[EARS-A1] should handle path without extension', () => {
      expect(extractRecordIdFromPath('.gitgov/tasks/123-task-foo')).toBe('123-task-foo');
    });
  });

  describe('getEntityTypeFromPath (EARS-A2)', () => {
    it('[EARS-A2] should return task for tasks directory', () => {
      expect(getEntityTypeFromPath('.gitgov/tasks/123.json')).toBe('task');
    });

    it('[EARS-A2] should return actor for actors directory', () => {
      expect(getEntityTypeFromPath('.gitgov/actors/human_dev.json')).toBe('actor');
    });

    it('[EARS-A2] should return cycle for cycles directory', () => {
      expect(getEntityTypeFromPath('.gitgov/cycles/123-cycle-sprint.json')).toBe('cycle');
    });

    it('[EARS-A2] should return execution for executions directory', () => {
      expect(getEntityTypeFromPath('.gitgov/executions/123-exec-commit.json')).toBe('execution');
    });

    it('[EARS-A2] should return feedback for feedbacks directory', () => {
      expect(getEntityTypeFromPath('.gitgov/feedbacks/123-feedback-review.json')).toBe('feedback');
    });

    it('[EARS-A2] should return agent for agents directory', () => {
      expect(getEntityTypeFromPath('.gitgov/agents/agent_code-reviewer.json')).toBe('agent');
    });

    it('[EARS-A2] should return null for unknown path', () => {
      expect(getEntityTypeFromPath('/some/other/path.json')).toBeNull();
    });
  });

  describe('inferEntityTypeFromId (EARS-B1)', () => {
    it('[EARS-B1] should infer execution from exec pattern', () => {
      expect(inferEntityTypeFromId('1234567890-exec-commit')).toBe('execution');
    });

    it('[EARS-B1] should infer execution from -execution- pattern', () => {
      expect(inferEntityTypeFromId('something-execution-test')).toBe('execution');
    });

    it('[EARS-B1] should infer feedback from pattern', () => {
      expect(inferEntityTypeFromId('1234567890-feedback-review')).toBe('feedback');
    });

    it('[EARS-B1] should infer cycle from timestamp pattern', () => {
      expect(inferEntityTypeFromId('1234567890-cycle-sprint')).toBe('cycle');
    });

    it('[EARS-B1] should infer cycle from cycle: prefix', () => {
      expect(inferEntityTypeFromId('cycle:sprint-1')).toBe('cycle');
    });

    it('[EARS-B1] should infer task from timestamp pattern', () => {
      expect(inferEntityTypeFromId('1234567890-task-implement-auth')).toBe('task');
    });

    it('[EARS-B1] should infer task from task: prefix', () => {
      expect(inferEntityTypeFromId('task:implement-auth')).toBe('task');
    });

    it('[EARS-B1] should infer actor from human: prefix', () => {
      expect(inferEntityTypeFromId('human:developer')).toBe('actor');
    });

    it('[EARS-B1] should infer actor from human_ prefix', () => {
      expect(inferEntityTypeFromId('human_developer')).toBe('actor');
    });

    it('[EARS-B1] should infer agent from agent: prefix', () => {
      expect(inferEntityTypeFromId('agent:code-reviewer')).toBe('agent');
    });

    it('[EARS-B1] should infer agent from agent_ prefix', () => {
      expect(inferEntityTypeFromId('agent_code-reviewer')).toBe('agent');
    });

    it('[EARS-B1] should default to task for unknown pattern', () => {
      expect(inferEntityTypeFromId('unknown-pattern')).toBe('task');
    });
  });

  describe('parseTimestampedId (EARS-C1, EARS-C2)', () => {
    it('[EARS-C1] should parse a valid task ID', () => {
      const parsed = parseTimestampedId('12345-task-implement-auth');
      expect(parsed).toEqual({
        timestamp: 12345,
        prefix: 'task',
        slug: 'implement-auth',
      });
    });

    it('[EARS-C1] should parse a valid cycle ID', () => {
      const parsed = parseTimestampedId('54321-cycle-sprint-1');
      expect(parsed).toEqual({
        timestamp: 54321,
        prefix: 'cycle',
        slug: 'sprint-1',
      });
    });

    it('[EARS-C2] should return null for invalid formats', () => {
      expect(parseTimestampedId('invalid-id')).toBeNull();
      expect(parseTimestampedId('123-task')).toBeNull();
    });

    it('[EARS-C2] should return null for non-string input', () => {
      expect(parseTimestampedId(null as unknown as string)).toBeNull();
      expect(parseTimestampedId(123 as unknown as string)).toBeNull();
    });
  });

  describe('parseActorId (EARS-D1, EARS-D2)', () => {
    it('[EARS-D1] should parse a valid human ID', () => {
      const parsed = parseActorId('human:camilo-velandia');
      expect(parsed).toEqual({
        type: 'human',
        slug: 'camilo-velandia',
      });
    });

    it('[EARS-D1] should parse a valid agent ID', () => {
      const parsed = parseActorId('agent:code-reviewer');
      expect(parsed).toEqual({
        type: 'agent',
        slug: 'code-reviewer',
      });
    });

    it('[EARS-D1] should parse agent ID with nested colons', () => {
      const parsed = parseActorId('agent:camilo:cursor:planner');
      expect(parsed).toEqual({
        type: 'agent',
        slug: 'camilo:cursor:planner',
      });
    });

    it('[EARS-D2] should return null for invalid actor IDs', () => {
      expect(parseActorId('invalid-id')).toBeNull();
      expect(parseActorId('badtype:name')).toBeNull();
    });

    it('[EARS-D2] should return null for non-string input', () => {
      expect(parseActorId(null as unknown as string)).toBeNull();
      expect(parseActorId(123 as unknown as string)).toBeNull();
    });
  });

  describe('isValidTimestampedId (EARS-E1, EARS-E2)', () => {
    it('[EARS-E1] should return true for valid task ID', () => {
      expect(isValidTimestampedId('12345-task-valid-slug')).toBe(true);
    });

    it('[EARS-E1] should return true for valid cycle ID', () => {
      expect(isValidTimestampedId('54321-cycle-another-slug')).toBe(true);
    });

    it('[EARS-E1] should return true for valid exec ID', () => {
      expect(isValidTimestampedId('67890-exec-execution-slug')).toBe(true);
    });

    it('[EARS-E1] should return true for valid feedback ID', () => {
      expect(isValidTimestampedId('22222-feedback-feedback-slug')).toBe(true);
    });

    it('[EARS-E2] should return false for invalid prefix', () => {
      expect(isValidTimestampedId('123-badprefix-slug')).toBe(false);
    });

    it('[EARS-E2] should return false for non-timestamp start', () => {
      expect(isValidTimestampedId('notatimestamp-task-slug')).toBe(false);
    });

    it('[EARS-E2] should return false for empty slug', () => {
      expect(isValidTimestampedId('12345-task-')).toBe(false);
    });

    it('[EARS-E2] should return false for missing slug', () => {
      expect(isValidTimestampedId('12345-task')).toBe(false);
    });
  });
});
