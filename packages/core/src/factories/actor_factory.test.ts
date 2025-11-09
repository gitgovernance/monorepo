import { createActorRecord } from './actor_factory';
import type { ActorRecord } from '../types';
import { DetailedValidationError } from '../validation/common';

// Mock the validator to control test outcomes
jest.mock('../validation/actor_validator', () => ({
  validateActorRecordDetailed: jest.fn(() => ({ isValid: true, errors: [] })),
}));

describe('createActorRecord', () => {
  beforeEach(() => {
    // Reset mock to default success state before each test
    const { validateActorRecordDetailed } = require('../validation/actor_validator');
    (validateActorRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-2 & EARS-3] should create a valid actor record with defaults and a generated ID', async () => {
    const payload: Partial<ActorRecord> = {
      type: 'human',
      displayName: 'Test User',
      publicKey: 'some-key',
      roles: ['author'],
    };
    const actor = createActorRecord(payload);
    expect(actor.id).toContain('human:test-user'); // ID is generated
    expect(actor.status).toBe('active');
    expect(actor.type).toBe('human');
    expect(actor.displayName).toBe('Test User');
  });

  it('[EARS-1] should throw DetailedValidationError for missing/invalid fields', () => {
    const { validateActorRecordDetailed } = require('../validation/actor_validator');
    (validateActorRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'type', message: 'must be one of: human, agent', value: 'human' },
        { field: 'displayName', message: 'must be a non-empty string', value: '' }
      ]
    });

    const payload: Partial<ActorRecord> = {
      displayName: 'Test User',
      publicKey: 'some-key',
    };
    expect(() => createActorRecord(payload)).toThrow(DetailedValidationError);
  });

  it('[EARS-4] should use a provided ID instead of generating one', () => {
    const payload: Partial<ActorRecord> = {
      id: 'human:custom-id',
      type: 'human',
      displayName: 'Test User',
      publicKey: 'some-key',
      roles: ['author'],
    };
    const actor = createActorRecord(payload);
    expect(actor.id).toBe('human:custom-id');
  });

  it('[EARS-5] should throw DetailedValidationError if the created record fails validation', () => {
    // Override the mock for this specific test
    const { validateActorRecordDetailed } = require('../validation/actor_validator');
    (validateActorRecordDetailed as jest.Mock).mockReturnValue({
      isValid: false,
      errors: [
        { field: 'publicKey', message: 'invalid key format', value: 'some-key' }
      ]
    });

    const payload: Partial<ActorRecord> = {
      type: 'human',
      displayName: 'Test User',
      publicKey: 'some-key',
      roles: ['author'],
    };
    expect(() => createActorRecord(payload)).toThrow(DetailedValidationError);

    // Restore the mock
    (validateActorRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
  });

  it('[EARS-6] should set default values for optional fields', async () => {
    const payload: Partial<ActorRecord> = {
      type: 'human',
      displayName: 'Minimal User',
    };

    const actor = createActorRecord(payload);

    expect(actor.status).toBe('active'); // Default status
    expect(actor.roles).toEqual(['author']); // Default roles
    expect(actor.publicKey).toBe(''); // Default empty string
  });

  it('[EARS-7] should preserve provided optional fields', async () => {
    const payload: Partial<ActorRecord> = {
      type: 'agent',
      displayName: 'Complex Agent',
      publicKey: 'custom-public-key',
      roles: ['author', 'reviewer', 'approver'],
      status: 'revoked'
    };

    const actor = createActorRecord(payload);

    expect(actor.status).toBe('revoked'); // Custom status preserved
    expect(actor.roles).toEqual(['author', 'reviewer', 'approver']);
    expect(actor.publicKey).toBe('custom-public-key');
  });

  it('[EARS-8] should generate ID from type and displayName when not provided', async () => {
    const payload: Partial<ActorRecord> = {
      type: 'human',
      displayName: 'Test User for ID Generation',
      publicKey: 'some-key',
      roles: ['author'],
    };

    const actor = createActorRecord(payload);

    expect(actor.id).toBe('human:test-user-for-id-generation');
    expect(actor.type).toBe('human');
    expect(actor.displayName).toBe('Test User for ID Generation');
  });

  describe('ActorRecord Specific Factory Operations (EARS 9-11)', () => {
    it('[EARS-9] should apply appropriate defaults for human type', async () => {
      const payload: Partial<ActorRecord> = {
        type: 'human',
        displayName: 'Human User',
        publicKey: 'test-key',
        roles: ['developer']
      };

      const actor = createActorRecord(payload);

      expect(actor.type).toBe('human');
      expect(actor.status).toBe('active'); // Default for humans
    });

    it('[EARS-10] should apply appropriate defaults for agent type', async () => {
      const payload: Partial<ActorRecord> = {
        type: 'agent',
        displayName: 'AI Agent',
        publicKey: 'agent-key',
        roles: ['assistant']
      };

      const actor = createActorRecord(payload);

      expect(actor.type).toBe('agent');
      expect(actor.status).toBe('active'); // Default for agents
    });

    it('[EARS-11] should throw DetailedValidationError when roles is missing', () => {
      const { validateActorRecordDetailed } = require('../validation/actor_validator');
      (validateActorRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'roles', message: 'must have at least 1 items', value: [] }
        ]
      });

      const payload: Partial<ActorRecord> = {
        type: 'human',
        displayName: 'User Without Roles',
        publicKey: 'test-key'
        // roles missing - should trigger validation error
      };

      expect(() => createActorRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateActorRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });

    it('[EARS-11] should throw DetailedValidationError when roles is empty array', () => {
      const { validateActorRecordDetailed } = require('../validation/actor_validator');
      (validateActorRecordDetailed as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [
          { field: 'roles', message: 'must have at least 1 items', value: [] }
        ]
      });

      // Create payload with empty roles array - using object literal to bypass TypeScript checking
      const invalidRoles: string[] = [];
      const payload: Partial<ActorRecord> = {
        type: 'human',
        displayName: 'User With Empty Roles',
        publicKey: 'test-key',
        roles: invalidRoles as [string, ...string[]] // Type assertion to match expected type
      };

      expect(() => createActorRecord(payload)).toThrow(DetailedValidationError);

      // Restore mock
      (validateActorRecordDetailed as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
    });
  });
});
