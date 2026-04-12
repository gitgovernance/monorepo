/**
 * Login Command Types
 *
 * Spec: cli/specs/login_command.md §3.3
 */

import type { BaseCommandOptions } from '../../interfaces/command';

// ============================================================================
// COMMAND OPTIONS
// ============================================================================

export interface LoginCommandOptions extends BaseCommandOptions {
  /** SaaS base URL (default: config.json saasUrl or https://cloud.gitgov.dev) */
  url?: string;
  /** Show current login status */
  status?: boolean;
  /** Remove session token */
  logout?: boolean;
  /** Login without syncing keys */
  noKeySync?: boolean;
}

// ============================================================================
// SAAS API TYPES (§3.3)
// ============================================================================

/** POST /api/identity/sync-key — CLI sends key to SaaS */
export type SyncKeyRequest = {
  actorId: string;
  repoId: string;
  /** base64 encoded, encrypted in transit (HTTPS) */
  privateKey: string;
};

export type SyncKeyResponse = {
  synced: boolean;
};

/** GET /api/identity/key — CLI requests key from SaaS */
export type GetKeyRequest = {
  actorId: string;
  repoId: string;
};

export type GetKeyResponse = {
  /** null if SaaS doesn't have it */
  privateKey: string | null;
};

/** GET /api/identity/status — Check sync status */
export type KeyStatusRequest = {
  actorId: string;
  repoId: string;
};

export type KeyStatusResponse = {
  hasKey: boolean;
  actorExists: boolean;
  /** Public key of the actor (for case d comparison — avoids downloading private key) */
  publicKey?: string | null;
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
