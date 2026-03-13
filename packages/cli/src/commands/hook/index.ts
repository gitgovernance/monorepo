import { Command } from 'commander';
import { HookCommand } from './hook_command';
import type { HookCommandOptions } from './hook_command.types';

export type { HookCommandOptions, HookCommandResult } from './hook_command.types';
export { HookCommand } from './hook_command';

/**
 * Register hook commands following GitGovernance CLI standard.
 * Blueprint: hook_command.md
 *
 * All subcommands read JSON from stdin (sent by Claude Code hooks).
 * This command is invisible — no stdout by default. Always exit 0.
 */
export function registerHookCommands(program: Command): void {
  const hookCommand = new HookCommand();

  const hookCmd = program
    .command('hook')
    .description('Process Claude Code hook events (passive governance)')
    .addHelpText('after', `
SUBCOMMANDS:
  command-executed   Process Bash tool output (commits, PRs, tests)
  file-changed       Process Write/Edit tool output
  task-completed     Process TaskCompleted event
  teammate-idle      Process TeammateIdle event
  session-end        Process Stop event

INPUT:
  All subcommands read JSON from stdin (sent by Claude Code hooks).
  This command is invisible — it never produces stdout by default.

ENVIRONMENT:
  GITGOV_PASSIVE=false   Disable passive governance (exit 0 without processing)
`);

  hookCmd
    .command('command-executed')
    .description('Process Bash command result (PostToolUse)')
    .option('-v, --verbose', 'Show diagnostic output on stderr')
    .option('--dry-run', 'Parse and classify without creating records')
    .action(async (options: HookCommandOptions) => {
      await hookCommand.executeCommandExecuted(options);
    });

  hookCmd
    .command('file-changed')
    .description('Process file write/edit (PostToolUse)')
    .option('-v, --verbose', 'Show diagnostic output on stderr')
    .option('--dry-run', 'Parse and classify without creating records')
    .action(async (options: HookCommandOptions) => {
      await hookCommand.executeFileChanged(options);
    });

  hookCmd
    .command('task-completed')
    .description('Process task completion (TaskCompleted)')
    .option('-v, --verbose', 'Show diagnostic output on stderr')
    .option('--dry-run', 'Parse and classify without creating records')
    .action(async (options: HookCommandOptions) => {
      await hookCommand.executeTaskCompleted(options);
    });

  hookCmd
    .command('teammate-idle')
    .description('Process teammate idle (TeammateIdle)')
    .option('-v, --verbose', 'Show diagnostic output on stderr')
    .option('--dry-run', 'Parse and classify without creating records')
    .action(async (options: HookCommandOptions) => {
      await hookCommand.executeTeammateIdle(options);
    });

  hookCmd
    .command('session-end')
    .description('Process session end (Stop)')
    .option('-v, --verbose', 'Show diagnostic output on stderr')
    .option('--dry-run', 'Parse and classify without creating records')
    .action(async (options: HookCommandOptions) => {
      await hookCommand.executeSessionEnd(options);
    });
}
