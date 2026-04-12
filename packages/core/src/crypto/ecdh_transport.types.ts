/**
 * ECDH X25519 Ephemeral Transport Layer types.
 *
 * Wire format for key material transfer between CLI and SaaS.
 * Both sides import from this file — coherence by construction.
 *
 * Protocol (IKS-A13, IKS-G6..G10):
 *   1. Client generates X25519 ephemeral keypair
 *   2. Client sends ephemeral public key to server
 *   3. Server generates its own X25519 ephemeral keypair
 *   4. Server derives shared secret (X25519 DH + HKDF)
 *   5. Server encrypts payload with AES-256-GCM using derived key
 *   6. Server sends EcdhEnvelope (server pubkey + ciphertext + iv + authTag)
 *   7. Client derives same shared secret + decrypts
 *   8. Both discard ephemeral keypairs (forward secrecy)
 */

/**
 * Ephemeral X25519 keypair for one side of the exchange.
 * Private key MUST be discarded after deriving the shared secret.
 */
export type EcdhKeypair = {
  /** Raw X25519 public key, base64-encoded (32 bytes -> 44 chars) */
  publicKey: string;
  /** Raw X25519 private key, base64-encoded (32 bytes -> 44 chars) */
  privateKey: string;
};

/**
 * Wire format envelope sent from server to client (or client to server)
 * containing ECDH-encrypted payload.
 *
 * The recipient combines their ephemeral private key with the sender's
 * ephemeral public key to derive the shared secret and decrypt.
 */
export type EcdhEnvelope = {
  /** Sender's ephemeral X25519 public key, base64-encoded */
  ephemeralPublicKey: string;
  /** AES-256-GCM encrypted payload, base64-encoded */
  ciphertext: string;
  /** AES-256-GCM initialization vector, base64-encoded (12 bytes) */
  iv: string;
  /** AES-256-GCM authentication tag, base64-encoded (16 bytes) */
  authTag: string;
};

/**
 * Request from client to server that includes the client's ephemeral
 * public key for the key exchange. Used as a header or body field.
 */
export type EcdhClientHello = {
  /** Client's ephemeral X25519 public key, base64-encoded */
  clientPublicKey: string;
};
