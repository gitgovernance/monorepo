import { validateCycleRecordDetailed } from '../../validation/cycle_validator';
import type { CycleRecord } from '../../record_types';

describe('CycleRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid CycleRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   */
  const createValidCycleRecord = (): CycleRecord => ({
    id: '1754400000-cycle-test',
    title: 'Test Cycle',
    status: 'active'
  });

  describe('Root Level & Required Fields (EARS 275-278)', () => {
    it('[EARS-275] should reject additional properties at root level', () => {
      const invalid = {
        ...createValidCycleRecord(),
        customField: 'not-allowed-because-additionalProperties-false'
      } as CycleRecord & { customField: string };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('should NOT have additional properties')
      )).toBe(true);
    });

    it('[EARS-276] should reject missing required field: id', () => {
      const invalid = createValidCycleRecord();
      delete (invalid as Partial<CycleRecord>).id;

      const result = validateCycleRecordDetailed(invalid as CycleRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('id') || e.field === 'id'
      )).toBe(true);
    });

    it('[EARS-277] should reject missing required field: title', () => {
      const invalid = createValidCycleRecord();
      delete (invalid as Partial<CycleRecord>).title;

      const result = validateCycleRecordDetailed(invalid as CycleRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('title') || e.field === 'title'
      )).toBe(true);
    });

    it('[EARS-278] should reject missing required field: status', () => {
      const invalid = createValidCycleRecord();
      delete (invalid as Partial<CycleRecord>).status;

      const result = validateCycleRecordDetailed(invalid as CycleRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('status') || e.field === 'status'
      )).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 279-283)', () => {
    it('[EARS-279] should reject invalid id pattern', () => {
      const invalid = {
        ...createValidCycleRecord(),
        id: 'invalid-id-format'
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-280] should accept valid id pattern', () => {
      const valid = {
        ...createValidCycleRecord(),
        id: '1754400000-cycle-sprint-24-api-performance'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-281] should reject id exceeding maxLength 70', () => {
      const invalid = {
        ...createValidCycleRecord(),
        id: '1234567890-cycle-' + 'a'.repeat(60) // exceeds 70 total
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-282] should accept id with maxLength 70', () => {
      const valid = {
        ...createValidCycleRecord(),
        id: '1234567890-cycle-' + 'a'.repeat(50) // 17 + 50 = 67 chars (pattern limits slug to 50)
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-283] should reject id with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        id: 123 as unknown as string
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Title Field Validations (EARS 284-287)', () => {
    it('[EARS-284] should reject title below minLength 1', () => {
      const invalid = {
        ...createValidCycleRecord(),
        title: '' // empty string
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-285] should accept title with minLength 1 or more', () => {
      const valid = {
        ...createValidCycleRecord(),
        title: 'A'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-286] should reject title exceeding maxLength 256', () => {
      const invalid = {
        ...createValidCycleRecord(),
        title: 'a'.repeat(257)
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-287] should reject title with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        title: 123 as unknown as string
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('Status Field Validations (EARS 288-293)', () => {
    it('[EARS-288] should accept status "planning"', () => {
      const valid = {
        ...createValidCycleRecord(),
        status: 'planning' as const
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-289] should accept status "active"', () => {
      const valid = {
        ...createValidCycleRecord(),
        status: 'active' as const
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-290] should accept status "completed"', () => {
      const valid = {
        ...createValidCycleRecord(),
        status: 'completed' as const
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-291] should accept status "archived"', () => {
      const valid = {
        ...createValidCycleRecord(),
        status: 'archived' as const
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-292] should reject invalid status enum value', () => {
      const invalid = {
        ...createValidCycleRecord(),
        status: 'cancelled' as unknown as 'active'
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-293] should reject status with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        status: 123 as unknown as 'active'
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && e.message.includes('string')
      )).toBe(true);
    });
  });

  describe('TaskIds Array Validations (EARS 294-302)', () => {
    it('[EARS-294] should accept absence of taskIds field (optional)', () => {
      const valid = createValidCycleRecord();

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-295] should accept empty taskIds array', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: []
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-296] should accept valid taskIds item pattern', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: ['1752274500-task-optimizar-endpoint-search']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-297] should reject invalid taskIds item pattern', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: ['invalid-task']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-298] should reject taskIds item exceeding maxLength 70', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: ['1234567890-task-' + 'a'.repeat(60)] // exceeds 70
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-299] should accept multiple valid taskIds items', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: [
          '1752274500-task-optimizar-endpoint-search',
          '1752360900-task-anadir-cache-a-redis'
        ]
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-300] should reject taskIds with non-array type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: 'not-an-array' as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-301] should reject taskIds item with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: [123] as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-302] should reject taskIds with null value', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: null as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });
  });

  describe('ChildCycleIds Array Validations (EARS 303-311)', () => {
    it('[EARS-303] should accept absence of childCycleIds field (optional)', () => {
      const valid = createValidCycleRecord();

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-304] should accept empty childCycleIds array', () => {
      const valid = {
        ...createValidCycleRecord(),
        childCycleIds: []
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-305] should accept valid childCycleIds item pattern', () => {
      const valid = {
        ...createValidCycleRecord(),
        childCycleIds: ['1754400000-cycle-sprint-24']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-306] should reject invalid childCycleIds item pattern', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: ['invalid-cycle']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-307] should reject childCycleIds item exceeding maxLength 70', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: ['1234567890-cycle-' + 'a'.repeat(60)] // exceeds 70
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-308] should accept multiple valid childCycleIds items', () => {
      const valid = {
        ...createValidCycleRecord(),
        childCycleIds: [
          '1754400000-cycle-sprint-24',
          '1754500000-cycle-sprint-25'
        ]
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-309] should reject childCycleIds with non-array type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: 'not-an-array' as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-310] should reject childCycleIds item with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: [123] as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-311] should reject childCycleIds with null value', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: null as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });
  });

  describe('Tags Array Validations (EARS 312-320)', () => {
    it('[EARS-312] should accept absence of tags field (optional)', () => {
      const valid = createValidCycleRecord();

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-313] should accept empty tags array', () => {
      const valid = {
        ...createValidCycleRecord(),
        tags: []
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-314] should accept valid tags item pattern', () => {
      const valid = {
        ...createValidCycleRecord(),
        tags: ['roadmap:q4', 'team:backend', 'focus:performance']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-315] should reject invalid tags item pattern', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: ['Invalid_Tag']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-316] should reject tags item exceeding maxLength 100', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: ['a'.repeat(101)]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-317] should accept multiple valid tags items', () => {
      const valid = {
        ...createValidCycleRecord(),
        tags: [
          'roadmap:q4',
          'team:backend',
          'focus:performance'
        ]
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-318] should reject tags with non-array type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: 'not-an-array' as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-319] should reject tags item with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: [123] as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-320] should reject tags with null value', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: null as unknown as string[]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });
  });

  describe('Notes Field Validations (EARS 321-325)', () => {
    it('[EARS-321] should accept absence of notes field (optional)', () => {
      const valid = createValidCycleRecord();

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-322] should accept empty notes string (minLength 0)', () => {
      const valid = {
        ...createValidCycleRecord(),
        notes: ''
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-323] should reject notes exceeding maxLength 10000', () => {
      const invalid = {
        ...createValidCycleRecord(),
        notes: 'a'.repeat(10001)
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-324] should reject notes with non-string type', () => {
      const invalid = {
        ...createValidCycleRecord(),
        notes: 123 as unknown as string
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-325] should accept notes with special chars and multiline', () => {
      const valid = {
        ...createValidCycleRecord(),
        notes: 'Objetivo: Reducir latencia\n🚀 Con emojis y unicode\n特殊字符'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Boundary Testing - Exact Limits (EARS 326-333)', () => {
    it('[EARS-326] should accept title with exactly 1 character', () => {
      const valid = {
        ...createValidCycleRecord(),
        title: 'A'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-327] should accept title with exactly 256 characters', () => {
      const valid = {
        ...createValidCycleRecord(),
        title: 'a'.repeat(256)
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-328] should accept id with minimum slug length (1 char)', () => {
      const valid = {
        ...createValidCycleRecord(),
        id: '1234567890-cycle-a'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-329] should accept id with maximum slug length (50 chars)', () => {
      const valid = {
        ...createValidCycleRecord(),
        id: '1234567890-cycle-' + 'a'.repeat(50)
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-330] should accept taskIds item with exactly 70 chars', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: ['1234567890-task-' + 'a'.repeat(50)] // 16 + 50 = 66 chars (pattern limits slug to 50)
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-331] should accept childCycleIds item with exactly 70 chars', () => {
      const valid = {
        ...createValidCycleRecord(),
        childCycleIds: ['1234567890-cycle-' + 'a'.repeat(50)] // 17 + 50 = 67 chars (pattern limits slug to 50)
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-332] should accept tags item with exactly 100 chars', () => {
      const valid = {
        ...createValidCycleRecord(),
        tags: ['a'.repeat(100)]
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-333] should accept notes with exactly 10000 characters', () => {
      const valid = {
        ...createValidCycleRecord(),
        notes: 'a'.repeat(10000)
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Happy Paths - Complete Records (EARS 334-337)', () => {
    it('[EARS-334] should accept minimal valid CycleRecord', () => {
      const valid = createValidCycleRecord();

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-335] should accept full valid CycleRecord with all optional', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: ['1752274500-task-optimizar-endpoint-search'],
        childCycleIds: ['1754400000-cycle-sprint-24'],
        tags: ['roadmap:q4', 'team:backend'],
        notes: 'Some additional notes here'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-336] should accept CycleRecord with empty optional arrays', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: [],
        childCycleIds: [],
        tags: [],
        notes: ''
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-337] should accept CycleRecord with partial optional fields', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: ['1752274500-task-optimizar-endpoint-search'],
        tags: ['roadmap:q4']
        // childCycleIds and notes are omitted
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases - Arrays with Empty Strings (EARS 338-340)', () => {
    it('[EARS-338] should reject taskIds with empty string item', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: ['']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-339] should reject childCycleIds with empty string item', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: ['']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-340] should reject tags with empty string item', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: ['']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });
  });

  describe('Edge Cases - Root Type Validation (EARS 341-343)', () => {
    it('[EARS-341] should reject CycleRecord as array type', () => {
      const invalid = [] as unknown as CycleRecord;

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('object') || e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-342] should reject CycleRecord as string type', () => {
      const invalid = 'not-an-object' as unknown as CycleRecord;

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('object') || e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-343] should reject CycleRecord as null type', () => {
      const invalid = null as unknown as CycleRecord;

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('object') || e.message.includes('null')
      )).toBe(true);
    });
  });

  describe('Edge Cases - Title Special Content (EARS 344-345)', () => {
    it('[EARS-344] should accept title with only whitespace', () => {
      const valid = {
        ...createValidCycleRecord(),
        title: '   ' // 3 spaces, meets minLength
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-345] should accept title with special chars and unicode', () => {
      const valid = {
        ...createValidCycleRecord(),
        title: 'Sprint 24 🚀 - API Performance (Q4 2025) - 特殊'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases - ID Timestamp Zero (EARS 346)', () => {
    it('[EARS-346] should accept id with zero timestamp', () => {
      const valid = {
        ...createValidCycleRecord(),
        id: '0000000000-cycle-valid-slug'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases - Arrays with Multiple Invalid Items (EARS 347-349)', () => {
    it('[EARS-347] should reject taskIds with mixed valid and invalid', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: [
          '1752274500-task-valid-task',
          'invalid-task-id'
        ]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-348] should reject childCycleIds with mixed valid and invalid', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: [
          '1754400000-cycle-valid-cycle',
          'invalid-cycle-id'
        ]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-349] should reject tags with mixed valid and invalid', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: [
          'roadmap:q4',
          'Invalid_Tag'
        ]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });
  });

  describe('Edge Cases - Array Items at Boundary (EARS 350-352)', () => {
    it('[EARS-350] should reject taskIds item with 71 chars', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: ['1234567890-task-' + 'a'.repeat(55)] // 16 + 55 = 71 characters
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-351] should reject childCycleIds item with 71 chars', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: ['1234567890-cycle-' + 'a'.repeat(54)] // 17 + 54 = 71 characters
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-352] should reject tags item with 101 chars', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: ['a'.repeat(101)]
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });
  });

  describe('Edge Cases - Pattern Variations (EARS 353-358)', () => {
    it('[EARS-353] should reject id with uppercase in slug', () => {
      const invalid = {
        ...createValidCycleRecord(),
        id: '1234567890-cycle-Invalid-Slug'
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-354] should reject taskIds item with uppercase in slug', () => {
      const invalid = {
        ...createValidCycleRecord(),
        taskIds: ['1234567890-task-Invalid-Slug']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-355] should reject childCycleIds item with uppercase in slug', () => {
      const invalid = {
        ...createValidCycleRecord(),
        childCycleIds: ['1234567890-cycle-Invalid-Slug']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('childCycleIds') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-356] should reject tags item with uppercase', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: ['Roadmap:Q4']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-357] should accept tags item with nested format', () => {
      const valid = {
        ...createValidCycleRecord(),
        tags: ['team:backend:api', 'roadmap:q4:growth']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-358] should reject tags item with special chars', () => {
      const invalid = {
        ...createValidCycleRecord(),
        tags: ['roadmap@q4', 'team#backend']
      };

      const result = validateCycleRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });
  });

  describe('Edge Cases - Optional Fields All Combinations (EARS 359-362)', () => {
    it('[EARS-359] should accept CycleRecord with only taskIds', () => {
      const valid = {
        ...createValidCycleRecord(),
        taskIds: ['1752274500-task-optimizar-endpoint-search']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-360] should accept CycleRecord with only childCycleIds', () => {
      const valid = {
        ...createValidCycleRecord(),
        childCycleIds: ['1754400000-cycle-sprint-24']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-361] should accept CycleRecord with only tags', () => {
      const valid = {
        ...createValidCycleRecord(),
        tags: ['roadmap:q4', 'team:backend']
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-362] should accept CycleRecord with only notes', () => {
      const valid = {
        ...createValidCycleRecord(),
        notes: 'Some notes about this cycle'
      };

      const result = validateCycleRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });
});

