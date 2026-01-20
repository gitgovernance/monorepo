/**
 * EnvKeyProvider Tests
 *
 * Tests for environment variable-based KeyProvider implementation.
 * EARS: KP01-KP04 (interface), EKP01-EKP12 (env-specific)
 */

import { EnvKeyProvider } from './env_key_provider';
import { KeyProviderError } from '../key_provider';

describe('EnvKeyProvider', () => {
  describe('KeyProvider Interface (EARS-KP01 to KP04)', () => {
    let env: Record<string, string | undefined>;
    let provider: EnvKeyProvider;

    beforeEach(() => {
      env = {};
      provider = new EnvKeyProvider({ env, allowWrites: true });
    });

    it('[EARS-KP01] should return private key for existing actor', async () => {
      env['GITGOV_KEY_ACTOR_HUMAN_ALICE'] = 'alicePrivateKey';

      const result = await provider.getPrivateKey('actor:human:alice');

      expect(result).toBe('alicePrivateKey');
    });

    it('[EARS-KP02] should return null for non-existent actor', async () => {
      const result = await provider.getPrivateKey('actor:unknown');

      expect(result).toBeNull();
    });

    it('[EARS-KP03] should persist key so get returns it', async () => {
      await provider.setPrivateKey('actor:bot:test', 'botKey');

      const result = await provider.getPrivateKey('actor:bot:test');

      expect(result).toBe('botKey');
    });

    it('[EARS-KP04] should delete key and return true', async () => {
      await provider.setPrivateKey('actor:delete', 'toDelete');

      const deleted = await provider.deletePrivateKey('actor:delete');

      expect(deleted).toBe(true);
      expect(env['GITGOV_KEY_ACTOR_DELETE']).toBeUndefined();
    });

    it('[EARS-KP04] should return false when deleting non-existent key', async () => {
      const deleted = await provider.deletePrivateKey('actor:nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('EnvKeyProvider Specifics (EARS-EKP01 to EKP08)', () => {
    let env: Record<string, string | undefined>;
    let provider: EnvKeyProvider;

    beforeEach(() => {
      env = {};
      provider = new EnvKeyProvider({ env, allowWrites: true });
    });

    it('[EARS-EKP01] should read from {prefix}{actorId} env var', async () => {
      env['GITGOV_KEY_ACTOR_HUMAN_ALICE'] = 'alicePrivateKey';

      const result = await provider.getPrivateKey('actor:human:alice');

      expect(result).toBe('alicePrivateKey');
    });

    it('[EARS-EKP02] should set env var in custom env object', async () => {
      await provider.setPrivateKey('actor:bot:test', 'botKey');

      expect(env['GITGOV_KEY_ACTOR_BOT_TEST']).toBe('botKey');
    });

    it('[EARS-EKP03] should throw KEY_WRITE_ERROR when writing to process.env', async () => {
      const readOnlyProvider = new EnvKeyProvider(); // Default: process.env, read-only

      await expect(readOnlyProvider.setPrivateKey('actor:test', 'key'))
        .rejects
        .toThrow(KeyProviderError);

      await expect(readOnlyProvider.setPrivateKey('actor:test', 'key'))
        .rejects
        .toMatchObject({ code: 'KEY_WRITE_ERROR' });
    });

    it('[EARS-EKP04] should replace non-alphanumeric with underscores', async () => {
      await provider.setPrivateKey('actor:human:alice-v2', 'keyV2');

      // actor:human:alice-v2 -> ACTOR_HUMAN_ALICE_V2
      expect(env['GITGOV_KEY_ACTOR_HUMAN_ALICE_V2']).toBe('keyV2');
    });

    it('[EARS-EKP05] should uppercase the actor ID', async () => {
      env['GITGOV_KEY_ACTOR_LOWERCASE'] = 'lowercaseKey';

      const result = await provider.getPrivateKey('actor:Lowercase');

      expect(result).toBe('lowercaseKey');
    });

    it('[EARS-EKP06] should collapse multiple underscores', async () => {
      await provider.setPrivateKey('actor::double::colon', 'key');

      // Multiple colons become underscores, then collapsed
      expect(env['GITGOV_KEY_ACTOR_DOUBLE_COLON']).toBe('key');
    });

    it('[EARS-EKP07] should return null for empty env var', async () => {
      env['GITGOV_KEY_ACTOR_EMPTY'] = '';

      const result = await provider.getPrivateKey('actor:empty');

      expect(result).toBeNull();
    });

    it('[EARS-EKP07] should return null for whitespace-only env var', async () => {
      env['GITGOV_KEY_ACTOR_WHITESPACE'] = '   ';

      const result = await provider.getPrivateKey('actor:whitespace');

      expect(result).toBeNull();
    });

    it('[EARS-EKP08] should trim whitespace from env var value', async () => {
      env['GITGOV_KEY_ACTOR_TRIMME'] = '  keyWithSpaces  ';

      const result = await provider.getPrivateKey('actor:trimme');

      expect(result).toBe('keyWithSpaces');
    });
  });

  describe('Configuration (EARS-EKP09 to EKP10)', () => {
    it('[EARS-EKP09] should use custom prefix', async () => {
      const env: Record<string, string | undefined> = {};
      const customProvider = new EnvKeyProvider({
        env,
        prefix: 'MY_KEYS_',
        allowWrites: true
      });

      await customProvider.setPrivateKey('actor:test', 'customPrefixKey');

      expect(env['MY_KEYS_ACTOR_TEST']).toBe('customPrefixKey');
    });

    it('[EARS-EKP10] should throw KEY_DELETE_ERROR in read-only mode', async () => {
      const readOnlyProvider = new EnvKeyProvider();

      await expect(readOnlyProvider.deletePrivateKey('actor:test'))
        .rejects
        .toThrow(KeyProviderError);
    });

    it('[EARS-EKP12] should allow reads from process.env in read-only mode', async () => {
      const originalEnv = process.env['GITGOV_KEY_TEST_READ'];
      process.env['GITGOV_KEY_TEST_READ'] = 'readableKey';

      try {
        const provider = new EnvKeyProvider();
        const result = await provider.getPrivateKey('test:read');

        expect(result).toBe('readableKey');
      } finally {
        if (originalEnv === undefined) {
          delete process.env['GITGOV_KEY_TEST_READ'];
        } else {
          process.env['GITGOV_KEY_TEST_READ'] = originalEnv;
        }
      }
    });
  });

  describe('Error Handling (EARS-EKP11)', () => {
    it('[EARS-EKP11] should throw INVALID_ACTOR_ID for empty actorId after sanitization', async () => {
      const provider = new EnvKeyProvider({ env: {}, allowWrites: true });

      // This should result in empty string after sanitization
      await expect(provider.setPrivateKey('::::', 'key'))
        .rejects
        .toMatchObject({ code: 'INVALID_ACTOR_ID' });
    });
  });
});
