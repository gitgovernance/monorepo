/**
 * Tests for GitLabWebhookHandler
 *
 * Blueprint: gitlab_webhook_module.md
 * EARS: GW-A1-A2, GW-B1-B3, GW-C1-C3, GW-D1-D3
 */

import { GitLabWebhookHandler } from './gitlab_webhook';
import type { GitLabWebhookPayload } from './gitlab_webhook.types';

const SECRET = 'test-webhook-secret';

function createHandler(stateBranch = 'gitgov-state') {
  return new GitLabWebhookHandler({ secret: SECRET, stateBranch });
}

function pushPayload(overrides?: Partial<{
  object_kind: string;
  ref: string;
  after: string;
  commits: Array<{ id: string; added: string[]; modified: string[]; removed: string[] }>;
}>): GitLabWebhookPayload {
  const body = {
    object_kind: overrides?.object_kind ?? 'push',
    ref: overrides?.ref ?? 'refs/heads/gitgov-state',
    after: overrides?.after ?? 'abc123',
    before: '000000',
    project_id: 123,
    commits: overrides?.commits ?? [{
      id: 'c1',
      added: ['.gitgov/tasks/t1.json'],
      modified: [],
      removed: [],
    }],
  };

  return {
    token: SECRET,
    deliveryId: 'delivery-uuid',
    rawBody: JSON.stringify(body),
  };
}

describe('GitLabWebhookHandler', () => {
  describe('4.1. Token Verification (EARS-GW-A1 to A2)', () => {
    it('[EARS-GW-A1] should accept payload with valid X-Gitlab-Token', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload());
      expect(result.action).toBe('sync');
    });

    it('[EARS-GW-A2] should return error for invalid or missing token', () => {
      const handler = createHandler();
      const payload = pushPayload();
      payload.token = 'wrong-token';

      const result = handler.handle(payload);
      expect(result.action).toBe('error');
      expect(result.reason).toBe('Invalid token');
    });
  });

  describe('4.2. Event Filtering (EARS-GW-B1 to B3)', () => {
    it('[EARS-GW-B1] should process push events to gitgov-state branch', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload());
      expect(result.action).toBe('sync');
    });

    it('[EARS-GW-B2] should ignore non-push events (tag_push, merge_request)', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload({ object_kind: 'tag_push' }));
      expect(result.action).toBe('ignore');
      expect(result.reason).toContain('Not push event');
    });

    it('[EARS-GW-B3] should ignore push events to non-state branches', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload({ ref: 'refs/heads/main' }));
      expect(result.action).toBe('ignore');
      expect(result.reason).toBe('Not state branch');
    });
  });

  describe('4.3. File Filtering and Delta (EARS-GW-C1 to C3)', () => {
    it('[EARS-GW-C1] should return sync action with delta for syncable gitgov files', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload({
        commits: [{
          id: 'c1',
          added: ['.gitgov/tasks/t1.json', '.gitgov/actors/a1.json'],
          modified: [],
          removed: [],
        }],
      }));

      expect(result.action).toBe('sync');
      expect(result.delta).toHaveLength(2);
      expect(result.delta![0]!.status).toBe('A');
    });

    it('[EARS-GW-C2] should ignore push with no syncable files', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload({
        commits: [{
          id: 'c1',
          added: ['README.md', 'src/index.ts'],
          modified: [],
          removed: [],
        }],
      }));

      expect(result.action).toBe('ignore');
      expect(result.reason).toBe('No syncable files');
    });

    it('[EARS-GW-C3] should deduplicate files across multiple commits', () => {
      const handler = createHandler();

      // Case 1: add → delete = omit
      const r1 = handler.handle(pushPayload({
        commits: [
          { id: 'c1', added: ['.gitgov/tasks/t1.json'], modified: [], removed: [] },
          { id: 'c2', added: [], modified: [], removed: ['.gitgov/tasks/t1.json'] },
        ],
      }));
      expect(r1.action).toBe('ignore');
      expect(r1.reason).toBe('No syncable files');

      // Case 2: add → modify = stays as A (first add wins)
      const r2 = handler.handle(pushPayload({
        commits: [
          { id: 'c1', added: ['.gitgov/tasks/t2.json'], modified: [], removed: [] },
          { id: 'c2', added: [], modified: ['.gitgov/tasks/t2.json'], removed: [] },
        ],
      }));
      expect(r2.action).toBe('sync');
      expect(r2.delta![0]!.status).toBe('A');

      // Case 3: modify → delete = delete
      const r3 = handler.handle(pushPayload({
        commits: [
          { id: 'c1', added: [], modified: ['.gitgov/tasks/t3.json'], removed: [] },
          { id: 'c2', added: [], modified: [], removed: ['.gitgov/tasks/t3.json'] },
        ],
      }));
      expect(r3.action).toBe('sync');
      expect(r3.delta![0]!.status).toBe('D');
    });
  });

  describe('4.4. Result Construction (EARS-GW-D1 to D3)', () => {
    it('[EARS-GW-D1] should include headSha and deliveryId in sync result', () => {
      const handler = createHandler();
      const result = handler.handle(pushPayload({ after: 'head-sha-123' }));

      expect(result.action).toBe('sync');
      expect(result.headSha).toBe('head-sha-123');
      expect(result.deliveryId).toBe('delivery-uuid');
    });

    it('[EARS-GW-D2] should return error for invalid JSON without throwing', () => {
      const handler = createHandler();
      const result = handler.handle({
        token: SECRET,
        deliveryId: 'uuid',
        rawBody: 'not valid json {{{',
      });

      expect(result.action).toBe('error');
      expect(result.reason).toBe('Invalid JSON payload');
    });

    it('[EARS-GW-D3] should return error for malformed push event', () => {
      const handler = createHandler();
      const result = handler.handle({
        token: SECRET,
        deliveryId: 'uuid',
        rawBody: JSON.stringify({ object_kind: 'push' }), // missing ref, after, commits
      });

      expect(result.action).toBe('error');
      expect(result.reason).toContain('Malformed push event');
    });
  });
});
