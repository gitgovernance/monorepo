import { createCycleRecord } from './cycle_factory';
import type { CycleRecord } from '../record_types';
import { DetailedValidationError } from '../record_validations/common';

// Manual mock for validateCycleRecordDetailed
jest.mock('../record_validations/cycle_validator', () => ({
  validateCycleRecordDetailed: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
}));

describe('createCycleRecord', () => {
  beforeEach(() => {
    // Reset mock to default success state before each test
    const { validateCycleRecordDetailed } = require('../record_validations/cycle_validator');
    (validateCycleRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-2 & EARS-3] should create a valid cycle record with defaults and a generated ID', async () => {
    const payload: Partial<CycleRecord> = {
      title: 'Sprint Q4 API Performance',
      taskIds: ['1752274500-task-optimizar-endpoint', '1752360900-task-cache-redis'],
      tags: ['roadmap:q4', 'team:backend'],
    };

    const cycle = createCycleRecord(payload);

    expect(cycle.id).toMatch(/^\d{10}-cycle-sprint-q4-api-performance$/); // ID is generated
    expect(cycle.status).toBe('planning'); // Default status
    expect(cycle.title).toBe('Sprint Q4 API Performance');
    expect(cycle.taskIds).toEqual(['1752274500-task-optimizar-endpoint', '1752360900-task-cache-redis']);
    expect(cycle.tags).toEqual(['roadmap:q4', 'team:backend']);
  });

  it('[EARS-1] should throw DetailedValidationError for missing/invalid fields', async () => {
    const { validateCycleRecordDetailed } = require('../record_validations/cycle_validator');
    (validateCycleRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'title', message: 'must be a non-empty string', value: '' },
        { field: 'status', message: 'must be one of: planning, active, completed, archived', value: 'invalid' }
      ]
    });

    const payload: Partial<CycleRecord> = {
      title: '',
      status: 'invalid' as any,
    };

    expect(() => createCycleRecord(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-4] should use a provided ID instead of generating one', async () => {
    const payload: Partial<CycleRecord> = {
      id: '1754400000-cycle-custom-cycle-id',
      title: 'Custom Cycle',
      status: 'active',
      tags: ['custom'],
    };

    const cycle = createCycleRecord(payload);
    expect(cycle.id).toBe('1754400000-cycle-custom-cycle-id');
  });

  it('[EARS-5] should throw DetailedValidationError if the created record fails validation', async () => {
    const { validateCycleRecordDetailed } = require('../record_validations/cycle_validator');
    (validateCycleRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'taskIds', message: 'items must match pattern', value: ['invalid-task-id'] }
      ]
    });

    const payload: Partial<CycleRecord> = {
      title: 'Valid Title',
      status: 'active',
      taskIds: ['invalid-task-id'],
    };

    expect(() => createCycleRecord(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-6] should set default values for optional fields', async () => {
    const payload: Partial<CycleRecord> = {
      title: 'Minimal Cycle',
    };

    const cycle = createCycleRecord(payload);

    expect(cycle.status).toBe('planning');
    expect(cycle.taskIds).toEqual([]); // EARS-21: Default empty array
    expect(cycle.childCycleIds).toBeUndefined();
    expect(cycle.tags).toBeUndefined();
    expect(cycle.notes).toBeUndefined();
  });

  it('[EARS-7] should preserve provided optional fields', async () => {
    const payload: Partial<CycleRecord> = {
      title: 'Complex Cycle',
      status: 'active',
      taskIds: ['1752274500-task-task1', '1752360900-task-task2'],
      childCycleIds: ['1754500000-cycle-child1'],
      tags: ['roadmap:q4', 'team:backend'],
      notes: 'This cycle requires careful coordination between teams'
    };

    const cycle = createCycleRecord(payload);

    expect(cycle.status).toBe('active');
    expect(cycle.taskIds).toEqual(['1752274500-task-task1', '1752360900-task-task2']);
    expect(cycle.childCycleIds).toEqual(['1754500000-cycle-child1']);
    expect(cycle.tags).toEqual(['roadmap:q4', 'team:backend']);
    expect(cycle.notes).toBe('This cycle requires careful coordination between teams');
  });

  it('[EARS-8] should generate ID with current timestamp when title is provided', async () => {
    const beforeTimestamp = Math.floor(Date.now() / 1000);

    const payload: Partial<CycleRecord> = {
      title: 'Test Cycle for ID Generation',
    };

    const cycle = createCycleRecord(payload);
    const afterTimestamp = Math.floor(Date.now() / 1000);

    // Extract timestamp from generated ID
    const idParts = cycle.id.split('-');
    const extractedTimestamp = parseInt(idParts[0] || '0');

    expect(extractedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(extractedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    expect(cycle.id).toMatch(/^\d{10}-cycle-test-cycle-for-id-generation$/);
  });

  describe('CycleRecord Specific Factory Operations (EARS 19-21)', () => {
    it('[EARS-19] should throw DetailedValidationError for invalid status', async () => {
      const { validateCycleRecordDetailed } = require('../record_validations/cycle_validator');
      (validateCycleRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'status', message: 'must be one of planning, active, completed, archived', value: 'invalid-status' }
        ]
      });

      const payload: Partial<CycleRecord> = {
        title: 'Test Cycle',
        status: 'invalid-status' as any
      };

      expect(() => createCycleRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateCycleRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-20] should throw DetailedValidationError for invalid taskIds pattern', async () => {
      const { validateCycleRecordDetailed } = require('../record_validations/cycle_validator');
      (validateCycleRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'taskIds', message: 'items must match task ID pattern', value: ['invalid-task-id', '1752274500-task-valid'] }
        ]
      });

      const payload: Partial<CycleRecord> = {
        title: 'Test Cycle',
        taskIds: ['invalid-task-id', '1752274500-task-valid']
      };

      expect(() => createCycleRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateCycleRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-21] should apply default empty array for taskIds when not provided', async () => {
      const payload: Partial<CycleRecord> = {
        title: 'Cycle Without Tasks'
        // taskIds not provided - should default to []
      };

      const cycle = createCycleRecord(payload);

      expect(cycle.taskIds).toEqual([]); // Default empty array
    });

    it('[EARS-19] should accept valid status values', async () => {
      const validStatuses = ['planning', 'active', 'completed', 'archived'];

      for (const status of validStatuses) {
        const payload: Partial<CycleRecord> = {
          title: `Test Cycle ${status}`,
          status: status as any
        };

        const cycle = createCycleRecord(payload);
        expect(cycle.status).toBe(status);
      }
    });

    it('[EARS-20] should accept valid taskIds with correct pattern', async () => {
      const validTaskIds = [
        '1752274500-task-implement-feature',
        '1752360900-task-write-tests',
        '1752400000-task-deploy-service'
      ];

      const payload: Partial<CycleRecord> = {
        title: 'Cycle With Valid Tasks',
        taskIds: validTaskIds
      };

      const cycle = createCycleRecord(payload);
      expect(cycle.taskIds).toEqual(validTaskIds);
    });
  });

  describe('CycleRecord Metadata Factory Operations (EARS 75-78)', () => {
    it('[EARS-75] should preserve metadata field when provided', () => {
      const payload: Partial<CycleRecord> = {
        title: 'Epic Cycle with Metadata',
        metadata: {
          epic: true,
          phase: 'active',
          files: {
            overview: 'overview.md',
            roadmap: 'roadmap.md',
            plan: 'implementation_plan.md'
          }
        }
      };

      const cycle = createCycleRecord(payload);

      expect(cycle.metadata).toEqual({
        epic: true,
        phase: 'active',
        files: {
          overview: 'overview.md',
          roadmap: 'roadmap.md',
          plan: 'implementation_plan.md'
        }
      });
    });

    it('[EARS-76] should preserve complex metadata with nested structures', () => {
      const payload: Partial<CycleRecord> = {
        title: 'Sprint Cycle with Complex Metadata',
        metadata: {
          sprint: 24,
          velocity: 42,
          team: 'backend',
          okr: {
            objective: 'Improve API performance',
            keyResults: [
              { id: 'KR-1', target: 200, current: 150 }
            ]
          }
        }
      };

      const cycle = createCycleRecord(payload);

      expect(cycle.metadata).toEqual({
        sprint: 24,
        velocity: 42,
        team: 'backend',
        okr: {
          objective: 'Improve API performance',
          keyResults: [
            { id: 'KR-1', target: 200, current: 150 }
          ]
        }
      });
    });

    it('[EARS-77] should accept CycleRecord without metadata', () => {
      const payload: Partial<CycleRecord> = {
        title: 'Cycle without Metadata'
      };

      const cycle = createCycleRecord(payload);

      expect(cycle.metadata).toBeUndefined();
    });

    it('[EARS-78] should accept empty metadata object', () => {
      const payload: Partial<CycleRecord> = {
        title: 'Cycle with Empty Metadata',
        metadata: {}
      };

      const cycle = createCycleRecord(payload);

      expect(cycle.metadata).toEqual({});
    });
  });

  describe('CycleRecord Typed Metadata Helpers (EARS 79-83)', () => {
    it('[EARS-79] should allow CycleRecord with typed epic metadata', () => {
      type EpicMeta = {
        epic: boolean;
        phase: string;
        files: Record<string, string>;
      };

      const meta: EpicMeta = {
        epic: true,
        phase: 'active',
        files: { overview: 'overview.md', roadmap: 'roadmap.md' }
      };

      const result = createCycleRecord<EpicMeta>({
        title: 'Epic: Auth System',
        metadata: meta
      });

      expect(result.metadata).toEqual(meta);
      expect(result.metadata?.epic).toBe(true);
      expect(result.metadata?.phase).toBe('active');
    });

    it('[EARS-80] should allow Partial<CycleRecord<T>> for factory input', () => {
      type SprintMeta = {
        sprint: number;
        velocity?: number;
      };

      const payload: Partial<CycleRecord<SprintMeta>> = {
        title: 'Sprint 24',
        metadata: { sprint: 24, velocity: 42 }
      };

      const result = createCycleRecord(payload);

      expect(result.metadata?.sprint).toBe(24);
      expect(result.metadata?.velocity).toBe(42);
    });

    it('[EARS-81] should allow custom metadata types defined by consumers', () => {
      type BudgetMeta = {
        budget: number;
        currency: string;
        allocated: boolean;
      };

      const budgetMeta: BudgetMeta = {
        budget: 50000,
        currency: 'USD',
        allocated: true
      };

      const result = createCycleRecord<BudgetMeta>({
        title: 'Q4 Budget Cycle',
        metadata: budgetMeta
      });

      expect(result.metadata).toEqual(budgetMeta);
      expect(result.metadata?.budget).toBe(50000);
      expect(result.metadata?.currency).toBe('USD');
    });

    it('[EARS-82] should allow CycleRecord<T> without metadata (optional)', () => {
      type SomeMeta = { field: string; };

      const result = createCycleRecord<SomeMeta>({
        title: 'Cycle Without Typed Metadata'
      });

      expect(result.metadata).toBeUndefined();
    });

    it('[EARS-83] should preserve generic type in factory return', () => {
      type EpicCycleMeta = { epic: boolean; phase: string; };

      const result = createCycleRecord<EpicCycleMeta>({
        title: 'Typed Factory Return',
        metadata: { epic: true, phase: 'active' }
      });

      // Compile-time: result is CycleRecord<EpicCycleMeta>, not CycleRecord<object>
      const epic: boolean = result.metadata!.epic;
      const phase: string = result.metadata!.phase;
      expect(epic).toBe(true);
      expect(phase).toBe('active');
    });
  });
});

