/**
 * HookHandler — Pure logic module for passive governance.
 *
 * Receives parsed hook events from Claude Code, classifies them,
 * and creates ExecutionRecords via the ExecutionAdapter.
 *
 * NO I/O — the CLI hook command handles stdin/stdout.
 * Fail-silent — never throws, always returns HookResult.
 *
 * All EARS prefixes map to hook_handler_module.md §4.
 */

import type { ExecutionRecord } from '../record_types';
import type {
  HookHandlerDependencies,
  HookEvent,
  HookResult,
  CommandExecutedEvent,
  TaskCompletedEvent,
  SessionEndEvent,
  CommandClassification,
} from './hook_handler.types';

export class HookHandler {
  private readonly executionAdapter: HookHandlerDependencies['executionAdapter'];
  private readonly sessionManager: HookHandlerDependencies['sessionManager'];
  private readonly configManager: HookHandlerDependencies['configManager'];

  constructor(deps: HookHandlerDependencies) {
    this.executionAdapter = deps.executionAdapter;
    this.sessionManager = deps.sessionManager;
    this.configManager = deps.configManager;
  }

  /**
   * Process a hook event and decide whether to create an ExecutionRecord.
   * Fail-silent: catches all errors and returns { action: 'skipped', reason }.
   */
  async handleEvent(event: HookEvent, options: { dryRun?: boolean } = {}): Promise<HookResult> {
    const dryRun = options.dryRun ?? false;
    try {
      // [EARS-A1] Check config exists
      const config = await this.configManager.loadConfig();
      if (!config) {
        return { action: 'skipped', reason: 'no config' };
      }

      // [EARS-A4] file-changed always skipped — too granular
      if (isFileChangedEvent(event)) {
        return { action: 'skipped', reason: 'file changes are not recorded' };
      }

      // [EARS-C2] teammate-idle — informational only in MVP
      if (isTeammateIdleEvent(event)) {
        return { action: 'skipped', reason: 'activity logged' };
      }

      // Read actor context for task association
      const actorId = await this.resolveActorId();
      const activeTaskId = actorId
        ? (await this.sessionManager.getActorState(actorId))?.activeTaskId ?? null
        : null;

      // [EARS-C3] session-end does NOT require activeTaskId
      if (isSessionEndEvent(event)) {
        return await this.handleSessionEnd(event, actorId, activeTaskId, dryRun);
      }

      // [EARS-A2] Events that require activeTaskId
      if (!activeTaskId) {
        return { action: 'skipped', reason: 'no active task' };
      }

      if (isCommandExecutedEvent(event)) {
        return await this.handleCommandExecuted(event, actorId!, activeTaskId, dryRun);
      }

      if (isTaskCompletedEvent(event)) {
        return await this.handleTaskCompleted(event, actorId!, activeTaskId, dryRun);
      }

      return { action: 'skipped', reason: 'unknown event type' };
    } catch (error) {
      // [EARS-A3] Fail-silent — catch everything
      const message = error instanceof Error ? error.message : String(error);
      return { action: 'skipped', reason: message };
    }
  }

  // ─── Command Executed ──────────────────────────────────────

  private async handleCommandExecuted(
    event: CommandExecutedEvent,
    actorId: string,
    activeTaskId: string,
    dryRun = false,
  ): Promise<HookResult> {
    // [EARS-B1] Skip failed commands
    if (event.exit_code !== 0) {
      return { action: 'skipped', reason: 'command failed' };
    }

    const classification = classifyCommand(event.tool_input.command, event.tool_output);

    // [EARS-B5] Unrecognized commands
    if (classification.kind === 'unknown') {
      return { action: 'skipped', reason: 'unrecognized command' };
    }

    const payload = this.buildCommandPayload(classification, activeTaskId);
    if (dryRun) {
      return { action: 'recorded', executionId: 'dry-run' };
    }
    const record = await this.executionAdapter.create(payload, actorId);
    return { action: 'recorded', executionId: record.id };
  }

  private buildCommandPayload(
    classification: Exclude<CommandClassification, { kind: 'unknown' }>,
    activeTaskId: string,
  ): Partial<ExecutionRecord> {
    switch (classification.kind) {
      // [EARS-B2]
      case 'commit':
        return {
          taskId: activeTaskId,
          type: 'completion',
          title: `Commit ${classification.hash}`,
          result: `Commit ${classification.hash}: ${classification.message} (${classification.filesChanged} files changed)`,
          references: [`commit:${classification.hash}`],
        };
      // [EARS-B3]
      case 'pr':
        return {
          taskId: activeTaskId,
          type: 'completion',
          title: `PR #${classification.number} created`,
          result: `PR #${classification.number} created`,
          references: [`pr:${classification.number}`],
        };
      // [EARS-B4]
      case 'test':
        return {
          taskId: activeTaskId,
          type: 'analysis',
          title: 'Test run',
          result: `Tests: ${classification.passed}/${classification.total} passing, ${classification.failed} failed`,
          metadata: { tests: { passed: classification.passed, failed: classification.failed, total: classification.total } },
        };
    }
  }

  // ─── Task Completed ────────────────────────────────────────

  private async handleTaskCompleted(
    event: TaskCompletedEvent,
    actorId: string,
    activeTaskId: string,
    dryRun = false,
  ): Promise<HookResult> {
    // [EARS-C1]
    const payload: Partial<ExecutionRecord> = {
      taskId: activeTaskId,
      type: 'completion',
      title: `Task completed: ${event.task.subject}`,
      result: `Task "${event.task.subject}" completed${event.task.owner ? ` by ${event.task.owner}` : ''}`,
      references: [`task:${event.task.id}`],
    };

    if (dryRun) {
      return { action: 'recorded', executionId: 'dry-run' };
    }
    const record = await this.executionAdapter.create(payload, actorId);
    return { action: 'recorded', executionId: record.id };
  }

  // ─── Session End ───────────────────────────────────────────

  private async handleSessionEnd(
    event: SessionEndEvent,
    actorId: string | null,
    activeTaskId: string | null,
    dryRun = false,
  ): Promise<HookResult> {
    // [EARS-C3] session-end still needs an actorId to sign the record
    if (!actorId) {
      return { action: 'skipped', reason: 'no actor' };
    }

    // taskId is required by execution schema and adapter validates it exists,
    // so session-end without activeTaskId cannot create a record
    if (!activeTaskId) {
      return { action: 'skipped', reason: 'no active task' };
    }

    const taskId = activeTaskId;
    const payload: Partial<ExecutionRecord> = {
      taskId,
      type: 'analysis',
      title: 'Session ended',
      result: `Session ended${event.session_id ? ` (${event.session_id})` : ''}`,
    };

    if (dryRun) {
      return { action: 'recorded', executionId: 'dry-run' };
    }
    const record = await this.executionAdapter.create(payload, actorId);
    return { action: 'recorded', executionId: record.id };
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async resolveActorId(): Promise<string | null> {
    const lastSession = await this.sessionManager.getLastSession();
    if (lastSession) return lastSession.actorId;

    const detectedId = await this.sessionManager.detectActorFromKeyFiles();
    return detectedId;
  }
}

// ─── Event Type Guards ─────────────────────────────────────────

function isCommandExecutedEvent(event: HookEvent): event is CommandExecutedEvent {
  return 'tool_name' in event && event.tool_name === 'Bash';
}

function isFileChangedEvent(event: HookEvent): event is import('./hook_handler.types').FileChangedEvent {
  return 'tool_name' in event && (event.tool_name === 'Write' || event.tool_name === 'Edit');
}

function isTaskCompletedEvent(event: HookEvent): event is TaskCompletedEvent {
  return 'hook_type' in event && event.hook_type === 'TaskCompleted';
}

function isTeammateIdleEvent(event: HookEvent): event is import('./hook_handler.types').TeammateIdleEvent {
  return 'hook_type' in event && event.hook_type === 'TeammateIdle';
}

function isSessionEndEvent(event: HookEvent): event is SessionEndEvent {
  return 'hook_type' in event && event.hook_type === 'Stop';
}

// ─── Command Classification ────────────────────────────────────

/** Classify a bash command to determine what kind of record to create */
export function classifyCommand(command: string, output?: string): CommandClassification {
  if (/git\s+commit/.test(command)) {
    return parseCommitOutput(output);
  }

  if (/gh\s+pr\s+create/.test(command)) {
    return parsePrOutput(output);
  }

  if (/(?:jest|vitest|pytest|npm\s+test|pnpm\s+test|npx\s+vitest|npx\s+jest)/.test(command)) {
    return parseTestOutput(output);
  }

  return { kind: 'unknown' };
}

function parseCommitOutput(output?: string): CommandClassification {
  if (!output) return { kind: 'commit', hash: 'unknown', message: '', filesChanged: 0 };

  // Pattern: [main abc1234] feat: add auth\n 3 files changed, ...
  const hashMatch = output.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  const hash = hashMatch?.[1] ?? 'unknown';

  // Message is after "] " until newline
  const messageMatch = output.match(/\]\s+(.+?)(?:\n|$)/);
  const message = messageMatch?.[1] ?? '';

  // Files changed
  const filesMatch = output.match(/(\d+)\s+files?\s+changed/);
  const filesChanged = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;

  return { kind: 'commit', hash, message, filesChanged };
}

function parsePrOutput(output?: string): CommandClassification {
  if (!output) return { kind: 'pr', number: 'unknown' };

  // gh pr create outputs URL like: https://github.com/org/repo/pull/123
  const prMatch = output.match(/\/pull\/(\d+)/);
  if (prMatch?.[1]) return { kind: 'pr', number: prMatch[1] };

  // Also try: Creating pull request #123
  const numMatch = output.match(/#(\d+)/);
  return { kind: 'pr', number: numMatch?.[1] ?? 'unknown' };
}

function parseTestOutput(output?: string): CommandClassification {
  if (!output) return { kind: 'test', passed: 0, failed: 0, total: 0 };

  let passed = 0;
  let failed = 0;
  let total = 0;

  // Vitest/Jest pattern: Tests  X passed | Y failed | Z total
  const vitestMatch = output.match(/Tests?\s+(\d+)\s+passed/);
  const failedMatch = output.match(/(\d+)\s+failed/);
  const totalMatch = output.match(/(\d+)\s+total/);

  if (vitestMatch?.[1]) passed = parseInt(vitestMatch[1], 10);
  if (failedMatch?.[1]) failed = parseInt(failedMatch[1], 10);
  if (totalMatch?.[1]) {
    total = parseInt(totalMatch[1], 10);
  } else {
    total = passed + failed;
  }

  // Pytest pattern: X passed, Y failed
  if (!vitestMatch) {
    const pytestPassed = output.match(/(\d+)\s+passed/);
    const pytestFailed = output.match(/(\d+)\s+failed/);
    if (pytestPassed?.[1]) passed = parseInt(pytestPassed[1], 10);
    if (pytestFailed?.[1]) failed = parseInt(pytestFailed[1], 10);
    total = passed + failed;
  }

  return { kind: 'test', passed, failed, total };
}
