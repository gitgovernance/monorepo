import { Command } from 'commander';
import { SyncCommand } from './sync-command';

/**
 * Register sync commands following GitGovernance CLI standard
 * 
 * Implements the sync command specification from sync_command.md blueprint.
 * Provides four subcommands: push, pull, resolve, audit for state synchronization.
 */
export function registerSyncCommands(program: Command): void {
  const syncCommand = new SyncCommand();

  // Register main sync command with subcommands
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
}

