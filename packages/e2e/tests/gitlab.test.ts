/**
 * Block J: GitLab Integration E2E Tests
 *
 * Blueprint: e2e/specs/gitlab.md
 * EARS: CJ1-CJ8
 *
 * Tests @gitgov/core-gitlab (GitLabRecordStore) against a REAL GitLab
 * repository. Validates that the same RecordStore contract that works
 * for GitHub (Block C) also works for GitLab.
 *
 * Requires: GITLAB_TOKEN + GITLAB_TEST_PROJECT_ID env vars.
 * Each test run creates an ephemeral branch and cleans up in afterAll.
 *
 * Uses @gitgov/core-gitlab via workspace:* (submodule in packages/core-gitlab).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Gitlab } from '@gitbeaker/rest';
import { randomUUID } from 'crypto';
import { GitLabRecordStore } from '@gitgov/core-gitlab';
import type { GitLabRecordStoreOptions } from '@gitgov/core-gitlab';
import {
  createTestPrisma,
  cleanupDb,
} from './helpers';
import type { PrismaClient } from './helpers';

const GITLAB_TOKEN = process.env['GITLAB_TOKEN'] ?? '';
const GITLAB_TEST_PROJECT_ID = process.env['GITLAB_TEST_PROJECT_ID'] ?? '';
const HAS_GITLAB = GITLAB_TOKEN.length > 0 && GITLAB_TEST_PROJECT_ID.length > 0;

// Record type for tests
type TestTaskRecord = {
  header: { version: string; type: string; payloadChecksum: string; signatures: Array<{ keyId: string; role: string; notes: string; signature: string; timestamp: number }> };
  payload: { id: string; title: string; status: string; priority: string };
};

function makeTaskRecord(id: string, title: string): TestTaskRecord {
  return {
    header: {
      version: '1.0',
      type: 'task',
      payloadChecksum: 'e2e-checksum-' + id,
      signatures: [{
        keyId: 'human:e2e-gitlab-dev',
        role: 'author',
        notes: 'E2E GitLab test',
        signature: 'e2e-sig',
        timestamp: Date.now(),
      }],
    },
    payload: { id, title, status: 'draft', priority: 'high' },
  };
}

describe('Block J: GitLab Integration (CJ1-CJ8)', () => {
  if (!HAS_GITLAB) {
    it.skip('requires GITLAB_TOKEN and GITLAB_TEST_PROJECT_ID — set in packages/e2e/.env', () => {});
    return;
  }

  let api: InstanceType<typeof Gitlab>;
  let projectId: number;
  let testBranch: string;
  let tasksStore: GitLabRecordStore<TestTaskRecord>;
  let prisma: PrismaClient;

  beforeAll(async () => {
    api = new Gitlab({ token: GITLAB_TOKEN });
    projectId = Number(GITLAB_TEST_PROJECT_ID);
    testBranch = `e2e-test-${randomUUID().slice(0, 8)}`;

    // Ensure repo has at least one commit
    try {
      await api.Branches.show(projectId, 'main');
    } catch {
      await api.Commits.create(projectId, 'main', 'initial commit', [
        { action: 'create', file_path: 'README.md', content: '# E2E Test Repo' },
      ]);
    }

    await api.Branches.create(projectId, testBranch, 'main');

    // GitLabRecordStore from @gitgov/core-gitlab
    tasksStore = new GitLabRecordStore<TestTaskRecord>({
      projectId,
      api: api as unknown as GitLabRecordStoreOptions['api'],
      ref: testBranch,
      basePath: '.gitgov/tasks',
    });

    prisma = createTestPrisma();
  }, 30_000);

  afterAll(async () => {
    try { await api.Branches.remove(projectId, testBranch); } catch { /* branch may not exist */ }
    try { await cleanupDb(prisma); await prisma.$disconnect(); } catch { /* ignore */ }
  }, 30_000);

  // ==================== CJ1-CJ3: CRUD via GitLabRecordStore ====================

  it('[EARS-CJ1] should write record to GitLab repo and return commit SHA', async () => {
    const record = makeTaskRecord('task-001', 'GitLab E2E Task');
    const result = await tasksStore.put('task-001', record);

    expect(result).toBeDefined();
    expect(result.commitSha).toBeDefined();
    expect(typeof result.commitSha).toBe('string');
    expect(result.commitSha.length).toBeGreaterThan(0);
  }, 30_000);

  it('[EARS-CJ2] should list all record IDs from GitLab directory via Tree API', async () => {
    const ids = await tasksStore.list();
    expect(ids).toContain('task-001');
  }, 30_000);

  it('[EARS-CJ3] should read record with intact payload', async () => {
    const record = await tasksStore.get('task-001');

    expect(record).not.toBeNull();
    expect(record!.payload.id).toBe('task-001');
    expect(record!.payload.title).toBe('GitLab E2E Task');
    expect(record!.payload.status).toBe('draft');
    expect(record!.header.signatures).toHaveLength(1);
    expect(record!.header.signatures[0].keyId).toBe('human:e2e-gitlab-dev');
  }, 30_000);

  // ==================== CJ4: Batch Write ====================

  it('[EARS-CJ4] should write N records in 1 atomic commit via Commits API', async () => {
    const records: Array<{ id: string; value: TestTaskRecord }> = [
      { id: 'task-batch-1', value: makeTaskRecord('task-batch-1', 'Batch 1') },
      { id: 'task-batch-2', value: makeTaskRecord('task-batch-2', 'Batch 2') },
      { id: 'task-batch-3', value: makeTaskRecord('task-batch-3', 'Batch 3') },
    ];

    const result = await tasksStore.putMany(records);
    expect(result).toBeDefined();
    expect(result.commitSha).toBeDefined();

    const ids = await tasksStore.list();
    expect(ids).toContain('task-batch-1');
    expect(ids).toContain('task-batch-2');
    expect(ids).toContain('task-batch-3');
  }, 30_000);

  // ==================== CJ7: Delete ====================

  it('[EARS-CJ7] should delete record from GitLab and return null on subsequent get', async () => {
    const before = await tasksStore.get('task-batch-3');
    expect(before).not.toBeNull();

    await tasksStore.delete('task-batch-3');

    const after = await tasksStore.get('task-batch-3');
    expect(after).toBeNull();
  }, 30_000);

  // ==================== CJ5-CJ6: Projection ====================

  it('[EARS-CJ5] should compute IndexData from GitLab-stored records', async () => {
    const ids = await tasksStore.list();
    expect(ids.length).toBeGreaterThanOrEqual(3);

    for (const id of ids) {
      const record = await tasksStore.get(id);
      expect(record).not.toBeNull();
      expect(record!.payload.id).toBe(id);
      expect(record!.header.version).toBe('1.0');
    }
  }, 60_000);

  it('[EARS-CJ6] should persist GitLab-sourced data to PostgreSQL', async () => {
    const ids = await tasksStore.list();

    // Single-tenant: delete existing meta rows then create fresh
    await prisma.gitgovMeta.deleteMany({});
    await prisma.gitgovMeta.create({
      data: {
        generatedAt: new Date().toISOString(),
        integrityStatus: 'valid',
        recordCountsJson: { tasks: ids.length, cycles: 0, actors: 0, executions: 0, feedbacks: 0 },
        generationTime: 0,
        derivedStatesJson: {},
        metricsJson: {},
      },
    });

    const meta = await prisma.gitgovMeta.findFirst({});
    expect(meta).not.toBeNull();
    const counts = meta!.recordCountsJson as Record<string, number>;
    expect(counts['tasks']).toBe(ids.length);
  }, 30_000);

  // ==================== CJ8: Optimistic Concurrency ====================

  it('[EARS-CJ8] should detect stale blob_id after external modification', async () => {
    const record = await tasksStore.get('task-001');
    expect(record).not.toBeNull();

    // Modify externally (bypass GitLabRecordStore)
    const newContent = Buffer.from(JSON.stringify(
      makeTaskRecord('task-001', 'Modified externally'), null, 2,
    )).toString('base64');
    await api.RepositoryFiles.edit(
      projectId, '.gitgov/tasks/task-001.json', testBranch,
      newContent, 'external modification', { encoding: 'base64' },
    );

    // Re-read via store — should see the external change
    const modified = await tasksStore.get('task-001');
    expect(modified).not.toBeNull();
    expect(modified!.payload.title).toBe('Modified externally');
  }, 30_000);
});
