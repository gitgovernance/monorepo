import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FsStore } from './fs_store';

interface TestRecord {
  id: string;
  name: string;
  data?: { nested: string };
}

describe('FsStore', () => {
  let store: FsStore<TestRecord>;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-store-test-'));
    store = new FsStore<TestRecord>({ basePath: tempDir });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
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

      expect(await store.exists('test-1')).toBe(true);
    });

    it('[EARS-A4] should overwrite existing value', async () => {
      const original: TestRecord = { id: 'test-1', name: 'Original' };
      const updated: TestRecord = { id: 'test-1', name: 'Updated' };

      await store.put('test-1', original);
      await store.put('test-1', updated);

      const result = await store.get('test-1');
      expect(result).toEqual(updated);
    });

    it('[EARS-A5] should delete existing record', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test Record' };
      await store.put('test-1', record);

      await store.delete('test-1');

      expect(await store.exists('test-1')).toBe(false);
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
  // §4.2 FsStore-Specific Behavior (EARS-B1 a B6)
  // ─────────────────────────────────────────────────────────

  describe('FsStore-Specific Behavior (EARS-B1 to B6)', () => {
    it('[EARS-B1] should create directory if missing', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep');
      const nestedStore = new FsStore<TestRecord>({ basePath: nestedDir });

      await nestedStore.put('test-1', { id: 'test-1', name: 'Test' });

      const exists = await fs.access(nestedDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('[EARS-B2] should write file at basePath/id.json', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test Record' };

      await store.put('test-1', record);

      const filePath = path.join(tempDir, 'test-1.json');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(record);
    });

    it('[EARS-B3] should read and parse json file', async () => {
      const record: TestRecord = { id: 'test-1', name: 'Test Record' };
      const filePath = path.join(tempDir, 'test-1.json');
      await fs.writeFile(filePath, JSON.stringify(record), 'utf-8');

      const result = await store.get('test-1');

      expect(result).toEqual(record);
    });

    it('[EARS-B4] should delete json file', async () => {
      const filePath = path.join(tempDir, 'test-1.json');
      await fs.writeFile(filePath, '{}', 'utf-8');

      await store.delete('test-1');

      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('[EARS-B5] should throw on invalid JSON', async () => {
      const filePath = path.join(tempDir, 'test-1.json');
      await fs.writeFile(filePath, 'not valid json {{{', 'utf-8');

      await expect(store.get('test-1')).rejects.toThrow();
    });

    it('[EARS-B6] should derive IDs from json files', async () => {
      await fs.writeFile(path.join(tempDir, 'record-1.json'), '{}', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'record-2.json'), '{}', 'utf-8');
      await fs.writeFile(path.join(tempDir, 'not-json.txt'), 'text', 'utf-8');

      const ids = await store.list();

      expect(ids).toHaveLength(2);
      expect(ids).toContain('record-1');
      expect(ids).toContain('record-2');
      expect(ids).not.toContain('not-json.txt');
    });
  });

  // ─────────────────────────────────────────────────────────
  // §4.3 Security (EARS-C1 a C2)
  // ─────────────────────────────────────────────────────────

  describe('Security (EARS-C1 to C2)', () => {
    it('[EARS-C1] should reject IDs with path traversal (..)', async () => {
      await expect(store.get('../etc/passwd')).rejects.toThrow(/cannot contain/);
      await expect(store.put('../etc/passwd', { id: 'x', name: 'x' })).rejects.toThrow(/cannot contain/);
      await expect(store.delete('../etc/passwd')).rejects.toThrow(/cannot contain/);
      await expect(store.exists('../etc/passwd')).rejects.toThrow(/cannot contain/);
    });

    it('[EARS-C1] should reject IDs with forward slash', async () => {
      await expect(store.get('foo/bar')).rejects.toThrow(/cannot contain/);
    });

    it('[EARS-C1] should reject IDs with backslash', async () => {
      await expect(store.get('foo\\bar')).rejects.toThrow(/cannot contain/);
    });

    it('[EARS-C2] should allow IDs with single dot', async () => {
      const record: TestRecord = { id: 'human.camilo', name: 'Camilo' };

      await store.put('human.camilo', record);
      const result = await store.get('human.camilo');

      expect(result).toEqual(record);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Additional: Custom extension and serializer
  // ─────────────────────────────────────────────────────────

  describe('Configuration Options', () => {
    it('should support custom extension', async () => {
      const customStore = new FsStore<TestRecord>({
        basePath: tempDir,
        extension: '.data',
      });

      await customStore.put('test-1', { id: 'test-1', name: 'Test' });

      const filePath = path.join(tempDir, 'test-1.data');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should support custom serializer', async () => {
      const customStore = new FsStore<TestRecord>({
        basePath: tempDir,
        serializer: {
          stringify: (value) => `CUSTOM:${JSON.stringify(value)}`,
          parse: (text) => JSON.parse(text.replace('CUSTOM:', '')),
        },
      });

      await customStore.put('test-1', { id: 'test-1', name: 'Test' });
      const result = await customStore.get('test-1');

      expect(result).toEqual({ id: 'test-1', name: 'Test' });

      const filePath = path.join(tempDir, 'test-1.json');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content.startsWith('CUSTOM:')).toBe(true);
    });

    it('should not create directory when createIfMissing is false', async () => {
      const nestedDir = path.join(tempDir, 'no-create', 'deep');
      const noCreateStore = new FsStore<TestRecord>({
        basePath: nestedDir,
        createIfMissing: false,
      });

      await expect(
        noCreateStore.put('test-1', { id: 'test-1', name: 'Test' })
      ).rejects.toThrow();
    });
  });
});
