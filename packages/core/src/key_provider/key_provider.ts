/**
 * KeyProvider Interface
 *
 * Abstracts private key storage for Actor signing operations.
 * Enables different backends: filesystem (development), environment variables (serverless),
 * or cloud KMS (enterprise).
 *
 * @module key_provider
 */

/**
 * Error codes for KeyProvider operations.
 */
export type KeyProviderErrorCode =
  | 'KEY_NOT_FOUND'
  | 'KEY_READ_ERROR'
  | 'KEY_WRITE_ERROR'
  | 'KEY_DELETE_ERROR'
  | 'INVALID_KEY_FORMAT'
  | 'INVALID_ACTOR_ID';

/**
 * Error thrown when key operations fail.
 */
export class KeyProviderError extends Error {
  constructor(
    message: string,
    public readonly code: KeyProviderErrorCode,
    public readonly actorId?: string
  ) {
    super(message);
    this.name = 'KeyProviderError';
  }
}

/**
 * Interface for managing private key storage.
 * Implementations handle the actual persistence mechanism.
 *
 * @example
 * ```typescript
 * // Filesystem backend (development)
 * const provider = new FsKeyProvider({ keysDir: '.gitgov/keys' });
 *
 * // Environment backend (serverless)
 * const provider = new EnvKeyProvider({ prefix: 'GITGOV_KEY_' });
 *
 * // Usage
 * const privateKey = await provider.getPrivateKey('actor:human:alice');
 * if (privateKey) {
 *   const signature = signPayload(payload, privateKey, actorId, role);
 * }
 * ```
 */
export interface KeyProvider {
  /**
   * Retrieves the private key for an actor.
   * @param actorId - The actor's ID (e.g., 'actor:human:alice')
   * @returns The base64-encoded private key, or null if not found
   */
  getPrivateKey(actorId: string): Promise<string | null>;

  /**
   * Stores a private key for an actor.
   * @param actorId - The actor's ID
   * @param privateKey - The base64-encoded private key
   * @throws KeyProviderError if write fails
   */
  setPrivateKey(actorId: string, privateKey: string): Promise<void>;

  /**
   * Checks if a private key exists for an actor.
   * @param actorId - The actor's ID
   * @returns true if key exists, false otherwise
   */
  hasPrivateKey(actorId: string): Promise<boolean>;

  /**
   * Deletes the private key for an actor.
   * @param actorId - The actor's ID
   * @returns true if key was deleted, false if it didn't exist
   */
  deletePrivateKey(actorId: string): Promise<boolean>;
}
