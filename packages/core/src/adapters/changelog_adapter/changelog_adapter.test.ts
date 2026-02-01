import { ChangelogAdapter } from './index';
import { createChangelogRecord } from '../../factories/changelog_factory';
import type { RecordStore } from '../../record_store';
import { IdentityAdapter } from '../identity_adapter';
import type { ChangelogRecord } from '../../record_types';
import type { GitGovChangelogRecord, GitGovTaskRecord, GitGovCycleRecord } from '../../record_types';
import type { IEventStream } from '../../event_bus';
import type { GitGovRecord, Signature } from '../../record_types';

// Mock dependencies
jest.mock('../../factories/changelog_factory');
jest.mock('../../record_store');
jest.mock('../identity_adapter');
jest.mock('../../event_bus', () => ({
  ...jest.requireActual('../../event_bus'),
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
        notes: 'Mock changelog for unit testing',
        signature: 'mock-sig',
        timestamp: 123
      }] as [Signature, ...Signature[]]
    },
    payload: {
      id: '1752707800-changelog-test-deliverable',
      title: 'Test Deliverable v1.0',
      description: 'Successfully delivered multiple features in this release',
      relatedTasks: ['1752274500-task-test-task'],
      completedAt: 1752707800,
      ...overrides
    }
  };
}

describe('ChangelogAdapter', () => {
  let changelogAdapter: ChangelogAdapter;
  let mockChangelogStore: jest.Mocked<RecordStore<GitGovChangelogRecord>>;
  let mockTaskStore: jest.Mocked<RecordStore<GitGovTaskRecord>>;
  let mockCycleStore: jest.Mocked<RecordStore<GitGovCycleRecord>>;
  let mockIdentityAdapter: jest.Mocked<IdentityAdapter>;
  let mockEventBus: jest.Mocked<IEventStream>;

  beforeEach(() => {
    // Mock RecordStore for changelog
    mockChangelogStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovChangelogRecord>>;

    // Mock RecordStore for tasks
    mockTaskStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovTaskRecord>>;

    // Mock RecordStore for cycles
    mockCycleStore = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      list: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<RecordStore<GitGovCycleRecord>>;

    // Mock IdentityAdapter
    mockIdentityAdapter = {
      signRecord: jest.fn(),
      getActor: jest.fn(),
      getCurrentActor: jest.fn(),
    } as unknown as jest.Mocked<IdentityAdapter>;

    // Mock EventBus
    mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getSubscriptions: jest.fn(),
      clearSubscriptions: jest.fn(),
      waitForIdle: jest.fn().mockResolvedValue(undefined)
    } as jest.Mocked<IEventStream>;

    // Instantiate ChangelogAdapter with mocked dependencies
    changelogAdapter = new ChangelogAdapter({
      stores: { changelogs: mockChangelogStore, tasks: mockTaskStore, cycles: mockCycleStore },
      identity: mockIdentityAdapter,
      eventBus: mockEventBus,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('[EARS-A1] should create a changelog record with all required fields', async () => {
      const mockPayload: Partial<ChangelogRecord> = {
        id: '1752707800-changelog-test-deliverable',
        title: 'Test Deliverable v1.0',
        description: 'Successfully delivered multiple features in this release',
        relatedTasks: ['1752274500-task-test-task'],
        completedAt: 1752707800
      };

      const mockRecord = createMockChangelogRecord(mockPayload);
      (createChangelogRecord as jest.Mock).mockReturnValue(mockPayload);
      mockIdentityAdapter.signRecord.mockResolvedValue(mockRecord);
      mockTaskStore.get.mockResolvedValue({ payload: { id: '1752274500-task-test-task' } } as any); // Mock task exists

      const result = await changelogAdapter.create(mockPayload, 'human:developer');

      expect(createChangelogRecord).toHaveBeenCalledWith(mockPayload);
      expect(mockIdentityAdapter.signRecord).toHaveBeenCalled();
      expect(mockChangelogStore.put).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalled();
      expect(result).toEqual(mockPayload);
    });

    it('[EARS-A2] should throw error when title is missing', async () => {
      const invalidPayload: Partial<ChangelogRecord> = {
        description: 'Test description with sufficient length',
        relatedTasks: ['task-1'],
      };

      await expect(changelogAdapter.create(invalidPayload, 'human:developer'))
        .rejects.toThrow('title is required');
    });

    it('[EARS-A3] should throw error when description is too short', async () => {
      const invalidPayload: Partial<ChangelogRecord> = {
        title: 'Test Title Here',
        description: 'Too short',
        relatedTasks: ['task-1'],
      };

      await expect(changelogAdapter.create(invalidPayload, 'human:developer'))
        .rejects.toThrow('description is required and must be at least 20 characters');
    });

    it('[EARS-A4] should throw error when relatedTasks is empty', async () => {
      // Test runtime validation of empty array - cast through unknown for type safety
      const invalidPayload = {
        title: 'Test Title Here',
        description: 'Valid description with sufficient length for validation',
        relatedTasks: [], // Runtime should reject empty array
      } as unknown as Partial<ChangelogRecord>;

      await expect(changelogAdapter.create(invalidPayload, 'human:developer'))
        .rejects.toThrow('relatedTasks is required and must contain at least one task ID');
    });

    it('[EARS-A5] should validate task existence when taskStore is provided', async () => {
      const mockPayload: Partial<ChangelogRecord> = {
        title: 'Test Deliverable',
        description: 'Test description with sufficient length for validation',
        relatedTasks: ['non-existent-task'],
      };

      mockTaskStore.get.mockResolvedValue(null);

      await expect(changelogAdapter.create(mockPayload, 'human:developer'))
        .rejects.toThrow('Task not found: non-existent-task');
    });
  });

  describe('getChangelog', () => {
    it('[EARS-B1] should return a changelog by ID', async () => {
      const mockRecord = createMockChangelogRecord();
      mockChangelogStore.get.mockResolvedValue(mockRecord);

      const result = await changelogAdapter.getChangelog('1752707800-changelog-test-deliverable');

      expect(result).toEqual(mockRecord.payload);
      expect(mockChangelogStore.get).toHaveBeenCalledWith('1752707800-changelog-test-deliverable');
    });

    it('[EARS-B2] should return null when changelog not found', async () => {
      mockChangelogStore.get.mockResolvedValue(null);

      const result = await changelogAdapter.getChangelog('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getChangelogsByTask', () => {
    it('[EARS-C1] should return changelogs that include specific task', async () => {
      const mockRecord1 = createMockChangelogRecord({
        id: 'changelog-1',
        relatedTasks: ['task-1', 'task-2']
      });
      const mockRecord2 = createMockChangelogRecord({
        id: 'changelog-2',
        relatedTasks: ['task-3']
      });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2']);
      mockChangelogStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2);

      const result = await changelogAdapter.getChangelogsByTask('task-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('changelog-1');
    });
  });

  describe('getAllChangelogs', () => {
    it('[EARS-D1] should return all changelogs', async () => {
      const mockRecord1 = createMockChangelogRecord({ id: 'changelog-1' });
      const mockRecord2 = createMockChangelogRecord({ id: 'changelog-2' });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2']);
      mockChangelogStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2);

      const result = await changelogAdapter.getAllChangelogs();

      expect(result).toHaveLength(2);
    });
  });

  describe('getRecentChangelogs', () => {
    it('[EARS-E1] should return recent changelogs sorted by completedAt', async () => {
      const mockRecord1 = createMockChangelogRecord({
        id: 'changelog-1',
        completedAt: 1752707900
      });
      const mockRecord2 = createMockChangelogRecord({
        id: 'changelog-2',
        completedAt: 1752707800
      });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2']);
      mockChangelogStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2);

      const result = await changelogAdapter.getRecentChangelogs(1);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('changelog-1'); // Most recent
    });
  });

  describe('getAllChangelogs with options', () => {
    it('[EARS-D3] should return all changelogs sorted by completedAt desc by default', async () => {
      const mockRecord1 = createMockChangelogRecord({
        id: 'changelog-1',
        completedAt: 1752707800 // Older
      });
      const mockRecord2 = createMockChangelogRecord({
        id: 'changelog-2',
        completedAt: 1752707900 // Newer
      });
      const mockRecord3 = createMockChangelogRecord({
        id: 'changelog-3',
        completedAt: 1752707850 // Middle
      });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2', 'changelog-3']);
      mockChangelogStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2)
        .mockResolvedValueOnce(mockRecord3);

      const result = await changelogAdapter.getAllChangelogs();

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe('changelog-2'); // Most recent first
      expect(result[1]!.id).toBe('changelog-3'); // Middle
      expect(result[2]!.id).toBe('changelog-1'); // Oldest last
    });

    it('[EARS-D2] should filter changelogs by tags', async () => {
      const mockRecord1 = createMockChangelogRecord({
        id: 'changelog-1',
        tags: ['feature', 'ui']
      });
      const mockRecord2 = createMockChangelogRecord({
        id: 'changelog-2',
        tags: ['bugfix', 'backend']
      });
      const mockRecord3 = createMockChangelogRecord({
        id: 'changelog-3',
        tags: ['feature', 'api']
      });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2', 'changelog-3']);
      mockChangelogStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2)
        .mockResolvedValueOnce(mockRecord3);

      const result = await changelogAdapter.getAllChangelogs({ tags: ['feature'] });

      expect(result).toHaveLength(2);
      expect(result.map(r => r.id)).toContain('changelog-1');
      expect(result.map(r => r.id)).toContain('changelog-3');
      expect(result.map(r => r.id)).not.toContain('changelog-2');
    });

    it('[EARS-D4] should apply limit to results', async () => {
      const mockRecord1 = createMockChangelogRecord({
        id: 'changelog-1',
        completedAt: 1752707800
      });
      const mockRecord2 = createMockChangelogRecord({
        id: 'changelog-2',
        completedAt: 1752707900
      });
      const mockRecord3 = createMockChangelogRecord({
        id: 'changelog-3',
        completedAt: 1752707850
      });

      mockChangelogStore.list.mockResolvedValue(['changelog-1', 'changelog-2', 'changelog-3']);
      mockChangelogStore.get
        .mockResolvedValueOnce(mockRecord1)
        .mockResolvedValueOnce(mockRecord2)
        .mockResolvedValueOnce(mockRecord3);

      const result = await changelogAdapter.getAllChangelogs({ limit: 2 });

      expect(result).toHaveLength(2);
      // Should return the 2 most recent
      expect(result[0]!.id).toBe('changelog-2');
      expect(result[1]!.id).toBe('changelog-3');
    });
  });

  describe('ID generation', () => {
    it('[EARS-A6] should generate correct ID from title using slug pattern', async () => {
      const mockPayload: Partial<ChangelogRecord> = {
        title: 'Test Deliverable v1.0',
        description: 'Successfully delivered multiple features in this release',
        relatedTasks: ['1752274500-task-test-task'],
        completedAt: 1752707800
      };

      const mockRecord = createMockChangelogRecord(mockPayload);
      (createChangelogRecord as jest.Mock).mockImplementation((payload) => payload);
      mockIdentityAdapter.signRecord.mockResolvedValue(mockRecord);
      mockTaskStore.get.mockResolvedValue({ payload: { id: '1752274500-task-test-task' } } as any);

      const result = await changelogAdapter.create(mockPayload, 'human:developer');

      // Verify ID follows pattern: {timestamp}-changelog-{slug}
      expect(result.id).toMatch(/^\d+-changelog-[\w-]+$/);
      expect(result.id).toContain('test-deliverable-v10');
      expect(result.id.split('-changelog-')[1]!.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Performance', () => {
    it('[EARS-F1] should execute in under 40ms for typical datasets', async () => {
      // Create 100 mock records (typical dataset)
      const mockRecords = Array.from({ length: 100 }, (_, i) =>
        createMockChangelogRecord({
          id: `changelog-${i}`,
          completedAt: 1752707800 + i,
          tags: i % 2 === 0 ? ['feature'] : ['bugfix']
        })
      );

      const ids = mockRecords.map(r => r.payload.id);
      mockChangelogStore.list.mockResolvedValue(ids);

      // Mock read calls
      for (const record of mockRecords) {
        mockChangelogStore.get.mockResolvedValueOnce(record);
      }

      const startTime = Date.now();
      await changelogAdapter.getAllChangelogs({ tags: ['feature'], limit: 10 });
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(40);
    });
  });
});
