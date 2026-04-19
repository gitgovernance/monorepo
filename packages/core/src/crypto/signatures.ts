import { generateKeyPair, sign, verify, createHash, createPrivateKey, createPublicKey, hkdf } from "crypto";
import { promisify } from "util";
import { calculatePayloadChecksum } from "./checksum";
import type { GitGovRecordPayload, Signature } from "../record_types";
import { createLogger } from "../logger";
const logger = createLogger("[CryptoModule] ");
const generateKeyPairAsync = promisify(generateKeyPair);

/**
 * Generates a new Ed25519 key pair.
 * @returns A promise that resolves to an object with publicKey and privateKey in base64 format.
 * 
 * The publicKey is the raw Ed25519 key (32 bytes -> 44 chars in base64).
 * The privateKey is stored in PKCS8 PEM format for compatibility.
 * 
 * Note: Node.js crypto does not support 'raw' format directly for Ed25519,
 * so we extract the raw 32-byte key from the SPKI DER encoding (RFC 8410).
 * SPKI DER structure: [algorithm identifier (12 bytes)] + [raw public key (32 bytes)]
 */
export async function generateKeys(): Promise<{ publicKey: string; privateKey: string; }> {
  const { publicKey, privateKey } = await generateKeyPairAsync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Extract raw Ed25519 public key (last 32 bytes of SPKI DER format)
  const rawPublicKey = publicKey.subarray(-32);

  return {
    publicKey: rawPublicKey.toString('base64'), // 32 bytes -> 44 chars
    privateKey: Buffer.from(privateKey).toString('base64'),
  };
}

/**
 * Derives the raw Ed25519 public key (base64) from a private key stored in
 * PKCS8 PEM format (base64-encoded, the format used by generateKeys()).
 *
 * Used by KeyProvider.getPublicKey() implementations that do NOT cache the
 * public key separately (FsKeyProvider, MockKeyProvider, EnvKeyProvider).
 * PrismaKeyProvider caches publicKey as a column and does NOT need this.
 *
 * @param privateKeyBase64 Base64-encoded PKCS8 PEM private key
 * @returns Base64-encoded raw Ed25519 public key (44 chars, 32 bytes)
 */
export function derivePublicKey(privateKeyBase64: string): string {
  const privateKeyObject = createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    type: 'pkcs8',
    format: 'pem',
  });
  const publicKeyDer = createPublicKey(privateKeyObject).export({
    type: 'spki',
    format: 'der',
  }) as Buffer;
  // SPKI DER: [algorithm identifier (12 bytes)] + [raw public key (32 bytes)]
  return publicKeyDer.subarray(-32).toString('base64');
}

/**
 * SPKI DER prefix for raw Ed25519 public key (RFC 8410): 12-byte algorithm
 * identifier followed by the 32-byte raw public key.
 *
 * Exposed so consumers can construct an SPKI-formatted key for `node:crypto.verify()`
 * without redefining the prefix bytes (which is a documented standard, not a magic
 * number — see RFC 8410 §3).
 */
export const SPKI_ED25519_HEADER: Buffer = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00,
]);

/**
 * Reconstructs an SPKI DER-encoded public key from a raw 32-byte Ed25519 key.
 *
 * Inverse of `derivePublicKey`: takes the base64-encoded raw key (as stored
 * in `ActorRecord.publicKey` and `ActorKey.publicKey`) and returns the SPKI
 * DER buffer that `node:crypto.verify()` accepts as `{ key, type: 'spki', format: 'der' }`.
 *
 * Used by:
 *   - `verifySignatures()` internally (Ed25519 signature verification path)
 *   - e2e tests verifying signatures produced by `PrismaKeyProvider.sign()`
 *
 * @param publicKeyBase64 Base64-encoded raw Ed25519 public key (32 bytes -> 44 chars)
 * @returns 44-byte SPKI DER buffer (12-byte prefix + 32-byte raw key)
 */
export function ed25519PublicKeyToSpki(publicKeyBase64: string): Buffer {
  return Buffer.concat([SPKI_ED25519_HEADER, Buffer.from(publicKeyBase64, 'base64')]);
}

/**
 * Derives a fixed-length symmetric key from a master key using HKDF-SHA256.
 *
 * Used by the 3-level key hierarchy in PrismaKeyProvider (Cycle 2 of
 * identity_key_sync epic): the MASTER_KEY env var is expanded via HKDF with
 * a purpose-specific `info` string to produce the key-wrapping key that
 * encrypts per-org `OrgEncryptionKey` rows.
 *
 * HKDF (RFC 5869) provides proper key derivation: secure expansion from
 * high-entropy keying material, binding by `info`, and no reliance on
 * UTF-8 truncation (which would be fragile with multi-byte characters).
 *
 * @param masterKeyBase64 - Base64-encoded input keying material (32+ bytes).
 *                         Generate with `openssl rand -base64 32`.
 * @param info - Context/purpose binding string (e.g. 'gitgov-org-key').
 *               Different `info` values produce different derived keys from
 *               the same master key, enabling safe reuse across purposes.
 * @param length - Derived key length in bytes. Default 32 (AES-256).
 * @returns Promise resolving to the derived key as a Buffer.
 */
export function deriveHkdfKey(
  masterKeyBase64: string,
  info: string,
  length: number = 32,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let keyMaterial: Buffer;
    try {
      keyMaterial = Buffer.from(masterKeyBase64, 'base64');
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Invalid base64 master key'));
      return;
    }
    // Empty salt is intentional: the `info` parameter provides domain separation.
    hkdf('sha256', keyMaterial, Buffer.alloc(0), info, length, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(Buffer.from(derivedKey));
    });
  });
}

/**
 * Builds the SHA-256 digest hash that Ed25519 signatures are computed over.
 *
 * The digest string follows the protocol format:
 *   "{payloadChecksum}:{keyId}:{role}:{notes}:{timestamp}"
 *
 * This is a stateless protocol primitive — callers sign the returned hash
 * using their own signing mechanism (raw key via signPayload, or KeyProvider
 * via adapter methods).
 */
export function buildSignatureDigest(
  payloadChecksum: string,
  keyId: string,
  role: string,
  notes: string,
  timestamp: number,
): Buffer {
  const digest = `${payloadChecksum}:${keyId}:${role}:${notes}:${timestamp}`;
  return createHash('sha256').update(digest).digest();
}

/**
 * Creates a signature for a given payload using a raw private key.
 */
export function signPayload(
  payload: GitGovRecordPayload,
  privateKey: string,
  keyId: string,
  role: string,
  notes: string,
): Signature {
  const payloadChecksum = calculatePayloadChecksum(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const digestHash = buildSignatureDigest(payloadChecksum, keyId, role, notes, timestamp);

  const signature = sign(null, digestHash, {
    key: Buffer.from(privateKey, 'base64'),
    type: 'pkcs8',
    format: 'pem'
  });

  return {
    keyId,
    role,
    notes,
    signature: signature.toString('base64'),
    timestamp,
  };
}

/**
 * Verifies all signatures on a record.
 * 
 * Reconstructs SPKI DER format from raw Ed25519 key for verification.
 */
export async function verifySignatures(
  record: { header: { payloadChecksum: string, signatures: Signature[] }, payload: GitGovRecordPayload },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<boolean> {
  for (const signature of record.header.signatures) {
    const publicKeyBase64 = await getActorPublicKey(signature.keyId);
    if (!publicKeyBase64) {
      // Use debug level instead of warn to reduce noise during indexer validation
      // The indexer already captures these errors in its integrity report
      logger.debug(`Public key not found for actor: ${signature.keyId}`);
      return false;
    }

    const digest = `${record.header.payloadChecksum}:${signature.keyId}:${signature.role}:${signature.notes}:${signature.timestamp}`;
    const digestHash = createHash('sha256').update(digest).digest();

    // Reconstruct SPKI DER from raw Ed25519 public key (RFC 8410)
    // SPKI DER structure: [algorithm identifier (12 bytes)] + [raw key (32 bytes)]
    const algorithmIdentifier = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
      0x70, 0x03, 0x21, 0x00
    ]);
    const rawPublicKey = Buffer.from(publicKeyBase64, 'base64');
    const spkiPublicKey = Buffer.concat([algorithmIdentifier, rawPublicKey]);

    const isValid = verify(
      null,
      digestHash,
      {
        key: spkiPublicKey,
        type: 'spki',
        format: 'der'
      },
      Buffer.from(signature.signature, 'base64')
    );

    if (!isValid) {
      return false;
    }
  }
  return true;
}

