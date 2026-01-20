import {
  generateActorId,
  generateTaskId,
  generateCycleId,
  generateExecutionId,
  generateChangelogId,
  generateFeedbackId
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
});
