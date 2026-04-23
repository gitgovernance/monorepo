/**
 * Integration test for key succession with REAL Ed25519 crypto.
 * No mocks — verifies that rotateActorKey produces records that pass
 * Three Gates validation offline (IKS-SUC4, EARS-F1c).
 */
import { IdentityAdapter } from './identity_adapter';
import { generateKeys, signPayload, verifySignatures } from '../../crypto/signatures';
import { calculatePayloadChecksum } from '../../crypto/checksum';
import { FsKeyProvider } from '../../key_provider/fs/fs_key_provider';
import type { ActorRecord, GitGovActorRecord } from '../../record_types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('rotateActorKey — Three Gates with REAL crypto (IKS-SUC4)', () => {
  let tmpDir: string;
  let keyProvider: InstanceType<typeof FsKeyProvider>;
  let actorStore: Record<string, GitGovActorRecord>;
  let store: { get: jest.Mock; put: jest.Mock; list: jest.Mock; delete: jest.Mock };
  let oldKeys: { publicKey: string; privateKey: string };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suc4-'));
    keyProvider = new FsKeyProvider({ keysDir: path.join(tmpDir, 'keys') });
    oldKeys = await generateKeys();
    await keyProvider.setPrivateKey('human:suc4-test', oldKeys.privateKey);

    actorStore = {};
    store = {
      get: jest.fn(async (id: string) => actorStore[id] || null),
      put: jest.fn(async (id: string, record: GitGovActorRecord) => { actorStore[id] = record; }),
      list: jest.fn(async () => Object.keys(actorStore)),
      delete: jest.fn(),
    };

    const actorPayload: ActorRecord = {
      id: 'human:suc4-test', type: 'human', displayName: 'SUC4 Test',
      publicKey: oldKeys.publicKey, roles: ['developer'], status: 'active',
    };
    const checksum = calculatePayloadChecksum(actorPayload);
    const creationSig = signPayload(actorPayload, oldKeys.privateKey, 'human:suc4-test', 'author', 'Genesis');
    actorStore['human:suc4-test'] = {
      header: { version: '1.0', type: 'actor', payloadChecksum: checksum, signatures: [creationSig] },
      payload: actorPayload,
    };
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('[EARS-F1c] new actor record should pass Three Gates (checksum + signature)', async () => {
    const adapter = new IdentityAdapter({ stores: { actors: store as any }, keyProvider });
    const { newActor } = await adapter.rotateActorKey('human:suc4-test');

    const newRecord = actorStore[newActor.id]!;
    expect(newRecord).toBeDefined();

    // Gate 1: Integrity — payload checksum matches
    expect(calculatePayloadChecksum(newRecord.payload)).toBe(newRecord.header.payloadChecksum);

    // Gate 2: Schema — has required fields
    expect(newRecord.payload.id).toContain('v2');
    expect(newRecord.payload.status).toBe('active');
    expect(newRecord.payload.publicKey).toHaveLength(44);

    // Gate 3: Authentication — signature verifies with OLD key (proof of ownership)
    expect(newRecord.header.signatures[0]!.keyId).toBe('human:suc4-test');
    const valid = await verifySignatures(newRecord, async (keyId) =>
      keyId === 'human:suc4-test' ? oldKeys.publicKey : null);
    expect(valid).toBe(true);
  });

  it('[EARS-D1b] revoked actor record should pass Three Gates (revocation signature only, §6.5)', async () => {
    const revokedRecord = actorStore['human:suc4-test']!;

    // Gate 1: Integrity
    expect(calculatePayloadChecksum(revokedRecord.payload)).toBe(revokedRecord.header.payloadChecksum);

    // Revocation metadata
    expect(revokedRecord.payload.status).toBe('revoked');
    expect(revokedRecord.payload.supersededBy).toContain('v2');

    // §6.5: revocation signature REPLACES original (1 signature, not 2)
    expect(revokedRecord.header.signatures).toHaveLength(1);
    expect(revokedRecord.header.signatures[0]!.notes).toContain('Revoking');

    // Gate 3: Revocation signature verifies with the old key
    const valid = await verifySignatures(revokedRecord, async (keyId) =>
      keyId === 'human:suc4-test' ? oldKeys.publicKey : null);
    expect(valid).toBe(true);
  });

  it('[EARS-F1b] should work with external keys (IKS-SUC3 + Three Gates)', async () => {
    // Reset store for a fresh test
    const freshKeys = await generateKeys();
    const freshKeyProvider = new FsKeyProvider({ keysDir: path.join(tmpDir, 'keys2') });
    await freshKeyProvider.setPrivateKey('human:ext-test', freshKeys.privateKey);

    const freshStore: Record<string, GitGovActorRecord> = {};
    const fStore = {
      get: jest.fn(async (id: string) => freshStore[id] || null),
      put: jest.fn(async (id: string, record: GitGovActorRecord) => { freshStore[id] = record; }),
      list: jest.fn(async () => Object.keys(freshStore)),
      delete: jest.fn(),
    };

    const payload: ActorRecord = {
      id: 'human:ext-test', type: 'human', displayName: 'Ext Test',
      publicKey: freshKeys.publicKey, roles: ['developer'], status: 'active',
    };
    const sig = signPayload(payload, freshKeys.privateKey, 'human:ext-test', 'author', 'Genesis');
    freshStore['human:ext-test'] = {
      header: { version: '1.0', type: 'actor', payloadChecksum: calculatePayloadChecksum(payload), signatures: [sig] },
      payload,
    };

    // External keys (simulates SaaS providing CLI's uploaded key)
    const externalKeys = await generateKeys();

    const adapter = new IdentityAdapter({ stores: { actors: fStore as any }, keyProvider: freshKeyProvider });
    const { newActor } = await adapter.rotateActorKey('human:ext-test', {
      newPublicKey: externalKeys.publicKey,
      newPrivateKey: externalKeys.privateKey,
    });

    // New actor uses external public key
    expect(newActor.publicKey).toBe(externalKeys.publicKey);

    // Three Gates on new actor
    const newRecord = freshStore[newActor.id]!;
    expect(calculatePayloadChecksum(newRecord.payload)).toBe(newRecord.header.payloadChecksum);
    const valid = await verifySignatures(newRecord, async (keyId) =>
      keyId === 'human:ext-test' ? freshKeys.publicKey : null);
    expect(valid).toBe(true);
  });
});
