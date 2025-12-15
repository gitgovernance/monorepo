import { validateExecutionRecordDetailed } from '../../validation/execution_validator';
import type { ExecutionRecord } from '../../types';

describe('ExecutionRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid ExecutionRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   */
  const createValidExecutionRecord = (): ExecutionRecord => ({
    id: '1234567890-exec-test',
    taskId: '1234567890-task-parent',
    type: 'progress',
    title: 'Test Execution',
    result: 'This is a valid test result with more than 10 characters to meet the minLength requirement.'
  });

  describe('Root Level & Required Fields (EARS 363-368)', () => {
    it('[EARS-363] should reject additional properties at root level', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        customField: 'not-allowed-because-additionalProperties-false'
      } as ExecutionRecord & { customField: string };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('should NOT have additional properties')
      )).toBe(true);
    });

    it('[EARS-364] should reject missing required field: id', () => {
      const invalid = createValidExecutionRecord();
      delete (invalid as Partial<ExecutionRecord>).id;

      const result = validateExecutionRecordDetailed(invalid as ExecutionRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('id') || e.field === 'id'
      )).toBe(true);
    });

    it('[EARS-365] should reject missing required field: taskId', () => {
      const invalid = createValidExecutionRecord();
      delete (invalid as Partial<ExecutionRecord>).taskId;

      const result = validateExecutionRecordDetailed(invalid as ExecutionRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('taskId') || e.field === 'taskId'
      )).toBe(true);
    });

    it('[EARS-366] should reject missing required field: type', () => {
      const invalid = createValidExecutionRecord();
      delete (invalid as Partial<ExecutionRecord>).type;

      const result = validateExecutionRecordDetailed(invalid as ExecutionRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.field === 'type'
      )).toBe(true);
    });

    it('[EARS-367] should reject missing required field: title', () => {
      const invalid = createValidExecutionRecord();
      delete (invalid as Partial<ExecutionRecord>).title;

      const result = validateExecutionRecordDetailed(invalid as ExecutionRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('title') || e.field === 'title'
      )).toBe(true);
    });

    it('[EARS-368] should reject missing required field: result', () => {
      const invalid = createValidExecutionRecord();
      delete (invalid as Partial<ExecutionRecord>).result;

      const result = validateExecutionRecordDetailed(invalid as ExecutionRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('result') || e.field === 'result'
      )).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 369-376)', () => {
    it('[EARS-369] should reject id with invalid pattern', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: 'invalid-id-format'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-370] should accept valid id', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1752275500-exec-refactor-queries'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-371] should reject id exceeding maxLength 66', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-' + 'a'.repeat(60) // exceeds 66 total
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && (e.message.includes('more than') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-372] should reject non-string id', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: 123 as unknown as string
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-373] should accept id with slug of 1 char', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-a'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-374] should accept id with slug of 50 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-' + 'a'.repeat(50) // 16 + 50 = 66 chars (max allowed)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-375] should reject id with uppercase in slug', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-TestSlug'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-376] should reject id with special chars in slug', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-test_slug@#'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });
  });

  describe('TaskId Field Validations (EARS 377-384)', () => {
    it('[EARS-377] should reject taskId with invalid pattern', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: 'invalid-taskid-format'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-378] should accept valid taskId', () => {
      const valid = {
        ...createValidExecutionRecord(),
        taskId: '1752274500-task-optimizar-api'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-379] should reject taskId exceeding maxLength 66', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-' + 'a'.repeat(60) // exceeds 66 total
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && (e.message.includes('more than') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-380] should reject non-string taskId', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: 123 as unknown as string
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-381] should accept taskId with slug of 1 char', () => {
      const valid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-a'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-382] should accept taskId with slug of 50 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-' + 'a'.repeat(50) // 16 + 50 = 66 chars (max allowed)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-383] should reject taskId with uppercase in slug', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-TestSlug'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-384] should reject taskId with special chars in slug', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-test_slug.name'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && e.message.includes('pattern')
      )).toBe(true);
    });
  });

  describe('Type Field Validations (EARS 385-394)', () => {
    it('[EARS-385] should accept type "analysis"', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'analysis' as const
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-386] should accept type "progress"', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'progress' as const
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-387] should accept type "blocker"', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'blocker' as const
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-388] should accept type "completion"', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'completion' as const
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-389] should accept type "info"', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'info' as const
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-390] should accept type "correction"', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'correction' as const
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-391] should reject type with invalid enum value', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        type: 'invalid-type' as unknown as 'progress'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-392] should reject non-string type', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        type: 123 as unknown as 'progress'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-393] should reject type with uppercase', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        type: 'ANALYSIS' as unknown as 'analysis'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-394] should reject empty type', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        type: '' as unknown as 'progress'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });
  });

  describe('Title Field Validations (EARS 395-401)', () => {
    it('[EARS-395] should reject empty title', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        title: ''
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-396] should accept title with 1 or more chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        title: 'A'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-397] should reject title exceeding maxLength 256', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        title: 'a'.repeat(257)
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-398] should reject non-string title', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        title: 123 as unknown as string
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-399] should accept title with special chars and unicode', () => {
      const valid = {
        ...createValidExecutionRecord(),
        title: 'Título con carácteres especiales: @#$%^&*() 中文 🚀'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-400] should accept title with only whitespace', () => {
      const valid = {
        ...createValidExecutionRecord(),
        title: '   '
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-401] should reject title with 257 chars', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        title: 'a'.repeat(257)
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('more than')
      )).toBe(true);
    });
  });

  describe('Result Field Validations (EARS 402-410)', () => {
    it('[EARS-402] should reject result with less than 10 chars', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        result: 'short'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('result') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-403] should accept result with 10 or more chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        result: 'This is a valid result with at least 10 characters.'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-404] should reject result exceeding maxLength 22000', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        result: 'a'.repeat(22001)
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('result') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-405] should reject non-string result', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        result: 123 as unknown as string
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('result') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-406] should accept result with special chars and multiline', () => {
      const valid = {
        ...createValidExecutionRecord(),
        result: 'Result with special chars: @#$%^&*()\nMultiple lines\n中文\n🚀'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-407] should accept result with markdown', () => {
      const valid = {
        ...createValidExecutionRecord(),
        result: '# Markdown Result\n\n- Item 1\n- Item 2\n\n**Bold** and *italic*'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-408] should reject result with 9 chars', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        result: '123456789'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('result') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-409] should reject result with 22001 chars', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        result: 'a'.repeat(22001)
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('result') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-410] should accept result with 11000 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        result: 'a'.repeat(11000)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Notes Field Validations (EARS 411-417)', () => {
    it('[EARS-411] should accept missing notes', () => {
      const valid = createValidExecutionRecord();
      // notes is undefined by default

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-412] should accept empty notes', () => {
      const valid = {
        ...createValidExecutionRecord(),
        notes: ''
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-413] should reject notes exceeding maxLength 6500', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        notes: 'a'.repeat(6501)
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-414] should reject non-string notes', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        notes: 123 as unknown as string
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-415] should reject null notes', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        notes: null as unknown as string
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes')
      )).toBe(true);
    });

    it('[EARS-416] should accept notes with special chars and multiline', () => {
      const valid = {
        ...createValidExecutionRecord(),
        notes: 'Notes with special chars: @#$%^&*()\nMultiple lines\n中文\n🚀'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-417] should reject notes with 6501 chars', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        notes: 'a'.repeat(6501)
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && e.message.includes('more than')
      )).toBe(true);
    });
  });

  describe('References Array Validations (EARS 418-430)', () => {
    it('[EARS-418] should accept missing references', () => {
      const valid = createValidExecutionRecord();
      // references is undefined by default

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-419] should accept empty references array', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: []
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-420] should accept references with valid string item', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['commit:abc123']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-421] should reject references item exceeding maxLength 500', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        references: ['a'.repeat(501)]
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-422] should accept references with multiple valid items', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['commit:abc123', 'pr:456', 'file:src/app.ts']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-423] should reject non-array references', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        references: 'not-an-array' as unknown as string[]
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-424] should reject references with non-string item', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        references: [123 as unknown as string]
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-425] should reject null references', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        references: null as unknown as string[]
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references')
      )).toBe(true);
    });

    it('[EARS-426] should accept references with empty string item', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-427] should accept references with typed prefixes', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: [
          'commit:abc123',
          'pr:456',
          'file:src/app.ts',
          'url:https://example.com',
          'task:1234567890-task-test',
          'exec:1234567890-exec-test'
        ]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-428] should accept references with duplicate items', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['commit:abc123', 'commit:abc123']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-429] should accept references items with spaces and special', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['file:src/path with spaces.ts', 'url:https://example.com?param=value&other=123']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-430] should accept references with mixed types', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: [
          'commit:abc123',
          'pr:456',
          'file:src/app.ts',
          'url:https://example.com',
          'issue:789',
          'task:1234567890-task-test',
          'exec:1234567890-exec-other',
          'changelog:1234567890-changelog-v1'
        ]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Boundary Testing - Exact Limits (EARS 431-441)', () => {
    it('[EARS-431] should accept title with exactly 1 char', () => {
      const valid = {
        ...createValidExecutionRecord(),
        title: 'A'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-432] should accept title with exactly 256 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        title: 'a'.repeat(256)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-433] should accept title with 128 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        title: 'a'.repeat(128)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-434] should accept result with exactly 10 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        result: '1234567890'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-435] should accept result with exactly 22000 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        result: 'a'.repeat(22000)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-436] should accept notes with exactly 6500 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        notes: 'a'.repeat(6500)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-437] should accept notes with 3250 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        notes: 'a'.repeat(3250)
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-438] should accept references item with exactly 500 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['a'.repeat(500)]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-439] should reject references item with 501 chars', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        references: ['a'.repeat(501)]
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('references') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-440] should accept references item with 250 chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['a'.repeat(250)]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-441] should accept references with 1 valid item', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['commit:abc123']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('ID and TaskId Pattern Edge Cases (EARS 442-449)', () => {
    it('[EARS-442] should accept id with zero timestamp', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '0000000000-exec-test'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-443] should reject id with 9-digit timestamp', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: '123456789-exec-test'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-444] should reject id with 11-digit timestamp', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        id: '12345678901-exec-test'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-445] should accept taskId with valid 10-digit timestamp', () => {
      const valid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-test'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-446] should reject taskId with 9-digit timestamp', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: '123456789-task-test'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-447] should reject taskId with 11-digit timestamp', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        taskId: '12345678901-task-test'
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('taskId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-448] should accept id slug with only numbers', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-1234567890'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-449] should accept id slug with only lowercase letters', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-abcdefghijklmnop'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Pattern Variations and Array Edge Cases (EARS 450-457)', () => {
    it('[EARS-450] should accept id slug with only dashes', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-------'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-451] should accept id slug with mixed chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        id: '1234567890-exec-abc-123-xyz'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-452] should accept taskId slug with only numbers', () => {
      const valid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-9876543210'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-453] should accept taskId slug with mixed chars', () => {
      const valid = {
        ...createValidExecutionRecord(),
        taskId: '1234567890-task-abc-123-xyz'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-454] should accept references with 10 valid items', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: [
          'commit:1',
          'commit:2',
          'commit:3',
          'commit:4',
          'commit:5',
          'commit:6',
          'commit:7',
          'commit:8',
          'commit:9',
          'commit:10'
        ]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-455] should accept references with valid URLs', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: [
          'url:https://example.com',
          'url:https://github.com/org/repo/pull/123',
          'url:https://docs.example.com/api#section'
        ]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-456] should accept references to other records', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: [
          'task:1234567890-task-parent-task',
          'exec:1234567890-exec-previous-execution',
          'changelog:1234567890-changelog-release-notes'
        ]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-457] should accept references with duplicate items (bis)', () => {
      const valid = {
        ...createValidExecutionRecord(),
        references: ['commit:abc', 'commit:abc', 'commit:abc']
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Happy Paths and Complete Records (EARS 458-461)', () => {
    it('[EARS-458] should accept ExecutionRecord with only required fields', () => {
      const valid: ExecutionRecord = {
        id: '1752275500-exec-minimal-test',
        taskId: '1752274500-task-parent',
        type: 'progress',
        title: 'Minimal Execution Record',
        result: 'This is a minimal valid execution with only required fields present.'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-459] should accept ExecutionRecord with all fields', () => {
      const valid: ExecutionRecord = {
        id: '1752275500-exec-complete-test',
        taskId: '1752274500-task-parent',
        type: 'completion',
        title: 'Complete Execution Record',
        result: 'This is a complete execution with all fields including optional ones.',
        notes: 'These are detailed notes explaining the execution process and decisions made.',
        references: [
          'commit:abc123def456',
          'pr:789',
          'file:src/components/Auth.tsx',
          'url:https://docs.example.com/oauth'
        ]
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-460] should accept ExecutionRecord with partial optional', () => {
      const valid: ExecutionRecord = {
        id: '1752275500-exec-partial-test',
        taskId: '1752274500-task-parent',
        type: 'analysis',
        title: 'Partial Execution Record',
        result: 'This execution has some optional fields present.',
        notes: 'Only notes field is present, references is absent.'
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('[EARS-461] should accept ExecutionRecord with empty optional arrays', () => {
      const valid: ExecutionRecord = {
        id: '1752275500-exec-empty-arrays-test',
        taskId: '1752274500-task-parent',
        type: 'info',
        title: 'Execution with Empty Arrays',
        result: 'This execution has empty references array.',
        references: []
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Metadata Field Validations (EARS 1002-1012)', () => {
    it('[EARS-1002] should accept missing metadata', () => {
      const valid = createValidExecutionRecord();
      // metadata is undefined by default

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1003] should accept empty metadata object', () => {
      const valid = {
        ...createValidExecutionRecord(),
        metadata: {}
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1004] should accept metadata with simple key-value pairs', () => {
      const valid = {
        ...createValidExecutionRecord(),
        metadata: {
          scannedFiles: 245,
          duration_ms: 1250,
          tier: 'free'
        }
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1005] should accept metadata with nested objects', () => {
      const valid = {
        ...createValidExecutionRecord(),
        metadata: {
          summary: {
            critical: 3,
            high: 4,
            medium: 3,
            low: 0
          },
          config: {
            detectors: ['regex', 'heuristic'],
            llmEnabled: false
          }
        }
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1006] should accept metadata with arrays', () => {
      const valid = {
        ...createValidExecutionRecord(),
        metadata: {
          findings: [
            { id: 'SEC-001', severity: 'critical', file: 'src/config.ts', line: 5 },
            { id: 'PII-001', severity: 'high', file: 'src/user.ts', line: 42 }
          ],
          scannedPaths: ['src/', 'lib/', 'config/']
        }
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1007] should reject non-object metadata (string)', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        metadata: 'not-an-object' as unknown as object
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1008] should reject non-object metadata (number)', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        metadata: 123 as unknown as object
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1009] should reject non-object metadata (array)', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        metadata: ['not', 'an', 'object'] as unknown as object
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1010] should reject null metadata', () => {
      const invalid = {
        ...createValidExecutionRecord(),
        metadata: null as unknown as object
      };

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata')
      )).toBe(true);
    });

    it('[EARS-1011] should accept metadata with GDPR audit findings structure', () => {
      const valid = {
        ...createValidExecutionRecord(),
        type: 'analysis' as const,
        metadata: {
          scannedFiles: 245,
          scannedLines: 18420,
          duration_ms: 1250,
          findings: [
            { id: 'SEC-001', severity: 'critical', file: 'src/config/db.ts', line: 5, type: 'api_key' },
            { id: 'SEC-003', severity: 'critical', file: 'src/auth/keys.ts', line: 2, type: 'private_key' },
            { id: 'PII-003', severity: 'critical', file: 'src/payments/stripe.ts', line: 8, type: 'credit_card' }
          ],
          summary: { critical: 3, high: 4, medium: 3, low: 0 }
        }
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1012] should accept metadata with mixed value types', () => {
      const valid = {
        ...createValidExecutionRecord(),
        metadata: {
          stringValue: 'hello',
          numberValue: 42,
          booleanValue: true,
          nullValue: null,
          arrayValue: [1, 2, 3],
          objectValue: { nested: 'object' }
        }
      };

      const result = validateExecutionRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases - Root Type and Optional Fields (EARS 462-464)', () => {
    it('[EARS-462] should reject ExecutionRecord as array type', () => {
      const invalid = [
        createValidExecutionRecord()
      ] as unknown as ExecutionRecord;

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-463] should reject ExecutionRecord as string type', () => {
      const invalid = 'not-an-object' as unknown as ExecutionRecord;

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-464] should reject ExecutionRecord as null type', () => {
      const invalid = null as unknown as ExecutionRecord;

      const result = validateExecutionRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('object') || e.message.includes('null')
      )).toBe(true);
    });
  });
});

