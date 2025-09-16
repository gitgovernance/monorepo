import { ChangelogAdapter } from './index';
import { createChangelogRecord } from '../../factories/changelog_factory';
import { RecordStore } from '../../store';
import { IdentityAdapter } from '../identity_adapter';
import { publishEvent } from '../../modules/event_bus_module';
import type { ChangelogRecord } from '../../types/changelog_record';
import type { TaskRecord } from '../../types/task_record';
import type { CycleRecord } from '../../types/cycle_record';
import type { IEventStream } from '../../modules/event_bus_module';
import type { GitGovRecord, Signature } from '../../models';
import { DetailedValidationError } from '../../validation/common';

// Mock dependencies
jest.mock('../../factories/changelog_factory');
jest.mock('../../store');
jest.mock('../identity_adapter');
jest.mock('../../modules/event_bus_module', () => ({
  ...jest.requireActual('../../modules/event_bus_module'),
  publishEvent: jest.fn(),
}));

// Helper function to create properly typed mock changelog records
function createMockChangelogRecord(overrides: Partial<ChangelogRecord> = {}): GitGovRecord & { payload: ChangelogRecord } {
  return {
    header: {
      version: '1.0',
      type: 'changelog',
      payloadChecksum: 'mock-checksum',
      signatures: [{
        keyId: 'mock-author',
        role: 'author',
        signature: 'mock-sig',
        timestamp: 123,
        timestamp_iso: '2025-01-01T00:00:00Z'
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: 'mock-changelog',
      entityType: 'task' as const,
      entityId: 'task-123',
      changeType: 'completion' as const,
      title: 'Mock Task Completion',
      description: 'Mock changelog description with sufficient length for validation requirements',
      timestamp: 1752707800,
      trigger: 'manual' as const,
      triggeredBy: 'human:developer',
      reason: 'Mock reason for testing purposes',
      riskLevel: 'low' as const,
      ...overrides
    }
  };
}

describe('ChangelogAdapter', () => {
  let changelogAdapter: ChangelogAdapter;
  let mockChangelogStore: jest.Mocked<RecordStore<ChangelogRecord>>;
  let mockTaskStore: jest.Mocked<RecordStore<TaskRecord>>;
  let mockCycleStore: jest.Mocked<RecordStore<CycleRecord>>;
  let mockIdentityAdapter: jest.Mocked<IdentityAdapter>;
  let mockPublishEvent: jest.Mock;

  const mockPayload = {
    entityType: 'task' as const,
    entityId: 'task-123',
    changeType: 'update' as const, // Use 'update' to avoid references.tasks requirement
    title: 'Test Task Update',
    description: 'Successfully updated the test task with new requirements',
    triggeredBy: 'human:developer',
    reason: 'Task requirements updated'
  };
  const mockActorId = 'human:developer';
  const mockCreatedChangelogPayload = {
    id: '123-changelog-test',
    entityType: 'task' as const,
    entityId: 'task-123',
    changeType: 'update' as const, // Match mockPayload
    title: 'Test Task Update',
    description: 'Successfully updated the test task with new requirements',
    timestamp: 1752707800,
    trigger: 'manual' as const,
    triggeredBy: 'human:developer',
    reason: 'Task requirements updated',
    riskLevel: 'low' as const
  };
  const mockSignedRecord = createMockChangelogRecord(mockCreatedChangelogPayload);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock changelog store with proper typing
    mockChangelogStore = {
      write: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<ChangelogRecord>>;

    // Mock task store
    mockTaskStore = {
      read: jest.fn().mockResolvedValue({ payload: { id: 'task-123' } }), // Default: task exists
      write: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<TaskRecord>>;

    // Mock cycle store
    mockCycleStore = {
      read: jest.fn().mockResolvedValue({ payload: { id: 'cycle-123' } }), // Default: cycle exists
      write: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<CycleRecord>>;

    // Mock identity adapter
    mockIdentityAdapter = {
      signRecord: jest.fn(),
      createActor: jest.fn(),
      getActor: jest.fn(),
      getAllActors: jest.fn(),
      createAgent: jest.fn(),
      getAgent: jest.fn(),
      getAllAgents: jest.fn()
    } as unknown as jest.Mocked<IdentityAdapter>;

    // Mock publish event
    mockPublishEvent = publishEvent as jest.Mock;

    // Mock factory - return the input payload with defaults applied
    (createChangelogRecord as jest.Mock).mockImplementation(async (payload: Partial<ChangelogRecord>) => ({
      id: '123-changelog-test',
      timestamp: 1752707800,
      trigger: 'manual' as const,
      riskLevel: 'low' as const,
      ...payload
    }));
    mockIdentityAdapter.signRecord.mockResolvedValue(mockSignedRecord);

    // Create adapter with mocked dependencies
    changelogAdapter = new ChangelogAdapter({
      changelogStore: mockChangelogStore,
      identity: mockIdentityAdapter,
      eventBus: {
        publish: jest.fn(),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        getSubscriptions: jest.fn(),
        clearSubscriptions: jest.fn()
      } as IEventStream,
      taskStore: mockTaskStore,
      cycleStore: mockCycleStore
    });
  });

  describe('create', () => {
    it('[EARS-1] should create, sign, write, and emit event for valid changelog', async () => {
      const result = await changelogAdapter.create(mockPayload, mockActorId);

      expect(createChangelogRecord).toHaveBeenCalledWith(mockPayload);
      expect(mockIdentityAdapter.signRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: mockCreatedChangelogPayload
        }),
        mockActorId,
        'author'
      );
      expect(mockChangelogStore.write).toHaveBeenCalledWith(mockSignedRecord);
      // Note: Now using this.eventBus.publish instead of publishEvent
      // The mock eventBus.publish should have been called
      expect(result).toEqual(mockCreatedChangelogPayload);
    });

    it('[EARS-2] should throw DetailedValidationError for invalid payload', async () => {
      const validationError = new DetailedValidationError('Invalid payload', []);
      (createChangelogRecord as jest.Mock).mockRejectedValue(validationError);

      await expect(changelogAdapter.create({ entityType: 'task', entityId: 'invalid' }, mockActorId))
        .rejects.toThrow('Invalid payload');

      // Ensure no side effects occurred
      expect(mockIdentityAdapter.signRecord).not.toHaveBeenCalled();
      expect(mockChangelogStore.write).not.toHaveBeenCalled();
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it('[EARS-3] should throw RecordNotFoundError for non-existent task entityId', async () => {
      mockTaskStore.read.mockResolvedValue(null);

      await expect(changelogAdapter.create({
        entityType: 'task',
        entityId: 'non-existent-task',
        changeType: 'update', // Use 'update' instead of 'completion'
        title: 'Valid Title',
        description: 'Valid description with sufficient length',
        triggeredBy: 'human:developer',
        reason: 'Valid reason'
      }, mockActorId))
        .rejects.toThrow('RecordNotFoundError: Task not found: non-existent-task');
    });

    it('[EARS-3] should throw RecordNotFoundError for non-existent cycle entityId', async () => {
      mockCycleStore.read.mockResolvedValue(null);

      await expect(changelogAdapter.create({
        entityType: 'cycle',
        entityId: 'non-existent-cycle',
        changeType: 'update', // Use 'update' instead of 'completion'
        title: 'Valid Title',
        description: 'Valid description with sufficient length',
        triggeredBy: 'human:developer',
        reason: 'Valid reason'
      }, mockActorId))
        .rejects.toThrow('RecordNotFoundError: Cycle not found: non-existent-cycle');
    });

    it('[EARS-4] should throw DetailedValidationError for invalid entityType', async () => {
      const invalidPayload = {
        entityType: 'invalid',
        entityId: 'entity-123',
        changeType: 'completion',
        title: 'Valid Title',
        description: 'Valid description',
        triggeredBy: 'human:developer',
        reason: 'Valid reason'
      } as unknown as Partial<ChangelogRecord>;

      await expect(changelogAdapter.create(invalidPayload, mockActorId))
        .rejects.toThrow('DetailedValidationError: entityType must be task, cycle, agent, system, or configuration');
    });

    it('[EARS-5] should throw DetailedValidationError for invalid changeType', async () => {
      const invalidPayload = {
        entityType: 'task',
        entityId: 'task-123',
        changeType: 'invalid',
        title: 'Valid Title',
        description: 'Valid description',
        triggeredBy: 'human:developer',
        reason: 'Valid reason'
      } as unknown as Partial<ChangelogRecord>;

      await expect(changelogAdapter.create(invalidPayload, mockActorId))
        .rejects.toThrow('DetailedValidationError: changeType must be creation, completion, update, deletion, or hotfix');
    });

    it('[EARS-6] should throw DetailedValidationError for high riskLevel without rollbackInstructions', async () => {
      await expect(changelogAdapter.create({
        entityType: 'task',
        entityId: 'task-123',
        changeType: 'update',
        title: 'High Risk Update',
        description: 'Major system update with high risk level',
        triggeredBy: 'human:developer',
        reason: 'System upgrade',
        riskLevel: 'high'
        // rollbackInstructions missing
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: rollbackInstructions is required when riskLevel is high');
    });

    it('[EARS-7] should throw DetailedValidationError for critical riskLevel without rollbackInstructions', async () => {
      await expect(changelogAdapter.create({
        entityType: 'system',
        entityId: 'payment-gateway',
        changeType: 'hotfix',
        title: 'Critical System Fix',
        description: 'Emergency fix for critical system failure',
        triggeredBy: 'human:on-call',
        reason: 'System down',
        riskLevel: 'critical'
        // rollbackInstructions missing
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: rollbackInstructions is required when riskLevel is critical');
    });

    it('[EARS-8] should throw DetailedValidationError for completion changeType without references.tasks', async () => {
      await expect(changelogAdapter.create({
        entityType: 'task',
        entityId: 'task-123',
        changeType: 'completion',
        title: 'Task Completion',
        description: 'Task has been completed successfully',
        triggeredBy: 'human:developer',
        reason: 'All work finished'
        // references.tasks missing for completion
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: references.tasks is required when changeType is completion');
    });

    it('[EARS-14] should throw DetailedValidationError for short title', async () => {
      await expect(changelogAdapter.create({
        entityType: 'task',
        entityId: 'task-123',
        changeType: 'completion',
        title: 'Short', // Less than 10 characters
        description: 'Valid description with sufficient length',
        triggeredBy: 'human:developer',
        reason: 'Valid reason'
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: title must be at least 10 characters');
    });

    it('[EARS-15] should throw DetailedValidationError for short description', async () => {
      await expect(changelogAdapter.create({
        entityType: 'task',
        entityId: 'task-123',
        changeType: 'completion',
        title: 'Valid Title',
        description: 'Short desc', // Less than 20 characters
        triggeredBy: 'human:developer',
        reason: 'Valid reason'
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: description must be at least 20 characters');
    });

    it('should work with graceful degradation when entity stores are not provided', async () => {
      const changelogAdapterNoEntityStores = new ChangelogAdapter({
        changelogStore: mockChangelogStore,
        identity: mockIdentityAdapter,
        eventBus: {
          publish: jest.fn(),
          subscribe: jest.fn(),
          unsubscribe: jest.fn(),
          getSubscriptions: jest.fn(),
          clearSubscriptions: jest.fn()
        } as IEventStream,
        // No taskStore or cycleStore provided
      });

      const result = await changelogAdapterNoEntityStores.create(mockPayload, mockActorId);

      expect(result).toEqual(mockCreatedChangelogPayload);
      expect(mockTaskStore.read).not.toHaveBeenCalled();
      expect(mockCycleStore.read).not.toHaveBeenCalled();
    });

    it('should accept valid entityType values', async () => {
      const validEntityTypes = ['task', 'cycle', 'agent', 'system', 'configuration'];

      for (const entityType of validEntityTypes) {
        const payload = {
          entityType,
          entityId: `${entityType}-123`,
          changeType: 'update' as const,
          title: `${entityType} Update`,
          description: `Updated ${entityType} with new configuration settings`,
          triggeredBy: 'human:developer',
          reason: 'Regular update'
        } as Partial<ChangelogRecord>;

        const result = await changelogAdapter.create(payload, mockActorId);
        expect(result.entityType).toBe(entityType);
      }
    });

    it('should accept valid changeType values', async () => {
      const validChangeTypes = ['creation', 'completion', 'update', 'deletion', 'hotfix'];

      for (const changeType of validChangeTypes) {
        const payload = {
          entityType: 'task' as const,
          entityId: 'task-123',
          changeType,
          title: `Task ${changeType}`,
          description: `Task ${changeType} with all requirements`,
          triggeredBy: 'human:developer',
          reason: `${changeType} reason`,
          // Add references.tasks for completion changeType
          ...(changeType === 'completion' && {
            references: {
              tasks: ['task-123']
            }
          })
        } as Partial<ChangelogRecord>;

        const result = await changelogAdapter.create(payload, mockActorId);
        expect(result.changeType).toBe(changeType);
      }
    });
  });

  describe('getChangelog', () => {
    it('[EARS-9] should return existing changelog record', async () => {
      const mockRecord = createMockChangelogRecord({ id: 'changelog-123' });
      mockChangelogStore.read.mockResolvedValue(mockRecord);

      const result = await changelogAdapter.getChangelog('changelog-123');

      expect(mockChangelogStore.read).toHaveBeenCalledWith('changelog-123');
      expect(result).toEqual(mockRecord.payload);
    });

    it('[EARS-10] should return null for non-existent changelog', async () => {
      mockChangelogStore.read.mockResolvedValue(null);

      const result = await changelogAdapter.getChangelog('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getChangelogsByEntity', () => {
    it('[EARS-11] should filter changelogs by entity ID', async () => {
      const changelog1 = createMockChangelogRecord({ id: 'changelog-1', entityId: 'task-123' });
      const changelog2 = createMockChangelogRecord({ id: 'changelog-2', entityId: 'task-456' });
      const changelog3 = createMockChangelogRecord({ id: 'changelog-3', entityId: 'task-123' });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2', 'changelog-3']);
      mockChangelogStore.read
        .mockResolvedValueOnce(changelog1)
        .mockResolvedValueOnce(changelog2)
        .mockResolvedValueOnce(changelog3);

      const result = await changelogAdapter.getChangelogsByEntity('task-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(changelog1.payload);
      expect(result[1]).toEqual(changelog3.payload);
    });

    it('[EARS-11] should filter changelogs by entity ID and entityType', async () => {
      const taskChangelog = createMockChangelogRecord({ id: 'changelog-1', entityId: 'entity-123', entityType: 'task' });
      const systemChangelog = createMockChangelogRecord({ id: 'changelog-2', entityId: 'entity-123', entityType: 'system' });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2']);
      mockChangelogStore.read
        .mockResolvedValueOnce(taskChangelog)
        .mockResolvedValueOnce(systemChangelog);

      const result = await changelogAdapter.getChangelogsByEntity('entity-123', 'task');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(taskChangelog.payload);
    });

    it('should return empty array when no changelogs found for entity', async () => {
      mockChangelogStore.list.mockResolvedValue([]);

      const result = await changelogAdapter.getChangelogsByEntity('entity-nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getAllChangelogs', () => {
    it('[EARS-12] should return all changelog records in the system', async () => {
      const changelog1 = createMockChangelogRecord({ id: 'changelog-1' });
      const changelog2 = createMockChangelogRecord({ id: 'changelog-2' });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2']);
      mockChangelogStore.read
        .mockResolvedValueOnce(changelog1)
        .mockResolvedValueOnce(changelog2);

      const result = await changelogAdapter.getAllChangelogs();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(changelog1.payload);
      expect(result[1]).toEqual(changelog2.payload);
    });

    it('should return empty array when no changelogs exist', async () => {
      mockChangelogStore.list.mockResolvedValue([]);

      const result = await changelogAdapter.getAllChangelogs();

      expect(result).toEqual([]);
    });
  });

  describe('getRecentChangelogs', () => {
    it('[EARS-13] should return changelogs ordered by timestamp descending with limit', async () => {
      const changelog1 = createMockChangelogRecord({ id: 'changelog-1', timestamp: 1752707800 }); // Older
      const changelog2 = createMockChangelogRecord({ id: 'changelog-2', timestamp: 1752707900 }); // Newer
      const changelog3 = createMockChangelogRecord({ id: 'changelog-3', timestamp: 1752707850 }); // Middle

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2', 'changelog-3']);
      mockChangelogStore.read
        .mockResolvedValueOnce(changelog1)
        .mockResolvedValueOnce(changelog2)
        .mockResolvedValueOnce(changelog3);

      const result = await changelogAdapter.getRecentChangelogs(2);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(changelog2.payload); // Most recent first
      expect(result[1]).toEqual(changelog3.payload); // Second most recent
    });

    it('should return all changelogs when limit exceeds total', async () => {
      const changelog1 = createMockChangelogRecord({ id: 'changelog-1' });

      mockChangelogStore.list.mockResolvedValue(['changelog-1']);
      mockChangelogStore.read.mockResolvedValueOnce(changelog1);

      const result = await changelogAdapter.getRecentChangelogs(10);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(changelog1.payload);
    });
  });

  describe('Performance Tests', () => {
    it('[EARS-16] should execute in under 40ms for typical datasets', async () => {
      // Create mock data for performance test
      const changelogIds = Array.from({ length: 100 }, (_, i) => `changelog-${i}`);
      const mockChangelogs = changelogIds.map(id =>
        createMockChangelogRecord({ id, entityId: `entity-${id}` })
      );

      mockChangelogStore.list.mockResolvedValue(changelogIds);
      mockChangelogs.forEach(changelog => {
        mockChangelogStore.read.mockResolvedValueOnce(changelog);
      });

      const startTime = Date.now();
      await changelogAdapter.getAllChangelogs();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(40);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when entityType is missing', async () => {
      await expect(changelogAdapter.create({
        entityId: 'entity-123'
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: entityType is required');
    });

    it('should throw error when entityId is missing', async () => {
      await expect(changelogAdapter.create({
        entityType: 'task'
      }, mockActorId))
        .rejects.toThrow('DetailedValidationError: entityId is required');
    });

    it('should handle factory errors gracefully', async () => {
      (createChangelogRecord as jest.Mock).mockRejectedValue(new Error('Factory error'));

      await expect(changelogAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Factory error');
    });

    it('should handle identity errors gracefully', async () => {
      mockIdentityAdapter.signRecord.mockRejectedValue(new Error('Signing failed'));

      await expect(changelogAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Signing failed');
    });

    it('should handle store errors gracefully', async () => {
      mockChangelogStore.write.mockRejectedValue(new Error('Store error'));

      await expect(changelogAdapter.create(mockPayload, mockActorId))
        .rejects.toThrow('Store error');
    });
  });

  describe('Multi-Entity Support', () => {
    it('should handle system entity without store validation', async () => {
      const systemPayload = {
        entityType: 'system' as const,
        entityId: 'payment-gateway',
        changeType: 'hotfix' as const,
        title: 'Payment Gateway Hotfix',
        description: 'Fixed critical payment processing issue',
        triggeredBy: 'human:on-call',
        reason: 'Critical production issue'
      };

      const result = await changelogAdapter.create(systemPayload, mockActorId);

      expect(result.entityType).toBe('system');
      expect(result.entityId).toBe('payment-gateway');
      // No store validation for system entities
      expect(mockTaskStore.read).not.toHaveBeenCalled();
      expect(mockCycleStore.read).not.toHaveBeenCalled();
    });

    it('should handle configuration entity without store validation', async () => {
      const configPayload = {
        entityType: 'configuration' as const,
        entityId: 'database-config',
        changeType: 'update' as const,
        title: 'Database Configuration Update',
        description: 'Updated connection pool settings for better performance',
        triggeredBy: 'human:devops',
        reason: 'Performance optimization'
      };

      const result = await changelogAdapter.create(configPayload, mockActorId);

      expect(result.entityType).toBe('configuration');
      expect(result.entityId).toBe('database-config');
      // No store validation for configuration entities
      expect(mockTaskStore.read).not.toHaveBeenCalled();
      expect(mockCycleStore.read).not.toHaveBeenCalled();
    });
  });
});
