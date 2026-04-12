/**
 * ECDH X25519 Ephemeral Transport — key exchange + AES-256-GCM encryption.
 *
 * Provides application-layer encryption for private key material transfer
 * between CLI and SaaS, with forward secrecy via ephemeral keypairs.
 *
 * Both client and server sides are implemented here so that CLI and SaaS
 * import from the same source — coherence by construction.
 *
 * Protocol: IKS-A13, EARS-10..17 (crypto_module.md §4.1.1)
 *
 * Security properties:
 *   - Forward secrecy: ephemeral keypairs are per-request
 *   - Defense-in-depth: encrypts above TLS (protects against TLS termination proxies)
 *   - Authenticated encryption: AES-256-GCM provides confidentiality + integrity
 *   - Key derivation: HKDF-SHA256 with fixed info string for domain separation
 */
import {
  generateKeyPairSync,
  diffieHellman,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createPrivateKey,
  createPublicKey,
} from 'crypto';
import { deriveHkdfKey } from './signatures';
import type { EcdhKeypair, EcdhEnvelope } from './ecdh_transport.types';

/** HKDF info string for ECDH shared secret → AES key derivation */
const ECDH_HKDF_INFO = 'gitgov-ecdh-transport-v1';

/** HKDF info string for server-side static ECDH key derivation from MASTER_KEY */
const SERVER_ECDH_KEY_INFO = 'gitgov-ecdh-server-key-v1';

/**
 * Generates an ephemeral X25519 keypair for one side of the exchange.
 *
 * The keypair MUST be discarded after the exchange completes (forward secrecy).
 * Do NOT persist or reuse these keys across requests.
 *
 * [EARS-10] Returns valid X25519 keypair (32 bytes raw)
 * [EARS-11] Unique per invocation (forward secrecy)
 */
export function generateEphemeralKeypair(): EcdhKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  // X25519 SPKI DER: 12-byte header + 32-byte raw key
  const rawPublicKey = publicKey.subarray(-32);
  // X25519 PKCS8 DER: 16-byte header + 32-byte raw key
  const rawPrivateKey = privateKey.subarray(-32);

  return {
    publicKey: rawPublicKey.toString('base64'),
    privateKey: rawPrivateKey.toString('base64'),
  };
}

/**
 * X25519 SPKI DER prefix (RFC 7748).
 * Structure: SEQUENCE { SEQUENCE { OID 1.3.101.110 }, BIT STRING { raw key } }
 */
const X25519_SPKI_HEADER = Buffer.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x6e, 0x03, 0x21, 0x00,
]);

/**
 * X25519 PKCS8 DER prefix (RFC 8410).
 * Structure: SEQUENCE { version, SEQUENCE { OID }, OCTET STRING { OCTET STRING { raw key } } }
 */
const X25519_PKCS8_HEADER = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Derives the shared AES-256 key from the X25519 Diffie-Hellman exchange.
 *
 * Both sides call this with:
 *   - Their own private key
 *   - The other side's public key
 * And get the same shared secret, which is then expanded via HKDF-SHA256
 * to produce the AES-256 encryption key.
 *
 * @param myPrivateKeyBase64 - Our ephemeral X25519 private key (raw, base64)
 * @param theirPublicKeyBase64 - Their ephemeral X25519 public key (raw, base64)
 * @returns 32-byte AES-256 key derived via HKDF
 */
async function deriveSharedKey(
  myPrivateKeyBase64: string,
  theirPublicKeyBase64: string,
): Promise<Buffer> {
  const myPrivateKeyDer = Buffer.concat([
    X25519_PKCS8_HEADER,
    Buffer.from(myPrivateKeyBase64, 'base64'),
  ]);
  const theirPublicKeyDer = Buffer.concat([
    X25519_SPKI_HEADER,
    Buffer.from(theirPublicKeyBase64, 'base64'),
  ]);

  const myKey = createPrivateKey({ key: myPrivateKeyDer, type: 'pkcs8', format: 'der' });
  const theirKey = createPublicKey({ key: theirPublicKeyDer, type: 'spki', format: 'der' });

  const sharedSecret = diffieHellman({ privateKey: myKey, publicKey: theirKey });

  // HKDF expands the raw DH output into a proper AES-256 key
  return deriveHkdfKey(sharedSecret.toString('base64'), ECDH_HKDF_INFO, 32);
}

/**
 * Encrypts data for transport using ECDH key exchange.
 *
 * Server-side: encrypts payload for the client.
 * Client-side: encrypts payload for the server (sync-key with private key).
 *
 * [EARS-12] Round-trip encrypt→decrypt returns original plaintext
 * [EARS-13] Ciphertext differs from plaintext (raw key never in envelope)
 *
 * @param plaintext - Data to encrypt (e.g., private key bytes)
 * @param myKeypair - Our ephemeral X25519 keypair (generated for this request)
 * @param theirPublicKeyBase64 - The other side's ephemeral public key
 * @returns EcdhEnvelope containing our public key + ciphertext + AES params
 */
export async function ecdhEncrypt(
  plaintext: Buffer,
  myKeypair: EcdhKeypair,
  theirPublicKeyBase64: string,
): Promise<EcdhEnvelope> {
  const aesKey = await deriveSharedKey(myKeypair.privateKey, theirPublicKeyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ephemeralPublicKey: myKeypair.publicKey,
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts an ECDH envelope received from the other side.
 *
 * Client-side: decrypts payload from the server (key download).
 * Server-side: decrypts payload from the client (sync-key with private key).
 *
 * @param envelope - EcdhEnvelope received from the other side
 * @param myPrivateKeyBase64 - Our ephemeral X25519 private key (raw, base64)
 * @returns Decrypted plaintext as Buffer
 * @throws Error if decryption fails (tampered data, wrong key)
 */
export async function ecdhDecrypt(
  envelope: EcdhEnvelope,
  myPrivateKeyBase64: string,
): Promise<Buffer> {
  const aesKey = await deriveSharedKey(myPrivateKeyBase64, envelope.ephemeralPublicKey);

  const decipher = createDecipheriv(
    'aes-256-gcm',
    aesKey,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted;
}

/**
 * Derives a deterministic X25519 keypair for server-side ECDH from MASTER_KEY.
 *
 * Used for the upload direction (client→server, e.g. sync-key): the client
 * needs the server's public key BEFORE encrypting, so the server must have
 * a stable (but rotatable) public key. The key is derived per-org via HKDF,
 * so compromising one org's ECDH key doesn't affect others.
 *
 * The client fetches the server's public key from the key-status endpoint,
 * then uses it with ecdhEncrypt (ECIES pattern):
 *   1. Client generates ephemeral keypair
 *   2. Client encrypts: ecdhEncrypt(data, clientKp, serverDerivedPub)
 *   3. Server decrypts: ecdhDecrypt(envelope, serverDerivedPriv)
 *
 * For the download direction (server→client), use generateEphemeralKeypair()
 * instead — that provides full forward secrecy.
 *
 * Rotation: when MASTER_KEY rotates, the derived key changes. The client
 * re-fetches via key-status. Old ciphertexts cannot be decrypted with the
 * new key (this is acceptable — ECDH transport is per-request, not storage).
 *
 * @param masterKeyBase64 - Base64-encoded MASTER_KEY (32+ bytes)
 * @param orgId - Organization ID for domain separation
 * @returns Deterministic X25519 keypair scoped to the org
 */
export async function deriveServerEcdhKeypair(
  masterKeyBase64: string,
  orgId: string,
): Promise<EcdhKeypair> {
  // Derive 32 bytes of key material via HKDF
  const seed = await deriveHkdfKey(
    masterKeyBase64,
    `${SERVER_ECDH_KEY_INFO}:${orgId}`,
    32,
  );

  // X25519 accepts any 32-byte scalar as a private key (clamping is automatic).
  // Use the HKDF output directly as the raw private key.
  const privateKeyBase64 = seed.toString('base64');

  // Derive the public key: wrap in PKCS8 DER → createPrivateKey → createPublicKey
  const privateKeyDer = Buffer.concat([X25519_PKCS8_HEADER, seed]);
  const privateKeyObj = createPrivateKey({ key: privateKeyDer, type: 'pkcs8', format: 'der' });
  const publicKeyDer = createPublicKey(privateKeyObj).export({ type: 'spki', format: 'der' }) as Buffer;
  const publicKeyBase64 = publicKeyDer.subarray(-32).toString('base64');

  return { publicKey: publicKeyBase64, privateKey: privateKeyBase64 };
}
