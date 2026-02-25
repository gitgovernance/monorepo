import {
  generateActorId,
  generateTaskId,
  generateCycleId,
  generateExecutionId,
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

  describe('generateFeedbackId', () => {
    it('[EARS-6] should create a valid feedback ID', () => {
      expect(generateFeedbackId('Code Review Comments', 77777)).toBe('77777-feedback-code-review-comments');
    });
  });
});
