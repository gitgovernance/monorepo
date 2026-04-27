import type { KeyProvider } from '../key_provider/key_provider';

/** Dependencias de RecordSigner -- solo KeyProvider. */
export type RecordSignerDependencies = {
  /** KeyProvider para firma Ed25519. sign() lanza KeyProviderError si no hay key. */
  keyProvider: KeyProvider;
};
