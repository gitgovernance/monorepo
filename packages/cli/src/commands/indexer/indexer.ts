import { Command } from 'commander';
import { IndexerCommand } from './indexer-command';
import type { IIndexerAdapter } from '../../../../core/src/adapters/indexer_adapter';

/**
 * Register indexer commands following GitGovernance CLI standard
 */
export function registerIndexerCommands(program: Command, indexerAdapter: IIndexerAdapter | null): void {
  // Register indexer command
  program
    .command('indexer')
    .description('Control local cache system for performance optimization')
    .option('-c, --validate-only', 'Only validate integrity, do not regenerate index')
    .option('-f, --force', 'Force regeneration even if errors found')
    .option('--json', 'Output results in JSON format for automation')
    .option('-v, --verbose', 'Show detailed output during indexing process')
    .option('-q, --quiet', 'Suppress output except critical errors (ideal for scripts)')
    .action(async (options) => {
      if (!indexerAdapter) {
        console.error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        process.exit(1);
      }

      const indexerCommand = new IndexerCommand(indexerAdapter);
      await indexerCommand.execute(options);
    });
}
