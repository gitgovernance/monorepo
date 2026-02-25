/**
 * Types for GithubWebhookHandler.
 *
 * All types map to github_webhook_module.md
 *
 * @module sync_state/github_webhook
 */

import type { StateDeltaFile } from "../sync_state.types";

/**
 * Configuration for GithubWebhookHandler.
 */
export type GithubWebhookOptions = {
  /** Webhook secret for HMAC-SHA256 signature verification */
  secret: string;
  /** State branch name to filter (default: 'gitgov-state') */
  stateBranch?: string;
};

/**
 * Input data extracted from the HTTP request by the consumer.
 * The consumer is responsible for extracting these fields from
 * the framework-specific Request object.
 */
export type WebhookPayload = {
  /** Value of x-hub-signature-256 header (e.g., 'sha256=abc123...') */
  signature: string;
  /** Value of x-github-event header (e.g., 'push', 'ping') */
  event: string;
  /** Value of x-github-delivery header (unique delivery UUID) */
  deliveryId: string;
  /** Raw JSON body as string (needed for HMAC verification) */
  rawBody: string;
};

/**
 * Decision returned by the webhook handler.
 * The consumer acts on this decision — the handler never executes sync.
 */
export type WebhookResult = {
  /** What the consumer should do */
  action: "sync" | "ignore" | "error";
  /** Changed files when action is 'sync' */
  delta?: StateDeltaFile[];
  /** HEAD commit SHA of the push (for tracking) */
  headSha?: string;
  /** Human-readable reason (for logging) */
  reason: string;
  /** Delivery ID echoed back (for correlation) */
  deliveryId: string;
};

/**
 * Parsed push event data (internal, extracted from rawBody).
 * Only the fields we need — not the full GitHub PushEvent payload.
 */
export type PushEventData = {
  /** Full ref (e.g., 'refs/heads/gitgov-state') */
  ref: string;
  /** HEAD commit SHA after the push */
  after: string;
  /** Before SHA (for detecting force-pushes: '0000...' = new branch) */
  before: string;
  /** Commits in the push */
  commits: Array<{
    id: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  /** Repository info */
  repository: {
    full_name: string;
  };
};
