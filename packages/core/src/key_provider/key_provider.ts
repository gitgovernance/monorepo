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
  | 'INVALID_ACTOR_ID'
  | 'DECRYPTION_FAILED'
  | 'STORE_FAILED';

/**
 * Context for KeyProvider errors.
 */
export type KeyProviderErrorContext = {
  actorId?: string;
  orgId?: string;
  hint?: string;
  cause?: Error;
};

/**
 * Error thrown when key operations fail.
 */
export class KeyProviderError extends Error {
  constructor(
    message: string,
    public readonly code: KeyProviderErrorCode,
    public readonly context: KeyProviderErrorContext = {}
  ) {
    super(message);
    this.name = 'KeyProviderError';
  }
}

/**
 * Ed25519 key pair — used by PrismaKeyProvider.storeKey() and IdentityAdapter.createActor().
 * Both publicKey and privateKey are base64-encoded raw Ed25519 bytes (32 bytes each).
 */
export type KeyPair = {
  publicKey: string;
  privateKey: string;
};

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
   * [EARS-KP05] Signs data with the actor's private key without exposing it.
   * Primary signing method — HSM-ready (key never leaves the provider).
   * [EARS-KP06] Throws KeyProviderError('KEY_NOT_FOUND') if no key exists.
   * @param actorId - The actor's ID
   * @param data - Raw bytes to sign (typically a SHA-256 digest)
   * @returns Ed25519 signature bytes
   */
  sign(actorId: string, data: Uint8Array): Promise<Uint8Array>;

  /**
   * Retrieves the private key for an actor.
   * Used for sync/export, NOT for signing (use sign() instead — HSM-ready).
   * @param actorId - The actor's ID (e.g., 'actor:human:alice')
   * @returns The base64-encoded private key, or null if not found
   */
  getPrivateKey(actorId: string): Promise<string | null>;

  /**
   * [EARS-KP07] Retrieves the public key for an actor.
   * Required for key verification flows (KEY_MISMATCH detection in IdentityService).
   * Implementations MAY cache this field directly (PrismaKeyProvider) or derive from the
   * private key via derivePublicKey() (FsKeyProvider, MockKeyProvider, EnvKeyProvider).
   * [EARS-KP08] Returns null if the actor has no key (fail-safe, same as getPrivateKey).
   * @param actorId - The actor's ID
   * @returns The base64-encoded public key (44 chars, raw Ed25519), or null if not found
   */
  getPublicKey(actorId: string): Promise<string | null>;

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
