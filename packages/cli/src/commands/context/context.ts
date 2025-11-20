import { Command } from 'commander';
import { ContextCommand } from './context-command';
import type { ContextCommandOptions } from './context-command';

/**
 * Registers all context-related commands
 */
export function registerContextCommands(program: Command): void {
  const contextCommand = new ContextCommand();

  program
    .command('context')
    .description('Query current working context (config + session) for agents and automation')
    .option('--json', 'Output results in JSON format')
    .option('--actor <actorId>', 'Query context for a specific actor (default: current actor)')
    .action(async (options: ContextCommandOptions, command: Command) => {
      // Handle --help flag when passed via pnpm start
      if (process.argv.includes('--help') || process.argv.includes('-h')) {
        command.help();
      }
      await contextCommand.execute(options);
    });
}

