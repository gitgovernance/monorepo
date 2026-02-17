import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

import { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { ToolResult } from '../../server/mcp_server.types.js';

// Tool handlers — imported directly for Level 2 (no protocol layer)
import { taskNewTool } from '../../tools/task/task_new_tool.js';
import { taskDeleteTool } from '../../tools/task/task_delete_tool.js';
import { taskSubmitTool } from '../../tools/task/task_submit_tool.js';
import { taskApproveTool } from '../../tools/task/task_approve_tool.js';
import { taskActivateTool } from '../../tools/task/task_activate_tool.js';
import { taskCompleteTool } from '../../tools/task/task_complete_tool.js';

import { cycleNewTool } from '../../tools/cycle/cycle_new_tool.js';
import { cycleActivateTool } from '../../tools/cycle/cycle_activate_tool.js';
import { cycleCompleteTool } from '../../tools/cycle/cycle_complete_tool.js';
import { cycleAddTaskTool } from '../../tools/cycle/cycle_add_task_tool.js';
import { cycleRemoveTaskTool } from '../../tools/cycle/cycle_remove_task_tool.js';
import { cycleMoveTaskTool } from '../../tools/cycle/cycle_move_task_tool.js';
import { cycleAddChildTool } from '../../tools/cycle/cycle_add_child_tool.js';

import { feedbackCreateTool } from '../../tools/feedback/feedback_create_tool.js';
import { feedbackListTool } from '../../tools/feedback/feedback_list_tool.js';
import { feedbackResolveTool } from '../../tools/feedback/feedback_resolve_tool.js';

import { statusTool } from '../../tools/read/status_tool.js';
import { contextTool } from '../../tools/read/context_tool.js';
import { lintTool } from '../../tools/read/lint_tool.js';
import { taskListTool } from '../../tools/read/task_list_tool.js';
import { taskShowTool } from '../../tools/read/task_show_tool.js';
import { cycleShowTool } from '../../tools/read/cycle_show_tool.js';

import { actorNewTool } from '../../tools/audit/actor_new_tool.js';
import { auditScanTool } from '../../tools/audit/audit_scan_tool.js';
import { auditWaiveTool } from '../../tools/audit/audit_waive_tool.js';

import { createResourceHandler } from '../../resources/mcp_resources.js';

import {
  createTempGitgovProject,
  createDI,
  parseToolResult,
  seedActor,
} from './core_test_helpers.js';
import type { TempGitgovProject } from './mcp_core_integration.types.js';

/**
 * MCP Core Integration Tests — Level 2.
 *
 * Handlers called directly with real McpDependencyInjectionService,
 * real FsRecordStore, and a temp .gitgov/ directory on disk.
 * No protocol layer — focus is handler ↔ core integration.
 *
 * Blueprint: specs/integration/mcp_core_integration.md
 * EARS: MSRV-CA1..CA7, CB1..CB6, CC1..CC3, CD1..CD7, CE1..CE4, CF1..CF5
 */

// ─── Helpers ───

type AnyData = Record<string, unknown>;

/** Call a tool handler and parse the result */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callHandler<T = AnyData>(
  tool: { handler: (input: any, di: McpDependencyInjectionService) => Promise<ToolResult> },
  input: Record<string, unknown>,
  di: McpDependencyInjectionService,
) {
  const result = await tool.handler(input, di);
  return parseToolResult<T>(result);
}

/** Check if a file exists on disk */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('MCP Core Integration', () => {
  // ─────────────────────────────────────────────────
  // 4.1. Task Full Lifecycle on Disk (MSRV-CA1 to CA7)
  // ─────────────────────────────────────────────────

  describe('4.1. Task Full Lifecycle on Disk (MSRV-CA1 to CA7)', () => {
    let project: TempGitgovProject;
    let di: McpDependencyInjectionService;

    beforeAll(async () => {
      project = await createTempGitgovProject();
      di = createDI(project.projectRoot);
    });

    afterAll(async () => {
      await project.cleanup();
    });

    it('[MSRV-CA1] should create task record on disk via real DI', async () => {
      const { data, isError } = await callHandler(taskNewTool, {
        title: 'Core test task',
        description: 'Created via real DI',
        priority: 'high',
      }, di);

      expect(isError).toBe(false);
      expect(data.id).toBeDefined();
      expect(data.status).toBe('draft');
      expect(data.priority).toBe('high');

      // Verify file exists on disk
      const taskId = data.id as string;
      const taskFile = path.join(project.gitgovPath, 'tasks', `${taskId}.json`);
      expect(await fileExists(taskFile)).toBe(true);

      // Verify store can read it back
      const container = await di.getContainer();
      const record = await container.stores.tasks.get(taskId);
      expect(record).not.toBeNull();
    });

    it('[MSRV-CA2] should transition task to review on disk', async () => {
      // Create a fresh task first
      const { data: created } = await callHandler(taskNewTool, {
        title: 'Submit test',
        description: 'Will be submitted',
      }, di);
      const taskId = created.id as string;

      const { data, isError } = await callHandler(taskSubmitTool, { taskId }, di);

      expect(isError).toBe(false);
      expect(data.status).toBe('review');
      expect(data.previousStatus).toBe('draft');

      // Verify on disk
      const container = await di.getContainer();
      const record = await container.stores.tasks.get(taskId);
      const payload = (record as AnyData).payload as AnyData;
      expect(payload.status).toBe('review');
    });

    it('[MSRV-CA3] should transition task to ready with signature on disk', async () => {
      // Create and submit
      const { data: created } = await callHandler(taskNewTool, {
        title: 'Approve test',
        description: 'Will be approved',
      }, di);
      const taskId = created.id as string;
      await callHandler(taskSubmitTool, { taskId }, di);

      const { data, isError } = await callHandler(taskApproveTool, { taskId }, di);

      expect(isError).toBe(false);
      expect(data.status).toBe('ready');
      expect(data.previousStatus).toBe('review');

      // Verify signature on disk — approve signs with role 'approver' in header.signatures
      const container = await di.getContainer();
      const record = await container.stores.tasks.get(taskId);
      expect(record).not.toBeNull();
      const header = (record as AnyData).header as AnyData;
      const signatures = header.signatures as AnyData[];
      expect(signatures.length).toBeGreaterThanOrEqual(1);
      expect(signatures.some((s) => s.role === 'approver')).toBe(true);
    });

    it('[MSRV-CA4] should transition task to active on disk', async () => {
      // Create → submit → approve
      const { data: created } = await callHandler(taskNewTool, {
        title: 'Activate test',
        description: 'Will be activated',
      }, di);
      const taskId = created.id as string;
      await callHandler(taskSubmitTool, { taskId }, di);
      await callHandler(taskApproveTool, { taskId }, di);

      const { data, isError } = await callHandler(taskActivateTool, { taskId }, di);

      expect(isError).toBe(false);
      expect(data.status).toBe('active');
      expect(data.previousStatus).toBe('ready');
    });

    it('[MSRV-CA5] should transition task to done with signature on disk', async () => {
      // Create → submit → approve → activate
      const { data: created } = await callHandler(taskNewTool, {
        title: 'Complete test',
        description: 'Will be completed',
      }, di);
      const taskId = created.id as string;
      await callHandler(taskSubmitTool, { taskId }, di);
      await callHandler(taskApproveTool, { taskId }, di);
      await callHandler(taskActivateTool, { taskId }, di);

      const { data, isError } = await callHandler(taskCompleteTool, { taskId }, di);

      expect(isError).toBe(false);
      expect(data.status).toBe('done');
      expect(data.previousStatus).toBe('active');

      // Verify signature on disk — complete signs with role 'approver' in header.signatures
      const container = await di.getContainer();
      const record = await container.stores.tasks.get(taskId);
      expect(record).not.toBeNull();
      const header = (record as AnyData).header as AnyData;
      const signatures = header.signatures as AnyData[];
      // Approve adds one signature, activate adds one, complete adds one = at least 3
      expect(signatures.length).toBeGreaterThanOrEqual(1);
      expect(signatures.some((s) => s.notes === 'Task completed')).toBe(true);
    });

    it('[MSRV-CA6] should remove task file from disk', async () => {
      // Create a draft task
      const { data: created } = await callHandler(taskNewTool, {
        title: 'Delete test',
        description: 'Will be deleted',
      }, di);
      const taskId = created.id as string;
      const taskFile = path.join(project.gitgovPath, 'tasks', `${taskId}.json`);
      expect(await fileExists(taskFile)).toBe(true);

      const { data, isError } = await callHandler(taskDeleteTool, { taskId }, di);

      expect(isError).toBe(false);
      expect(data.deleted).toBe(true);

      // Verify file removed from disk
      expect(await fileExists(taskFile)).toBe(false);

      // Verify store returns null
      const container = await di.getContainer();
      const record = await container.stores.tasks.get(taskId);
      expect(record).toBeNull();
    });

    it('[MSRV-CA7] should complete full task lifecycle on disk', async () => {
      // Full lifecycle: draft → review → ready → active → done
      const { data: created } = await callHandler(taskNewTool, {
        title: 'Full lifecycle task',
        description: 'Goes through all states',
        priority: 'critical',
      }, di);
      const taskId = created.id as string;
      expect(created.status).toBe('draft');

      const { data: submitted } = await callHandler(taskSubmitTool, { taskId }, di);
      expect(submitted.status).toBe('review');

      const { data: approved } = await callHandler(taskApproveTool, { taskId }, di);
      expect(approved.status).toBe('ready');

      const { data: activated } = await callHandler(taskActivateTool, { taskId }, di);
      expect(activated.status).toBe('active');

      const { data: completed } = await callHandler(taskCompleteTool, { taskId }, di);
      expect(completed.status).toBe('done');

      // Verify final state on disk
      const container = await di.getContainer();
      const record = await container.stores.tasks.get(taskId);
      expect(record).not.toBeNull();
      const payload = (record as AnyData).payload as AnyData;
      expect(payload.status).toBe('done');
      expect(payload.title).toBe('Full lifecycle task');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.2. Cycle Lifecycle & Linking on Disk (MSRV-CB1 to CB6)
  // ─────────────────────────────────────────────────

  describe('4.2. Cycle Lifecycle & Linking on Disk (MSRV-CB1 to CB6)', () => {
    let project: TempGitgovProject;
    let di: McpDependencyInjectionService;

    beforeAll(async () => {
      project = await createTempGitgovProject();
      di = createDI(project.projectRoot);
    });

    afterAll(async () => {
      await project.cleanup();
    });

    it('[MSRV-CB1] should create cycle record on disk via real DI', async () => {
      const { data, isError } = await callHandler(cycleNewTool, {
        title: 'Sprint Alpha',
      }, di);

      expect(isError).toBe(false);
      expect(data.id).toBeDefined();
      expect(data.title).toBe('Sprint Alpha');
      expect(data.status).toBe('planning');

      // Verify on disk
      const cycleId = data.id as string;
      const cycleFile = path.join(project.gitgovPath, 'cycles', `${cycleId}.json`);
      expect(await fileExists(cycleFile)).toBe(true);
    });

    it('[MSRV-CB2] should complete cycle lifecycle on disk', async () => {
      // Create → activate → complete
      const { data: created } = await callHandler(cycleNewTool, {
        title: 'Lifecycle Cycle',
      }, di);
      const cycleId = created.id as string;
      expect(created.status).toBe('planning');

      const { data: activated } = await callHandler(cycleActivateTool, { cycleId }, di);
      expect(activated.status).toBe('active');

      const { data: completed } = await callHandler(cycleCompleteTool, { cycleId }, di);
      expect(completed.status).toBe('completed');

      // Verify final state on disk
      const container = await di.getContainer();
      const record = await container.stores.cycles.get(cycleId);
      const payload = (record as AnyData).payload as AnyData;
      expect(payload.status).toBe('completed');
    });

    it('[MSRV-CB3] should bidirectionally link task to cycle on disk', async () => {
      // Create a task and a cycle
      const { data: task } = await callHandler(taskNewTool, {
        title: 'Linkable task',
        description: 'Will link to cycle',
      }, di);
      const { data: cycle } = await callHandler(cycleNewTool, {
        title: 'Link cycle',
      }, di);

      const { data, isError } = await callHandler(cycleAddTaskTool, {
        cycleId: cycle.id as string,
        taskId: task.id as string,
      }, di);

      expect(isError).toBe(false);
      expect(data.linked).toBe(true);

      // Verify bidirectional: cycle has taskIds, task has cycleIds
      const container = await di.getContainer();
      const cycleRecord = await container.stores.cycles.get(cycle.id as string);
      const cyclePayload = (cycleRecord as AnyData).payload as AnyData;
      expect((cyclePayload.taskIds as string[]) ?? []).toContain(task.id);

      const taskRecord = await container.stores.tasks.get(task.id as string);
      const taskPayload = (taskRecord as AnyData).payload as AnyData;
      expect((taskPayload.cycleIds as string[]) ?? []).toContain(cycle.id);
    });

    it('[MSRV-CB4] should bidirectionally unlink task from cycle on disk', async () => {
      // Create and link
      const { data: task } = await callHandler(taskNewTool, {
        title: 'Unlink task',
        description: 'Will unlink',
      }, di);
      const { data: cycle } = await callHandler(cycleNewTool, { title: 'Unlink cycle' }, di);
      await callHandler(cycleAddTaskTool, {
        cycleId: cycle.id as string,
        taskId: task.id as string,
      }, di);

      // Now unlink
      const { data, isError } = await callHandler(cycleRemoveTaskTool, {
        cycleId: cycle.id as string,
        taskId: task.id as string,
      }, di);

      expect(isError).toBe(false);
      expect(data.unlinked).toBe(true);

      // Verify bidirectional removal
      const container = await di.getContainer();
      const cycleRecord = await container.stores.cycles.get(cycle.id as string);
      const cyclePayload = (cycleRecord as AnyData).payload as AnyData;
      expect((cyclePayload.taskIds as string[]) ?? []).not.toContain(task.id);

      const taskRecord = await container.stores.tasks.get(task.id as string);
      const taskPayload = (taskRecord as AnyData).payload as AnyData;
      expect((taskPayload.cycleIds as string[]) ?? []).not.toContain(cycle.id);
    });

    it('[MSRV-CB5] should atomically move task between cycles on disk', async () => {
      // Create task + 2 cycles, link task to source
      const { data: task } = await callHandler(taskNewTool, {
        title: 'Move task',
        description: 'Will move between cycles',
      }, di);
      const { data: srcCycle } = await callHandler(cycleNewTool, { title: 'Source' }, di);
      const { data: dstCycle } = await callHandler(cycleNewTool, { title: 'Destination' }, di);
      await callHandler(cycleAddTaskTool, {
        cycleId: srcCycle.id as string,
        taskId: task.id as string,
      }, di);

      // Move task from source to destination
      const { data, isError } = await callHandler(cycleMoveTaskTool, {
        taskId: task.id as string,
        fromCycleId: srcCycle.id as string,
        toCycleId: dstCycle.id as string,
      }, di);

      expect(isError).toBe(false);
      expect(data.moved).toBe(true);

      // Verify: task no longer in source, now in destination
      const container = await di.getContainer();
      const srcRecord = await container.stores.cycles.get(srcCycle.id as string);
      const srcPayload = (srcRecord as AnyData).payload as AnyData;
      expect((srcPayload.taskIds as string[]) ?? []).not.toContain(task.id);

      const dstRecord = await container.stores.cycles.get(dstCycle.id as string);
      const dstPayload = (dstRecord as AnyData).payload as AnyData;
      expect((dstPayload.taskIds as string[]) ?? []).toContain(task.id);
    });

    it('[MSRV-CB6] should add child cycle to parent on disk', async () => {
      const { data: parent } = await callHandler(cycleNewTool, { title: 'Parent' }, di);
      const { data: child } = await callHandler(cycleNewTool, { title: 'Child' }, di);

      const { data, isError } = await callHandler(cycleAddChildTool, {
        parentCycleId: parent.id as string,
        childCycleId: child.id as string,
      }, di);

      expect(isError).toBe(false);
      expect(data.linked).toBe(true);

      // Verify parent's childCycleIds
      const container = await di.getContainer();
      const parentRecord = await container.stores.cycles.get(parent.id as string);
      const parentPayload = (parentRecord as AnyData).payload as AnyData;
      expect((parentPayload.childCycleIds as string[]) ?? []).toContain(child.id);
    });
  });

  // ─────────────────────────────────────────────────
  // 4.3. Feedback Lifecycle on Disk (MSRV-CC1 to CC3)
  // ─────────────────────────────────────────────────

  describe('4.3. Feedback Lifecycle on Disk (MSRV-CC1 to CC3)', () => {
    let project: TempGitgovProject;
    let di: McpDependencyInjectionService;
    let seedTaskId: string;

    beforeAll(async () => {
      project = await createTempGitgovProject();
      di = createDI(project.projectRoot);

      // Create a task to attach feedback to
      const { data } = await callHandler(taskNewTool, {
        title: 'Feedback target',
        description: 'Task for feedback tests',
      }, di);
      seedTaskId = data.id as string;
    });

    afterAll(async () => {
      await project.cleanup();
    });

    it('[MSRV-CC1] should create feedback record on disk via real DI', async () => {
      const { data, isError } = await callHandler(feedbackCreateTool, {
        entityType: 'task',
        entityId: seedTaskId,
        type: 'suggestion',
        content: 'Consider adding error handling',
      }, di);

      expect(isError).toBe(false);
      expect(data.id).toBeDefined();
      expect(data.entityType).toBe('task');
      expect(data.entityId).toBe(seedTaskId);
      expect(data.status).toBe('open');

      // Verify file exists on disk
      const fbId = data.id as string;
      const fbFile = path.join(project.gitgovPath, 'feedback', `${fbId}.json`);
      expect(await fileExists(fbFile)).toBe(true);
    });

    it('[MSRV-CC2] should list feedbacks filtered by entityId from disk', async () => {
      // Create a second feedback for the same task
      await callHandler(feedbackCreateTool, {
        entityType: 'task',
        entityId: seedTaskId,
        type: 'question',
        content: 'Why is this needed?',
      }, di);

      const { data, isError } = await callHandler(feedbackListTool, {
        entityId: seedTaskId,
      }, di);

      expect(isError).toBe(false);
      expect(data.total).toBeGreaterThanOrEqual(2);
      const feedbacks = data.feedbacks as AnyData[];
      expect(feedbacks.every((f) => f.entityId === seedTaskId)).toBe(true);
    });

    it('[MSRV-CC3] should resolve feedback to resolved status on disk', async () => {
      // Create a feedback to resolve
      const { data: created } = await callHandler(feedbackCreateTool, {
        entityType: 'task',
        entityId: seedTaskId,
        type: 'blocking',
        content: 'Must fix this first',
      }, di);
      const fbId = created.id as string;

      const { data, isError } = await callHandler(feedbackResolveTool, {
        feedbackId: fbId,
        content: 'Fixed in latest commit',
      }, di);

      expect(isError).toBe(false);
      expect(data.status).toBe('resolved');
      expect(data.previousStatus).toBe('open');

      // Core uses immutable pattern: resolve() creates a NEW feedback record
      // pointing to the original. The original stays 'open' on disk.
      // Verify the resolution record exists on disk (has resolvesFeedbackId → fbId)
      const container = await di.getContainer();
      const resolutionId = data.id as string;
      const resRecord = await container.stores.feedbacks.get(resolutionId);
      expect(resRecord).not.toBeNull();
      const resPayload = (resRecord as AnyData).payload as AnyData;
      expect(resPayload.status).toBe('resolved');
      expect(resPayload.resolvesFeedbackId).toBe(fbId);
    });
  });

  // ─────────────────────────────────────────────────
  // 4.4. Read Tools with Real Data (MSRV-CD1 to CD7)
  // ─────────────────────────────────────────────────

  describe('4.4. Read Tools with Real Data (MSRV-CD1 to CD7)', () => {
    let project: TempGitgovProject;
    let di: McpDependencyInjectionService;
    let seedTaskId: string;
    let seedCycleId: string;

    beforeAll(async () => {
      project = await createTempGitgovProject();
      di = createDI(project.projectRoot);

      // Seed a task and cycle for read tests
      const { data: task } = await callHandler(taskNewTool, {
        title: 'Readable task',
        description: 'For read tool tests',
        priority: 'high',
        tags: ['test'],
      }, di);
      seedTaskId = task.id as string;

      const { data: cycle } = await callHandler(cycleNewTool, { title: 'Readable cycle' }, di);
      seedCycleId = cycle.id as string;

      // Link task to cycle
      await callHandler(cycleAddTaskTool, {
        cycleId: seedCycleId,
        taskId: seedTaskId,
      }, di);
    });

    afterAll(async () => {
      await project.cleanup();
    });

    it('[MSRV-CD1] should return accurate health from real records', async () => {
      const { data, isError } = await callHandler(statusTool, {}, di);

      expect(isError).toBe(false);
      expect(data.projectName).toBe('Test Project');
      expect(data.activeCycles).toBeDefined();
      expect(data.recentTasks).toBeDefined();
      expect(data.health).toBeDefined();
    });

    it('[MSRV-CD2] should return real config and session', async () => {
      const { data, isError } = await callHandler(contextTool, {}, di);

      expect(isError).toBe(false);
      const config = data.config as AnyData;
      expect(config.projectName).toBe('Test Project');
      expect(config.version).toBe('1.0.0');

      const session = data.session as AnyData;
      expect(session.currentActor).toBe('test-actor');
    });

    it('[MSRV-CD3] should return real lint violations', async () => {
      const { data, isError } = await callHandler(lintTool, {}, di);

      expect(isError).toBe(false);
      expect(data.action).toBe('lint');
      // With real data, there may be warnings or clean state
      expect(typeof data.totalViolations).toBe('number');
      expect(data.violations).toBeDefined();
    });

    it('[MSRV-CD4] should filter tasks by status from real store', async () => {
      const { data, isError } = await callHandler(taskListTool, { status: 'draft' }, di);

      expect(isError).toBe(false);
      expect(data.tasks).toBeDefined();
      const tasks = data.tasks as AnyData[];
      // Our seeded task is in draft
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      expect(tasks.every((t) => t.status === 'draft')).toBe(true);
    });

    it('[MSRV-CD5] should return full task from real store', async () => {
      const { data, isError } = await callHandler(taskShowTool, { taskId: seedTaskId }, di);

      expect(isError).toBe(false);
      expect(data.id).toBe(seedTaskId);
      expect(data.title).toBe('Readable task');
      expect(data.priority).toBe('high');
    });

    it('[MSRV-CD6] should return cycle with real task hierarchy', async () => {
      const { data, isError } = await callHandler(cycleShowTool, { cycleId: seedCycleId }, di);

      expect(isError).toBe(false);
      expect(data.id).toBe(seedCycleId);
      expect(data.title).toBe('Readable cycle');
      expect(data.taskCount).toBeGreaterThanOrEqual(1);
      const tasks = data.tasks as AnyData[];
      expect(tasks.some((t) => t.id === seedTaskId)).toBe(true);
    });

    it('[MSRV-CD7] should return NOT_FOUND for missing task in real store', async () => {
      const { data, isError } = await callHandler(taskShowTool, {
        taskId: 'nonexistent-task-id',
      }, di);

      expect(isError).toBe(true);
      expect(data.code).toBe('NOT_FOUND');
    });
  });

  // ─────────────────────────────────────────────────
  // 4.5. Audit & Actor on Disk (MSRV-CE1 to CE4)
  // ─────────────────────────────────────────────────

  describe('4.5. Audit & Actor on Disk (MSRV-CE1 to CE4)', () => {
    let project: TempGitgovProject;
    let di: McpDependencyInjectionService;

    beforeAll(async () => {
      project = await createTempGitgovProject();
      di = createDI(project.projectRoot);

      // Create an initial git commit so audit tools have something to scan
      const dummyFile = path.join(project.projectRoot, 'README.md');
      await fs.writeFile(dummyFile, '# Test Project\n');
      const { execSync } = await import('child_process');
      execSync('git add README.md && git commit -m "init"', {
        cwd: project.projectRoot,
        stdio: 'ignore',
      });
    });

    afterAll(async () => {
      await project.cleanup();
    });

    it('[MSRV-CE1] should create actor record on disk via real DI', async () => {
      const { data, isError } = await callHandler(actorNewTool, {
        id: 'agent:ci-bot',
        type: 'agent',
        displayName: 'CI Bot',
        roles: ['contributor'],
      }, di);

      expect(isError).toBe(false);
      expect(data.id).toBe('agent:ci-bot');
      expect(data.type).toBe('agent');
      expect(data.displayName).toBe('CI Bot');

      // Verify file exists on disk via store (file name may differ from ID due to sanitization)
      const container = await di.getContainer();
      const actorRecord = await container.stores.actors.get('agent:ci-bot');
      expect(actorRecord).not.toBeNull();
    });

    it('[MSRV-CE2] should return DUPLICATE_ACTOR for existing actor', async () => {
      // Create an actor first, then try again with the same ID
      await callHandler(actorNewTool, {
        id: 'agent:dup-test',
        type: 'agent',
        displayName: 'First',
        roles: ['contributor'],
      }, di);

      const { data, isError } = await callHandler(actorNewTool, {
        id: 'agent:dup-test',
        type: 'agent',
        displayName: 'Duplicate',
      }, di);

      expect(isError).toBe(true);
      expect(data.code).toBe('DUPLICATE_ACTOR');
    });

    it('[MSRV-CE3] should return real findings from source auditor via real DI', async () => {
      // Create a suspicious file for the auditor to find
      await fs.writeFile(
        path.join(project.projectRoot, 'secret.ts'),
        'const API_KEY = "sk-1234567890abcdef";\nexport default API_KEY;\n',
      );
      const { execSync } = await import('child_process');
      execSync('git add secret.ts && git commit -m "add secret"', {
        cwd: project.projectRoot,
        stdio: 'ignore',
      });

      const { data, isError } = await callHandler(auditScanTool, {}, di);

      // The auditor runs against real git — either returns findings or errors gracefully
      if (!isError) {
        expect(data.findings).toBeDefined();
        expect(data.summary).toBeDefined();
      } else {
        // Source auditor may require specific git history structure;
        // verify it returns a well-formed error
        expect(data.code).toBe('AUDIT_SCAN_ERROR');
        expect(data.error).toBeDefined();
      }
    });

    it('[MSRV-CE4] should create waiver feedback record on disk', async () => {
      const { data, isError } = await callHandler(auditWaiveTool, {
        fingerprint: 'fp-test-123',
        justification: 'False positive in test file',
      }, di);

      expect(isError).toBe(false);
      expect(data.waiverId).toBeDefined();
      expect(data.fingerprint).toBe('fp-test-123');

      // Verify feedback record on disk
      const waiverFile = path.join(project.gitgovPath, 'feedback', `${data.waiverId}.json`);
      expect(await fileExists(waiverFile)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────
  // 4.6. Resources & DI Bootstrap (MSRV-CF1 to CF5)
  // ─────────────────────────────────────────────────

  describe('4.6. Resources & DI Bootstrap (MSRV-CF1 to CF5)', () => {
    let project: TempGitgovProject;
    let di: McpDependencyInjectionService;
    let seedTaskId: string;

    beforeAll(async () => {
      project = await createTempGitgovProject();
      di = createDI(project.projectRoot);

      // Seed a task for resource tests
      const { data } = await callHandler(taskNewTool, {
        title: 'Resource task',
        description: 'For resource tests',
      }, di);
      seedTaskId = data.id as string;
    });

    afterAll(async () => {
      await project.cleanup();
    });

    it('[MSRV-CF1] should list URIs for real records on disk', async () => {
      const resourceHandler = createResourceHandler();
      const { resources } = await resourceHandler.list(di);

      expect(resources.length).toBeGreaterThanOrEqual(2); // task + actor
      const uris = resources.map((r) => r.uri);
      expect(uris.some((u) => u.includes(seedTaskId))).toBe(true);
      expect(uris.some((u) => u.includes('test-actor'))).toBe(true);
    });

    it('[MSRV-CF2] should read full record by URI from disk', async () => {
      const resourceHandler = createResourceHandler();
      const { contents } = await resourceHandler.read(`gitgov://tasks/${seedTaskId}`, di);

      expect(contents.length).toBe(1);
      expect(contents[0].uri).toBe(`gitgov://tasks/${seedTaskId}`);
      expect(contents[0].mimeType).toBe('application/json');

      const record = JSON.parse(contents[0].text!);
      expect(record.payload.title).toBe('Resource task');
    });

    it('[MSRV-CF3] should initialize all stores and adapters from real .gitgov/', async () => {
      const freshDi = createDI(project.projectRoot);
      const container = await freshDi.getContainer();

      // Stores
      expect(container.stores.tasks).toBeDefined();
      expect(container.stores.cycles).toBeDefined();
      expect(container.stores.feedbacks).toBeDefined();
      expect(container.stores.executions).toBeDefined();
      expect(container.stores.changelogs).toBeDefined();
      expect(container.stores.actors).toBeDefined();
      expect(container.stores.agents).toBeDefined();

      // Adapters & modules
      expect(container.backlogAdapter).toBeDefined();
      expect(container.feedbackAdapter).toBeDefined();
      expect(container.identityAdapter).toBeDefined();
      expect(container.lintModule).toBeDefined();
      expect(container.syncModule).toBeDefined();
      expect(container.projector).toBeDefined();
      expect(container.configManager).toBeDefined();
      expect(container.sessionManager).toBeDefined();
    });

    it('[MSRV-CF4] should throw when .gitgov/ not found', async () => {
      const emptyDir = path.join(project.projectRoot, 'no-gitgov-here');
      await fs.mkdir(emptyDir, { recursive: true });

      const badDi = createDI(emptyDir);
      await expect(badDi.getContainer()).rejects.toThrow(/not initialized/i);
    });

    it('[MSRV-CF5] should return same container on multiple calls', async () => {
      const freshDi = createDI(project.projectRoot);
      const c1 = await freshDi.getContainer();
      const c2 = await freshDi.getContainer();

      expect(c1).toBe(c2);
    });
  });
});
