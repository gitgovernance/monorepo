/**
 * This file was automatically generated from embedded_metadata_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for the wrapper structure of all GitGovernance records.
 */
export interface EmbeddedMetadataRecord {
  header: {
    /**
     * Version of the embedded metadata format.
     */
    version: '1.0';
    /**
     * The type of the record contained in the payload.
     */
    type: 'actor' | 'agent' | 'task' | 'execution' | 'feedback' | 'cycle' | 'workflow' | 'custom';
    /**
     * URL to a custom schema for the payload. Required when type is 'custom'.
     */
    schemaUrl?: string;
    /**
     * SHA-256 checksum of the custom schema. Required when type is 'custom'.
     */
    schemaChecksum?: string;
    /**
     * SHA-256 checksum of the canonically serialized payload.
     */
    payloadChecksum: string;
    /**
     * An array of one or more signature objects.
     *
     * @minItems 1
     */
    signatures: [
      {
        /**
         * The Actor ID of the signer. Supports scoped identifiers (e.g. agent:camilo:cursor).
         */
        keyId: string;
        /**
         * The context role of the signature (e.g., 'author', 'reviewer', or 'custom:*').
         */
        role: string;
        /**
         * Human-readable note from the signer. Part of the signature digest.
         */
        notes: string;
        /**
         * The Ed25519 signature (base64 encoded, 88 chars with padding) of the signature digest.
         */
        signature: string;
        /**
         * Unix timestamp of the signature.
         */
        timestamp: number;
      },
      ...{
        /**
         * The Actor ID of the signer. Supports scoped identifiers (e.g. agent:camilo:cursor).
         */
        keyId: string;
        /**
         * The context role of the signature (e.g., 'author', 'reviewer', or 'custom:*').
         */
        role: string;
        /**
         * Human-readable note from the signer. Part of the signature digest.
         */
        notes: string;
        /**
         * The Ed25519 signature (base64 encoded, 88 chars with padding) of the signature digest.
         */
        signature: string;
        /**
         * Unix timestamp of the signature.
         */
        timestamp: number;
      }[]
    ];
  };
  /**
   * The specific record data, validated against the schema defined by header.type.
   */
  payload: {};
}
