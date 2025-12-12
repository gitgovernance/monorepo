import { Command } from 'commander';
import { SyncCommand } from './sync-command';

/**
 * Register sync commands following GitGovernance CLI standard
 *
 * Implements the sync command specification from sync_command.md blueprint.
 * Provides four subcommands: push, pull, resolve, audit for state synchronization.
 *
 * Also registers top-level aliases for convenience:
 * - `gitgov push` → `gitgov sync push`
 * - `gitgov pull` → `gitgov sync pull`
 */
export function registerSyncCommands(program: Command): void {
  const syncCommand = new SyncCommand();

  // ============================================================================
  // MAIN SYNC COMMAND WITH SUBCOMMANDS
  // ============================================================================
  const syncCmd = program
    .command('sync')
    .description('Unified state synchronization mechanism for gitgov-state branch');

  // Subcommand: gitgov sync push
  syncCmd
    .command('push')
    .description('Publish local state changes to gitgov-state')
    .option('--dry-run', 'Simulate operation without making real changes')
    .option('--force', 'Force push even if there are unsynced remote changes (not recommended)')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress output except errors and warnings')
    .action(async (options) => {
      await syncCommand.executePush(options);
    });

  // Subcommand: gitgov sync pull
  syncCmd
    .command('pull')
    .description('Pull remote state changes from gitgov-state')
    .option('--reindex', 'Force re-indexation even if there are no new changes')
<<<<<<< HEAD
    .option('--force', '[EARS-62] Force pull even if local changes would be overwritten (discards local changes)')
=======
>>>>>>> main
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress output except errors and warnings')
    .action(async (options) => {
      await syncCommand.executePull(options);
    });

  // Subcommand: gitgov sync resolve
  syncCmd
    .command('resolve')
    .description('Resolve state conflicts in a governed manner')
    .requiredOption('--reason <reason>', 'Justification for conflict resolution (required)')
    .option('--actor <actor-id>', 'Actor ID resolving the conflict (default: current session actor)')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress output except errors and warnings')
    .action(async (options) => {
      await syncCommand.executeResolve(options);
    });

  // Subcommand: gitgov sync audit
  syncCmd
    .command('audit')
    .description('Execute complete audit of gitgov-state (verify resolutions, signatures, checksums, files)')
    .option('--no-signatures', 'Skip signature verification on Records')
    .option('--no-checksums', 'Skip checksum verification')
    .option('--no-files', 'Skip expected files verification')
    .option('--scope <scope>', 'Verification scope: current, state-branch, or all (default: all)', 'all')
    .option('--files-scope <scope>', 'Expected files verification scope: head or all-commits (default: head)', 'head')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress output except errors and warnings')
    .action(async (options) => {
      await syncCommand.executeAudit(options);
    });
<<<<<<< HEAD

  // ============================================================================
  // TOP-LEVEL ALIASES FOR CONVENIENCE
  // ============================================================================
  // These provide shortcuts for the most commonly used sync operations:
  // - `gitgov push` → `gitgov sync push`
  // - `gitgov pull` → `gitgov sync pull`

  // Alias: gitgov push (shortcut for gitgov sync push)
  program
    .command('push')
    .description('Publish local state changes to gitgov-state (alias for "gitgov sync push")')
    .option('--dry-run', 'Simulate operation without making real changes')
    .option('--force', 'Force push even if there are unsynced remote changes (not recommended)')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress output except errors and warnings')
    .action(async (options) => {
      await syncCommand.executePush(options);
    });

  // Alias: gitgov pull (shortcut for gitgov sync pull)
  program
    .command('pull')
    .description('Pull remote state changes from gitgov-state (alias for "gitgov sync pull")')
    .option('--reindex', 'Force re-indexation even if there are no new changes')
    .option('--force', '[EARS-62] Force pull even if local changes would be overwritten (discards local changes)')
    .option('--format <format>', 'Output format: text or json', 'text')
    .option('--json', 'Shortcut for --format json')
    .option('--quiet', 'Suppress output except errors and warnings')
    .action(async (options) => {
      await syncCommand.executePull(options);
    });
=======
>>>>>>> main
}

