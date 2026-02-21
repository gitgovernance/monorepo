/**
 * GithubWebhookHandler - GitHub webhook processor for state sync.
 *
 * Pure logic module that processes GitHub push event payloads,
 * verifies HMAC-SHA256 signatures, filters relevant events,
 * and returns a typed decision (sync/ignore/error).
 *
 * All EARS prefixes map to github_webhook_module.md
 * [EARS-GW-A1 to GW-D3]
 *
 * @module sync_state/github_webhook
 */

import crypto from "crypto";
import type { StateDeltaFile } from "../sync_state.types";
import { shouldSyncFile } from "../sync_state.utils";
import { DEFAULT_STATE_BRANCH } from "../fs_worktree/fs_worktree_sync_state.types";
import type {
  GithubWebhookOptions,
  WebhookPayload,
  WebhookResult,
  PushEventData,
} from "./github_webhook.types";

/**
 * GithubWebhookHandler - Processes GitHub webhook deliveries.
 *
 * Framework-agnostic: receives extracted payload data, returns a decision.
 * Never throws exceptions — all error paths return WebhookResult with action: 'error'.
 *
 * [EARS-GW-A1 to EARS-GW-D3]
 */
export class GithubWebhookHandler {
  private readonly secret: string;
  private readonly stateBranch: string;

  constructor(options: GithubWebhookOptions) {
    this.secret = options.secret;
    this.stateBranch = options.stateBranch ?? DEFAULT_STATE_BRANCH;
  }

  /**
   * Process a GitHub webhook delivery.
   * Returns a decision (sync/ignore/error) — never throws.
   *
   * [EARS-GW-A1, A2, A3, B1, B2, B3, C1, C2, C3, D1, D2, D3]
   */
  handle(payload: WebhookPayload): WebhookResult {
    const { deliveryId } = payload;

    // [EARS-GW-A1, A2, A3] Verify HMAC-SHA256 signature
    if (!this.verifySignature(payload.rawBody, payload.signature)) {
      return {
        action: "error",
        reason: "Invalid signature",
        deliveryId,
      };
    }

    // [EARS-GW-B2] Handle ping events (GitHub health check)
    if (payload.event === "ping") {
      return {
        action: "ignore",
        reason: "Ping event",
        deliveryId,
      };
    }

    // [EARS-GW-B1, B3] Only process push events
    if (payload.event !== "push") {
      return {
        action: "ignore",
        reason: `Unsupported event: ${payload.event}`,
        deliveryId,
      };
    }

    // [EARS-GW-D2] Parse payload
    let pushData: PushEventData;
    try {
      pushData = JSON.parse(payload.rawBody) as PushEventData;
    } catch {
      return {
        action: "error",
        reason: "Invalid JSON payload",
        deliveryId,
      };
    }

    // [EARS-GW-D3] Validate required fields
    const missingFields: string[] = [];
    if (!pushData.ref) missingFields.push("ref");
    if (!pushData.after) missingFields.push("after");
    if (!Array.isArray(pushData.commits)) missingFields.push("commits");

    if (missingFields.length > 0) {
      return {
        action: "error",
        reason: `Malformed push event: missing ${missingFields.join(", ")}`,
        deliveryId,
      };
    }

    // [EARS-GW-B3] Check if push is to the state branch
    const expectedRef = `refs/heads/${this.stateBranch}`;
    if (pushData.ref !== expectedRef) {
      return {
        action: "ignore",
        reason: "Not state branch",
        deliveryId,
      };
    }

    // [EARS-GW-C1, C2, C3] Filter syncable files and build delta
    const delta = this.buildDelta(pushData.commits);

    if (delta.length === 0) {
      return {
        action: "ignore",
        reason: "No syncable files",
        deliveryId,
      };
    }

    // [EARS-GW-D1] Return sync decision with headSha and deliveryId
    return {
      action: "sync",
      delta,
      headSha: pushData.after,
      reason: `${delta.length} syncable file(s) changed`,
      deliveryId,
    };
  }

  /**
   * Verify HMAC-SHA256 signature using constant-time comparison.
   *
   * [EARS-GW-A1, A2, A3]
   */
  private verifySignature(rawBody: string, signature: string): boolean {
    if (!signature) {
      return false;
    }

    // Expect format: sha256=<hex>
    const prefix = "sha256=";
    if (!signature.startsWith(prefix)) {
      return false;
    }

    const receivedHex = signature.slice(prefix.length);

    // Compute expected HMAC
    const expectedHex = crypto
      .createHmac("sha256", this.secret)
      .update(rawBody, "utf8")
      .digest("hex");

    // [EARS-GW-A3] Constant-time comparison
    const receivedBuf = Buffer.from(receivedHex, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");

    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  }

  /**
   * Build deduplicated delta from commit file lists.
   * Last commit wins for files modified across multiple commits.
   *
   * [EARS-GW-C1, C2, C3]
   */
  private buildDelta(
    commits: PushEventData["commits"],
  ): StateDeltaFile[] {
    // Track latest status per file path (last commit wins)
    const fileMap = new Map<string, "A" | "M" | "D">();

    for (const commit of commits) {
      for (const file of commit.added) {
        if (shouldSyncFile(file)) {
          fileMap.set(file, "A");
        }
      }
      for (const file of commit.modified) {
        if (shouldSyncFile(file)) {
          // If previously added in an earlier commit, keep as A
          const existing = fileMap.get(file);
          fileMap.set(file, existing === "A" ? "A" : "M");
        }
      }
      for (const file of commit.removed) {
        if (shouldSyncFile(file)) {
          // If added then deleted in same push, omit entirely
          const existing = fileMap.get(file);
          if (existing === "A") {
            fileMap.delete(file);
          } else {
            fileMap.set(file, "D");
          }
        }
      }
    }

    return Array.from(fileMap.entries()).map(([file, status]) => ({
      file,
      status,
    }));
  }
}
