/**
 * Types for GitLabWebhookHandler.
 * @module webhook/gitlab_webhook.types
 */

/** Configuration for GitLabWebhookHandler */
export type GitLabWebhookOptions = {
  /** Webhook secret token for X-Gitlab-Token verification */
  secret: string;
  /** State branch name to filter (default: 'gitgov-state') */
  stateBranch?: string;
};

/** Input data extracted from the HTTP request by the consumer */
export type GitLabWebhookPayload = {
  /** Value of X-Gitlab-Token header */
  token: string;
  /** Value of X-Gitlab-Event-UUID header (unique delivery UUID) */
  deliveryId: string;
  /** Raw JSON body as string */
  rawBody: string;
};

/** Decision returned by the webhook handler */
export type GitLabWebhookResult = {
  /** What the consumer should do */
  action: 'sync' | 'ignore' | 'error';
  /** Changed files when action is 'sync' */
  delta?: Array<{ status: 'A' | 'M' | 'D'; file: string }>;
  /** HEAD commit SHA of the push */
  headSha?: string;
  /** Human-readable reason (for logging) */
  reason: string;
  /** Delivery ID echoed back (for correlation) */
  deliveryId: string;
};

/** Parsed GitLab push event (internal) */
export type GitLabPushEventData = {
  /** Event type (e.g., 'push', 'tag_push') */
  object_kind: string;
  /** Full ref (e.g., 'refs/heads/gitgov-state') */
  ref: string;
  /** HEAD commit SHA after push */
  after: string;
  /** Before SHA */
  before: string;
  /** GitLab project ID */
  project_id: number;
  /** Commits in the push */
  commits: Array<{
    id: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
};
