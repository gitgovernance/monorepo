/**
 * FsKeyProvider Tests
 *
 * Tests for filesystem-based KeyProvider implementation.
 * EARS: KP01-KP04 (interface), FKP01-FKP10 (fs-specific)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FsKeyProvider } from './fs_key_provider';
import { KeyProviderError } from '../key_provider';

describe('FsKeyProvider', () => {
  let tempDir: string;
  let actorsDir: string;
  let provider: FsKeyProvider;

  beforeEach(async () => {
    // Create temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-key-provider-test-'));
    actorsDir = path.join(tempDir, 'actors');
    provider = new FsKeyProvider({ actorsDir });
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('KeyProvider Interface (EARS-KP01 to KP04)', () => {
    it('[EARS-KP01] should return private key for existing actor', async () => {
      const actorId = 'actor:human:alice';
      const privateKey = 'base64EncodedPrivateKey123';

      await provider.setPrivateKey(actorId, privateKey);
      const result = await provider.getPrivateKey(actorId);

      expect(result).toBe(privateKey);
    });

    it('[EARS-KP02] should return null for non-existent actor', async () => {
      const result = await provider.getPrivateKey('actor:human:unknown');

      expect(result).toBeNull();
    });

    it('[EARS-KP03] should persist key so get returns it', async () => {
      const actorId = 'actor:bot:test';
      const privateKey = 'testPrivateKey456';

      await provider.setPrivateKey(actorId, privateKey);

      // Create new provider instance to verify persistence
      const newProvider = new FsKeyProvider({ actorsDir });
      const result = await newProvider.getPrivateKey(actorId);

      expect(result).toBe(privateKey);
    });

    it('[EARS-KP04] should delete key and return true', async () => {
      const actorId = 'actor:human:bob';
      const privateKey = 'bobsKey';

      await provider.setPrivateKey(actorId, privateKey);
      const deleted = await provider.deletePrivateKey(actorId);

      expect(deleted).toBe(true);
      expect(await provider.getPrivateKey(actorId)).toBeNull();
    });

    it('[EARS-KP04] should return false when deleting non-existent key', async () => {
      const deleted = await provider.deletePrivateKey('actor:nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('FsKeyProvider Specifics (EARS-FKP01 to FKP08)', () => {
    it('[EARS-FKP01] should create actorsDir if not exists', async () => {
      const dirExists = async () => {
        try {
          await fs.access(actorsDir);
          return true;
        } catch {
          return false;
        }
      };

      expect(await dirExists()).toBe(false);

      // After setPrivateKey, directory should exist
      await provider.setPrivateKey('actor:test', 'key');

      expect(await dirExists()).toBe(true);
    });

    it('[EARS-FKP02] should write key to {actorsDir}/{actorId}.key', async () => {
      const actorId = 'actor:human:test';
      const privateKey = 'testKey123';

      await provider.setPrivateKey(actorId, privateKey);

      const keyPath = path.join(actorsDir, 'actor:human:test.key');
      const content = await fs.readFile(keyPath, 'utf-8');

      expect(content).toBe(privateKey);
    });

    it('[EARS-FKP03] should set secure file permissions (0600)', async () => {
      const actorId = 'actor:secure';
      await provider.setPrivateKey(actorId, 'secureKey');

      const keyPath = path.join(actorsDir, 'actor:secure.key');
      const stats = await fs.stat(keyPath);

      // Check permissions (0600 = owner read/write only)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('[EARS-FKP04] should sanitize actorId to prevent path traversal', async () => {
      const maliciousId = '../../../etc/passwd';
      const privateKey = 'shouldNotEscape';

      await provider.setPrivateKey(maliciousId, privateKey);

      // Verify key was written in actorsDir, not escaped
      const files = await fs.readdir(actorsDir);
      expect(files.length).toBe(1);
      expect(files[0]).not.toContain('..');

      // Verify no file was created outside actorsDir
      const parentDir = path.dirname(actorsDir);
      const parentFiles = await fs.readdir(parentDir);
      expect(parentFiles).not.toContain('passwd');
    });

    it('[EARS-FKP05] should handle slashes in actorId', async () => {
      const actorId = 'actor/with/slashes';
      const privateKey = 'slashKey';

      await provider.setPrivateKey(actorId, privateKey);
      const result = await provider.getPrivateKey(actorId);

      expect(result).toBe(privateKey);
    });

    it('[EARS-FKP06] should return true if key file exists', async () => {
      const actorId = 'actor:human:exists';

      expect(await provider.hasPrivateKey(actorId)).toBe(false);

      await provider.setPrivateKey(actorId, 'someKey');

      expect(await provider.hasPrivateKey(actorId)).toBe(true);
    });

    it('[EARS-FKP07] should trim whitespace from key content', async () => {
      const actorId = 'actor:whitespace';
      const keyPath = path.join(actorsDir, 'actor:whitespace.key');

      // Manually write key with whitespace
      await fs.mkdir(actorsDir, { recursive: true });
      await fs.writeFile(keyPath, '  keyWithSpaces  \n', 'utf-8');

      const result = await provider.getPrivateKey(actorId);

      expect(result).toBe('keyWithSpaces');
    });

    it('[EARS-FKP08] should return null for empty key file', async () => {
      const actorId = 'actor:empty';
      const keyPath = path.join(actorsDir, 'actor:empty.key');

      await fs.mkdir(actorsDir, { recursive: true });
      await fs.writeFile(keyPath, '', 'utf-8');

      const result = await provider.getPrivateKey(actorId);

      expect(result).toBeNull();
    });
  });

  describe('Error Handling (EARS-FKP09 to FKP10)', () => {
    it('[EARS-FKP09] should throw INVALID_ACTOR_ID for empty actorId', async () => {
      await expect(provider.setPrivateKey('..', 'key'))
        .rejects
        .toThrow(KeyProviderError);
    });

    it('[EARS-FKP10] should use custom file extension', async () => {
      const customProvider = new FsKeyProvider({
        actorsDir,
        extension: '.privkey'
      });

      await customProvider.setPrivateKey('actor:test', 'customKey');

      const keyPath = path.join(actorsDir, 'actor:test.privkey');
      const content = await fs.readFile(keyPath, 'utf-8');

      expect(content).toBe('customKey');
    });
  });
});
