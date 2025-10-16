import { Command } from 'commander';
import { IndexerCommand } from './indexer-command';
import type { IndexerAdapter } from '@gitgov/core';

/**
 * Register indexer commands following GitGovernance CLI standard
 */
export function registerIndexerCommands(program: Command, indexerAdapter: IndexerAdapter.IIndexerAdapter | null): void {
  // Register indexer command
  program
    .command('indexer')
    .description('Control local cache system for performance optimization')
    .option('-c, --validate-only', 'Only validate integrity, do not regenerate index')
    .option('-f, --force', 'Force regeneration even if errors found')
    .option('--json', 'Output results in JSON format for automation')
    .option('-v, --verbose', 'Show detailed output during indexing process')
    .option('-q, --quiet', 'Suppress output except critical errors (ideal for scripts)')
    .action(async (options, command) => {
      // Handle --help flag when passed via pnpm start
      if (process.argv.includes('--help') || process.argv.includes('-h')) {
        command.help();
      }

      if (!indexerAdapter) {
        console.error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        process.exit(1);
      }

      const indexerCommand = new IndexerCommand();
      await indexerCommand.execute(options);
    });
}
