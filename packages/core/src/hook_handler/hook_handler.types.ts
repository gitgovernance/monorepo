/**
 * Hook Handler Types
 *
 * Types for the passive governance hook handler module.
 * Based on hook_handler_module.md blueprint.
 *
 * All EARS prefixes map to hook_handler_module.md §4.
 */

import type { IExecutionAdapter } from '../adapters/execution_adapter';
import type { ISessionManager } from '../session_manager';
import type { IConfigManager } from '../config_manager';

// ─── Event Types ───────────────────────────────────────────────

/** Types of events the hook handler can receive */
export type HookEventType =
  | 'command-executed'
  | 'file-changed'
  | 'task-completed'
  | 'teammate-idle'
  | 'session-end';

/** PostToolUse Bash event — commits, PRs, test runs, other commands */
export type CommandExecutedEvent = {
  tool_name: 'Bash';
  tool_input: {
    command: string;
    description?: string;
  };
  tool_output?: string;
  exit_code?: number;
};

/** PostToolUse Write/Edit event — file modifications (not recorded, too granular) */
export type FileChangedEvent = {
  tool_name: 'Write' | 'Edit';
  tool_input: {
    file_path: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  };
};

/** Claude Code TaskCompleted notification event */
export type TaskCompletedEvent = {
  hook_type: 'TaskCompleted';
  task: {
    id: string;
    subject: string;
    description?: string;
    status: string;
    owner?: string;
  };
  session_id?: string;
  team_name?: string;
};

/** Claude Code TeammateIdle notification event (informational, no record in MVP) */
export type TeammateIdleEvent = {
  hook_type: 'TeammateIdle';
  agent: {
    name: string;
    agent_id?: string;
  };
  session_id?: string;
  team_name?: string;
};

/** Claude Code Stop event — session ending */
export type SessionEndEvent = {
  hook_type: 'Stop';
  session_id?: string;
  cwd?: string;
};

/** Union of all possible hook events */
export type HookEvent =
  | CommandExecutedEvent
  | FileChangedEvent
  | TaskCompletedEvent
  | TeammateIdleEvent
  | SessionEndEvent;

// ─── Result Types ──────────────────────────────────────────────

/** Result of processing a hook event. Never throws — always returns. */
export type HookResult = {
  action: 'recorded' | 'skipped';
  reason?: string;
  executionId?: string;
};

// ─── Dependencies ──────────────────────────────────────────────

/** Dependencies injected into HookHandler via constructor */
export interface HookHandlerDependencies {
  executionAdapter: IExecutionAdapter;
  sessionManager: ISessionManager;
  configManager: IConfigManager;
}

// ─── Command Classification ────────────────────────────────────

/** Classification result for a bash command */
export type CommandClassification =
  | { kind: 'commit'; hash: string; message: string; filesChanged: number }
  | { kind: 'pr'; number: string }
  | { kind: 'test'; passed: number; failed: number; total: number }
  | { kind: 'unknown' };
