/**
 * PrismaKeyProvider — Database-backed KeyProvider implementation.
 * Blueprint: prisma_key_provider_module.md
 *
 * Stores private keys in an ActorKey table, encrypted with AES-256-GCM.
 * Used by SaaS environments for multi-tenant key management.
 *
 * | EARS ID | Method          | Section |
 * |---------|-----------------|---------|
 * | PKP-A1  | getPrivateKey   | 4.1     |
 * | PKP-A2  | getPrivateKey   | 4.1     |
 * | PKP-A3  | setPrivateKey   | 4.1     |
 * | PKP-A4  | deletePrivateKey| 4.1     |
 * | PKP-B1  | (isolation)     | 4.2     |
 * | PKP-B2  | (isolation)     | 4.2     |
 * | PKP-C1  | encrypt/decrypt | 4.3     |
 * | PKP-C2  | plaintext mode  | 4.3     |
 * | PKP-C3  | decrypt error   | 4.3     |
 * | PKP-D1  | hasPrivateKey   | 4.4     |
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import type { KeyProvider } from '../key_provider';
import { KeyProviderError } from '../key_provider';
import type { PrismaKeyProviderOptions } from './prisma_key_provider.types';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class PrismaKeyProvider implements KeyProvider {
  private readonly prisma: PrismaKeyProviderOptions['prisma'];
  private readonly repoId: string;
  private readonly encryptionSecret: string | undefined;

  constructor(options: PrismaKeyProviderOptions) {
    this.prisma = options.prisma;
    this.repoId = options.repoId;
    this.encryptionSecret = options.encryptionSecret;
  }

  /**
   * [PKP-A1] Get existing key → decrypt + return
   * [PKP-A2] Get non-existing key → null
   */
  async getPrivateKey(actorId: string): Promise<string | null> {
    const row = await this.prisma.actorKey.findUnique({
      where: { actorId_repoId: { actorId, repoId: this.repoId } },
    });

    if (!row) {
      // [PKP-A2] Not found → null (fail-safe)
      return null;
    }

    // [PKP-A1] Decrypt and return
    try {
      return this.decrypt(row.encryptedKey);
    } catch (error) {
      // [PKP-C3] Decryption failure → throw
      throw new KeyProviderError(
        `Failed to decrypt private key for ${actorId}: ${(error as Error).message}`,
        'KEY_READ_ERROR',
        actorId,
      );
    }
  }

  /**
   * [PKP-A3] Set key → encrypt + upsert
   */
  async setPrivateKey(actorId: string, privateKey: string): Promise<void> {
    const encryptedKey = this.encrypt(privateKey);

    try {
      await this.prisma.actorKey.upsert({
        where: { actorId_repoId: { actorId, repoId: this.repoId } },
        create: { actorId, repoId: this.repoId, encryptedKey },
        update: { encryptedKey },
      });
    } catch (error) {
      throw new KeyProviderError(
        `Failed to store private key for ${actorId}: ${(error as Error).message}`,
        'KEY_WRITE_ERROR',
        actorId,
      );
    }
  }

  /**
   * [PKP-D1] Check existence without reading key content
   */
  async hasPrivateKey(actorId: string): Promise<boolean> {
    const count = await this.prisma.actorKey.count({
      where: { actorId, repoId: this.repoId },
    });
    return count > 0;
  }

  /**
   * [PKP-A4] Delete key → true/false
   */
  async deletePrivateKey(actorId: string): Promise<boolean> {
    try {
      await this.prisma.actorKey.delete({
        where: { actorId_repoId: { actorId, repoId: this.repoId } },
      });
      return true;
    } catch (error) {
      // P2025 = record not found → return false
      // All other errors (DB connection, etc.) → propagate per §5.3
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2025') {
        return false;
      }
      throw error;
    }
  }

  /**
   * [PKP-C1] Encrypt with AES-256-GCM
   * [PKP-C2] No secret → plaintext
   */
  private encrypt(plaintext: string): string {
    if (!this.encryptionSecret) {
      // [PKP-C2] Dev mode — store plaintext
      return plaintext;
    }

    const key = this.deriveKey(this.encryptionSecret);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  /**
   * [PKP-C1] Decrypt with AES-256-GCM
   * [PKP-C3] Throws on failure
   */
  private decrypt(ciphertext: string): string {
    if (!this.encryptionSecret) {
      // [PKP-C2] Dev mode — stored as plaintext
      return ciphertext;
    }

    const key = this.deriveKey(this.encryptionSecret);
    const data = Buffer.from(ciphertext, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
  }

  /** Derive 32-byte key from secret using SHA-256 */
  private deriveKey(secret: string): Buffer {
    return createHash('sha256').update(secret).digest();
  }
}
