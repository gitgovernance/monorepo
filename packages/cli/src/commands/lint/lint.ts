import { Command } from 'commander';
import { LintCommand } from './lint-command';

/**
 * Register the lint command
 */
export function registerLintCommand(program: Command): void {
  const lintCommand = new LintCommand();
  lintCommand.register(program);
}



