import { generateEphemeralKeypair, ecdhEncrypt, ecdhDecrypt, deriveServerEcdhKeypair } from './ecdh_transport';
import type { EcdhEnvelope, EcdhKeypair } from './ecdh_transport.types';
import { randomBytes } from 'crypto';

describe('4.1.1. ECDH X25519 Transport (EARS-10 to EARS-17)', () => {
  describe('generateEphemeralKeypair', () => {
    it('[EARS-10] should generate a valid X25519 keypair with 32-byte raw keys', () => {
      const keypair = generateEphemeralKeypair();
      expect(Buffer.from(keypair.publicKey, 'base64')).toHaveLength(32);
      expect(Buffer.from(keypair.privateKey, 'base64')).toHaveLength(32);
    });

    it('[EARS-11] should generate unique keypairs per invocation (forward secrecy)', () => {
      const kp1 = generateEphemeralKeypair();
      const kp2 = generateEphemeralKeypair();
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
    });
  });

  describe('ecdhEncrypt + ecdhDecrypt round-trip', () => {
    let clientKeypair: EcdhKeypair;
    let serverKeypair: EcdhKeypair;

    beforeEach(() => {
      clientKeypair = generateEphemeralKeypair();
      serverKeypair = generateEphemeralKeypair();
    });

    it('[EARS-12] should encrypt and decrypt a payload via ECDH key exchange', async () => {
      const plaintext = Buffer.from('ed25519-private-key-material-here');

      // Server encrypts for client
      const envelope = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);

      // Client decrypts
      const decrypted = await ecdhDecrypt(envelope, clientKeypair.privateKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('[EARS-13] should produce ciphertext that differs from plaintext', async () => {
      const plaintext = Buffer.from('sensitive-key-material');

      const envelope = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);

      // Ciphertext is NOT the plaintext
      const ciphertextBuf = Buffer.from(envelope.ciphertext, 'base64');
      expect(ciphertextBuf).not.toEqual(plaintext);
    });

    it('[EARS-17] should work for both directions (server→client and client→server)', async () => {
      const serverPayload = Buffer.from('server-to-client-key');
      const clientPayload = Buffer.from('client-to-server-key');

      // Server → Client
      const serverEnvelope = await ecdhEncrypt(serverPayload, serverKeypair, clientKeypair.publicKey);
      const clientDecrypted = await ecdhDecrypt(serverEnvelope, clientKeypair.privateKey);
      expect(clientDecrypted).toEqual(serverPayload);

      // Client → Server
      const clientEnvelope = await ecdhEncrypt(clientPayload, clientKeypair, serverKeypair.publicKey);
      const serverDecrypted = await ecdhDecrypt(clientEnvelope, serverKeypair.privateKey);
      expect(serverDecrypted).toEqual(clientPayload);
    });

    it('should handle empty payload', async () => {
      const plaintext = Buffer.alloc(0);

      const envelope = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);
      const decrypted = await ecdhDecrypt(envelope, clientKeypair.privateKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('should handle large payload (4KB private key PEM)', async () => {
      // Simulate a large PKCS8 PEM private key
      const plaintext = Buffer.alloc(4096, 0x42);

      const envelope = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);
      const decrypted = await ecdhDecrypt(envelope, clientKeypair.privateKey);

      expect(decrypted).toEqual(plaintext);
    });

    it('should produce different ciphertext for same plaintext with different keypairs', async () => {
      const plaintext = Buffer.from('same-key-material');

      const envelope1 = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);

      // New keypairs → different shared secret → different ciphertext
      const newServerKeypair = generateEphemeralKeypair();
      const newClientKeypair = generateEphemeralKeypair();
      const envelope2 = await ecdhEncrypt(plaintext, newServerKeypair, newClientKeypair.publicKey);

      expect(envelope1.ciphertext).not.toBe(envelope2.ciphertext);
    });

    it('should produce different IV per encryption (nonce uniqueness)', async () => {
      const plaintext = Buffer.from('same-payload');

      const envelope1 = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);
      const envelope2 = await ecdhEncrypt(plaintext, serverKeypair, clientKeypair.publicKey);

      expect(envelope1.iv).not.toBe(envelope2.iv);
    });
  });

  describe('ecdhDecrypt failure cases', () => {
    it('[EARS-14] should throw when decrypting with wrong private key', async () => {
      const clientKeypair = generateEphemeralKeypair();
      const serverKeypair = generateEphemeralKeypair();
      const wrongKeypair = generateEphemeralKeypair();

      const envelope = await ecdhEncrypt(
        Buffer.from('secret'),
        serverKeypair,
        clientKeypair.publicKey,
      );

      // Decrypt with wrong private key → different shared secret → AES auth fails
      await expect(ecdhDecrypt(envelope, wrongKeypair.privateKey)).rejects.toThrow();
    });

    it('[EARS-15] should throw when ciphertext is tampered', async () => {
      const clientKeypair = generateEphemeralKeypair();
      const serverKeypair = generateEphemeralKeypair();

      const envelope = await ecdhEncrypt(
        Buffer.from('secret'),
        serverKeypair,
        clientKeypair.publicKey,
      );

      // Tamper with ciphertext
      const tampered: EcdhEnvelope = {
        ...envelope,
        ciphertext: Buffer.from('tampered-data').toString('base64'),
      };

      await expect(ecdhDecrypt(tampered, clientKeypair.privateKey)).rejects.toThrow();
    });

    it('[EARS-15] should throw when authTag is tampered', async () => {
      const clientKeypair = generateEphemeralKeypair();
      const serverKeypair = generateEphemeralKeypair();

      const envelope = await ecdhEncrypt(
        Buffer.from('secret'),
        serverKeypair,
        clientKeypair.publicKey,
      );

      // Tamper with authTag
      const tampered: EcdhEnvelope = {
        ...envelope,
        authTag: Buffer.alloc(16, 0xff).toString('base64'),
      };

      await expect(ecdhDecrypt(tampered, clientKeypair.privateKey)).rejects.toThrow();
    });
  });

  describe('deriveServerEcdhKeypair (upload direction)', () => {
    const masterKey = randomBytes(32).toString('base64');

    it('should derive a valid 32-byte X25519 keypair from MASTER_KEY + orgId', async () => {
      const kp = await deriveServerEcdhKeypair(masterKey, 'org-123');
      expect(Buffer.from(kp.publicKey, 'base64')).toHaveLength(32);
      expect(Buffer.from(kp.privateKey, 'base64')).toHaveLength(32);
    });

    it('should be deterministic (same inputs → same output)', async () => {
      const kp1 = await deriveServerEcdhKeypair(masterKey, 'org-123');
      const kp2 = await deriveServerEcdhKeypair(masterKey, 'org-123');
      expect(kp1.publicKey).toBe(kp2.publicKey);
      expect(kp1.privateKey).toBe(kp2.privateKey);
    });

    it('should derive different keys for different orgs', async () => {
      const kp1 = await deriveServerEcdhKeypair(masterKey, 'org-1');
      const kp2 = await deriveServerEcdhKeypair(masterKey, 'org-2');
      expect(kp1.publicKey).not.toBe(kp2.publicKey);
    });

    it('should work with ecdhEncrypt/ecdhDecrypt for upload (ECIES pattern)', async () => {
      const serverKp = await deriveServerEcdhKeypair(masterKey, 'org-upload');
      const clientKp = generateEphemeralKeypair();

      // Client encrypts FOR the server using server's derived public key
      const plaintext = Buffer.from('private-key-to-upload');
      const envelope = await ecdhEncrypt(plaintext, clientKp, serverKp.publicKey);

      // Server decrypts with its derived private key
      const decrypted = await ecdhDecrypt(envelope, serverKp.privateKey);
      expect(decrypted).toEqual(plaintext);
    });
  });

  describe('EcdhEnvelope wire format', () => {
    it('[EARS-16] should produce envelope with all required fields as valid base64', async () => {
      const clientKeypair = generateEphemeralKeypair();
      const serverKeypair = generateEphemeralKeypair();

      const envelope = await ecdhEncrypt(
        Buffer.from('payload'),
        serverKeypair,
        clientKeypair.publicKey,
      );

      // All fields present
      expect(envelope).toMatchObject({
        ephemeralPublicKey: expect.any(String),
        ciphertext: expect.any(String),
        iv: expect.any(String),
        authTag: expect.any(String),
      });

      // All valid base64
      expect(() => Buffer.from(envelope.ephemeralPublicKey, 'base64')).not.toThrow();
      expect(() => Buffer.from(envelope.ciphertext, 'base64')).not.toThrow();
      expect(() => Buffer.from(envelope.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(envelope.authTag, 'base64')).not.toThrow();

      // IV is 12 bytes (AES-GCM standard)
      expect(Buffer.from(envelope.iv, 'base64')).toHaveLength(12);

      // AuthTag is 16 bytes (AES-GCM standard)
      expect(Buffer.from(envelope.authTag, 'base64')).toHaveLength(16);

      // Ephemeral public key is 32 bytes (X25519)
      expect(Buffer.from(envelope.ephemeralPublicKey, 'base64')).toHaveLength(32);
    });
  });
});
