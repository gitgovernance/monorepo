import { validateTaskRecordDetailed } from '../../record_validations/task_validator';
import type { TaskRecord } from '../../record_types';

describe('TaskRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid TaskRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   */
  const createValidTaskRecord = (): TaskRecord => ({
    id: '1234567890-task-test',
    title: 'Test Task',
    status: 'draft',
    priority: 'medium',
    description: 'This is a valid test description with more than 10 characters.'
  });

  describe('Root Level & Required Fields (EARS 186-191)', () => {
    it('[EARS-186] should reject additional properties at root level', () => {
      const invalid = {
        ...createValidTaskRecord(),
        customField: 'not-allowed-because-additionalProperties-false'
      } as TaskRecord & { customField: string };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('should NOT have additional properties')
      )).toBe(true);
    });

    it('[EARS-187] should reject missing required field: id', () => {
      const invalid = createValidTaskRecord();
      delete (invalid as Partial<TaskRecord>).id;

      const result = validateTaskRecordDetailed(invalid as TaskRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('id') || e.field === 'id'
      )).toBe(true);
    });

    it('[EARS-188] should reject missing required field: title', () => {
      const invalid = createValidTaskRecord();
      delete (invalid as Partial<TaskRecord>).title;

      const result = validateTaskRecordDetailed(invalid as TaskRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('title') || e.field === 'title'
      )).toBe(true);
    });

    it('[EARS-189] should reject missing required field: status', () => {
      const invalid = createValidTaskRecord();
      delete (invalid as Partial<TaskRecord>).status;

      const result = validateTaskRecordDetailed(invalid as TaskRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('status') || e.field === 'status'
      )).toBe(true);
    });

    it('[EARS-190] should reject missing required field: priority', () => {
      const invalid = createValidTaskRecord();
      delete (invalid as Partial<TaskRecord>).priority;

      const result = validateTaskRecordDetailed(invalid as TaskRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('priority') || e.field === 'priority'
      )).toBe(true);
    });

    it('[EARS-191] should reject missing required field: description', () => {
      const invalid = createValidTaskRecord();
      delete (invalid as Partial<TaskRecord>).description;

      const result = validateTaskRecordDetailed(invalid as TaskRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('description') || e.field === 'description'
      )).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 192-196)', () => {
    it('[EARS-192] should reject invalid id pattern', () => {
      const invalid = {
        ...createValidTaskRecord(),
        id: 'invalid-id-format'
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-193] should accept valid id pattern', () => {
      const valid = {
        ...createValidTaskRecord(),
        id: '1752274500-task-implement-oauth'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-194] should reject id exceeding maxLength 66', () => {
      const invalid = {
        ...createValidTaskRecord(),
        id: '1234567890-task-' + 'a'.repeat(60) // exceeds 70 total
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-195] should accept id with maxLength 66', () => {
      const valid = {
        ...createValidTaskRecord(),
        id: '1234567890-task-' + 'a'.repeat(50) // 16 + 50 = 66 chars (pattern limits slug to 50)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-196] should reject id with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        id: 123 as unknown as string
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Title Field Validations (EARS 197-200)', () => {
    it('[EARS-197] should reject title below minLength 3', () => {
      const invalid = {
        ...createValidTaskRecord(),
        title: 'AB' // only 2 characters
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-198] should accept title with minLength 3 or more', () => {
      const valid = {
        ...createValidTaskRecord(),
        title: 'ABC'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-199] should reject title exceeding maxLength 150', () => {
      const invalid = {
        ...createValidTaskRecord(),
        title: 'a'.repeat(151)
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-200] should reject title with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        title: 123 as unknown as string
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Status Field Validations (EARS 201-210)', () => {
    it('[EARS-201] should accept status "draft"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'draft' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-202] should accept status "review"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'review' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-203] should accept status "ready"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'ready' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-204] should accept status "active"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'active' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-205] should accept status "done"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'done' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-206] should accept status "archived"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'archived' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-207] should accept status "paused"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'paused' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-208] should accept status "discarded"', () => {
      const valid = {
        ...createValidTaskRecord(),
        status: 'discarded' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-209] should reject invalid status enum value', () => {
      const invalid = {
        ...createValidTaskRecord(),
        status: 'pending' as unknown as 'draft'
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-210] should reject status with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        status: 123 as unknown as 'draft'
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Priority Field Validations (EARS 211-216)', () => {
    it('[EARS-211] should accept priority "low"', () => {
      const valid = {
        ...createValidTaskRecord(),
        priority: 'low' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-212] should accept priority "medium"', () => {
      const valid = {
        ...createValidTaskRecord(),
        priority: 'medium' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-213] should accept priority "high"', () => {
      const valid = {
        ...createValidTaskRecord(),
        priority: 'high' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-214] should accept priority "critical"', () => {
      const valid = {
        ...createValidTaskRecord(),
        priority: 'critical' as const
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-215] should reject invalid priority enum value', () => {
      const invalid = {
        ...createValidTaskRecord(),
        priority: 'urgent' as unknown as 'low'
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('priority') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-216] should reject priority with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        priority: 123 as unknown as 'low'
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('priority') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Description Field Validations (EARS 217-220)', () => {
    it('[EARS-217] should reject description below minLength 10', () => {
      const invalid = {
        ...createValidTaskRecord(),
        description: 'Too short'
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-218] should accept description with minLength 10 or more', () => {
      const valid = {
        ...createValidTaskRecord(),
        description: 'This has exactly 10 chars but we need at least 10'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-219] should accept description with no upper length limit', () => {
      const valid = {
        ...createValidTaskRecord(),
        description: 'a'.repeat(50000)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-220] should reject description with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        description: 123 as unknown as string
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('CycleIds Array Validations (EARS 221-227)', () => {
    it('[EARS-221] should accept absence of cycleIds field (optional)', () => {
      const valid = createValidTaskRecord();

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-222] should accept empty cycleIds array', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: []
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-223] should accept valid cycleIds item pattern', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: ['1234567890-cycle-q1-2024']
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-224] should reject invalid cycleIds item pattern', () => {
      const invalid = {
        ...createValidTaskRecord(),
        cycleIds: ['invalid-cycle']
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('cycleIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-225] should accept multiple valid cycleIds items', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: [
          '1234567890-cycle-q1-2024',
          '1234567891-cycle-q2-2024'
        ]
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-226] should reject cycleIds with non-array type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        cycleIds: 'not-an-array' as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('cycleIds') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-227] should reject cycleIds item with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        cycleIds: [123] as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('cycleIds') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Tags Array Validations (EARS 228-234)', () => {
    it('[EARS-228] should accept absence of tags field (optional)', () => {
      const valid = createValidTaskRecord();

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-229] should accept empty tags array', () => {
      const valid = {
        ...createValidTaskRecord(),
        tags: []
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-230] should accept valid tags item pattern', () => {
      const valid = {
        ...createValidTaskRecord(),
        tags: ['skill:react', 'category:feature', 'role:agent:developer']
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-231] should reject invalid tags item pattern', () => {
      const invalid = {
        ...createValidTaskRecord(),
        tags: ['Invalid_Tag']
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-232] should accept multiple valid tags items', () => {
      const valid = {
        ...createValidTaskRecord(),
        tags: [
          'skill:react',
          'skill:typescript',
          'category:frontend'
        ]
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-233] should reject tags with non-array type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        tags: 'not-an-array' as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-234] should reject tags item with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        tags: [123] as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('References Array Validations (EARS 235-240)', () => {
    it('[EARS-235] should accept absence of references field (optional)', () => {
      const valid = createValidTaskRecord();

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-236] should accept empty references array', () => {
      const valid = {
        ...createValidTaskRecord(),
        references: []
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-237] should accept valid strings in references', () => {
      const valid = {
        ...createValidTaskRecord(),
        references: [
          'https://example.com/docs',
          'packages/core/README.md'
        ]
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-238] should reject references item exceeding maxLength 500', () => {
      const invalid = {
        ...createValidTaskRecord(),
        references: ['https://example.com/' + 'a'.repeat(500)]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-239] should reject references with non-array type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        references: 'not-an-array' as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-240] should reject references item with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        references: [123] as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Notes Field Validations (EARS 241-244)', () => {
    it('[EARS-241] should accept absence of notes field (optional)', () => {
      const valid = createValidTaskRecord();

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-242] should reject empty notes string (minLength 1)', () => {
      const invalid = {
        ...createValidTaskRecord(),
        notes: ''
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-243] should accept notes with no upper length limit', () => {
      const valid = {
        ...createValidTaskRecord(),
        notes: 'a'.repeat(50000)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-244] should reject notes with non-string type', () => {
      const invalid = {
        ...createValidTaskRecord(),
        notes: 123 as unknown as string
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Edge Cases: Boundary Testing for Title (EARS 245-246)', () => {
    it('[EARS-245] should accept title with exactly 3 characters', () => {
      const valid = {
        ...createValidTaskRecord(),
        title: 'ABC'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-246] should accept title with exactly 150 characters', () => {
      const valid = {
        ...createValidTaskRecord(),
        title: 'a'.repeat(150)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases: Boundary Testing for Description (EARS 247-248)', () => {
    it('[EARS-247] should accept description with exactly 10 characters', () => {
      const valid = {
        ...createValidTaskRecord(),
        description: 'a'.repeat(10)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-248] should accept description with large content (no upper limit)', () => {
      const valid = {
        ...createValidTaskRecord(),
        description: 'a'.repeat(100000)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases: Boundary Testing for ID (EARS 249-250)', () => {
    it('[EARS-249] should accept id with minimum slug length (1 char)', () => {
      const valid = {
        ...createValidTaskRecord(),
        id: '1234567890-task-a'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-250] should accept id with maximum slug length (50 chars)', () => {
      const valid = {
        ...createValidTaskRecord(),
        id: '1234567890-task-' + 'a'.repeat(50)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases: Boundary Testing for References Item (EARS 251-252)', () => {
    it('[EARS-251] should accept reference item with exactly 500 chars', () => {
      const valid = {
        ...createValidTaskRecord(),
        references: ['a'.repeat(500)]
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-252] should accept reference item with 1 character', () => {
      const valid = {
        ...createValidTaskRecord(),
        references: ['a']
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases: Boundary Testing for Notes (EARS 253)', () => {
    it('[EARS-253] should accept notes with large content (no upper limit)', () => {
      const valid = {
        ...createValidTaskRecord(),
        notes: 'a'.repeat(50000)
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Happy Path: Complete Valid Records (EARS 254-257)', () => {
    it('[EARS-254] should accept minimal valid TaskRecord', () => {
      const valid = createValidTaskRecord();

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-255] should accept full valid TaskRecord with all optional', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: ['1234567890-cycle-q1-2024'],
        tags: ['skill:react', 'category:feature'],
        references: ['https://example.com/docs'],
        notes: 'Some additional notes here'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-256] should accept TaskRecord with empty optional arrays', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: [],
        tags: [],
        references: []
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-257] should accept TaskRecord with partial optional fields', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: ['1234567890-cycle-q1-2024'],
        tags: ['skill:react']
        // references and notes are omitted
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Null Values for Optional Fields (EARS 258-261)', () => {
    it('[EARS-258] should reject cycleIds with null value', () => {
      const invalid = {
        ...createValidTaskRecord(),
        cycleIds: null as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('cycleIds') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-259] should reject tags with null value', () => {
      const invalid = {
        ...createValidTaskRecord(),
        tags: null as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-260] should reject references with null value', () => {
      const invalid = {
        ...createValidTaskRecord(),
        references: null as unknown as string[]
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-261] should reject notes with null value', () => {
      const invalid = {
        ...createValidTaskRecord(),
        notes: null as unknown as string
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && (e.message.includes('string') || e.message.includes('null'))
      )).toBe(true);
    });
  });

  describe('Empty Strings in Array Items (EARS 262-264)', () => {
    it('[EARS-262] should reject cycleIds with empty string item', () => {
      const invalid = {
        ...createValidTaskRecord(),
        cycleIds: ['']
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('cycleIds') && (e.message.includes('minLength') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-263] should reject tags with empty string item', () => {
      const invalid = {
        ...createValidTaskRecord(),
        tags: ['']
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && (e.message.includes('minLength') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-264] should reject references with empty string item', () => {
      const invalid = {
        ...createValidTaskRecord(),
        references: ['']
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });
  });

  describe('Root Type Validation (EARS 265-267)', () => {
    it('[EARS-265] should reject TaskRecord as array type', () => {
      const invalid = [] as unknown as TaskRecord;

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('object') || e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-266] should reject TaskRecord as string type', () => {
      const invalid = 'not-an-object' as unknown as TaskRecord;

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('object') || e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-267] should reject TaskRecord as null type', () => {
      const invalid = null as unknown as TaskRecord;

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('object') || e.message.includes('null')
      )).toBe(true);
    });
  });

  describe('Title Edge Cases (EARS 268-269)', () => {
    it('[EARS-268] should accept title with only whitespace', () => {
      const valid = {
        ...createValidTaskRecord(),
        title: '   ' // 3 spaces, meets minLength
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-269] should accept title with special chars and unicode', () => {
      const valid = {
        ...createValidTaskRecord(),
        title: 'Título con ñ, emojis 🚀, and symbols !@#$%'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Description Edge Cases (EARS 270-271)', () => {
    it('[EARS-270] should accept description with only whitespace', () => {
      const valid = {
        ...createValidTaskRecord(),
        description: '          ' // 10 spaces, meets minLength
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-271] should accept description with multiple lines', () => {
      const valid = {
        ...createValidTaskRecord(),
        description: 'Line 1\nLine 2\nLine 3 with more content'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('ID Pattern Edge Cases (EARS 272-274)', () => {
    it('[EARS-272] should accept id with zero timestamp', () => {
      const valid = {
        ...createValidTaskRecord(),
        id: '0000000000-task-valid-slug'
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-273] should accept empty cycleIds array', () => {
      const valid = {
        ...createValidTaskRecord(),
        cycleIds: []
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-274] should accept empty tags array', () => {
      const valid = {
        ...createValidTaskRecord(),
        tags: []
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Metadata Field Validations (EARS 1025-1035)', () => {
    it('[EARS-1025] should accept missing metadata', () => {
      const valid = createValidTaskRecord();

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1026] should accept empty metadata object', () => {
      const valid = {
        ...createValidTaskRecord(),
        metadata: {}
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1027] should accept metadata with simple key-value pairs', () => {
      const valid = {
        ...createValidTaskRecord(),
        metadata: {
          epic: true,
          jira: 'AUTH-42',
          storyPoints: 5
        }
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1028] should accept metadata with nested objects', () => {
      const valid = {
        ...createValidTaskRecord(),
        metadata: {
          epic: true,
          files: {
            overview: 'overview.md',
            roadmap: 'roadmap.md'
          },
          metrics: {
            estimatedHours: 4,
            actualHours: 2.5
          }
        }
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1029] should accept metadata with arrays', () => {
      const valid = {
        ...createValidTaskRecord(),
        metadata: {
          blockedBy: ['AUTH-40', 'AUTH-41'],
          labels: [
            { name: 'security', color: '#ff0000' },
            { name: 'auth', color: '#00ff00' }
          ]
        }
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1030] should reject non-object metadata (string)', () => {
      const invalid = {
        ...createValidTaskRecord(),
        metadata: 'not-an-object' as unknown as object
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1031] should reject non-object metadata (number)', () => {
      const invalid = {
        ...createValidTaskRecord(),
        metadata: 123 as unknown as object
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1032] should reject non-object metadata (array)', () => {
      const invalid = {
        ...createValidTaskRecord(),
        metadata: ['not', 'an', 'object'] as unknown as object
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1033] should reject null metadata', () => {
      const invalid = {
        ...createValidTaskRecord(),
        metadata: null as unknown as object
      };

      const result = validateTaskRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata')
      )).toBe(true);
    });

    it('[EARS-1034] should accept metadata with epic modeling structure', () => {
      const valid = {
        ...createValidTaskRecord(),
        metadata: {
          epic: true,
          phase: 'implementation',
          estimatedHours: 8,
          jira: 'AUTH-42',
          files: { overview: 'epics/auth/overview.md' }
        }
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1035] should accept metadata with mixed value types', () => {
      const valid = {
        ...createValidTaskRecord(),
        metadata: {
          stringValue: 'hello',
          numberValue: 42,
          booleanValue: true,
          nullValue: null,
          arrayValue: [1, 2, 3],
          objectValue: { nested: 'object' }
        }
      };

      const result = validateTaskRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });
});

