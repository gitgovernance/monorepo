/**
 * This file was automatically generated from actor_record_schema.json.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source schema,
 * and run 'pnpm compile:types' to regenerate this file.
 */

/**
 * Canonical schema for actor records as defined in 02_actor.md
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
   * The Ed25519 public key (base64 encoded, 44 characters) for verifying the actor's signatures.
   */
  publicKey: string;
  /**
   * List of capacity roles defining the actor's skills and permissions. Uses hierarchical format with colons.
   *
   * @minItems 1
   */
  roles: [string, ...string[]];
  /**
   * Optional. The lifecycle status of the actor. Defaults to 'active' if not specified.
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
