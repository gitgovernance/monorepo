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
 */
export async function generateKeys(): Promise<{ publicKey: string; privateKey: string; }> {
  const { publicKey, privateKey } = await generateKeyPairAsync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
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
  role: string
): Signature {
  const payloadChecksum = calculatePayloadChecksum(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = `${payloadChecksum}:${keyId}:${role}:${timestamp}`;

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
    signature: signature.toString('base64'),
    timestamp,
    timestamp_iso: new Date(timestamp * 1000).toISOString(),
  };
}

/**
 * Verifies all signatures on a record.
 */
export async function verifySignatures(
  record: { header: { payloadChecksum: string, signatures: Signature[] }, payload: GitGovRecordPayload },
  getActorPublicKey: (keyId: string) => Promise<string | null>
): Promise<boolean> {
  for (const signature of record.header.signatures) {
    const publicKey = await getActorPublicKey(signature.keyId);
    if (!publicKey) {
      logger.warn(`Public key not found for actor: ${signature.keyId}`);
      return false;
    }

    const digest = `${record.header.payloadChecksum}:${signature.keyId}:${signature.role}:${signature.timestamp}`;

    // Per the blueprint, verify against the SHA-256 hash of the digest
    const digestHash = createHash('sha256').update(digest).digest();

    const isValid = verify(
      null,
      digestHash,
      {
        key: Buffer.from(publicKey, 'base64'),
        type: 'spki',
        format: 'pem'
      },
      Buffer.from(signature.signature, 'base64')
    );

    if (!isValid) {
      return false;
    }
  }
  return true;
}
