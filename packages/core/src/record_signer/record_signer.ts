import type { KeyProvider } from '../key_provider/key_provider';
import type { RecordSignerDependencies } from './record_signer.types';
import type {
  GitGovRecord,
  GitGovRecordType,
  GitGovRecordPayload,
} from '../record_types/common.types';
import type {
  EmbeddedMetadataRecord,
  Signature,
} from '../record_types/embedded.types';
import { calculatePayloadChecksum } from '../crypto/checksum';
import { buildSignatureDigest } from '../crypto/signatures';

export class RecordSigner {
  private keyProvider: KeyProvider;

  constructor(dependencies: RecordSignerDependencies) {
    this.keyProvider = dependencies.keyProvider;
  }

  /**
   * Creates a new signed record from a payload (0 -> 1 signature).
   *
   * [RSIG-A1] Returns EmbeddedMetadataRecord with exactly 1 real Ed25519 signature.
   * [RSIG-A2] Calculates payloadChecksum internally via calculatePayloadChecksum.
   * [RSIG-A3] Propagates KeyProviderError if keyId has no private key.
   * [RSIG-A4] Produces a record that passes verifySignatures with the signer's public key.
   */
  async createSignedRecord<T extends GitGovRecordPayload<unknown>>(
    payload: T,
    type: GitGovRecordType,
    actorId: string,
    role: string,
    notes: string,
  ): Promise<EmbeddedMetadataRecord<T>> {
    // [RSIG-A2] Calculate payloadChecksum exactly once
    const payloadChecksum = calculatePayloadChecksum(payload as GitGovRecordPayload);
    const timestamp = Math.floor(Date.now() / 1000);

    // [RSIG-A1] Build digest and sign via keyProvider
    const digestHash = buildSignatureDigest(payloadChecksum, actorId, role, notes, timestamp);

    // [RSIG-A3] keyProvider.sign() throws KeyProviderError('KEY_NOT_FOUND') if no key
    const signatureBytes = await this.keyProvider.sign(actorId, new Uint8Array(digestHash));

    // [RSIG-A4] Build real Ed25519 signature
    const signature: Signature = {
      keyId: actorId,
      role,
      notes,
      signature: Buffer.from(signatureBytes).toString('base64'),
      timestamp,
    };

    return {
      header: {
        version: '1.0',
        type,
        payloadChecksum,
        signatures: [signature],
      },
      payload,
    };
  }

  /**
   * Adds a signature to an existing record (N -> N+1 signatures).
   *
   * [RSIG-B1] Delegates to keyProvider.sign() producing real Ed25519 signature.
   * [RSIG-B2] Propagates KeyProviderError if keyId has no private key.
   * [RSIG-B3] Replaces placeholder signatures instead of appending.
   * [RSIG-B4] Appends new signature when no placeholders exist.
   */
  async signRecord<T extends GitGovRecord>(
    record: T,
    actorId: string,
    role: string,
    notes: string,
  ): Promise<T> {
    // [RSIG-B1] Recalculate payloadChecksum and build digest
    const payloadChecksum = calculatePayloadChecksum(record.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const digestHash = buildSignatureDigest(payloadChecksum, actorId, role, notes, timestamp);

    // [RSIG-B2] keyProvider.sign() throws KeyProviderError('KEY_NOT_FOUND') if no key
    const signatureBytes = await this.keyProvider.sign(actorId, new Uint8Array(digestHash));

    const signature: Signature = {
      keyId: actorId,
      role,
      notes,
      signature: Buffer.from(signatureBytes).toString('base64'),
      timestamp,
    };

    // [RSIG-B3] Replace placeholder signatures or [RSIG-B4] append new signature
    const existingSignatures = record.header.signatures || [];
    const hasPlaceholder = existingSignatures.some(sig => sig.signature === 'placeholder');

    let finalSignatures: [Signature, ...Signature[]];
    if (hasPlaceholder) {
      // [RSIG-B3] Replace each placeholder with the real signature
      const replaced = existingSignatures.map(sig =>
        sig.signature === 'placeholder' ? signature : sig
      );
      finalSignatures = replaced.length > 0
        ? replaced as [Signature, ...Signature[]]
        : [signature];
    } else {
      // [RSIG-B4] Append new signature to existing array
      finalSignatures = [...existingSignatures, signature] as [Signature, ...Signature[]];
    }

    const signedRecord = {
      ...record,
      header: {
        ...record.header,
        payloadChecksum,
        signatures: finalSignatures,
      },
    } as T;

    return signedRecord;
  }
}
