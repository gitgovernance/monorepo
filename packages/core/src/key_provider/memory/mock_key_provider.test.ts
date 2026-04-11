/**
 * MockKeyProvider Tests
 *
 * Tests for in-memory KeyProvider implementation (for testing).
 * EARS: KP01-KP08 (interface incl. getPublicKey), MKP01-MKP10 (mock-specific)
 */

import { verify, createHash } from 'crypto';
import { MockKeyProvider } from './mock_key_provider';
import { KeyProviderError } from '../key_provider';
import { generateKeys } from '../../crypto/signatures';

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

  describe('Signing (EARS-MKP08)', () => {
    it('[EARS-MKP08] should sign data with stored Ed25519 key and throw KEY_NOT_FOUND when missing', async () => {
      const { publicKey, privateKey } = await generateKeys();
      const provider = new MockKeyProvider({ keys: { 'human:signer': privateKey } });

      const data = new Uint8Array(createHash('sha256').update('test-payload').digest());
      const signature = await provider.sign('human:signer', data);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);

      // Verify Ed25519 signature
      const algorithmId = Buffer.from([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]);
      const spki = Buffer.concat([algorithmId, Buffer.from(publicKey, 'base64')]);
      const isValid = verify(null, data, { key: spki, type: 'spki', format: 'der' }, Buffer.from(signature));
      expect(isValid).toBe(true);

      // Throws KEY_NOT_FOUND for missing actor
      await expect(provider.sign('human:nonexistent', data))
        .rejects.toThrow(KeyProviderError);
      await expect(provider.sign('human:nonexistent', data))
        .rejects.toMatchObject({ code: 'KEY_NOT_FOUND' });
    });
  });

  describe('Public Key Derivation (EARS-MKP09 to MKP10)', () => {
    it('[EARS-MKP09] should derive public key from stored private key', async () => {
      const { publicKey, privateKey } = await generateKeys();
      const provider = new MockKeyProvider({ keys: { 'human:alice': privateKey } });

      const derived = await provider.getPublicKey('human:alice');
      expect(derived).toBe(publicKey);
      expect(derived).toHaveLength(44);
    });

    it('[EARS-MKP10] should return null when no private key exists', async () => {
      const provider = new MockKeyProvider();
      const result = await provider.getPublicKey('human:nonexistent');
      expect(result).toBeNull();
    });
  });
});
