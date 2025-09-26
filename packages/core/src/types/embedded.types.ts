import type { GitGovRecordPayload } from "./common.types";
import type { EmbeddedMetadataRecord as BaseEmbeddedMetadataRecord } from "./generated/embedded_metadata";

/**
 * Extract Signature type from the auto-generated base type.
 * This is hardcoded solution but avoids duplication and uses the generated type as source of truth.
 */
export type Signature = BaseEmbeddedMetadataRecord['header']['signatures'][0];

/**
 * Generic version of EmbeddedMetadataRecord that accepts any payload type T.
 * This extends the auto-generated base type but makes the payload generic.
 * We need to explicitly preserve the header structure due to the index signature in the base type.
 */
export type EmbeddedMetadataRecord<T extends GitGovRecordPayload> = {
  header: BaseEmbeddedMetadataRecord['header'];
  payload: T;
}
