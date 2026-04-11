/**
 * EnvKeyProvider - Environment variable-based KeyProvider implementation
 *
 * Reads private keys from environment variables.
 * Used in serverless environments (Atlassian Forge, AWS Lambda, etc.) and CI/CD.
 *
 * @module key_provider/memory/env_key_provider
 */

import { sign } from 'crypto';
import type { KeyProvider } from '../key_provider';
import { KeyProviderError } from '../key_provider';
import { derivePublicKey } from '../../crypto/signatures';

/**
 * Options for EnvKeyProvider.
 */
export interface EnvKeyProviderOptions {
  /** Prefix for environment variable names (default: 'GITGOV_KEY_') */
  prefix?: string;
  /** Environment object to read from (default: process.env) */
  env?: Record<string, string | undefined>;
  /** Allow writes to custom env object (default: false for process.env, true otherwise) */
  allowWrites?: boolean;
}

/**
 * Environment variable-based KeyProvider implementation.
 * Keys are read from environment variables with a configurable prefix.
 *
 * Variable naming: {prefix}{SANITIZED_ACTOR_ID}
 * Example: GITGOV_KEY_ACTOR_HUMAN_ALICE for actorId "actor:human:alice"
 *
 * @example
 * ```typescript
 * // Read from process.env (default, read-only)
 * const provider = new EnvKeyProvider({ prefix: 'GITGOV_KEY_' });
 *
 * // Read from custom env object (writable)
 * const customEnv = { GITGOV_KEY_ACTOR_BOT: 'base64key...' };
 * const provider = new EnvKeyProvider({ env: customEnv, allowWrites: true });
 * ```
 */
export class EnvKeyProvider implements KeyProvider {
  private readonly prefix: string;
  private readonly env: Record<string, string | undefined>;
  private readonly allowWrites: boolean;

  constructor(options: EnvKeyProviderOptions = {}) {
    this.prefix = options.prefix ?? 'GITGOV_KEY_';
    // [EARS-EKP12] Default to process.env, always allows reads
    this.env = options.env ?? process.env;
    // Default: allow writes only if using custom env object
    this.allowWrites = options.allowWrites ?? (options.env !== undefined);
  }

  /**
   * [EARS-EKP13] Signs data with an Ed25519 private key from environment variable.
   * Throws KeyProviderError('KEY_NOT_FOUND') if env var not set.
   */
  async sign(actorId: string, data: Uint8Array): Promise<Uint8Array> {
    const privateKey = await this.getPrivateKey(actorId);
    if (!privateKey) {
      throw new KeyProviderError(
        `Private key not found in env for ${actorId}`,
        'KEY_NOT_FOUND',
        { actorId, hint: 'Set environment variable with the private key' }
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
   * [EARS-KP01] Retrieves the private key from environment variable.
   * [EARS-EKP01] Reads from {prefix}{SANITIZED_ACTOR_ID}.
   * [EARS-EKP07] Returns null for empty or whitespace-only value.
   * [EARS-EKP08] Trims whitespace from value.
   */
  async getPrivateKey(actorId: string): Promise<string | null> {
    const varName = this.getEnvVarName(actorId);
    const value = this.env[varName];

    if (!value || value.trim() === '') {
      return null;
    }

    return value.trim();
  }

  /**
   * [EARS-KP07] Derives the raw Ed25519 public key from the stored private key.
   * [EARS-KP08] Returns null if no private key env var is set for the actor.
   */
  async getPublicKey(actorId: string): Promise<string | null> {
    const privateKey = await this.getPrivateKey(actorId);
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
   * [EARS-KP03] Stores a private key in the environment object.
   * [EARS-EKP02] Sets env var in custom env object.
   * [EARS-EKP03] Throws KEY_WRITE_ERROR when writing to process.env.
   */
  async setPrivateKey(actorId: string, privateKey: string): Promise<void> {
    if (!this.allowWrites) {
      throw new KeyProviderError(
        'Cannot write to environment variables in read-only mode. ' +
        'Use a custom env object with allowWrites: true for writable storage.',
        'KEY_WRITE_ERROR',
        { actorId }
      );
    }

    const varName = this.getEnvVarName(actorId);
    this.env[varName] = privateKey;
  }

  /**
   * Checks if a private key exists in environment variables.
   */
  async hasPrivateKey(actorId: string): Promise<boolean> {
    const varName = this.getEnvVarName(actorId);
    const value = this.env[varName];
    return value !== undefined && value.trim() !== '';
  }

  /**
   * [EARS-KP04] Deletes the private key from environment object.
   * [EARS-EKP10] Throws KEY_DELETE_ERROR in read-only mode.
   */
  async deletePrivateKey(actorId: string): Promise<boolean> {
    if (!this.allowWrites) {
      throw new KeyProviderError(
        'Cannot delete environment variables in read-only mode.',
        'KEY_DELETE_ERROR',
        { actorId }
      );
    }

    const varName = this.getEnvVarName(actorId);
    const existed = this.env[varName] !== undefined;
    delete this.env[varName];
    return existed;
  }

  /**
   * [EARS-EKP04] Builds environment variable name from actorId.
   * [EARS-EKP05] Converts to UPPERCASE.
   * [EARS-EKP06] Collapses multiple underscores.
   * [EARS-EKP11] Throws INVALID_ACTOR_ID if empty after sanitization.
   */
  private getEnvVarName(actorId: string): string {
    // Sanitize: replace non-alphanumeric with underscores, uppercase
    const sanitized = actorId
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_')  // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Trim leading/trailing underscores

    // [EARS-EKP11] Throw if empty after sanitization
    if (!sanitized) {
      throw new KeyProviderError(
        'Invalid actorId: empty after sanitization',
        'INVALID_ACTOR_ID',
        { actorId }
      );
    }

    return `${this.prefix}${sanitized}`;
  }
}
