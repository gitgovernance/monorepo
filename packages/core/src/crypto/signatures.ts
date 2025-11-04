import { generateKeyPair, sign, verify, createHash } from "crypto";
import { promisify } from "util";
import { calculatePayloadChecksum } from "./checksum";
import type { GitGovRecordPayload, Signature } from "../types";
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
 * Creates a signature for a given payload.
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
  const digest = `${payloadChecksum}:${keyId}:${role}:${notes}:${timestamp}`;

  // Per the blueprint, sign the SHA-256 hash of the digest
  const digestHash = createHash('sha256').update(digest).digest();

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
      logger.warn(`Public key not found for actor: ${signature.keyId}`);
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
