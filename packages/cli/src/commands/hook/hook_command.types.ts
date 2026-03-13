/**
 * Hook Command Types
 *
 * Types for the passive governance hook CLI command.
 * Based on hook_command.md §3.3.
 *
 * NOTE: This command does NOT extend BaseCommandOptions because
 * hook has no --json, --quiet flags — it's silent by default.
 */

import type { HookEventType } from '@gitgov/core';

// ─── Command Options ─────────────────────────────────────────

/** Options parsed from CLI flags for hook subcommands */
export interface HookCommandOptions {
  /** Show diagnostic output on stderr (event type, classification, record ID or skip) */
  verbose?: boolean;
  /** Parse and classify without creating records; output JSON to stdout */
  dryRun?: boolean;
}

// ─── Command Result ──────────────────────────────────────────

/** Result returned by each hook subcommand execution */
export interface HookCommandResult {
  /** Whether the hook processing completed without errors */
  success: boolean;
  /** The classified event type from the stdin payload */
  event_type: HookEventType;
  /** Whether the event was recorded or skipped */
  action: 'recorded' | 'skipped';
  /** Reason for skipping (if action is 'skipped') */
  reason?: string;
  /** ID of the created ExecutionRecord (if action is 'recorded') */
  executionId?: string;
}
