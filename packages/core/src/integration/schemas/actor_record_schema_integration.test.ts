import { validateActorRecordDetailed } from '../../record_validations/actor_validator';
import type { ActorRecord } from '../../record_types';

describe('ActorRecord Schema Integration Tests', () => {
  /**
   * Helper function to create a minimal valid ActorRecord for integration tests.
   * This is a plain object creation (not using the factory) to test the validator directly.
   * Uses a dummy 44-char publicKey to satisfy schema constraints.
   */
  const createValidActorRecord = (): ActorRecord => ({
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', // 44 chars (Ed25519 base64 length)
    roles: ['developer:backend']
  });

  describe('Root Level Validations (EARS 61)', () => {
    it('[EARS-61] should reject additional properties at root level', () => {
      const invalid = {
        ...createValidActorRecord(),
        extraField: 'not allowed'
      } as ActorRecord & { extraField: string };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.message.includes('additionalProperties') ||
        e.message.includes('must NOT have additional properties')
      )).toBe(true);
    });
  });

  describe('Required Fields Validations (EARS 62-66)', () => {
    it('[EARS-62] should reject missing required field: id', () => {
      const invalid = createValidActorRecord();
      delete (invalid as Partial<ActorRecord>).id;

      const result = validateActorRecordDetailed(invalid as ActorRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('id'))).toBe(true);
    });

    it('[EARS-63] should reject missing required field: type', () => {
      const invalid = createValidActorRecord();
      delete (invalid as Partial<ActorRecord>).type;

      const result = validateActorRecordDetailed(invalid as ActorRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('type'))).toBe(true);
    });

    it('[EARS-64] should reject missing required field: displayName', () => {
      const invalid = createValidActorRecord();
      delete (invalid as Partial<ActorRecord>).displayName;

      const result = validateActorRecordDetailed(invalid as ActorRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('displayName'))).toBe(true);
    });

    it('[EARS-65] should reject missing required field: publicKey', () => {
      const invalid = createValidActorRecord();
      delete (invalid as Partial<ActorRecord>).publicKey;

      const result = validateActorRecordDetailed(invalid as ActorRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('publicKey'))).toBe(true);
    });

    it('[EARS-66] should reject missing required field: roles', () => {
      const invalid = createValidActorRecord();
      delete (invalid as Partial<ActorRecord>).roles;

      const result = validateActorRecordDetailed(invalid as ActorRecord);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('roles'))).toBe(true);
    });
  });

  describe('ID Field Validations (EARS 67-70)', () => {
    it('[EARS-67] should reject invalid id pattern', () => {
      const invalid = {
        ...createValidActorRecord(),
        id: 'invalid-id-format'
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-68] should accept valid human id pattern', () => {
      const valid = {
        ...createValidActorRecord(),
        id: 'human:camilo'
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-69] should accept valid agent id pattern', () => {
      const valid = {
        ...createValidActorRecord(),
        id: 'agent:aion',
        type: 'agent' as const
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-70] should accept valid id pattern with multiple segments', () => {
      const valid = {
        ...createValidActorRecord(),
        id: 'agent:camilo:cursor',
        type: 'agent' as const
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Type Field Validations (EARS 71-73)', () => {
    it('[EARS-71] should accept type "human"', () => {
      const valid = {
        ...createValidActorRecord(),
        type: 'human' as const
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-72] should accept type "agent"', () => {
      const valid = {
        ...createValidActorRecord(),
        id: 'agent:test',
        type: 'agent' as const
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-73] should reject invalid type enum value', () => {
      const invalid = {
        ...createValidActorRecord(),
        type: 'robot' as unknown as 'human' | 'agent'
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });
  });

  describe('DisplayName Field Validations (EARS 74-77)', () => {
    it('[EARS-74] should reject empty displayName string (minLength: 1)', () => {
      const invalid = {
        ...createValidActorRecord(),
        displayName: ''
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('displayName') && (e.message.includes('minLength') || e.message.includes('fewer than'))
      )).toBe(true);
    });

    it('[EARS-75] should accept displayName with exactly 1 character (minLength boundary)', () => {
      const valid = {
        ...createValidActorRecord(),
        displayName: 'A'
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-76] should reject displayName exceeding 100 characters', () => {
      const invalid = {
        ...createValidActorRecord(),
        displayName: 'A'.repeat(101)
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('displayName') && (e.message.includes('maxLength') || e.message.includes('more than'))
      )).toBe(true);
    });

    it('[EARS-77] should accept displayName with exactly 100 characters (maxLength boundary)', () => {
      const valid = {
        ...createValidActorRecord(),
        displayName: 'A'.repeat(100)
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('PublicKey Field Validations (EARS 78-80)', () => {
    it('[EARS-78] should reject publicKey with less than 44 characters', () => {
      const invalid = {
        ...createValidActorRecord(),
        publicKey: 'short'
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('publicKey') && (e.message.includes('minLength') || e.message.includes('fewer than'))
      )).toBe(true);
    });

    it('[EARS-79] should reject publicKey with more than 44 characters', () => {
      const invalid = {
        ...createValidActorRecord(),
        publicKey: 'A'.repeat(45)
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('publicKey') && (e.message.includes('maxLength') || e.message.includes('more than'))
      )).toBe(true);
    });

    it('[EARS-80] should accept publicKey with exactly 44 characters (Ed25519 base64 length)', () => {
      const valid = {
        ...createValidActorRecord(),
        publicKey: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      };

      expect(valid.publicKey.length).toBe(44);
      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Roles Array Validations (EARS 81-86)', () => {
    it('[EARS-81] should reject empty roles array (minItems: 1)', () => {
      const invalid = {
        ...createValidActorRecord(),
        roles: []
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && (e.message.includes('minItems') || e.message.includes('fewer than'))
      )).toBe(true);
    });

    it('[EARS-82] should accept roles array with at least 1 item', () => {
      const valid = {
        ...createValidActorRecord(),
        roles: ['developer']
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-83] should reject role item with invalid pattern', () => {
      const invalid = {
        ...createValidActorRecord(),
        roles: ['Invalid-Role!']
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-84] should accept role item with valid pattern', () => {
      const valid = {
        ...createValidActorRecord(),
        roles: ['developer:backend:go', 'auditor']
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-85] should reject roles with duplicates (uniqueItems)', () => {
      const invalid = {
        ...createValidActorRecord(),
        roles: ['developer', 'developer']
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && (e.message.includes('unique') || e.message.includes('duplicate'))
      )).toBe(true);
    });

    it('[EARS-86] should accept multiple unique roles', () => {
      const valid = {
        ...createValidActorRecord(),
        roles: ['developer:backend', 'auditor', 'planner:ai']
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Status Field Validations (EARS 87-90)', () => {
    it('[EARS-87] should accept status "active"', () => {
      const valid = {
        ...createValidActorRecord(),
        status: 'active' as const
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-88] should accept status "revoked"', () => {
      const valid = {
        ...createValidActorRecord(),
        status: 'revoked' as const
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-89] should reject invalid status enum value', () => {
      const invalid = {
        ...createValidActorRecord(),
        status: 'suspended' as unknown as 'active' | 'revoked'
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') &&
        (e.message.includes('enum') || e.message.includes('must be equal to one of'))
      )).toBe(true);
    });

    it('[EARS-90] should accept absence of status field (optional)', () => {
      const valid = createValidActorRecord();
      // status is optional, so not including it should be valid

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('SupersededBy Field Validations (EARS 91-93)', () => {
    it('[EARS-91] should reject invalid supersededBy pattern', () => {
      const invalid = {
        ...createValidActorRecord(),
        supersededBy: 'invalid-format'
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('supersededBy') && e.message.includes('pattern')
      )).toBe(true);
    });

    it('[EARS-92] should accept valid supersededBy pattern', () => {
      const valid = {
        ...createValidActorRecord(),
        supersededBy: 'human:new-user'
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-93] should accept absence of supersededBy field (optional)', () => {
      const valid = createValidActorRecord();
      // supersededBy is optional, so not including it should be valid

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Metadata Field Validations (EARS 94-96)', () => {
    it('[EARS-94] should accept empty metadata object', () => {
      const valid = {
        ...createValidActorRecord(),
        metadata: {}
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-95] should accept metadata with arbitrary properties', () => {
      const valid = {
        ...createValidActorRecord(),
        metadata: {
          version: '1.2.0',
          source: 'https://github.com/...',
          team: 'frontend'
        }
      };

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });

    it('[EARS-96] should accept absence of metadata field (optional)', () => {
      const valid = createValidActorRecord();
      // metadata is optional, so not including it should be valid

      const result = validateActorRecordDetailed(valid);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Type Validations (EARS 97-105)', () => {
    it('[EARS-97] should reject id with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        id: 123 as unknown as string
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('id') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-98] should reject type with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        type: 123 as unknown as 'human' | 'agent'
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('type') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-99] should reject displayName with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        displayName: 123 as unknown as string
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('displayName') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-100] should reject publicKey with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        publicKey: 123 as unknown as string
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('publicKey') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-101] should reject roles with non-array type', () => {
      const invalid = {
        ...createValidActorRecord(),
        roles: 'not-an-array' as unknown as string[]
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && e.message.includes('array')
      )).toBe(true);
    });

    it('[EARS-102] should reject role item with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        roles: [123 as unknown as string]
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('roles') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-103] should reject status with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        status: 123 as unknown as string
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('status') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-104] should reject supersededBy with non-string type', () => {
      const invalid = {
        ...createValidActorRecord(),
        supersededBy: 123 as unknown as string
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('supersededBy') && e.message.includes('string')
      )).toBe(true);
    });

    it('[EARS-105] should reject metadata with non-object type', () => {
      const invalid = {
        ...createValidActorRecord(),
        metadata: 'not-an-object' as unknown as Record<string, unknown>
      };

      const result = validateActorRecordDetailed(invalid);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.field.includes('metadata') && e.message.includes('object')
      )).toBe(true);
    });
  });
});

