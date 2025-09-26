/**
 * This file was automatically generated from actor_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for actor records as defined in actor_protocol.md
 */
export interface ActorRecord {
  /**
   * Unique, human-readable identifier for the actor.
   */
  id: string;
  /**
   * The type of actor.
   */
  type: 'human' | 'agent';
  /**
   * The name of the actor to be used in user interfaces.
   */
  displayName: string;
  /**
   * The Ed25519 public key (base64 encoded) for verifying the actor's signatures.
   */
  publicKey: string;
  /**
   * List of capacity roles defining the actor's skills and permissions.
   *
   * @minItems 1
   */
  roles: [string, ...string[]];
  /**
   * The lifecycle status of the actor.
   */
  status?: 'active' | 'revoked';
  /**
   * Optional. The ID of the actor that replaces this one.
   */
  supersededBy?: string;
  /**
   * An optional field for additional, non-canonical metadata.
   */
  metadata?: {};
}
