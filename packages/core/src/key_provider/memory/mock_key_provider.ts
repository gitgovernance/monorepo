/**
 * MockKeyProvider - In-memory KeyProvider for testing
 *
 * Stores keys in a Map for unit testing without I/O.
 *
 * @module key_provider/memory/mock_key_provider
 */

import { sign } from 'crypto';
import type { KeyProvider } from '../key_provider';
import { KeyProviderError } from '../key_provider';
import { derivePublicKey } from '../../crypto/signatures';

/**
 * Options for MockKeyProvider.
 */
export interface MockKeyProviderOptions {
  /** Initial keys to populate (actorId -> privateKey) */
  keys?: Map<string, string> | Record<string, string>;
}

/**
 * In-memory KeyProvider for testing.
 * All operations use an internal Map, no I/O required.
 *
 * @example
 * ```typescript
 * // Empty provider
 * const provider = new MockKeyProvider();
 *
 * // Pre-populated provider
 * const provider = new MockKeyProvider({
 *   keys: { 'actor:human:alice': 'base64key...' }
 * });
 *
 * // Use in tests
 * await provider.setPrivateKey('actor:bot:test', 'testkey');
 * const key = await provider.getPrivateKey('actor:bot:test');
 * ```
 */
export class MockKeyProvider implements KeyProvider {
  private readonly keys: Map<string, string>;

  constructor(options: MockKeyProviderOptions = {}) {
    if (options.keys instanceof Map) {
      this.keys = new Map(options.keys);
    } else if (options.keys) {
      this.keys = new Map(Object.entries(options.keys));
    } else {
      this.keys = new Map();
    }
  }

  /**
   * [EARS-MKP08] Signs data with a stored Ed25519 private key.
   * Throws KeyProviderError('KEY_NOT_FOUND') if no key stored for actorId.
   */
  async sign(actorId: string, data: Uint8Array): Promise<Uint8Array> {
    const privateKey = this.keys.get(actorId);
    if (!privateKey) {
      throw new KeyProviderError(
        `Private key not found for ${actorId}`,
        'KEY_NOT_FOUND',
        { actorId, hint: 'Use setPrivateKey() to seed a key in MockKeyProvider' }
      );
    }

    const signature = sign(null, data, {
      key: Buffer.from(privateKey, 'base64'),
      type: 'pkcs8',
      format: 'pem',
    });
    return new Uint8Array(signature);
  }

  /**
   * [EARS-KP01] Retrieves the private key for an actor.
   */
  async getPrivateKey(actorId: string): Promise<string | null> {
    return this.keys.get(actorId) ?? null;
  }

  /**
   * [EARS-KP07] Derives the raw Ed25519 public key from the stored private key.
   * [EARS-KP08] Returns null if no private key exists for the actor.
   */
  async getPublicKey(actorId: string): Promise<string | null> {
    const privateKey = this.keys.get(actorId);
    if (!privateKey) {
      return null;
    }
    try {
      return derivePublicKey(privateKey);
    } catch (error) {
      throw new KeyProviderError(
        `Failed to derive public key for ${actorId}: ${(error as Error).message}`,
        'KEY_READ_ERROR',
        { actorId }
      );
    }
  }

  /**
   * [EARS-KP03] Stores a private key for an actor.
   * [EARS-MKP03] Overwrites existing key if present.
   */
  async setPrivateKey(actorId: string, privateKey: string): Promise<void> {
    this.keys.set(actorId, privateKey);
  }

  /**
   * [EARS-MKP07] Checks if a private key exists for an actor.
   */
  async hasPrivateKey(actorId: string): Promise<boolean> {
    return this.keys.has(actorId);
  }

  /**
   * [EARS-KP04] Deletes the private key for an actor.
   */
  async deletePrivateKey(actorId: string): Promise<boolean> {
    return this.keys.delete(actorId);
  }

  /**
   * [EARS-MKP04] Returns the number of stored keys (useful for testing).
   */
  size(): number {
    return this.keys.size;
  }

  /**
   * [EARS-MKP05] Clears all stored keys (useful for test cleanup).
   */
  clear(): void {
    this.keys.clear();
  }

  /**
   * [EARS-MKP06] Returns all stored actor IDs (useful for testing).
   */
  listActorIds(): string[] {
    return Array.from(this.keys.keys());
  }
}
