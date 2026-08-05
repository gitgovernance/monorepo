import { Command } from 'commander';
import { IndexerCommand } from './indexer-command';
import type { IRecordProjector } from '@gitgov/core';

/**
 * Register indexer commands following GitGovernance CLI standard
 *
 * [EARS-C3] `resolveProjector` es un THUNK, no un projector ya construido: el
 * registro de comandos NO debe tocar stores. Construirlo aqui disparaba
 * initializeStores() -> bootstrapWorktree() antes de que Commander parseara
 * ninguna opcion, asi que el override de --state-branch (INIT-L1/L3) y el de
 * LOGIN-P1 llegaban siempre tarde y el worktree quedaba atado al default.
 * Cross-ref: EARS-C15 y EARS-B2 de dependency_injection_module.
 */
export function registerIndexerCommands(
  program: Command,
  resolveProjector: () => Promise<IRecordProjector | null>,
): void {
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

      // [EARS-C3] Resolucion diferida: recien aqui se tocan los stores, con el
      // override del comando ya aplicado. EARS-C1/C2 conservan mensaje y exit code.
      const projector = await resolveProjector();
      if (!projector) {
        console.error("❌ GitGovernance not initialized. Run 'gitgov init' first.");
        process.exit(1);
      }

      const indexerCommand = new IndexerCommand();
      await indexerCommand.execute(options);
    });
}
