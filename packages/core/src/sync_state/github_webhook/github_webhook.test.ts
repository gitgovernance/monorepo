/**
 * GithubWebhookHandler Tests
 *
 * Tests for the GitHub webhook processor for state sync.
 *
 * All EARS prefixes map to github_webhook_module.md
 * [EARS-GW-A1 to GW-D3]
 */

import crypto from "crypto";
import { GithubWebhookHandler } from "./github_webhook";
import type { WebhookPayload } from "./github_webhook.types";

const TEST_SECRET = "test-webhook-secret-abc123";

/**
 * Helper: compute valid HMAC-SHA256 signature for a body.
 */
function sign(body: string, secret: string = TEST_SECRET): string {
  const hmac = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  return `sha256=${hmac}`;
}

/**
 * Helper: create a valid push payload to gitgov-state with given files.
 */
function makePushPayload(
  opts: {
    branch?: string;
    added?: string[];
    modified?: string[];
    removed?: string[];
    after?: string;
  } = {},
): string {
  const branch = opts.branch ?? "gitgov-state";
  return JSON.stringify({
    ref: `refs/heads/${branch}`,
    after: opts.after ?? "abc123def456",
    before: "000000000000",
    commits: [
      {
        id: "commit1",
        added: opts.added ?? [],
        modified: opts.modified ?? [],
        removed: opts.removed ?? [],
      },
    ],
    repository: { full_name: "org/repo" },
  });
}

/**
 * Helper: create a valid WebhookPayload with proper signature.
 */
function makePayload(
  rawBody: string,
  overrides: Partial<WebhookPayload> = {},
): WebhookPayload {
  return {
    signature: sign(rawBody),
    event: "push",
    deliveryId: "delivery-001",
    rawBody,
    ...overrides,
  };
}

describe("GithubWebhookHandler", () => {
  let handler: GithubWebhookHandler;

  beforeEach(() => {
    handler = new GithubWebhookHandler({ secret: TEST_SECRET });
  });

  // ===== EARS-GW-A1 to A3: Signature Verification =====

  describe("4.1. Signature Verification (EARS-GW-A1 to GW-A3)", () => {
    it("[EARS-GW-A1] should accept payload with valid HMAC-SHA256 signature", () => {
      const body = makePushPayload({ added: [".gitgov/tasks/1.json"] });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).not.toBe("error");
    });

    it("[EARS-GW-A2] should return error for invalid or missing signature", () => {
      const body = makePushPayload({ added: [".gitgov/tasks/1.json"] });

      // Invalid signature
      const result1 = handler.handle(
        makePayload(body, { signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000" }),
      );
      expect(result1.action).toBe("error");
      expect(result1.reason).toBe("Invalid signature");

      // Missing signature (empty string)
      const result2 = handler.handle(
        makePayload(body, { signature: "" }),
      );
      expect(result2.action).toBe("error");
      expect(result2.reason).toBe("Invalid signature");

      // Wrong prefix
      const result3 = handler.handle(
        makePayload(body, { signature: "sha1=abcdef" }),
      );
      expect(result3.action).toBe("error");
      expect(result3.reason).toBe("Invalid signature");
    });

    it("[EARS-GW-A3] should use timingSafeEqual for signature comparison", () => {
      const spy = jest.spyOn(crypto, "timingSafeEqual");
      const body = makePushPayload({ added: [".gitgov/tasks/1.json"] });
      const payload = makePayload(body);

      handler.handle(payload);

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  // ===== EARS-GW-B1 to B3: Event Filtering =====

  describe("4.2. Event Filtering (EARS-GW-B1 to GW-B3)", () => {
    it("[EARS-GW-B1] should process push events to gitgov-state branch", () => {
      const body = makePushPayload({ added: [".gitgov/tasks/1.json"] });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).toBe("sync");
      expect(result.delta).toBeDefined();
      expect(result.delta!.length).toBeGreaterThan(0);
    });

    it("[EARS-GW-B2] should ignore ping events", () => {
      const body = JSON.stringify({ zen: "Keep it logically awesome." });
      const payload = makePayload(body, { event: "ping" });

      const result = handler.handle(payload);

      expect(result.action).toBe("ignore");
      expect(result.reason).toBe("Ping event");
    });

    it("[EARS-GW-B3] should ignore push events to non-state branches", () => {
      const body = makePushPayload({
        branch: "main",
        added: [".gitgov/tasks/1.json"],
      });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).toBe("ignore");
      expect(result.reason).toBe("Not state branch");
    });
  });

  // ===== EARS-GW-C1 to C3: File Filtering and Delta =====

  describe("4.3. File Filtering and Delta (EARS-GW-C1 to GW-C3)", () => {
    it("[EARS-GW-C1] should return sync action with delta for syncable gitgov files", () => {
      const body = makePushPayload({
        added: [".gitgov/tasks/task-1.json", ".gitgov/actors/human_dev.json"],
        modified: [".gitgov/config.json"],
      });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).toBe("sync");
      expect(result.delta).toBeDefined();
      expect(result.delta!.length).toBe(3);

      const files = result.delta!.map((d) => d.file);
      expect(files).toContain(".gitgov/tasks/task-1.json");
      expect(files).toContain(".gitgov/actors/human_dev.json");
      expect(files).toContain(".gitgov/config.json");

      // Verify statuses
      const taskDelta = result.delta!.find((d) => d.file === ".gitgov/tasks/task-1.json");
      expect(taskDelta!.status).toBe("A");
      const configDelta = result.delta!.find((d) => d.file === ".gitgov/config.json");
      expect(configDelta!.status).toBe("M");
    });

    it("[EARS-GW-C2] should ignore push with no syncable files", () => {
      const body = makePushPayload({
        added: ["README.md", ".gitignore"],
        modified: ["src/index.ts"],
      });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).toBe("ignore");
      expect(result.reason).toBe("No syncable files");
    });

    it("[EARS-GW-C3] should deduplicate files across multiple commits in single push", () => {
      // Scenario: commit1 adds file, commit2 modifies it, commit3 deletes another
      const body = JSON.stringify({
        ref: "refs/heads/gitgov-state",
        after: "sha-final",
        before: "sha-before",
        commits: [
          {
            id: "commit1",
            added: [".gitgov/tasks/task-a.json", ".gitgov/tasks/task-b.json"],
            modified: [],
            removed: [],
          },
          {
            id: "commit2",
            added: [],
            modified: [".gitgov/tasks/task-a.json"],
            removed: [],
          },
          {
            id: "commit3",
            added: [],
            modified: [],
            removed: [".gitgov/tasks/task-b.json"],
          },
        ],
        repository: { full_name: "org/repo" },
      });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).toBe("sync");
      expect(result.delta).toBeDefined();

      // task-a: added in commit1, modified in commit2 → stays as A (add then modify = A)
      const taskA = result.delta!.find((d) => d.file === ".gitgov/tasks/task-a.json");
      expect(taskA).toBeDefined();
      expect(taskA!.status).toBe("A");

      // task-b: added in commit1, removed in commit3 → omitted (add then delete = gone)
      const taskB = result.delta!.find((d) => d.file === ".gitgov/tasks/task-b.json");
      expect(taskB).toBeUndefined();

      expect(result.delta!.length).toBe(1);
    });
  });

  // ===== EARS-GW-D1 to D3: Result Construction =====

  describe("4.4. Result Construction (EARS-GW-D1 to GW-D3)", () => {
    it("[EARS-GW-D1] should include headSha and deliveryId in sync result", () => {
      const body = makePushPayload({
        added: [".gitgov/tasks/1.json"],
        after: "deadbeef123456",
      });
      const payload = makePayload(body, { deliveryId: "delivery-xyz" });

      const result = handler.handle(payload);

      expect(result.action).toBe("sync");
      expect(result.headSha).toBe("deadbeef123456");
      expect(result.deliveryId).toBe("delivery-xyz");
    });

    it("[EARS-GW-D2] should return error for invalid JSON without throwing", () => {
      const body = "this is not valid json {{{";
      const payload = makePayload(body);

      // Should not throw
      const result = handler.handle(payload);

      expect(result.action).toBe("error");
      expect(result.reason).toBe("Invalid JSON payload");
      expect(result.deliveryId).toBe("delivery-001");
    });

    it("[EARS-GW-D3] should return error for malformed push event with missing fields", () => {
      // Missing 'ref' and 'commits'
      const body = JSON.stringify({ after: "sha123" });
      const payload = makePayload(body);

      const result = handler.handle(payload);

      expect(result.action).toBe("error");
      expect(result.reason).toContain("Malformed push event");
      expect(result.reason).toContain("ref");
      expect(result.reason).toContain("commits");
    });
  });
});
