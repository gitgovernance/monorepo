import type { GitGovRecordPayload } from "./common.types";

/**
 * Represents a single cryptographic signature.
 */
export type Signature = {
  keyId: string;
  role: string;
  signature: string;
  timestamp: number;
  timestamp_iso: string;
}

/**
 * Canonical schema for the wrapper structure of all GitGovernance records.
 * It is generic over the payload type `T`.
 */
export type EmbeddedMetadataRecord<T extends GitGovRecordPayload> = {
  header: {
    version: "1.0";
    type: "actor" | "agent" | "task" | "execution" | "changelog" | "feedback" | "cycle" | "custom";
    schemaUrl?: string;
    schemaChecksum?: string;
    payloadChecksum: string;
    signatures: [Signature, ...Signature[]];
    audit?: string;
  };
  payload: T;
}
