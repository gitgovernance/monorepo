/**
 * Block A: CLI Record Creation — 8 EARS (CA1-CA7, CA9; CA8 deprecated)
 * Blueprint: e2e/specs/cli_records.md
 *
 * Validates that the real CLI (`node gitgov.mjs`) creates all 7 record types
 * correctly in the filesystem. All records are created via execSync — black-box.
 *
 * EARS for missing CLI commands (CA2, CA3, CA5, CA6, CA8) FAIL loudly
 * to prevent deploying without coverage. Implement the commands to fix.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  runCliCommand,
  createGitRepo,
  listRecordIds,
  readRecord,
  getGitgovDir,
  cleanupWorktree,
  SKIP_CLEANUP,
} from './helpers';
import type { ParsedRecord } from './helpers';

describe('Block A: CLI Record Creation (CA1-CA7, CA9)', () => {
  let tempDir: string;
  let repoPath: string;
  let actorId: string;
  let taskId: string;
  let cycleId: string;
  let agentRepoForCA3: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-e2e-block-a-'));
    repoPath = path.join(tempDir, 'block-a');
    createGitRepo(repoPath);
  });

  afterAll(() => {
    cleanupWorktree(repoPath);
    if (agentRepoForCA3) cleanupWorktree(agentRepoForCA3);
    if (!SKIP_CLEANUP) fs.rmSync(tempDir, { recursive: true, force: true });
    else console.log(`[SKIP_CLEANUP] Keeping tempDir=${tempDir}`);
  });

  it('[EARS-CA1] should create human actor with keypair on gitgov init', async () => {
    const result = runCliCommand(
      ['init', '--name', 'Pipeline E2E Test', '--actor-name', 'E2E Dev', '--quiet'],
      { cwd: repoPath },
    );
    expect(result.success).toBe(true);

    // Verify actor record exists
    const actorIds = await listRecordIds(repoPath, 'actors');
    expect(actorIds.length).toBeGreaterThanOrEqual(1);

    // Verify .key file exists in keys/ directory (CLI stores keys separately from actor JSON)
    const keysDir = path.join(getGitgovDir(repoPath), 'keys');
    const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
    expect(keyFiles.length).toBeGreaterThanOrEqual(1);

    // Verify config.json exists
    expect(fs.existsSync(path.join(getGitgovDir(repoPath), 'config.json'))).toBe(true);

    // Read actor record and verify shape
    const actor = await readRecord(repoPath, 'actors', actorIds[0]!);
    expect(actor.payload.type).toBe('human');
    expect(actor.payload.displayName).toBe('E2E Dev');
    expect(actor.payload.publicKey).toBeDefined();
    actorId = actor.payload.id;
  });

  it('[EARS-CA2] should create agent actor with separate keypair', async () => {
    // Agent init needs its own repo — init --type agent re-initializes the whole project
    const agentRepoPath = path.join(tempDir, 'block-a-agent');
    createGitRepo(agentRepoPath);

    const result = runCliCommand(
      ['init', '--actor-name', 'Agente Auditor', '--type', 'agent', '--quiet'],
      { cwd: agentRepoPath },
    );
    expect(result.success).toBe(true);

    const actorIds = await listRecordIds(agentRepoPath, 'actors');
    const agentActorId = actorIds.find(id => id.includes('agent'));
    expect(agentActorId).toBeDefined();

    const agent = await readRecord(agentRepoPath, 'actors', agentActorId!);
    expect(agent.payload.type).toBe('agent');
    expect(agent.payload.displayName).toBe('Agente Auditor');

    // Store for CA3
    agentRepoForCA3 = agentRepoPath;
  });

  it('[EARS-CA3] should create agent record with engine config', async () => {
    // agent new requires <actorId> positional — use the agent actor from CA2's repo
    expect(agentRepoForCA3).toBeDefined();
    const actorIds = await listRecordIds(agentRepoForCA3, 'actors');
    const agentActorId = actorIds.find(id => id.includes('agent'));
    expect(agentActorId).toBeDefined();

    const agent = await readRecord(agentRepoForCA3, 'actors', agentActorId!);
    const result = runCliCommand(
      ['agent', 'new', agent.payload.id, '--engine-type', 'local'],
      { cwd: agentRepoForCA3 },
    );
    expect(result.success).toBe(true);

    const agentDir = path.join(getGitgovDir(agentRepoForCA3), 'agents');
    const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.json'));
    expect(agentFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('[EARS-CA4] should create signed task record with correct payload', async () => {
    const result = runCliCommand(
      ['task', 'new', 'Fix auth bug', '-d', 'Auth bypass in login flow', '-p', 'high', '--tags', 'bug,auth', '-q'],
      { cwd: repoPath },
    );
    expect(result.success).toBe(true);

    const taskIds = await listRecordIds(repoPath, 'tasks');
    expect(taskIds.length).toBeGreaterThanOrEqual(1);

    const task = await readRecord(repoPath, 'tasks', taskIds[0]!);
    expect(task.payload.title).toBe('Fix auth bug');
    expect(task.payload.priority).toBe('high');
    expect(task.payload.status).toBe('draft');
    expect(task.payload.tags).toContain('bug');
    expect(task.payload.tags).toContain('auth');
    expect(task.header.signatures).toHaveLength(1);
    taskId = task.payload.id;
  });

  it('[EARS-CA4+] should create feedback record via task assign', async () => {
    const result = runCliCommand(
      ['task', 'assign', taskId, '--to', actorId, '-q'],
      { cwd: repoPath },
    );
    expect(result.success).toBe(true);

    const fbIds = await listRecordIds(repoPath, 'feedbacks');
    expect(fbIds.length).toBeGreaterThanOrEqual(1);

    const fb = await readRecord(repoPath, 'feedbacks', fbIds[0]!);
    expect(fb.payload.type).toBe('assignment');
    expect(fb.payload.entityType).toBe('task');
    expect(fb.payload.entityId).toBe(taskId);
  });

  it('[EARS-CA5] should create execution record linked to task', async () => {
    // exec new takes <taskId> as positional arg, not --task flag
    const result = runCliCommand(
      ['exec', 'new', taskId, '-t', 'analysis', '-r', 'Security scan completed with 0 findings', '--title', 'Security scan'],
      { cwd: repoPath },
    );
    expect(result.success).toBe(true);

    const execIds = await listRecordIds(repoPath, 'executions');
    expect(execIds.length).toBeGreaterThanOrEqual(1);

    const exec = await readRecord(repoPath, 'executions', execIds[0]!);
    expect(exec.payload.taskId).toBe(taskId);
    expect(exec.header.signatures.length).toBeGreaterThanOrEqual(1);
  });

  it('[EARS-CA6] should create feedback record with approval type', async () => {
    // Requires: gitgov feedback --entity-type task --type approval ...
    const result = runCliCommand(
      ['feedback', '--entity-type', 'task', '--entity-id', taskId, '--type', 'approval', '--content', 'LGTM'],
      { cwd: repoPath },
    );
    expect(result.success).toBe(true);

    const fbIds = await listRecordIds(repoPath, 'feedbacks');
    const fbRecords = await Promise.all(fbIds.map(id => readRecord(repoPath, 'feedbacks', id)));
    const approvalFb = fbRecords.find(fb => fb.payload.type === 'approval');
    expect(approvalFb).toBeDefined();
    expect(approvalFb!.payload.entityType).toBe('task');
    expect(approvalFb!.payload.entityId).toBe(taskId);
  });

  it('[EARS-CA7] should create cycle record referencing tasks', async () => {
    const result = runCliCommand(
      ['cycle', 'new', 'Sprint 1', '--task-ids', taskId, '-q'],
      { cwd: repoPath },
    );
    expect(result.success).toBe(true);

    const cycleIds = await listRecordIds(repoPath, 'cycles');
    // gitgov init creates a root cycle, so we expect at least 2 (root + Sprint 1)
    expect(cycleIds.length).toBeGreaterThanOrEqual(2);

    // Find our Sprint 1 cycle (not the root cycle created by init)
    let sprint1: ParsedRecord | undefined;
    for (const id of cycleIds) {
      const c = await readRecord(repoPath, 'cycles', id);
      if (c.payload.title === 'Sprint 1') {
        sprint1 = c;
        break;
      }
    }
    expect(sprint1).toBeDefined();
    expect(sprint1!.payload.taskIds).toContain(taskId);
    expect(sprint1!.header.signatures.length).toBeGreaterThanOrEqual(1);
    cycleId = sprint1!.payload.id;
  });

  // CA8 (changelog) — DEPRECATED: changelog record type removed from protocol

  it('[EARS-CA9] should have valid SHA-256 checksums on all records', async () => {
    const dirs = ['actors', 'tasks', 'feedbacks', 'cycles'];
    let totalChecked = 0;

    for (const dir of dirs) {
      const ids = await listRecordIds(repoPath, dir);
      for (const id of ids) {
        const record = await readRecord(repoPath, dir, id);
        expect(record.header).toBeDefined();
        expect(record.header.payloadChecksum).toBeDefined();
        expect(record.header.signatures.length).toBeGreaterThanOrEqual(1);

        // Verify checksum is SHA-256 hex (64 chars)
        expect(record.header.payloadChecksum).toMatch(/^[a-f0-9]{64}$/);

        // Verify each signature has required fields
        for (const sig of record.header.signatures) {
          expect(sig.keyId).toBeDefined();
          expect(sig.signature).toBeDefined();
          expect(sig.timestamp).toBeDefined();
        }

        totalChecked++;
      }
    }

    // We should have at least 4 records: 1 actor + 1 task + 1 feedback + 1 cycle
    expect(totalChecked).toBeGreaterThanOrEqual(4);
  });
});
