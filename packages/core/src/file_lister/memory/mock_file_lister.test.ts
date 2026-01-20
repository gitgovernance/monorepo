/**
 * MockFileLister Tests
 *
 * Tests for the in-memory FileLister implementation.
 * All EARS prefixes map to file_lister_module.md blueprint.
 */

import { MockFileLister } from './mock_file_lister';
import { FileListerError } from '../file_lister';

describe('MockFileLister', () => {
  describe('4.1. FileLister Interface (EARS-FL01 to FL04)', () => {
    describe('list()', () => {
      it('[EARS-FL01] should return files matching glob patterns', async () => {
        const lister = new MockFileLister({
          files: {
            'src/index.ts': 'export const x = 1;',
            'src/utils.ts': 'export const y = 2;',
            'README.md': '# Project',
            'package.json': '{}',
          },
        });

        const tsFiles = await lister.list(['**/*.ts']);
        expect(tsFiles).toContain('src/index.ts');
        expect(tsFiles).toContain('src/utils.ts');
        expect(tsFiles).not.toContain('README.md');
        expect(tsFiles).not.toContain('package.json');
      });

      it('[EARS-FL01] should support multiple patterns', async () => {
        const lister = new MockFileLister({
          files: {
            'src/index.ts': '',
            'docs/api.md': '',
            'README.md': '',
          },
        });

        const files = await lister.list(['**/*.ts', '**/*.md']);
        expect(files).toHaveLength(3);
      });
    });

    describe('exists()', () => {
      it('[EARS-FL02] should return true for existing file', async () => {
        const lister = new MockFileLister({
          files: { 'src/index.ts': 'content' },
        });

        expect(await lister.exists('src/index.ts')).toBe(true);
      });

      it('[EARS-FL02] should return false for non-existing file', async () => {
        const lister = new MockFileLister({
          files: { 'src/index.ts': 'content' },
        });

        expect(await lister.exists('src/missing.ts')).toBe(false);
      });
    });

    describe('read()', () => {
      it('[EARS-FL03] should return file content as UTF-8 string', async () => {
        const content = 'export const x = 1;';
        const lister = new MockFileLister({
          files: { 'src/index.ts': content },
        });

        const result = await lister.read('src/index.ts');
        expect(result).toBe(content);
      });

      it('[EARS-FL03] should throw FILE_NOT_FOUND for missing file', async () => {
        const lister = new MockFileLister({ files: {} });

        await expect(lister.read('missing.ts')).rejects.toThrow(FileListerError);
        await expect(lister.read('missing.ts')).rejects.toMatchObject({
          code: 'FILE_NOT_FOUND',
          filePath: 'missing.ts',
        });
      });
    });

    describe('stat()', () => {
      it('[EARS-FL04] should return size, mtime, and isFile', async () => {
        const content = 'hello world';
        const lister = new MockFileLister({
          files: { 'test.txt': content },
        });

        const stats = await lister.stat('test.txt');
        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('mtime');
        expect(stats).toHaveProperty('isFile');
        expect(stats.isFile).toBe(true);
      });

      it('[EARS-FL04] should throw FILE_NOT_FOUND for missing file', async () => {
        const lister = new MockFileLister({ files: {} });

        await expect(lister.stat('missing.txt')).rejects.toThrow(FileListerError);
        await expect(lister.stat('missing.txt')).rejects.toMatchObject({
          code: 'FILE_NOT_FOUND',
        });
      });
    });
  });

  describe('4.3. MockFileLister Specifics (EARS-MFL01 to MFL04)', () => {
    it('[EARS-MFL01] should use provided files Map', async () => {
      const filesMap = new Map([
        ['a.ts', 'content a'],
        ['b.ts', 'content b'],
      ]);
      const lister = new MockFileLister({ files: filesMap });

      expect(await lister.exists('a.ts')).toBe(true);
      expect(await lister.exists('b.ts')).toBe(true);
      expect(await lister.read('a.ts')).toBe('content a');
    });

    it('[EARS-MFL01] should accept Record<string,string> as files', async () => {
      const lister = new MockFileLister({
        files: {
          'src/index.ts': 'code',
          'README.md': '# Title',
        },
      });

      expect(await lister.exists('src/index.ts')).toBe(true);
      expect(await lister.read('README.md')).toBe('# Title');
    });

    it('[EARS-MFL02] should filter keys using glob patterns', async () => {
      const lister = new MockFileLister({
        files: {
          'src/index.ts': '',
          'src/utils/helper.ts': '',
          'tests/index.test.ts': '',
          'README.md': '',
        },
      });

      const srcFiles = await lister.list(['src/**/*.ts']);
      expect(srcFiles).toContain('src/index.ts');
      expect(srcFiles).toContain('src/utils/helper.ts');
      expect(srcFiles).not.toContain('tests/index.test.ts');
      expect(srcFiles).not.toContain('README.md');
    });

    it('[EARS-MFL02] should support ignore patterns', async () => {
      const lister = new MockFileLister({
        files: {
          'src/index.ts': '',
          'src/generated/types.ts': '',
          'src/utils.ts': '',
        },
      });

      const files = await lister.list(['src/**/*.ts'], { ignore: ['**/generated/**'] });
      expect(files).toContain('src/index.ts');
      expect(files).toContain('src/utils.ts');
      expect(files).not.toContain('src/generated/types.ts');
    });

    it('[EARS-MFL03] should generate stats from content length', async () => {
      const content = 'hello world'; // 11 characters
      const lister = new MockFileLister({
        files: { 'test.txt': content },
      });

      const stats = await lister.stat('test.txt');
      expect(stats.size).toBe(11);
      expect(stats.isFile).toBe(true);
      expect(stats.mtime).toBeGreaterThan(0);
    });

    it('[EARS-MFL03] should use explicit stats when provided', async () => {
      const explicitStats = { size: 100, mtime: 1234567890, isFile: true };
      const lister = new MockFileLister({
        files: { 'test.txt': 'short' },
        stats: new Map([['test.txt', explicitStats]]),
      });

      const stats = await lister.stat('test.txt');
      expect(stats.size).toBe(100);
      expect(stats.mtime).toBe(1234567890);
    });

    it('[EARS-MFL04] should reflect files added after construction', async () => {
      const lister = new MockFileLister({ files: {} });

      expect(await lister.exists('new.ts')).toBe(false);

      lister.addFile('new.ts', 'new content');

      expect(await lister.exists('new.ts')).toBe(true);
      expect(await lister.read('new.ts')).toBe('new content');

      const files = await lister.list(['**/*.ts']);
      expect(files).toContain('new.ts');
    });
  });

  describe('Testing Utilities', () => {
    it('should support removeFile()', async () => {
      const lister = new MockFileLister({
        files: { 'test.ts': 'content' },
      });

      expect(await lister.exists('test.ts')).toBe(true);
      const removed = lister.removeFile('test.ts');
      expect(removed).toBe(true);
      expect(await lister.exists('test.ts')).toBe(false);
    });

    it('should support size()', () => {
      const lister = new MockFileLister({
        files: { 'a.ts': '', 'b.ts': '', 'c.ts': '' },
      });

      expect(lister.size()).toBe(3);
    });

    it('should support clear()', async () => {
      const lister = new MockFileLister({
        files: { 'a.ts': '', 'b.ts': '' },
      });

      expect(lister.size()).toBe(2);
      lister.clear();
      expect(lister.size()).toBe(0);
      expect(await lister.exists('a.ts')).toBe(false);
    });

    it('should support listPaths()', () => {
      const lister = new MockFileLister({
        files: { 'a.ts': '', 'b.ts': '' },
      });

      const paths = lister.listPaths();
      expect(paths).toContain('a.ts');
      expect(paths).toContain('b.ts');
    });
  });
});
