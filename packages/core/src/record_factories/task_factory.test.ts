import { createTaskRecord } from './task_factory';
import type { TaskRecord } from '../record_types';
import { DetailedValidationError } from '../record_validations/common';

// Manual mock for validateTaskRecordDetailed
jest.mock('../record_validations/task_validator', () => ({
  validateTaskRecordDetailed: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
}));

describe('createTaskRecord', () => {
  beforeEach(() => {
    // Reset mock to default success state before each test
    const { validateTaskRecordDetailed } = require('../record_validations/task_validator');
    (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-2 & EARS-3] should create a valid task record with defaults and a generated ID', async () => {
    const payload: Partial<TaskRecord> = {
      title: 'Implement user authentication',
      description: 'Create a complete user authentication system with JWT tokens',
      priority: 'high',
      tags: ['skill:typescript', 'area:backend'],
    };

    const task = createTaskRecord(payload);

    expect(task.id).toMatch(/^\d{10}-task-implement-user-authentication$/); // ID is generated
    expect(task.status).toBe('draft'); // Default status
    expect(task.priority).toBe('high');
    expect(task.title).toBe('Implement user authentication');
    expect(task.description).toBe('Create a complete user authentication system with JWT tokens');
    expect(task.tags).toEqual(['skill:typescript', 'area:backend']);
  });

  it('[EARS-1] should throw DetailedValidationError for missing/invalid fields', async () => {
    const { validateTaskRecordDetailed } = require('../record_validations/task_validator');
    (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'title', message: 'must be a non-empty string', value: '' },
        { field: 'description', message: 'must be at least 10 characters', value: 'short' }
      ]
    });

    const payload: Partial<TaskRecord> = {
      title: '',
      description: 'short',
    };

    expect(() => createTaskRecord(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-4] should use a provided ID instead of generating one', async () => {
    const payload: Partial<TaskRecord> = {
      id: '1752274500-task-custom-task-id',
      title: 'Custom Task',
      description: 'A task with a custom ID',
      priority: 'medium',
      tags: ['custom'],
    };

    const task = createTaskRecord(payload);
    expect(task.id).toBe('1752274500-task-custom-task-id');
  });

  it('[EARS-5] should throw DetailedValidationError if the created record fails validation', async () => {
    const { validateTaskRecordDetailed } = require('../record_validations/task_validator');
    (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'status', message: 'must be one of: draft, review, ready, active, done, archived, paused, discarded', value: 'invalid-status' }
      ]
    });

    const payload: Partial<TaskRecord> = {
      title: 'Valid Title',
      description: 'Valid description that is long enough',
      status: 'invalid-status' as any,
    };

    expect(() => createTaskRecord(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-6] should set default values for optional fields', async () => {
    const payload: Partial<TaskRecord> = {
      title: 'Minimal Task',
      description: 'A task with minimal required fields',
    };

    const task = createTaskRecord(payload);

    expect(task.status).toBe('draft');
    expect(task.priority).toBe('medium');
    expect(task.tags).toEqual([]);
    expect(task.cycleIds).toBeUndefined();
    expect(task.references).toBeUndefined();
    expect(task.notes).toBeUndefined();
  });

  it('[EARS-7] should preserve provided optional fields', async () => {
    const payload: Partial<TaskRecord> = {
      title: 'Complex Task',
      description: 'A task with all optional fields provided',
      cycleIds: ['1752274500-cycle-sprint-1'],
      references: ['file:packages/core/src/auth.ts', 'url:https://jwt.io'],
      notes: 'This task requires careful attention to security',
    };

    const task = createTaskRecord(payload);

    expect(task.cycleIds).toEqual(['1752274500-cycle-sprint-1']);
    expect(task.references).toEqual(['file:packages/core/src/auth.ts', 'url:https://jwt.io']);
    expect(task.notes).toBe('This task requires careful attention to security');
  });

  it('[EARS-8] should generate ID with current timestamp when title is provided', async () => {
    const beforeTimestamp = Math.floor(Date.now() / 1000);

    const payload: Partial<TaskRecord> = {
      title: 'Test Task for ID Generation',
      description: 'Testing timestamp-based ID generation',
    };

    const task = createTaskRecord(payload);
    const afterTimestamp = Math.floor(Date.now() / 1000);

    // Extract timestamp from generated ID
    const idParts = task.id.split('-');
    const extractedTimestamp = parseInt(idParts[0] || '0');

    expect(extractedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(extractedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(task.id).toMatch(/^\d{10}-task-test-task-for-id-generation$/);
  });

  describe('TaskRecord Specific Factory Operations (EARS 15-18)', () => {
    it('[EARS-15] should throw DetailedValidationError for invalid status', async () => {
      const { validateTaskRecordDetailed } = require('../record_validations/task_validator');
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'status', message: 'must be one of draft, review, ready, active, done, archived', value: 'invalid-status' }
        ]
      });

      const payload: Partial<TaskRecord> = {
        title: 'Test Task',
        description: 'Test description for validation',
        status: 'invalid-status' as any
      };

      expect(() => createTaskRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-16] should throw DetailedValidationError for invalid priority', async () => {
      const { validateTaskRecordDetailed } = require('../record_validations/task_validator');
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'priority', message: 'must be one of low, medium, high, urgent', value: 'invalid-priority' }
        ]
      });

      const payload: Partial<TaskRecord> = {
        title: 'Test Task',
        description: 'Test description for validation',
        priority: 'invalid-priority' as any
      };

      expect(() => createTaskRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-17] should apply default empty array for tags when not provided', async () => {
      const payload: Partial<TaskRecord> = {
        title: 'Task Without Tags',
        description: 'Testing default tags behavior'
        // tags not provided - should default to []
      };

      const task = createTaskRecord(payload);

      expect(task.tags).toEqual([]); // Default empty array
    });

    it('[EARS-18] should throw DetailedValidationError for title shorter than 3 characters', async () => {
      const { validateTaskRecordDetailed } = require('../record_validations/task_validator');
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'title', message: 'must be at least 3 characters', value: 'hi' }
        ]
      });

      const payload: Partial<TaskRecord> = {
        title: 'hi', // Too short
        description: 'Test description for validation'
      };

      expect(() => createTaskRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateTaskRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-15] should accept valid status values', async () => {
      const validStatuses = ['draft', 'review', 'ready', 'active', 'done', 'archived'];

      for (const status of validStatuses) {
        const payload: Partial<TaskRecord> = {
          title: `Test Task ${status}`,
          description: 'Test description for status validation',
          status: status as any
        };

        const task = createTaskRecord(payload);
        expect(task.status).toBe(status);
      }
    });

    it('[EARS-16] should accept valid priority values', async () => {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];

      for (const priority of validPriorities) {
        const payload: Partial<TaskRecord> = {
          title: `Test Task ${priority}`,
          description: 'Test description for priority validation',
          priority: priority as any
        };

        const task = createTaskRecord(payload);
        expect(task.priority).toBe(priority);
      }
    });
  });

  describe('TaskRecord Metadata Factory Operations (EARS 66-69)', () => {
    it('[EARS-66] should preserve metadata field when provided', () => {
      const payload: Partial<TaskRecord> = {
        title: 'Task with Metadata',
        description: 'Testing metadata preservation in task factory',
        metadata: {
          jira: 'AUTH-42',
          storyPoints: 5
        }
      };

      const task = createTaskRecord(payload);

      expect(task.metadata).toEqual({
        jira: 'AUTH-42',
        storyPoints: 5
      });
    });

    it('[EARS-67] should preserve complex metadata with nested structures', () => {
      const payload: Partial<TaskRecord> = {
        title: 'Task with Complex Metadata',
        description: 'Testing nested metadata structures',
        metadata: {
          epic: true,
          phase: 'implementation',
          files: {
            overview: 'overview.md',
            roadmap: 'roadmap.md'
          },
          estimates: [{ skill: 'backend', hours: 8 }]
        }
      };

      const task = createTaskRecord(payload);

      expect(task.metadata).toEqual({
        epic: true,
        phase: 'implementation',
        files: {
          overview: 'overview.md',
          roadmap: 'roadmap.md'
        },
        estimates: [{ skill: 'backend', hours: 8 }]
      });
    });

    it('[EARS-68] should accept TaskRecord without metadata', () => {
      const payload: Partial<TaskRecord> = {
        title: 'Task without Metadata',
        description: 'Testing task creation without metadata field'
      };

      const task = createTaskRecord(payload);

      expect(task.metadata).toBeUndefined();
    });

    it('[EARS-69] should accept empty metadata object', () => {
      const payload: Partial<TaskRecord> = {
        title: 'Task with Empty Metadata',
        description: 'Testing task with empty metadata object',
        metadata: {}
      };

      const task = createTaskRecord(payload);

      expect(task.metadata).toEqual({});
    });
  });

  describe('TaskRecord Typed Metadata Helpers (EARS 70-74)', () => {
    it('[EARS-70] should allow TaskRecord with typed project metadata', () => {
      type ProjectMeta = {
        jira: string;
        storyPoints: number;
        sprint: string;
      };

      const meta: ProjectMeta = {
        jira: 'AUTH-42',
        storyPoints: 5,
        sprint: 'Sprint 24'
      };

      const result = createTaskRecord<ProjectMeta>({
        title: 'Implement OAuth',
        description: 'Full OAuth2 implementation for project tracking',
        metadata: meta
      });

      expect(result.metadata).toEqual(meta);
      expect(result.metadata?.jira).toBe('AUTH-42');
      expect(result.metadata?.storyPoints).toBe(5);
    });

    it('[EARS-71] should allow Partial<TaskRecord<T>> for factory input', () => {
      type ComplianceMeta = {
        regulation: string;
        deadline?: string;
      };

      const payload: Partial<TaskRecord<ComplianceMeta>> = {
        title: 'GDPR Compliance Task',
        description: 'Ensure GDPR compliance across all user data endpoints',
        metadata: { regulation: 'GDPR', deadline: '2025-12-31' }
      };

      const result = createTaskRecord(payload);

      expect(result.metadata?.regulation).toBe('GDPR');
      expect(result.metadata?.deadline).toBe('2025-12-31');
    });

    it('[EARS-72] should allow custom metadata types defined by consumers', () => {
      type AgentMeta = {
        assignedAgent: string;
        estimatedTokens: number;
        toolsRequired: string[];
      };

      const agentMeta: AgentMeta = {
        assignedAgent: 'agent:code-reviewer',
        estimatedTokens: 50000,
        toolsRequired: ['grep', 'read', 'edit']
      };

      const result = createTaskRecord<AgentMeta>({
        title: 'Code Review Task',
        description: 'Automated code review with agent metadata tracking',
        metadata: agentMeta
      });

      expect(result.metadata).toEqual(agentMeta);
      expect(result.metadata?.assignedAgent).toBe('agent:code-reviewer');
      expect(result.metadata?.toolsRequired).toHaveLength(3);
    });

    it('[EARS-73] should allow TaskRecord<T> without metadata (optional)', () => {
      type SomeMeta = { field: string; };

      const result = createTaskRecord<SomeMeta>({
        title: 'Task Without Typed Metadata',
        description: 'TaskRecord with generic type but no metadata provided'
      });

      expect(result.metadata).toBeUndefined();
    });

    it('[EARS-74] should preserve generic type in factory return', () => {
      type EpicMeta = { jira: string; storyPoints: number; };

      const result = createTaskRecord<EpicMeta>({
        title: 'Typed Factory Return',
        description: 'Verifies createTaskRecord<T> returns TaskRecord<T>',
        metadata: { jira: 'PROJ-99', storyPoints: 8 }
      });

      // Compile-time: result is TaskRecord<EpicMeta>, not TaskRecord<object>
      const jira: string = result.metadata!.jira;
      const points: number = result.metadata!.storyPoints;
      expect(jira).toBe('PROJ-99');
      expect(points).toBe(8);
    });
  });
});
