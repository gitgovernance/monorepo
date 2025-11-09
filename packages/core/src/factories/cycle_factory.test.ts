import { createCycleRecord } from './cycle_factory';
import type { CycleRecord } from '../types';
import { DetailedValidationError } from '../validation/common';

// Manual mock for validateCycleRecordDetailed
jest.mock('../validation/cycle_validator', () => ({
  validateCycleRecordDetailed: jest.fn()
    .mockReturnValue({ isValid: true, errors: [] }),
}));

describe('createCycleRecord', () => {
  beforeEach(() => {
    // Reset mock to default success state before each test
    const { validateCycleRecordDetailed } = require('../validation/cycle_validator');
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
    const { validateCycleRecordDetailed } = require('../validation/cycle_validator');
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
    const { validateCycleRecordDetailed } = require('../validation/cycle_validator');
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
      const { validateCycleRecordDetailed } = require('../validation/cycle_validator');
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
      const { validateCycleRecordDetailed } = require('../validation/cycle_validator');
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
});

