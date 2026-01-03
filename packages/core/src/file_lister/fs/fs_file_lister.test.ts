/**
 * FsFileLister Tests
 *
 * Tests for the filesystem-based FileLister implementation.
 * All EARS prefixes map to file_lister_module.md blueprint.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FsFileLister } from './fs_file_lister';
import { FileListerError } from '../file_lister';

describe('FsFileLister', () => {
  let tempDir: string;
  let lister: FsFileLister;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-file-lister-test-'));
    lister = new FsFileLister({ cwd: tempDir });
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  async function createFile(relativePath: string, content: string = '') {
    const fullPath = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  describe('4.1. FileLister Interface (EARS-FL01 to FL04)', () => {
    describe('list()', () => {
      it('[EARS-FL01] should return files matching glob patterns', async () => {
        await createFile('src/index.ts', 'export const x = 1;');
        await createFile('src/utils.ts', 'export const y = 2;');
        await createFile('README.md', '# Project');

        const tsFiles = await lister.list(['**/*.ts']);
        expect(tsFiles.sort()).toEqual(['src/index.ts', 'src/utils.ts'].sort());
      });

      it('[EARS-FL01] should support multiple patterns', async () => {
        await createFile('src/index.ts');
        await createFile('docs/api.md');
        await createFile('package.json');

        const files = await lister.list(['**/*.ts', '**/*.md']);
        expect(files).toContain('src/index.ts');
        expect(files).toContain('docs/api.md');
        expect(files).not.toContain('package.json');
      });

      it('[EARS-FL01] should return empty array for no matches', async () => {
        await createFile('src/index.ts');

        const files = await lister.list(['**/*.py']);
        expect(files).toEqual([]);
      });
    });

    describe('exists()', () => {
      it('[EARS-FL02] should return true for existing file', async () => {
        await createFile('src/index.ts', 'content');

        expect(await lister.exists('src/index.ts')).toBe(true);
      });

      it('[EARS-FL02] should return false for non-existing file', async () => {
        expect(await lister.exists('missing.ts')).toBe(false);
      });
    });

    describe('read()', () => {
      it('[EARS-FL03] should return file content as UTF-8 string', async () => {
        const content = 'export const x = 1;\n// Special chars: áéíóú 你好';
        await createFile('src/index.ts', content);

        const result = await lister.read('src/index.ts');
        expect(result).toBe(content);
      });
    });

    describe('stat()', () => {
      it('[EARS-FL04] should return size, mtime, and isFile', async () => {
        const content = 'hello world';
        await createFile('test.txt', content);

        const stats = await lister.stat('test.txt');
        expect(stats.size).toBe(content.length);
        expect(stats.mtime).toBeGreaterThan(0);
        expect(stats.isFile).toBe(true);
      });
    });
  });

  describe('4.2. FsFileLister Specifics (EARS-FFL01 to FFL04)', () => {
    it('[EARS-FFL01] should exclude files matching ignore patterns', async () => {
      await createFile('src/index.ts');
      await createFile('src/generated/types.ts');
      await createFile('node_modules/pkg/index.js');

      const files = await lister.list(['**/*.ts', '**/*.js'], {
        ignore: ['node_modules/**', '**/generated/**'],
      });

      expect(files).toContain('src/index.ts');
      expect(files).not.toContain('src/generated/types.ts');
      expect(files).not.toContain('node_modules/pkg/index.js');
    });

    it('[EARS-FFL03] should throw FILE_NOT_FOUND for missing file on read', async () => {
      await expect(lister.read('missing.ts')).rejects.toThrow(FileListerError);
      await expect(lister.read('missing.ts')).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
        filePath: 'missing.ts',
      });
    });

    it('[EARS-FFL03] should throw FILE_NOT_FOUND for missing file on stat', async () => {
      await expect(lister.stat('missing.ts')).rejects.toThrow(FileListerError);
      await expect(lister.stat('missing.ts')).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
        filePath: 'missing.ts',
      });
    });

    it('[EARS-FFL04] should throw INVALID_PATH for path traversal on read', async () => {
      await expect(lister.read('../outside.txt')).rejects.toThrow(FileListerError);
      await expect(lister.read('../outside.txt')).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });

    it('[EARS-FFL04] should throw INVALID_PATH for path traversal on exists', async () => {
      await expect(lister.exists('../outside.txt')).rejects.toThrow(FileListerError);
      await expect(lister.exists('../outside.txt')).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });

    it('[EARS-FFL04] should throw INVALID_PATH for path traversal on stat', async () => {
      await expect(lister.stat('../outside.txt')).rejects.toThrow(FileListerError);
      await expect(lister.stat('../outside.txt')).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });

    it('[EARS-FFL04] should throw INVALID_PATH for path traversal in patterns', async () => {
      await expect(lister.list(['../**/*.ts'])).rejects.toThrow(FileListerError);
      await expect(lister.list(['../**/*.ts'])).rejects.toMatchObject({
        code: 'INVALID_PATH',
      });
    });
  });

  describe('Options', () => {
    it('should respect maxDepth option', async () => {
      await createFile('level1.ts');
      await createFile('a/level2.ts');
      await createFile('a/b/level3.ts');
      await createFile('a/b/c/level4.ts');

      const files = await lister.list(['**/*.ts'], { maxDepth: 2 });
      expect(files).toContain('level1.ts');
      expect(files).toContain('a/level2.ts');
      // maxDepth: 2 means traverse up to 2 levels deep
      // behavior depends on fast-glob implementation
    });

    it('should support absolute paths option', async () => {
      await createFile('src/index.ts');

      const files = await lister.list(['**/*.ts'], { absolute: true });
      expect(files.every((f) => path.isAbsolute(f))).toBe(true);
      expect(files[0]).toContain(tempDir);
    });
  });
});
