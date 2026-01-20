/**
 * MockKeyProvider Tests
 *
 * Tests for in-memory KeyProvider implementation (for testing).
 * EARS: KP01-KP04 (interface), MKP01-MKP07 (mock-specific)
 */

import { MockKeyProvider } from './mock_key_provider';

describe('MockKeyProvider', () => {
  describe('KeyProvider Interface (EARS-KP01 to KP04)', () => {
    let provider: MockKeyProvider;

    beforeEach(() => {
      provider = new MockKeyProvider();
    });

    it('[EARS-KP01] should return private key for existing actor', async () => {
      await provider.setPrivateKey('actor:test', 'testKey');

      const result = await provider.getPrivateKey('actor:test');

      expect(result).toBe('testKey');
    });

    it('[EARS-KP02] should return null for non-existent actor', async () => {
      const result = await provider.getPrivateKey('actor:unknown');

      expect(result).toBeNull();
    });

    it('[EARS-KP03] should persist key so get returns it', async () => {
      await provider.setPrivateKey('actor:test', 'testKey');

      const result = await provider.getPrivateKey('actor:test');

      expect(result).toBe('testKey');
    });

    it('[EARS-KP04] should delete key and return true', async () => {
      await provider.setPrivateKey('actor:delete', 'toDelete');

      const deleted = await provider.deletePrivateKey('actor:delete');

      expect(deleted).toBe(true);
      expect(await provider.hasPrivateKey('actor:delete')).toBe(false);
    });

    it('[EARS-KP04] should return false when deleting non-existent key', async () => {
      const deleted = await provider.deletePrivateKey('actor:nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('MockKeyProvider Specifics (EARS-MKP01 to MKP06)', () => {
    it('[EARS-MKP01] should not modify original Map', async () => {
      const original = new Map([['actor:test', 'original']]);
      const provider = new MockKeyProvider({ keys: original });

      await provider.setPrivateKey('actor:test', 'modified');
      await provider.setPrivateKey('actor:new', 'newKey');

      expect(original.get('actor:test')).toBe('original');
      expect(original.has('actor:new')).toBe(false);
    });

    it('[EARS-MKP02] should accept object in constructor', async () => {
      const provider = new MockKeyProvider({
        keys: {
          'actor:human:alice': 'aliceKey',
          'actor:bot:test': 'botKey'
        }
      });

      expect(await provider.getPrivateKey('actor:human:alice')).toBe('aliceKey');
      expect(await provider.getPrivateKey('actor:bot:test')).toBe('botKey');
    });

    it('[EARS-MKP01] should accept Map in constructor', async () => {
      const keys = new Map([
        ['actor:a', 'keyA'],
        ['actor:b', 'keyB']
      ]);

      const provider = new MockKeyProvider({ keys });

      expect(await provider.getPrivateKey('actor:a')).toBe('keyA');
      expect(await provider.getPrivateKey('actor:b')).toBe('keyB');
    });

    it('[EARS-MKP03] should overwrite existing key', async () => {
      const provider = new MockKeyProvider();

      await provider.setPrivateKey('actor:test', 'original');
      await provider.setPrivateKey('actor:test', 'updated');

      const result = await provider.getPrivateKey('actor:test');

      expect(result).toBe('updated');
    });

    it('[EARS-MKP04] should return size of stored keys', async () => {
      const provider = new MockKeyProvider();

      expect(provider.size()).toBe(0);

      await provider.setPrivateKey('actor:a', 'keyA');
      expect(provider.size()).toBe(1);

      await provider.setPrivateKey('actor:b', 'keyB');
      expect(provider.size()).toBe(2);
    });

    it('[EARS-MKP05] should clear all keys', async () => {
      const provider = new MockKeyProvider({
        keys: { 'actor:a': 'keyA', 'actor:b': 'keyB' }
      });

      expect(provider.size()).toBe(2);

      provider.clear();

      expect(provider.size()).toBe(0);
      expect(await provider.hasPrivateKey('actor:a')).toBe(false);
    });

    it('[EARS-MKP06] should list all actor IDs', async () => {
      const provider = new MockKeyProvider({
        keys: {
          'actor:human:alice': 'keyA',
          'actor:bot:test': 'keyB'
        }
      });

      const actorIds = provider.listActorIds();

      expect(actorIds).toContain('actor:human:alice');
      expect(actorIds).toContain('actor:bot:test');
      expect(actorIds.length).toBe(2);
    });
  });

  describe('hasPrivateKey (EARS-MKP07)', () => {
    it('[EARS-MKP07] should check if key exists', async () => {
      const provider = new MockKeyProvider();

      expect(await provider.hasPrivateKey('actor:test')).toBe(false);

      await provider.setPrivateKey('actor:test', 'key');

      expect(await provider.hasPrivateKey('actor:test')).toBe(true);
    });
  });
});
