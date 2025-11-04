import { validateChangelogRecordDetailed } from '../../validation/changelog_validator';
import type { ChangelogRecord } from '../../types';

describe('ChangelogRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid ChangelogRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   */
  const createValidChangelogRecord = (): ChangelogRecord => ({
    id: '1234567890-changelog-test',
    title: 'Test Changelog',
    description: 'This is a valid test description with more than 20 characters.',
    relatedTasks: ['1234567890-task-test-task'],
    completedAt: 1752707800
  });

  describe('Root Level & Required Fields (EARS 465-470)', () => {
    it('[EARS-465] should reject additional properties at root level', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        customField: 'not-allowed-because-additionalProperties-false'
      } as ChangelogRecord & { customField: string };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additional') || e.message.includes('should NOT have additional properties')
      )).toBe(true);
    });

    it('[EARS-466] should reject missing required field: id', () => {
      const invalid = createValidChangelogRecord();
      delete (invalid as Partial<ChangelogRecord>).id;

      const result = validateChangelogRecordDetailed(invalid as ChangelogRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('id') || e.field === 'id'
      )).toBe(true);
    });

    it('[EARS-467] should reject missing required field: title', () => {
      const invalid = createValidChangelogRecord();
      delete (invalid as Partial<ChangelogRecord>).title;

      const result = validateChangelogRecordDetailed(invalid as ChangelogRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('title') || e.field === 'title'
      )).toBe(true);
    });

    it('[EARS-468] should reject missing required field: description', () => {
      const invalid = createValidChangelogRecord();
      delete (invalid as Partial<ChangelogRecord>).description;

      const result = validateChangelogRecordDetailed(invalid as ChangelogRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('description') || e.field === 'description'
      )).toBe(true);
    });

    it('[EARS-469] should reject missing required field: relatedTasks', () => {
      const invalid = createValidChangelogRecord();
      delete (invalid as Partial<ChangelogRecord>).relatedTasks;

      const result = validateChangelogRecordDetailed(invalid as ChangelogRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('relatedTasks') || e.field === 'relatedTasks'
      )).toBe(true);
    });

    it('[EARS-470] should reject missing required field: completedAt', () => {
      const invalid = createValidChangelogRecord();
      delete (invalid as Partial<ChangelogRecord>).completedAt;

      const result = validateChangelogRecordDetailed(invalid as ChangelogRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('completedAt') || e.field === 'completedAt'
      )).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 471-484)', () => {
    it('[EARS-471] should reject id with invalid pattern', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: 'invalid-id-format'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-472] should accept valid id', () => {
      const valid = {
        ...createValidChangelogRecord(),
        id: '1752707800-changelog-sistema-autenticacion-v1'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-473] should reject id exceeding maxLength 71', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-' + 'a'.repeat(51) // 21 + 51 = 72, exceeds maxLength 71
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-474] should reject non-string id', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: 123 as unknown as string
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-475] should accept id with slug of 1 char', () => {
      const valid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-a'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-476] should accept id with slug of 50 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        // Pattern allows {1,50} and maxLength is 71
        // (10 digits + 11 chars "-changelog-" + 50 slug = 71 total)
        id: '1234567890-changelog-' + 'a'.repeat(50)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-477] should reject id with uppercase in slug', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-InvalidSlug'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-478] should reject id with special chars in slug', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-invalid_slug'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-479] should accept id with valid 10-digit timestamp', () => {
      const valid = {
        ...createValidChangelogRecord(),
        id: '9999999999-changelog-valid'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-480] should reject id with 9-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: '123456789-changelog-test'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-481] should reject id with 11-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        id: '12345678901-changelog-test'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-482] should accept id slug with only numbers', () => {
      const valid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-12345'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-483] should accept id slug with only lowercase letters', () => {
      const valid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-sistema'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-484] should accept id slug with mixed chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        id: '1234567890-changelog-abc-123-xyz'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Title Field Validations (EARS 485-495)', () => {
    it('[EARS-485] should reject title with less than 10 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        title: 'Too short'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-486] should accept title with 10 or more chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        title: '1234567890'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-487] should reject title exceeding maxLength 150', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        title: 'a'.repeat(151)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-488] should reject non-string title', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        title: 123 as unknown as string
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-489] should accept title with special chars and unicode', () => {
      const valid = {
        ...createValidChangelogRecord(),
        title: 'Sistema de Autenticación 🚀 con ñ'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-490] should accept title with exactly 10 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        title: 'a'.repeat(10)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-491] should accept title with exactly 150 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        title: 'a'.repeat(150)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-492] should reject title with 9 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        title: 'a'.repeat(9)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-493] should reject title with 151 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        title: 'a'.repeat(151)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-494] should accept title with 80 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        title: 'a'.repeat(80)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-495] should reject empty title', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        title: ''
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('title') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });
  });

  describe('Description Field Validations (EARS 496-506)', () => {
    it('[EARS-496] should reject description with less than 20 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        description: 'Too short'
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-497] should accept description with 20 or more chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        description: '12345678901234567890'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-498] should reject description exceeding maxLength 5000', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        description: 'a'.repeat(5001)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-499] should reject non-string description', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        description: 123 as unknown as string
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-500] should accept description with special chars and markdown', () => {
      const valid = {
        ...createValidChangelogRecord(),
        description: `
## Changelog Entry

- Feature 1
- Feature 2

**Bold text** and *italic* with special chars: !@#$%^&*()
        `.trim()
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-501] should accept description with exactly 20 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        description: 'a'.repeat(20)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-502] should accept description with exactly 5000 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        description: 'a'.repeat(5000)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-503] should reject description with 19 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        description: 'a'.repeat(19)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });

    it('[EARS-504] should reject description with 5001 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        description: 'a'.repeat(5001)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && (e.message.includes('more than') || e.message.includes('maxLength'))
      )).toBe(true);
    });

    it('[EARS-505] should accept description with 2500 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        description: 'a'.repeat(2500)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-506] should reject empty description', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        description: ''
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('description') && (e.message.includes('fewer than') || e.message.includes('minLength'))
      )).toBe(true);
    });
  });

  describe('RelatedTasks Field Validations (EARS 507-524)', () => {
    it('[EARS-507] should reject non-array relatedTasks', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: 'not-an-array' as unknown as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-508] should reject empty relatedTasks array', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: [] as unknown as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && (e.message.includes('minItems') || e.message.includes('fewer than'))
      )).toBe(true);
    });

    it('[EARS-509] should accept relatedTasks with exactly 1 valid item', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1752274500-task-crear-ui-login'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-510] should accept relatedTasks with multiple valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: [
          '1752274500-task-crear-ui-login',
          '1752274600-task-integrar-oauth2-backend',
          '1752274700-task-implementar-2fa-totp'
        ] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-511] should reject relatedTasks with non-string item', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: [123] as unknown as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-512] should reject relatedTasks item with invalid pattern', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['invalid-task-id'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-513] should accept relatedTasks item with valid pattern', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1752274500-task-valid-task-id'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-514] should reject relatedTasks item with 9-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['123456789-task-test'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-515] should reject relatedTasks item with 11-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['12345678901-task-test'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-516] should accept relatedTasks item with 10-digit timestamp', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1234567890-task-valid'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-517] should accept relatedTasks item with slug of 1 char', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1234567890-task-a'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-518] should accept relatedTasks item with slug of 50 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1234567890-task-' + 'a'.repeat(50)] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-519] should reject relatedTasks item with slug of 51 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1234567890-task-' + 'a'.repeat(51)] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-520] should reject relatedTasks item with uppercase in slug', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1234567890-task-InvalidSlug'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-521] should reject relatedTasks item with special chars in slug', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: ['1234567890-task-invalid_slug'] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-522] should accept relatedTasks with 5 valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: [
          '1752274500-task-task1',
          '1752274600-task-task2',
          '1752274700-task-task3',
          '1752274800-task-task4',
          '1752274900-task-task5'
        ] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-523] should accept relatedTasks with duplicate items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedTasks: [
          '1752274500-task-task1',
          '1752274500-task-task1'
        ] as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-524] should reject null relatedTasks', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedTasks: null as unknown as [string, ...string[]]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedTasks') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });
  });

  describe('CompletedAt Field Validations (EARS 525-532)', () => {
    it('[EARS-525] should reject non-number completedAt', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        completedAt: '1752707800' as unknown as number
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('completedAt') && e.message.includes('number')
      )).toBe(true);
    });

    it('[EARS-526] should reject negative completedAt', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        completedAt: -1
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('completedAt') && (
          e.message.includes('minimum') ||
          e.message.includes('greater') ||
          e.message.includes('>=') ||
          e.message.includes('must be')
        )
      )).toBe(true);
    });

    it('[EARS-527] should accept completedAt with value 0', () => {
      const valid = {
        ...createValidChangelogRecord(),
        completedAt: 0
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-528] should accept positive completedAt', () => {
      const valid = {
        ...createValidChangelogRecord(),
        completedAt: 1752707800
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-529] should accept completedAt with current Unix timestamp', () => {
      const valid = {
        ...createValidChangelogRecord(),
        completedAt: Math.floor(Date.now() / 1000)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-530] should accept completedAt with very large value', () => {
      const valid = {
        ...createValidChangelogRecord(),
        completedAt: 9999999999
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-531] should reject null completedAt', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        completedAt: null as unknown as number
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('completedAt') && (e.message.includes('number') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-532] should reject string completedAt', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        completedAt: '1752707800' as unknown as number
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('completedAt') && e.message.includes('number')
      )).toBe(true);
    });
  });

  describe('RelatedCycles Field Validations (EARS 533-548)', () => {
    it('[EARS-533] should accept missing relatedCycles', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-534] should accept empty relatedCycles array', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: []
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-535] should reject non-array relatedCycles', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: 'not-an-array' as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-536] should reject relatedCycles with non-string item', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: [123] as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-537] should reject relatedCycles item with invalid pattern', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['invalid-cycle-id']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-538] should accept relatedCycles item with valid pattern', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['1752200000-cycle-q1-auth-milestone']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-539] should accept relatedCycles with multiple valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: [
          '1752200000-cycle-q1-2024',
          '1752300000-cycle-q2-2024'
        ]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-540] should reject relatedCycles item with 9-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['123456789-cycle-test']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-541] should reject relatedCycles item with 11-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['12345678901-cycle-test']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-542] should accept relatedCycles item with slug of 1 char', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['1234567890-cycle-a']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-543] should accept relatedCycles item with slug of 50 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['1234567890-cycle-' + 'a'.repeat(50)]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-544] should reject relatedCycles item with slug of 51 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['1234567890-cycle-' + 'a'.repeat(51)]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-545] should reject relatedCycles item with uppercase in slug', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['1234567890-cycle-InvalidSlug']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-546] should accept relatedCycles with duplicate items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: [
          '1752200000-cycle-q1-2024',
          '1752200000-cycle-q1-2024'
        ]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-547] should reject null relatedCycles', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedCycles: null as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedCycles') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-548] should accept relatedCycles with 1 valid item', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedCycles: ['1752200000-cycle-q1-2024']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('RelatedExecutions Field Validations (EARS 549-564)', () => {
    it('[EARS-549] should accept missing relatedExecutions', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-550] should accept empty relatedExecutions array', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: []
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-551] should reject non-array relatedExecutions', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: 'not-an-array' as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-552] should reject relatedExecutions with non-string item', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: [123] as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-553] should reject relatedExecutions item with invalid pattern', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['invalid-exec-id']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-554] should accept relatedExecutions item with valid pattern', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['1752274550-exec-analisis-auth-providers']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-555] should accept relatedExecutions with multiple valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: [
          '1752274550-exec-analisis-auth',
          '1752707750-exec-final-integration'
        ]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-556] should reject relatedExecutions item with 9-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['123456789-exec-test']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-557] should reject relatedExecutions item with 11-digit timestamp', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['12345678901-exec-test']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-558] should accept relatedExecutions item with slug of 1 char', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['1234567890-exec-a']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-559] should accept relatedExecutions item with slug of 50 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['1234567890-exec-' + 'a'.repeat(50)]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-560] should reject relatedExecutions item with slug of 51 chars', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['1234567890-exec-' + 'a'.repeat(51)]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-561] should reject relatedExecutions item with uppercase in slug', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['1234567890-exec-InvalidSlug']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-562] should accept relatedExecutions with duplicate items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: [
          '1752274550-exec-test',
          '1752274550-exec-test'
        ]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-563] should reject null relatedExecutions', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        relatedExecutions: null as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('relatedExecutions') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-564] should accept relatedExecutions with 1 valid item', () => {
      const valid = {
        ...createValidChangelogRecord(),
        relatedExecutions: ['1752274550-exec-test']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Version Field Validations (EARS 565-574)', () => {
    it('[EARS-565] should accept missing version', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-566] should reject empty version', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        version: ''
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('version') && (e.message.includes('minLength') || e.message.includes('fewer than'))
      )).toBe(true);
    });

    it('[EARS-567] should accept version with 1 or more chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        version: 'v'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-568] should reject version exceeding maxLength 50', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        version: 'v' + 'a'.repeat(50)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('version') && (e.message.includes('maxLength') || e.message.includes('more than'))
      )).toBe(true);
    });

    it('[EARS-569] should reject non-string version', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        version: 123 as unknown as string
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('version') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-570] should accept version with semver format', () => {
      const valid = {
        ...createValidChangelogRecord(),
        version: 'v1.0.0'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-571] should accept version with sprint format', () => {
      const valid = {
        ...createValidChangelogRecord(),
        version: 'sprint-24'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-572] should accept version with exactly 1 char', () => {
      const valid = {
        ...createValidChangelogRecord(),
        version: 'a'
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-573] should accept version with exactly 50 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        version: 'a'.repeat(50)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-574] should reject null version', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        version: null as unknown as string
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('version') && (e.message.includes('string') || e.message.includes('null'))
      )).toBe(true);
    });
  });

  describe('Tags Field Validations (EARS 575-589)', () => {
    it('[EARS-575] should accept missing tags', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-576] should accept empty tags array', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: []
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-577] should reject non-array tags', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: 'not-an-array' as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-578] should reject tags with non-string item', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: [123] as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-579] should reject tags item with invalid pattern', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: ['Invalid_Tag']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-580] should accept tags with simple valid item', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: ['feature']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-581] should accept tags item with namespace', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: ['feature:auth']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-582] should accept tags item with multiple namespaces', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: ['team:backend:api']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-583] should accept tags with multiple valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: ['feature:auth', 'security', 'frontend']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-584] should reject tags item with uppercase', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: ['Feature']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-585] should reject tags item with underscore', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: ['feature_auth']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-586] should reject tags item with spaces', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: ['feature auth']
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-587] should accept tags with duplicate items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: ['feature', 'feature']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-588] should reject null tags', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        tags: null as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('tags') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-589] should accept tags with 1 valid item', () => {
      const valid = {
        ...createValidChangelogRecord(),
        tags: ['feature']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Commits Field Validations (EARS 590-599)', () => {
    it('[EARS-590] should accept missing commits', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-591] should accept empty commits array', () => {
      const valid = {
        ...createValidChangelogRecord(),
        commits: []
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-592] should reject non-array commits', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        commits: 'not-an-array' as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('commits') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-593] should reject commits with non-string item', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        commits: [123] as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('commits') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-594] should reject commits item exceeding maxLength 100', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        commits: ['a'.repeat(101)]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('commits') && (e.message.includes('maxLength') || e.message.includes('more than'))
      )).toBe(true);
    });

    it('[EARS-595] should accept commits with valid short hash', () => {
      const valid = {
        ...createValidChangelogRecord(),
        commits: ['abc123def']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-596] should accept commits with valid long hash', () => {
      const valid = {
        ...createValidChangelogRecord(),
        commits: ['1234567890abcdef1234567890abcdef12345678'] // 40 chars SHA-1
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-597] should accept commits with multiple valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        commits: ['abc123def', '456ghi789', 'jkl012mno']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-598] should reject null commits', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        commits: null as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('commits') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-599] should accept commits item with exactly 100 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        commits: ['a'.repeat(100)]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Files Field Validations (EARS 600-609)', () => {
    it('[EARS-600] should accept missing files', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-601] should accept empty files array', () => {
      const valid = {
        ...createValidChangelogRecord(),
        files: []
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-602] should reject non-array files', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        files: 'not-an-array' as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('files') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-603] should reject files with non-string item', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        files: [123] as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('files') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-604] should reject files item exceeding maxLength 500', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        files: ['a'.repeat(501)]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('files') && (e.message.includes('maxLength') || e.message.includes('more than'))
      )).toBe(true);
    });

    it('[EARS-605] should accept files with valid relative path', () => {
      const valid = {
        ...createValidChangelogRecord(),
        files: ['src/pages/Login.tsx']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-606] should accept files with valid absolute path', () => {
      const valid = {
        ...createValidChangelogRecord(),
        files: ['/usr/local/app/src/services/auth.ts']
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-607] should accept files with multiple valid items', () => {
      const valid = {
        ...createValidChangelogRecord(),
        files: [
          'src/pages/Login.tsx',
          'src/services/auth.ts',
          'e2e/auth.spec.ts'
        ]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-608] should reject null files', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        files: null as unknown as string[]
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('files') && (e.message.includes('array') || e.message.includes('null'))
      )).toBe(true);
    });

    it('[EARS-609] should accept files item with exactly 500 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        files: ['a'.repeat(500)]
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Notes Field Validations (EARS 610-614)', () => {
    it('[EARS-610] should accept missing notes', () => {
      const valid = createValidChangelogRecord();

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-611] should accept empty notes', () => {
      const valid = {
        ...createValidChangelogRecord(),
        notes: ''
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-612] should reject notes exceeding maxLength 3000', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        notes: 'a'.repeat(3001)
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && (e.message.includes('maxLength') || e.message.includes('more than'))
      )).toBe(true);
    });

    it('[EARS-613] should reject non-string notes', () => {
      const invalid = {
        ...createValidChangelogRecord(),
        notes: 123 as unknown as string
      };

      const result = validateChangelogRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('notes') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-614] should accept notes with exactly 3000 chars', () => {
      const valid = {
        ...createValidChangelogRecord(),
        notes: 'a'.repeat(3000)
      };

      const result = validateChangelogRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });
});

