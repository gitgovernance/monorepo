import { MemoryStore } from './memory_store';

interface TestRecord {
  id: string;
  name: string;
  data?: { nested: string };
}

describe('MemoryStore', () => {
  let store: MemoryStore<TestRecord>;

  beforeEach(() => {
    store = new MemoryStore<TestRecord>();
  });

  // ─────────────────────────────────────────────────────────
  // §4.1 Core Store Operations (EARS-A1 a A10)
  // ─────────────────────────────────────────────────────────

  describe('Core Store Operations (EARS-A1 to A10)', () => {
    it('[EARS-A1] should return stored record when ID exists', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test Record' };
      await store.put('test-1', record);

      const result = await store.get('test-1');

      expect(result).toEqual(record);
    });

    it('[EARS-A2] should return null when ID does not exist', async () => {
      const result = await store.get('non-existent');

      expect(result).toBeNull();
    });

    it('[EARS-A3] should persist value with given ID', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test Record' };

      await store.put('test-1', record);

      expect(store.size()).toBe(1);
      expect(await store.exists('test-1')).toBe(true);
    });

    it('[EARS-A4] should overwrite existing value', async () => {
      const original: TestRecord = { id: 'test-1', name: 'Original' };
      const updated: TestRecord = { id: 'test-1', name: 'Updated' };

      await store.put('test-1', original);
      await store.put('test-1', updated);

      const result = await store.get('test-1');
      expect(result).toEqual(updated);
      expect(store.size()).toBe(1);
    });

    it('[EARS-A5] should delete existing record', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test Record' };
      await store.put('test-1', record);

      await store.delete('test-1');

      expect(await store.exists('test-1')).toBe(false);
      expect(store.size()).toBe(0);
    });

    it('[EARS-A6] should complete without error for non-existing ID', async () => {
      await expect(store.delete('non-existent')).resolves.toBeUndefined();
    });

    it('[EARS-A7] should return all stored IDs', async () => {
      await store.put('id-1', { id: 'id-1', name: 'Record 1' });
      await store.put('id-2', { id: 'id-2', name: 'Record 2' });
      await store.put('id-3', { id: 'id-3', name: 'Record 3' });

      const ids = await store.list();

      expect(ids).toHaveLength(3);
      expect(ids).toContain('id-1');
      expect(ids).toContain('id-2');
      expect(ids).toContain('id-3');
    });

    it('[EARS-A8] should return empty array for empty store', async () => {
      const ids = await store.list();

      expect(ids).toEqual([]);
    });

    it('[EARS-A9] should return true for existing ID', async () => {
      await store.put('test-1', { id: 'test-1', name: 'Test' });

      const exists = await store.exists('test-1');

      expect(exists).toBe(true);
    });

    it('[EARS-A10] should return false for non-existing ID', async () => {
      const exists = await store.exists('non-existent');

      expect(exists).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────
  // §4.2 MemoryStore-Specific Behavior (EARS-B1 a B4)
  // ─────────────────────────────────────────────────────────

  describe('MemoryStore-Specific Behavior (EARS-B1 to B4)', () => {
    it('[EARS-B1] should initialize with empty Map', () => {
      const freshStore = new MemoryStore<TestRecord>();

      expect(freshStore.size()).toBe(0);
    });

    it('[EARS-B2] should deep clone value on put', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test', data: { nested: 'value' } };

      await store.put('test-1', record);

      // Modify original after put
      record.name = 'Modified';
      record.data!.nested = 'modified';

      // Stored value should be unaffected
      const stored = await store.get('test-1');
      expect(stored?.name).toBe('Test');
      expect(stored?.data?.nested).toBe('value');
    });

    it('[EARS-B3] should return cloned value on get', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test', data: { nested: 'value' } };
      await store.put('test-1', record);

      const retrieved = await store.get('test-1');
      retrieved!.name = 'Modified';
      retrieved!.data!.nested = 'modified';

      // Store should be unaffected
      const stored = await store.get('test-1');
      expect(stored?.name).toBe('Test');
      expect(stored?.data?.nested).toBe('value');
    });

    it('[EARS-B4] should use direct reference when deepClone is false', async () => {
      const noCloneStore = new MemoryStore<TestRecord>({ deepClone: false });
      const record: TestRecord = { id: 'test-1', name: 'Test', data: { nested: 'value' } };

      await noCloneStore.put('test-1', record);

      // Modify original after put
      record.name = 'Modified';

      // Stored value SHOULD be affected (same reference)
      const stored = await noCloneStore.get('test-1');
      expect(stored?.name).toBe('Modified');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Test Helpers
  // ─────────────────────────────────────────────────────────

  describe('Test Helpers', () => {
    it('clear() should remove all records', async () => {
      await store.put('id-1', { id: 'id-1', name: 'Record 1' });
      await store.put('id-2', { id: 'id-2', name: 'Record 2' });

      store.clear();

      expect(store.size()).toBe(0);
      expect(await store.list()).toEqual([]);
    });

    it('size() should return number of records', async () => {
      expect(store.size()).toBe(0);

      await store.put('id-1', { id: 'id-1', name: 'Record 1' });
      expect(store.size()).toBe(1);

      await store.put('id-2', { id: 'id-2', name: 'Record 2' });
      expect(store.size()).toBe(2);
    });

    it('getAll() should return copy of internal Map', async () => {
      await store.put('id-1', { id: 'id-1', name: 'Record 1' });
      await store.put('id-2', { id: 'id-2', name: 'Record 2' });

      const all = store.getAll();

      expect(all.size).toBe(2);
      expect(all.get('id-1')?.name).toBe('Record 1');
      expect(all.get('id-2')?.name).toBe('Record 2');
    });

    it('should accept initial data', () => {
      const initial = new Map<string, TestRecord>([
        ['id-1', { id: 'id-1', name: 'Record 1' }],
        ['id-2', { id: 'id-2', name: 'Record 2' }],
      ]);

      const preloadedStore = new MemoryStore<TestRecord>({ initial });

      expect(preloadedStore.size()).toBe(2);
    });
  });
});
