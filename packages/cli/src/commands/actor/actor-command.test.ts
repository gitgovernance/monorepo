// Mock @gitgov/core FIRST to avoid import.meta issues in Jest
jest.mock('@gitgov/core', () => ({
  Records: {},
  Factories: {}
}));

// Mock DependencyInjectionService before importing
jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn()
  }
}));

import { ActorCommand } from './actor-command';
import { DependencyInjectionService } from '../../services/dependency-injection';
import type { ActorRecord } from '@gitgov/core';

// Mock console methods to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

describe('ActorCommand', () => {
  let actorCommand: ActorCommand;
  let mockIdentityAdapter: {
    createActor: jest.MockedFunction<(payload: Partial<ActorRecord>, signerId: string) => Promise<ActorRecord>>;
    rotateActorKey: jest.MockedFunction<(actorId: string) => Promise<{ oldActor: ActorRecord; newActor: ActorRecord }>>;
  };

  const sampleActor: ActorRecord = {
    id: 'human:test-user',
    type: 'human',
    displayName: 'Test User',
    publicKey: 'test-public-key',
    roles: ['developer'],
    status: 'active'
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockIdentityAdapter = {
      createActor: jest.fn(),
      rotateActorKey: jest.fn()
    };

    const mockDependencyService = {
      getIdentityAdapter: jest.fn().mockResolvedValue(mockIdentityAdapter)
    };

    (DependencyInjectionService.getInstance as jest.MockedFunction<typeof DependencyInjectionService.getInstance>)
      .mockReturnValue(mockDependencyService as never);

    actorCommand = new ActorCommand();
  });

  afterEach(() => {
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockProcessExit.mockClear();
  });

  describe('4.1. Actor Creation (ICOMP-C4 to ICOMP-C6)', () => {
    it('[ICOMP-C4] WHEN actor new is executed with valid flags THE SYSTEM SHALL create ActorRecord with keys', async () => {
      mockIdentityAdapter.createActor.mockResolvedValue(sampleActor);

      await actorCommand.executeNew({
        type: 'human',
        name: 'Test User',
        role: ['developer'],
        json: true
      });

      expect(mockIdentityAdapter.createActor).toHaveBeenCalledWith(
        {
          type: 'human',
          displayName: 'Test User',
          roles: ['developer'],
        },
        'self'
      );

      // Verify JSON output
      expect(mockConsoleLog).toHaveBeenCalled();
      const outputCall = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success"')
      );
      expect(outputCall).toBeDefined();
      const output = JSON.parse(outputCall![0]);
      expect(output.success).toBe(true);
      expect(output.data.actorId).toBe('human:test-user');
      expect(output.data.type).toBe('human');
      expect(output.data.displayName).toBe('Test User');
      expect(output.data.roles).toEqual(['developer']);
    });

    it('[ICOMP-C5] WHEN actor new is executed with invalid type THE SYSTEM SHALL fail with error', async () => {
      mockIdentityAdapter.createActor.mockRejectedValue(
        new Error('ActorRecord requires type and displayName')
      );

      await actorCommand.executeNew({
        type: 'invalid' as 'human',
        name: 'Bad Actor',
        role: ['developer']
      });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create actor')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[ICOMP-C6] WHEN --json flag is provided THE SYSTEM SHALL output JSON with success and data fields', async () => {
      mockIdentityAdapter.createActor.mockResolvedValue(sampleActor);

      await actorCommand.executeNew({
        type: 'human',
        name: 'Test User',
        role: ['developer'],
        json: true
      });

      expect(mockConsoleLog).toHaveBeenCalled();
      const outputCall = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success"')
      );
      expect(outputCall).toBeDefined();
      const output = JSON.parse(outputCall![0]);
      expect(output.success).toBe(true);
      expect(output.data).toBeDefined();
      expect(output.data.actorId).toBeDefined();
      expect(output.data.type).toBeDefined();
      expect(output.data.displayName).toBeDefined();
      expect(output.data.roles).toBeDefined();
    });
  });

  describe('4.2. Key Rotation (EARS-4)', () => {
    it('[EARS-4] WHEN actor rotate-key is executed THE SYSTEM SHALL create versioned successor and revoke old', async () => {
      const oldActor: ActorRecord = {
        ...sampleActor,
        status: 'revoked',
        supersededBy: 'human:test-user-v2'
      };
      const newActor: ActorRecord = {
        ...sampleActor,
        id: 'human:test-user-v2',
        publicKey: 'new-public-key'
      };

      mockIdentityAdapter.rotateActorKey.mockResolvedValue({ oldActor, newActor });

      await actorCommand.executeRotateKey('human:test-user', { json: true });

      expect(mockIdentityAdapter.rotateActorKey).toHaveBeenCalledWith('human:test-user');

      // Verify JSON output
      expect(mockConsoleLog).toHaveBeenCalled();
      const outputCall = mockConsoleLog.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"success"')
      );
      expect(outputCall).toBeDefined();
      const output = JSON.parse(outputCall![0]);
      expect(output.success).toBe(true);
      expect(output.data.oldActorId).toBe('human:test-user');
      expect(output.data.newActorId).toBe('human:test-user-v2');
      expect(output.data.status).toBe('rotated');
    });

    it('[EARS-4b] WHEN actor rotate-key is executed with non-existent actor THE SYSTEM SHALL fail with error', async () => {
      mockIdentityAdapter.rotateActorKey.mockRejectedValue(
        new Error('ActorRecord with id non-existent not found')
      );

      await actorCommand.executeRotateKey('non-existent', {});

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to rotate key')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});
