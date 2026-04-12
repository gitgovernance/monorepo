/**
 * Login Command Types — v2 (Cycle 4, identity_key_sync)
 *
 * Spec: cli/specs/login_command.md §3.3
 * Updated: REST → tRPC wire format, repoId → orgId, +ECDH, +--force flags
 */

import type { BaseCommandOptions } from '../../interfaces/command';

// ============================================================================
// COMMAND OPTIONS
// ============================================================================

export interface LoginCommandOptions extends BaseCommandOptions {
  /** SaaS base URL override (default: .gitgov/config.json saasUrl — no hardcoded default) */
  url?: string;
  /** Show current login status */
  status?: boolean;
  /** Remove session token */
  logout?: boolean;
  /** Login without syncing keys */
  noKeySync?: boolean;
  /** On key conflict: upload local key, archive SaaS key */
  forceLocal?: boolean;
  /** On key conflict: download SaaS key, archive local key */
  forceCloud?: boolean;
}

// ============================================================================
// tRPC RESPONSE TYPES (§3.3 — match identity_service.router.ts)
// ============================================================================

/** Response from identity.keyStatus tRPC query */
export type KeyStatusResponse = {
  exists: boolean;
  hasPrivateKey: boolean;
  publicKey: string | null;
  /** Server's X25519 ECDH public key for upload encryption (ECIES pattern) */
  ecdhPublicKey: string;
};

/** Response from identity.syncKey tRPC mutation */
export type SyncKeyResponse = {
  success: boolean;
  actorId: string;
  mode: 'full' | 'verify-only';
};

/** Response from identity.getKey tRPC query */
export type GetKeyResponse = {
  publicKey: string | null;
  /** ECDH-encrypted private key envelope */
  privateKeyEnvelope: {
    ephemeralPublicKey: string;
    ciphertext: string;
    iv: string;
    authTag: string;
  };
};

/** Wrapper for tRPC response envelope */
export type TrpcResponse<T> = {
  result: {
    data: {
      json: T;
    };
  };
};

// ============================================================================
// DEPENDENCY INJECTION
// ============================================================================

/** Abstraction over browser open, HTTP server, and fetch for testability */
export interface LoginDeps {
  openBrowser: (url: string) => Promise<void>;
  startCallbackServer: (port: number) => Promise<{ token: string; user: { login: string; id: number } }>;
  fetchSaas: (url: string, init?: RequestInit) => Promise<Response>;
}
