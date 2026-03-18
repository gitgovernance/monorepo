/**
 * GitLabWebhookHandler - GitLab webhook processor for state sync.
 *
 * Pure logic module that processes GitLab push event payloads,
 * verifies X-Gitlab-Token, filters relevant events,
 * and returns a typed decision (sync/ignore/error).
 *
 * No crypto needed (unlike GitHub's HMAC-SHA256).
 * No Gitbeaker dependency (webhooks arrive via HTTP push).
 *
 * Blueprint: gitlab_webhook_module.md
 * [EARS-GW-A1 to GW-D3]
 *
 * @module webhook/gitlab_webhook
 */

import type {
  GitLabWebhookOptions,
  GitLabWebhookPayload,
  GitLabWebhookResult,
  GitLabPushEventData,
} from './gitlab_webhook.types';

/**
 * Check if a file path should be synced.
 * On gitgov-state branch, .gitgov/ files live at root (no .gitgov/ prefix).
 * We sync all .json files since the entire branch is .gitgov/ content.
 *
 * NOTE: Ideally this would import shouldSyncFile from @gitgov/core,
 * but the webhook module is zero-dependency (no Gitbeaker, no core).
 * This local version covers the gitgov-state branch convention where
 * all files are syncable .json records.
 */
function shouldSyncFile(filePath: string): boolean {
  // Files under .gitgov/ prefix (source branch convention)
  if (filePath.startsWith('.gitgov/')) return true;
  // Files on gitgov-state branch (root = .gitgov/ content) — all .json are records
  if (filePath.endsWith('.json')) return true;
  return false;
}

export class GitLabWebhookHandler {
  private readonly secret: string;
  private readonly stateBranch: string;

  constructor(options: GitLabWebhookOptions) {
    this.secret = options.secret;
    this.stateBranch = options.stateBranch ?? 'gitgov-state';
  }

  /**
   * Process a GitLab webhook delivery.
   * Returns a decision (sync/ignore/error) — never throws.
   *
   * [EARS-GW-A1, A2, B1, B2, B3, C1, C2, C3, D1, D2, D3]
   */
  handle(payload: GitLabWebhookPayload): GitLabWebhookResult {
    const { deliveryId } = payload;

    // [EARS-GW-A1, A2] Verify token
    if (!payload.token || payload.token !== this.secret) {
      return { action: 'error', reason: 'Invalid token', deliveryId };
    }

    // [EARS-GW-D2] Parse payload
    let pushData: GitLabPushEventData;
    try {
      pushData = JSON.parse(payload.rawBody) as GitLabPushEventData;
    } catch {
      return { action: 'error', reason: 'Invalid JSON payload', deliveryId };
    }

    // [EARS-GW-D3] Validate required fields
    if (!pushData.object_kind || !pushData.ref || !pushData.after || !pushData.commits) {
      return { action: 'error', reason: 'Malformed push event: missing required fields', deliveryId };
    }

    // [EARS-GW-B2] Only process push events
    if (pushData.object_kind !== 'push') {
      return { action: 'ignore', reason: `Not push event: ${pushData.object_kind}`, deliveryId };
    }

    // [EARS-GW-B1] Process push events to state branch
    // [EARS-GW-B3] Only process pushes to state branch
    const branch = pushData.ref.replace('refs/heads/', '');
    if (branch !== this.stateBranch) {
      return { action: 'ignore', reason: 'Not state branch', deliveryId };
    }

    // [EARS-GW-C1, C2, C3] Filter syncable files and build delta
    const fileMap = new Map<string, 'A' | 'M' | 'D'>();

    for (const commit of pushData.commits) {
      for (const file of commit.added) {
        if (shouldSyncFile(file)) fileMap.set(file, 'A');
      }
      for (const file of commit.modified) {
        if (shouldSyncFile(file)) {
          // [EARS-GW-C3] Last commit wins: add → modify = modify
          fileMap.set(file, fileMap.has(file) && fileMap.get(file) === 'A' ? 'A' : 'M');
        }
      }
      for (const file of commit.removed) {
        if (shouldSyncFile(file)) {
          // [EARS-GW-C3] add → delete = omit
          if (fileMap.get(file) === 'A') {
            fileMap.delete(file);
          } else {
            fileMap.set(file, 'D');
          }
        }
      }
    }

    // [EARS-GW-C2] No syncable files
    if (fileMap.size === 0) {
      return { action: 'ignore', reason: 'No syncable files', deliveryId };
    }

    // [EARS-GW-D1, C1] Build result
    const delta = Array.from(fileMap.entries()).map(([file, status]) => ({ status, file }));

    return {
      action: 'sync',
      delta,
      headSha: pushData.after,
      reason: `${delta.length} syncable files changed`,
      deliveryId,
    };
  }
}
