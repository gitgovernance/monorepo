import { validateFeedbackRecordDetailed } from '../../validation/feedback_validator';
import type { FeedbackRecord } from '../../types';

describe('FeedbackRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid FeedbackRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   */
  const createValidFeedbackRecord = (): FeedbackRecord => ({
    id: '1234567890-feedback-test',
    entityType: 'task',
    entityId: '1234567890-task-parent',
    type: 'question',
    status: 'open',
    content: 'This is a valid feedback content.'
  });

  describe('Root Level & Required Fields (EARS 615-621)', () => {
    it('[EARS-615] should reject additional properties at root level', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        customField: 'not-allowed-because-additionalProperties-false'
      } as FeedbackRecord & { customField: string };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('should NOT have additional properties')
      )).toBe(true);
    });

    it('[EARS-616] should reject missing required field: id', () => {
      const invalid = createValidFeedbackRecord();
      delete (invalid as Partial<FeedbackRecord>).id;

      const result = validateFeedbackRecordDetailed(invalid as FeedbackRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('id') || e.field === 'id'
      )).toBe(true);
    });

    it('[EARS-617] should reject missing required field: entityType', () => {
      const invalid = createValidFeedbackRecord();
      delete (invalid as Partial<FeedbackRecord>).entityType;

      const result = validateFeedbackRecordDetailed(invalid as FeedbackRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('entityType') || e.field === 'entityType'
      )).toBe(true);
    });

    it('[EARS-618] should reject missing required field: entityId', () => {
      const invalid = createValidFeedbackRecord();
      delete (invalid as Partial<FeedbackRecord>).entityId;

      const result = validateFeedbackRecordDetailed(invalid as FeedbackRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('entityId') || e.field === 'entityId'
      )).toBe(true);
    });

    it('[EARS-619] should reject missing required field: type', () => {
      const invalid = createValidFeedbackRecord();
      delete (invalid as Partial<FeedbackRecord>).type;

      const result = validateFeedbackRecordDetailed(invalid as FeedbackRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.field === 'type'
      )).toBe(true);
    });

    it('[EARS-620] should reject missing required field: status', () => {
      const invalid = createValidFeedbackRecord();
      delete (invalid as Partial<FeedbackRecord>).status;

      const result = validateFeedbackRecordDetailed(invalid as FeedbackRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('status') || e.field === 'status'
      )).toBe(true);
    });

    it('[EARS-621] should reject missing required field: content', () => {
      const invalid = createValidFeedbackRecord();
      delete (invalid as Partial<FeedbackRecord>).content;

      const result = validateFeedbackRecordDetailed(invalid as FeedbackRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('content') || e.field === 'content'
      )).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 622-635)', () => {
    it('[EARS-622] should reject id with invalid pattern', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: 'invalid-id-format'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-623] should accept valid id', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1752788100-feedback-blocking-rest-api'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-624] should reject id exceeding maxLength 70', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-' + 'a'.repeat(60) // exceeds 70 total
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && (e.message.includes('more than') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-625] should reject non-string id', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: 123 as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-626] should accept id with slug of 1 char', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-a'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-627] should accept id with slug of 50 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-' + 'a'.repeat(50) // 20 + 50 = 70 chars (max allowed)
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-628] should reject id with uppercase in slug', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-TestSlug'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-629] should reject id with special chars in slug', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-test_slug@#'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-630] should accept id with valid 10-digit timestamp', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-631] should reject id with 9-digit timestamp', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: '123456789-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-632] should reject id with 11-digit timestamp', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        id: '12345678901-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-633] should accept id slug with only numbers', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-12345'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-634] should accept id slug with only lowercase letters', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-blocking'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-635] should accept id slug with mixed chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        id: '1234567890-feedback-abc-123-xyz'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('EntityType Field Validations (EARS 636-643)', () => {
    it('[EARS-636] should accept entityType "task"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityType: 'task' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-637] should accept entityType "execution"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityType: 'execution' as const,
        entityId: '1234567890-exec-test'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-638] should accept entityType "changelog"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityType: 'changelog' as const,
        entityId: '1234567890-changelog-test'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-639] should accept entityType "feedback"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityType: 'feedback' as const,
        entityId: '1234567890-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-640] should accept entityType "cycle"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityType: 'cycle' as const,
        entityId: '1234567890-cycle-test'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-641] should reject invalid entityType enum value', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityType: 'invalid-type' as unknown as 'task'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityType') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-642] should reject non-string entityType', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityType: 123 as unknown as 'task'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityType') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-643] should reject empty entityType', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityType: '' as unknown as 'task'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityType') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });
  });

  describe('EntityId Field Validations (EARS 644-653)', () => {
    it('[EARS-644] should reject entityId with less than 1 char', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityId: ''
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityId') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-645] should accept entityId with 1 or more chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityId: 'a'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-646] should reject entityId exceeding maxLength 256', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityId: 'a'.repeat(257)
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityId') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-647] should reject non-string entityId', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityId: 123 as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityId') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-648] should accept entityId with exactly 1 char', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityId: 'a'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-649] should accept entityId with exactly 256 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityId: 'a'.repeat(256)
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-650] should accept entityId with 128 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        entityId: 'a'.repeat(128)
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-651] should reject empty entityId', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityId: ''
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityId') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-652] should reject entityId with 257 chars', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityId: 'a'.repeat(257)
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityId') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-653] should reject null entityId', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        entityId: null as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('entityId')
      )).toBe(true);
    });
  });

  describe('Type Field Validations (EARS 654-662)', () => {
    it('[EARS-654] should accept type "blocking"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'blocking' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-655] should accept type "suggestion"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'suggestion' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-656] should accept type "question"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'question' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-657] should accept type "approval"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'approval' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-658] should accept type "clarification"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'clarification' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-659] should accept type "assignment"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'assignment' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-660] should reject invalid type enum value', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        type: 'invalid-type' as unknown as 'question'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-661] should reject non-string type', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        type: 123 as unknown as 'question'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-662] should reject empty type', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        type: '' as unknown as 'question'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });
  });

  describe('Status Field Validations (EARS 663-669)', () => {
    it('[EARS-663] should accept status "open"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        status: 'open' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-664] should accept status "acknowledged"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        status: 'acknowledged' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-665] should accept status "resolved"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        status: 'resolved' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-666] should accept status "wontfix"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        status: 'wontfix' as const
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-667] should reject invalid status enum value', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        status: 'invalid-status' as unknown as 'open'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-668] should reject non-string status', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        status: 123 as unknown as 'open'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-669] should reject empty status', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        status: '' as unknown as 'open'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });
  });

  describe('Content Field Validations (EARS 670-680)', () => {
    it('[EARS-670] should reject content with less than 1 char', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        content: ''
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('content') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-671] should accept content with 1 or more chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        content: 'a'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-672] should reject content exceeding maxLength 5000', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        content: 'a'.repeat(5001)
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('content') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-673] should reject non-string content', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        content: 123 as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('content') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-674] should accept content with special chars and markdown', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        content: '# Feedback\n\nEsta implementación **no cumple** el estándar:\n\n- Item 1\n- Item 2\n\n```js\ncode here\n```\n\n¿Por qué? 🤔'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-675] should accept content with exactly 1 char', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        content: 'a'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-676] should accept content with exactly 5000 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        content: 'a'.repeat(5000)
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-677] should reject empty content', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        content: ''
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('content') && e.message.includes('fewer')
      )).toBe(true);
    });

    it('[EARS-678] should reject content with 5001 chars', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        content: 'a'.repeat(5001)
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('content') && e.message.includes('more than')
      )).toBe(true);
    });

    it('[EARS-679] should accept content with 2500 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        content: 'a'.repeat(2500)
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-680] should reject null content', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        content: null as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('content')
      )).toBe(true);
    });
  });

  describe('Assignee Field Validations (EARS 681-691)', () => {
    it('[EARS-681] should accept missing assignee', () => {
      const valid = createValidFeedbackRecord();
      // assignee is undefined by default

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-682] should reject empty assignee', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: ''
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-683] should reject assignee with invalid pattern', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: 'invalid-format'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-684] should accept assignee with format "human:maria"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        assignee: 'human:maria'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-685] should accept assignee with format "agent:code-reviewer"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        assignee: 'agent:code-reviewer'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-686] should accept assignee with format "agent:camilo:cursor"', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        assignee: 'agent:camilo:cursor'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-687] should reject assignee exceeding maxLength 256', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: 'human:' + 'a'.repeat(260)
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee') && (e.message.includes('more than') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-688] should reject assignee without human/agent prefix', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: 'maria'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-689] should reject assignee without colon', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: 'humanmaria'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-690] should reject non-string assignee', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: 123 as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-691] should reject null assignee', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        assignee: null as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('assignee')
      )).toBe(true);
    });
  });

  describe('ResolvesFeedbackId Field Validations (EARS 692-707)', () => {
    it('[EARS-692] should accept missing resolvesFeedbackId', () => {
      const valid = createValidFeedbackRecord();
      // resolvesFeedbackId is undefined by default

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-693] should reject resolvesFeedbackId with invalid pattern', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: 'invalid-id-format'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-694] should accept resolvesFeedbackId with valid pattern', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1752788100-feedback-blocking-rest-api'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-695] should reject resolvesFeedbackId exceeding maxLength 70', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-' + 'a'.repeat(60) // exceeds 70 total
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && (e.message.includes('more than') || e.message.includes('pattern'))
      )).toBe(true);
    });

    it('[EARS-696] should reject non-string resolvesFeedbackId', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: 123 as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-697] should accept resolvesFeedbackId with slug of 1 char', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-a'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-698] should accept resolvesFeedbackId with slug of 50 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-' + 'a'.repeat(50) // 20 + 50 = 70 chars
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-699] should reject resolvesFeedbackId with uppercase in slug', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-TestSlug'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-700] should accept resolvesFeedbackId with 10-digit timestamp', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-701] should reject resolvesFeedbackId with 9-digit timestamp', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '123456789-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-702] should reject resolvesFeedbackId with 11-digit timestamp', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '12345678901-feedback-test'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-703] should reject null resolvesFeedbackId', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: null as unknown as string
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId')
      )).toBe(true);
    });

    it('[EARS-704] should reject empty resolvesFeedbackId', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: ''
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-705] should reject resolvesFeedbackId with slug of 51 chars', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-' + 'a'.repeat(51) // exceeds pattern limit
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-706] should reject resolvesFeedbackId with special chars in slug', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-test_slug@#'
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('resolvesFeedbackId') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-707] should accept resolvesFeedbackId with exactly 70 chars', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        resolvesFeedbackId: '1234567890-feedback-' + 'a'.repeat(50) // exactly 70 chars
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Happy Paths and Complete Records', () => {
    it('should accept FeedbackRecord with only required fields', () => {
      const valid: FeedbackRecord = {
        id: '1752788100-feedback-minimal-test',
        entityType: 'task',
        entityId: '1752274500-task-parent',
        type: 'question',
        status: 'open',
        content: 'This is a minimal valid feedback with only required fields present.'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept FeedbackRecord with all fields', () => {
      const valid: FeedbackRecord = {
        id: '1752788100-feedback-complete-test',
        entityType: 'execution',
        entityId: '1752642000-exec-subtarea-9-4',
        type: 'blocking',
        status: 'open',
        content: 'Esta implementación no cumple el estándar de rutas REST. Los endpoints deben seguir el patrón /api/v1/{resource}/{id}.',
        assignee: 'human:maria',
        resolvesFeedbackId: '1752788000-feedback-previous'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept FeedbackRecord with partial optional fields', () => {
      const valid: FeedbackRecord = {
        id: '1752788100-feedback-partial-test',
        entityType: 'task',
        entityId: '1752274500-task-implement-feature',
        type: 'assignment',
        status: 'open',
        content: 'Asignando esta tarea por experiencia con OAuth2. Prioridad alta.',
        assignee: 'human:maria'
        // resolvesFeedbackId is absent
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept FeedbackRecord referencing another feedback', () => {
      const valid: FeedbackRecord = {
        id: '1752788200-feedback-response',
        entityType: 'feedback',
        entityId: '1752788100-feedback-blocking-rest-api',
        type: 'clarification',
        status: 'resolved',
        content: 'Implementada la corrección. Ahora todos los endpoints siguen el estándar REST. Tests actualizados y passing.',
        resolvesFeedbackId: '1752788100-feedback-blocking-rest-api'
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge Cases - Root Type and Special Scenarios', () => {
    it('should reject FeedbackRecord as array type', () => {
      const invalid = [
        createValidFeedbackRecord()
      ] as unknown as FeedbackRecord;

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('object')
      )).toBe(true);
    });

    it('should reject FeedbackRecord as string type', () => {
      const invalid = 'not-an-object' as unknown as FeedbackRecord;

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('object')
      )).toBe(true);
    });

    it('should reject FeedbackRecord as null type', () => {
      const invalid = null as unknown as FeedbackRecord;

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('type') || e.message.includes('object') || e.message.includes('null')
      )).toBe(true);
    });

    it('should accept feedback on different entity types', () => {
      const entities = [
        { type: 'task' as const, id: '1234567890-task-test' },
        { type: 'execution' as const, id: '1234567890-exec-test' },
        { type: 'changelog' as const, id: '1234567890-changelog-test' },
        { type: 'feedback' as const, id: '1234567890-feedback-test' },
        { type: 'cycle' as const, id: '1234567890-cycle-test' }
      ];

      entities.forEach(entity => {
        const valid = {
          ...createValidFeedbackRecord(),
          entityType: entity.type,
          entityId: entity.id
        };

        const result = validateFeedbackRecordDetailed(valid);
        expect(result.isValid).toBe(true);
      });
    });

    it('should accept all feedback types', () => {
      const types: Array<'blocking' | 'suggestion' | 'question' | 'approval' | 'clarification' | 'assignment'> = [
        'blocking',
        'suggestion',
        'question',
        'approval',
        'clarification',
        'assignment'
      ];

      types.forEach(type => {
        const valid = {
          ...createValidFeedbackRecord(),
          type
        };

        const result = validateFeedbackRecordDetailed(valid);
        expect(result.isValid).toBe(true);
      });
    });

    it('should accept all status values', () => {
      const statuses: Array<'open' | 'acknowledged' | 'resolved' | 'wontfix'> = [
        'open',
        'acknowledged',
        'resolved',
        'wontfix'
      ];

      statuses.forEach(status => {
        const valid = {
          ...createValidFeedbackRecord(),
          status
        };

        const result = validateFeedbackRecordDetailed(valid);
        expect(result.isValid).toBe(true);
      });
    });

    it('should accept assignee with multiple levels', () => {
      const assignees = [
        'human:maria',
        'human:camilo',
        'agent:code-reviewer',
        'agent:camilo:cursor',
        'agent:maria:copilot',
        'human:john:team-lead'
      ];

      assignees.forEach(assignee => {
        const valid = {
          ...createValidFeedbackRecord(),
          assignee
        };

        const result = validateFeedbackRecordDetailed(valid);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Metadata Field Validations (EARS 1013-1024)', () => {
    it('[EARS-1013] should accept missing metadata', () => {
      const valid = createValidFeedbackRecord();
      // metadata is undefined by default

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1014] should accept empty metadata object', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        metadata: {}
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1015] should accept metadata with simple key-value pairs', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        metadata: {
          reviewerId: 'reviewer-123',
          score: 95,
          tier: 'senior'
        }
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1016] should accept metadata with nested objects', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        metadata: {
          context: {
            source: 'automated-scan',
            priority: 'high'
          },
          details: {
            category: 'security',
            subcategory: 'credentials'
          }
        }
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1017] should accept metadata with arrays', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        metadata: {
          issues: [
            { id: 'SEC-001', severity: 'critical', file: 'src/config.ts', line: 5 },
            { id: 'SEC-002', severity: 'high', file: 'src/auth.ts', line: 42 }
          ],
          affectedPaths: ['src/', 'lib/', 'config/']
        }
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1018] should reject non-object metadata (string)', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        metadata: 'not-an-object' as unknown as object
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1019] should reject non-object metadata (number)', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        metadata: 123 as unknown as object
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1020] should reject non-object metadata (array)', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        metadata: ['not', 'an', 'object'] as unknown as object
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });

    it('[EARS-1021] should reject null metadata', () => {
      const invalid = {
        ...createValidFeedbackRecord(),
        metadata: null as unknown as object
      };

      const result = validateFeedbackRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata')
      )).toBe(true);
    });

    it('[EARS-1022] should accept metadata with issue tracking structure', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        type: 'blocking' as const,
        metadata: {
          issueId: 'SEC-001',
          severity: 'critical',
          file: 'src/config.ts',
          line: 42,
          expiresAt: '2025-12-31T23:59:59Z'
        }
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1023] should accept metadata with mixed value types', () => {
      const valid = {
        ...createValidFeedbackRecord(),
        metadata: {
          stringValue: 'hello',
          numberValue: 42,
          booleanValue: true,
          nullValue: null,
          arrayValue: [1, 2, 3],
          objectValue: { nested: 'object' }
        }
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-1024] should accept FeedbackRecord with all fields including metadata', () => {
      const valid: FeedbackRecord = {
        id: '1752788100-feedback-complete-with-metadata',
        entityType: 'execution',
        entityId: '1752642000-exec-scan',
        type: 'approval',
        status: 'resolved',
        content: 'Approved with full context and metadata.',
        assignee: 'human:security-lead',
        resolvesFeedbackId: '1752788000-feedback-previous',
        metadata: {
          reviewerId: 'reviewer-456',
          approvalLevel: 'senior',
          context: { source: 'manual-review', priority: 'high' }
        }
      };

      const result = validateFeedbackRecordDetailed(valid);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});

