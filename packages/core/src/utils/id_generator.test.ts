import {
  generateActorId,
  generateTaskId,
  generateCycleId,
  generateExecutionId,
  generateChangelogId,
  generateFeedbackId,
  parseTimestampedId,
  parseActorId,
  isValidTimestampedId
} from './id_generator';

describe('ID Generators', () => {
  describe('generateActorId', () => {
    it('[EARS-1] should create a valid human ID', () => {
      expect(generateActorId('human', 'Camilo Velandia')).toBe('human:camilo-velandia');
    });

    it('[EARS-1] should create a valid agent ID', () => {
      expect(generateActorId('agent', 'Cursor Assistant')).toBe('agent:cursor-assistant');
    });
  });

  describe('generateTaskId', () => {
    it('[EARS-2] should create a valid task ID', () => {
      expect(generateTaskId('Implement Auth Flow', 12345)).toBe('12345-task-implement-auth-flow');
    });
  });

  describe('generateCycleId', () => {
    it('[EARS-3] should create a valid cycle ID', () => {
      expect(generateCycleId('Q4 Sprint 1', 54321)).toBe('54321-cycle-q4-sprint-1');
    });
  });

  describe('generateExecutionId', () => {
    it('[EARS-4] should create a valid execution ID', () => {
      expect(generateExecutionId('Commit changes', 99999)).toBe('99999-exec-commit-changes');
    });
  });

  describe('generateChangelogId', () => {
    it('[EARS-5] should create a valid changelog ID from title (Protocol v2.0.0)', () => {
      expect(generateChangelogId('Authentication System v1.0', 1752707800))
        .toBe('1752707800-changelog-authentication-system-v10');
    });

    it('[EARS-5] should create changelog ID following official pattern', () => {
      expect(generateChangelogId('Sprint 24 API Performance', 1752707900))
        .toBe('1752707900-changelog-sprint-24-api-performance');
    });

    it('[EARS-5] should sanitize special characters in changelog ID', () => {
      expect(generateChangelogId('Hotfix: Critical Payment Timeout!', 1752708000))
        .toBe('1752708000-changelog-hotfix-critical-payment-timeout');
    });

    it('[EARS-5] should limit slug length to 50 characters', () => {
      const longTitle = 'This is an extremely long changelog title that should be truncated to fit within the maximum allowed length';
      const result = generateChangelogId(longTitle, 88888);
      const slug = result.split('-changelog-')[1];
      expect(slug!.length).toBeLessThanOrEqual(50);
    });

    it('[EARS-5] should match official schema pattern', () => {
      const result = generateChangelogId('Test Deliverable', 1752707800);
      // Pattern from schema: "^\d{10}-changelog-[a-z0-9-]{1,50}$"
      expect(result).toMatch(/^\d{10}-changelog-[a-z0-9-]{1,50}$/);
    });
  });

  describe('generateFeedbackId', () => {
    it('[EARS-6] should create a valid feedback ID', () => {
      expect(generateFeedbackId('Code Review Comments', 77777)).toBe('77777-feedback-code-review-comments');
    });
  });

  describe('parseTimestampedId', () => {
    it('[EARS-7] should parse a valid task ID', () => {
      const parsed = parseTimestampedId('12345-task-implement-auth');
      expect(parsed).toEqual({
        timestamp: 12345,
        prefix: 'task',
        slug: 'implement-auth',
      });
    });

    it('[EARS-7] should return null for invalid formats', () => {
      expect(parseTimestampedId('invalid-id')).toBeNull();
      expect(parseTimestampedId('123-task')).toBeNull();
    });
  });

  describe('parseActorId', () => {
    it('[EARS-8] should parse a valid human ID', () => {
      const parsed = parseActorId('human:camilo-velandia');
      expect(parsed).toEqual({
        type: 'human',
        slug: 'camilo-velandia',
      });
    });

    it('[EARS-8] should parse a valid agent ID with scope', () => {
      const parsed = parseActorId('agent:camilo:cursor:planner');
      expect(parsed).toEqual({
        type: 'agent',
        slug: 'camilo:cursor:planner',
      });
    });

    it('[EARS-8] should return null for invalid actor IDs', () => {
      expect(parseActorId('invalid-id')).toBeNull();
      expect(parseActorId('badtype:name')).toBeNull();
    });
  });

  describe('isValidTimestampedId', () => {
    it('[EARS-9] should return true for valid IDs', () => {
      expect(isValidTimestampedId('12345-task-valid-slug')).toBe(true);
      expect(isValidTimestampedId('54321-cycle-another-slug')).toBe(true);
      expect(isValidTimestampedId('67890-exec-execution-slug')).toBe(true);
      expect(isValidTimestampedId('11111-changelog-changelog-slug')).toBe(true);
      expect(isValidTimestampedId('22222-feedback-feedback-slug')).toBe(true);
    });

    it('[EARS-10] should return false for invalid IDs', () => {
      expect(isValidTimestampedId('123-badprefix-slug')).toBe(false);
      expect(isValidTimestampedId('notatimestamp-task-slug')).toBe(false);
      expect(isValidTimestampedId('12345-task-')).toBe(false);
      expect(isValidTimestampedId('12345-task')).toBe(false);
    });
  });
});
