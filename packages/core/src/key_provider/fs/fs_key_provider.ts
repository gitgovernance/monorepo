/**
 * FsKeyProvider - Filesystem-based KeyProvider implementation
 *
 * Stores private keys alongside actor records in .gitgov/actors/{actorId}.key
 * Used in development and CLI environments.
 *
 * @module key_provider/fs/fs_key_provider
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { KeyProvider } from '../key_provider';
import { KeyProviderError } from '../key_provider';

/**
 * Options for FsKeyProvider.
 */
export interface FsKeyProviderOptions {
  /** Directory where key files are stored (same as actors: .gitgov/actors) */
  actorsDir: string;
  /** File extension for key files (default: '.key') */
  extension?: string;
  /** File permissions for key files (default: 0o600 - owner read/write only) */
  fileMode?: number;
}

/**
 * Filesystem-based KeyProvider implementation.
 * Keys are stored alongside actor records with .key extension.
 *
 * @example
 * ```typescript
 * const provider = new FsKeyProvider({ actorsDir: '.gitgov/actors' });
 * await provider.setPrivateKey('actor:human:alice', 'base64PrivateKey...');
 * const key = await provider.getPrivateKey('actor:human:alice');
 * ```
 */
export class FsKeyProvider implements KeyProvider {
  private readonly actorsDir: string;
  private readonly extension: string;
  private readonly fileMode: number;

  constructor(options: FsKeyProviderOptions) {
    this.actorsDir = options.actorsDir;
    this.extension = options.extension ?? '.key';
    this.fileMode = options.fileMode ?? 0o600;
  }

  /**
   * [EARS-KP01] Retrieves the private key for an actor.
   * [EARS-FKP07] Trims whitespace from content.
   * [EARS-FKP08] Returns null for empty key file.
   */
  async getPrivateKey(actorId: string): Promise<string | null> {
    const keyPath = this.getKeyPath(actorId);

    try {
      const content = await fs.readFile(keyPath, 'utf-8');
      const key = content.trim();

      if (!key) {
        return null;
      }

      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // [EARS-KP02] File not found - return null
        return null;
      }

      throw new KeyProviderError(
        `Failed to read private key for ${this.sanitizeForLog(actorId)}: ${(error as Error).message}`,
        'KEY_READ_ERROR',
        actorId
      );
    }
  }

  /**
   * [EARS-KP03] Stores a private key for an actor.
   * [EARS-FKP01] Creates actorsDir if not exists.
   * [EARS-FKP02] Writes key to {actorsDir}/{actorId}.key.
   * [EARS-FKP03] Sets secure file permissions (0600).
   */
  async setPrivateKey(actorId: string, privateKey: string): Promise<void> {
    const keyPath = this.getKeyPath(actorId);

    try {
      // [EARS-FKP01] Ensure directory exists
      await fs.mkdir(this.actorsDir, { recursive: true });

      // [EARS-FKP02] Write key to {actorsDir}/{actorId}.key
      await fs.writeFile(keyPath, privateKey, 'utf-8');

      // [EARS-FKP03] Set secure file permissions (owner read/write only)
      await fs.chmod(keyPath, this.fileMode);
    } catch (error) {
      throw new KeyProviderError(
        `Failed to write private key for ${this.sanitizeForLog(actorId)}: ${(error as Error).message}`,
        'KEY_WRITE_ERROR',
        actorId
      );
    }
  }

  /**
   * [EARS-FKP06] Checks if a private key exists for an actor.
   */
  async hasPrivateKey(actorId: string): Promise<boolean> {
    const keyPath = this.getKeyPath(actorId);

    try {
      await fs.access(keyPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * [EARS-KP04] Deletes the private key for an actor.
   */
  async deletePrivateKey(actorId: string): Promise<boolean> {
    const keyPath = this.getKeyPath(actorId);

    try {
      await fs.unlink(keyPath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File didn't exist
        return false;
      }

      throw new KeyProviderError(
        `Failed to delete private key for ${this.sanitizeForLog(actorId)}: ${(error as Error).message}`,
        'KEY_DELETE_ERROR',
        actorId
      );
    }
  }

  /**
   * [EARS-FKP04] Builds the key file path, sanitizing actorId to prevent path traversal.
   * [EARS-FKP05] Replaces slashes with underscores.
   */
  private getKeyPath(actorId: string): string {
    // Sanitize actorId to prevent path traversal attacks
    const sanitized = this.sanitizeActorId(actorId);
    return path.join(this.actorsDir, `${sanitized}${this.extension}`);
  }

  /**
   * [EARS-FKP04] Sanitizes actorId to prevent directory traversal.
   * [EARS-FKP05] Replaces path separators with underscores.
   * [EARS-FKP09] Throws INVALID_ACTOR_ID for empty actorId.
   */
  private sanitizeActorId(actorId: string): string {
    // Remove path traversal attempts
    let sanitized = actorId
      .replace(/\.\./g, '')  // Remove ..
      .replace(/[/\\]/g, '_'); // Replace path separators with underscore

    // Validate result is not empty
    if (!sanitized || sanitized === '') {
      throw new KeyProviderError(
        'Invalid actorId: empty after sanitization',
        'INVALID_ACTOR_ID',
        actorId
      );
    }

    return sanitized;
  }

  /**
   * Sanitizes actorId for logging (removes potential secrets).
   */
  private sanitizeForLog(actorId: string): string {
    // Just show first part for privacy
    if (actorId.length > 20) {
      return actorId.substring(0, 20) + '...';
    }
    return actorId;
  }
}
