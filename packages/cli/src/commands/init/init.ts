import { Command } from 'commander';
import { InitCommand } from './init-command';
import type { InitCommandOptions } from './init-command';

/**
 * Registers init command following GitGovernance CLI standard
 */
export function registerInitCommands(program: Command): void {
  const initCommand = new InitCommand();

  program
    .command('init')
    .description('Initialize GitGovernance project with complete bootstrap')
    .option('-n, --name <name>', 'Project name (default: directory name)')
    .option('-b, --blueprint <template>', 'Blueprint template (basic, saas-mvp, ai-product, enterprise) - optional')
    .option('-m, --methodology <method>', 'Workflow methodology (default, scrum, kanban)', 'default')
    .option('-a, --actor-name <name>', 'Actor display name (default: git user.name)')
    .option('-e, --actor-email <email>', 'Actor email (default: git user.email)')
    .option('-f, --force', 'Re-initialize forcefully (requires confirmation)')
    .option('--no-cache', 'Skip IndexerAdapter initialization (faster init)')
    .option('--skip-validation', 'Skip environment validation (advanced users)')
    .option('--json', 'Output in JSON format for automation')
    .option('-v, --verbose', 'Show detailed bootstrap process')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (options: InitCommandOptions) => {
      await initCommand.execute(options);
    });
}
