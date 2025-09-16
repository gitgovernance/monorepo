import { Command } from 'commander';
import { StatusCommand } from './status-command';
import type { StatusCommandOptions } from './status-command';

/**
 * Registers all status-related commands
 */
export function registerStatusCommands(program: Command): void {
  const statusCommand = new StatusCommand();

  program
    .command('status')
    .description('Show intelligent project status dashboard')
    .option('--all', 'Show global dashboard instead of personal view')
    .option('--health', 'Include detailed health metrics')
    .option('--alerts', 'Show only alerts and warnings')
    .option('--cycles', 'Include cycles information')
    .option('--team', 'Include team collaboration metrics')
    .option('--from-source', 'Skip cache and read directly from source')
    .option('--json', 'Output results in JSON format')
    .option('--verbose', 'Enable verbose output with detailed information')
    .option('--quiet', 'Suppress non-essential output')
    .action(async (options: StatusCommandOptions) => {
      await statusCommand.execute(options);
    });
}