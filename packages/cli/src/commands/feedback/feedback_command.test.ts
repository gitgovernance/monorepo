/**
 * Feedback Command tests — Block F (ICOMP-F1 to ICOMP-F3)
 * Blueprint: feedback_command.md §4.1
 *
 * Only the create action is tested in this epic.
 */

// Mock @gitgov/core FIRST to avoid import.meta issues
vi.mock('@gitgov/core', () => ({
  Records: {},
  Factories: {
    createFeedbackRecord: vi.fn((data) => data),
    createTestSignature: vi.fn((keyId, role, notes) => ({
      keyId, role, notes, timestamp: Date.now(), signature: 'A'.repeat(86) + '=='
    })),
  }
}));

// Mock DependencyInjectionService
vi.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: vi.fn()
  }
}));

import { FeedbackCommand } from './feedback_command';
import { DependencyInjectionService } from '../../services/dependency-injection';

const mockFeedback = {
  id: '1752642000-feedback-suggestion-refactor',
  entityType: 'task',
  entityId: '1752274500-task-auth',
  type: 'suggestion',
  status: 'open',
  content: 'Consider refactoring the auth module',
};

// Mock console and process.exit at module level (task-command pattern)
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation();
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation();
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation();

describe('FeedbackCommand', () => {
  let feedbackCommand: FeedbackCommand;
  let mockFeedbackAdapter: {
    create: Mock<any>;
  };
  let mockIdentityAdapter: {
    getCurrentActor: Mock<any>;
  };
  let mockProjector: {
    invalidateCache: Mock<any>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockFeedbackAdapter = {
      create: vi.fn().mockResolvedValue(mockFeedback),
    };

    mockIdentityAdapter = {
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'human:dev', displayName: 'Dev', type: 'human' }),
    };

    mockProjector = {
      invalidateCache: vi.fn().mockResolvedValue(undefined),
    };

    const mockDependencyService = {
      getFeedbackAdapter: vi.fn().mockResolvedValue(mockFeedbackAdapter),
      getIdentityAdapter: vi.fn().mockResolvedValue(mockIdentityAdapter),
      getRecordProjector: vi.fn().mockResolvedValue(mockProjector),
      getCurrentActor: vi.fn().mockResolvedValue({ id: 'human:dev', displayName: 'Dev', type: 'human' }),
      getProjectRoot: vi.fn().mockResolvedValue('/mock/project/root'),
    };

    // Set up mock BEFORE constructing command (critical — BaseCommand reads DI in constructor)
    (DependencyInjectionService.getInstance as Mock<typeof DependencyInjectionService.getInstance>)
      .mockReturnValue(mockDependencyService as never);

    feedbackCommand = new FeedbackCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('4.1. Create — Default Action (ICOMP-F1 to ICOMP-F3)', () => {

    it('[ICOMP-F1] should abort when required fields are missing', async () => {
      // Missing entityType, type, and content
      await feedbackCommand.executeCreate({
        entityId: 'task-1',
      } as any);

      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Missing required')
      );
    });

    it('[ICOMP-F2] should create FeedbackRecord via adapter', async () => {
      await feedbackCommand.executeCreate({
        entityType: 'task',
        entityId: '1752274500-task-auth',
        type: 'suggestion',
        content: 'Consider refactoring the auth module',
      } as any);

      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'task',
          entityId: '1752274500-task-auth',
          type: 'suggestion',
          content: 'Consider refactoring the auth module',
        }),
        'human:dev',
      );

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Feedback created')
      );
    });

    it('[ICOMP-F3] should output JSON when --json is provided', async () => {
      await feedbackCommand.executeCreate({
        entityType: 'task',
        entityId: '1752274500-task-auth',
        type: 'suggestion',
        content: 'Consider refactoring',
        json: true,
      } as any);

      const output = JSON.parse(mockConsoleLog.mock.calls[0]![0]);
      expect(output.success).toBe(true);
      expect(output.data.id).toBe('1752642000-feedback-suggestion-refactor');
      expect(output.data.entityType).toBe('task');
      expect(output.data.entityId).toBe('1752274500-task-auth');
      expect(output.data.type).toBe('suggestion');
      expect(output.data.status).toBe('open');
    });
  });
});
