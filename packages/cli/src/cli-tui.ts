#!/usr/bin/env node

/**
 * GitGovernance CLI - TUI Version
 * 
 * Full-featured version with interactive TUI support.
 * Includes Ink/React for rich terminal interfaces.
 */

import { program } from 'commander';
import { DependencyInjectionService } from './services/dependency-injection';

// Import commands (shared logic + TUI support)
import { InitCommand } from './commands/init/init-command';
import { StatusCommand } from './commands/status/status-command';
import { TaskCommand } from './commands/task/task-command';
import { CycleCommand } from './commands/cycle/cycle-command';
import { IndexerCommand } from './commands/indexer/indexer-command';
import { DashboardCommand } from './commands/dashboard/dashboard-command';

// Version and metadata
const packageJson = require('../package.json');

// Configure CLI
program
  .name('gitgov')
  .description('GitGovernance CLI - Full Version (with TUI)')
  .version(packageJson.version)
  .option('--verbose', 'Enable verbose output')
  .option('--quiet', 'Suppress non-essential output');

// Commands
program
  .command('init')
  .description('Initialize GitGovernance in current repository')
  .option('-n, --name <name>', 'Project name')
  .option('-b, --blueprint <template>', 'Blueprint template')
  .option('-m, --methodology <type>', 'Workflow methodology', 'default')
  .option('-a, --actor-name <name>', 'Actor display name')
  .option('-e, --actor-email <email>', 'Actor email')
  .option('--force', 'Force re-initialization')
  .option('--no-cache', 'Skip cache initialization')
  .option('--skip-validation', 'Skip environment validation')
  .option('--json', 'JSON output')
  .action(async (options) => {
    const command = new InitCommand();
    await command.execute(options);
  });

program
  .command('status')
  .description('Show project status and health')
  .option('-a, --all', 'Show global project view')
  .option('-h, --health', 'Include detailed health metrics')
  .option('--alerts', 'Show only alerts and warnings')
  .option('-c, --cycles', 'Include cycle information')
  .option('-t, --team', 'Include team metrics')
  .option('--from-source', 'Read directly from records')
  .option('--json', 'JSON output')
  .action(async (options) => {
    const command = new StatusCommand();
    await command.execute(options);
  });

program
  .command('dashboard')
  .description('Interactive TUI dashboard')
  .option('--template <type>', 'Dashboard template', 'row-based')
  .option('--methodology <type>', 'Methodology', 'default')
  .option('--refresh-interval <seconds>', 'Refresh interval', '5')
  .option('--no-live', 'Disable live mode')
  .option('--actor <id>', 'Actor ID')
  .option('--theme <theme>', 'Theme (dark/light)', 'dark')
  .option('--no-cache', 'Bypass cache')
  .option('--debug', 'Debug mode')
  .option('--config <path>', 'Config file path')
  .option('--json', 'JSON output (non-interactive)')
  .option('--verbose', 'Verbose output')
  .option('--quiet', 'Quiet mode')
  .action(async (options) => {
    const command = new DashboardCommand();
    await command.execute(options);
  });

// Register task command
const taskCommand = new TaskCommand();
taskCommand.register(program);

// Register cycle command
const cycleCommand = new CycleCommand();
cycleCommand.register(program);

// Register indexer command
const indexerCommand = new IndexerCommand();
indexerCommand.register(program);

// TUI-specific commands (only available in full version)
program
  .command('diagram')
  .description('Interactive diagram generator (TUI only)')
  .option('-w, --watch', 'Watch mode with TUI')
  .option('-o, --output <file>', 'Output file')
  .option('--cycle <id>', 'Filter by cycle')
  .option('--task <id>', 'Filter by task')
  .option('--package <name>', 'Filter by package')
  .option('--verbose', 'Verbose output')
  .option('--quiet', 'Quiet mode')
  .action(async (options) => {
    // Dynamic import for diagram command (TUI-specific)
    try {
      const { DiagramCommand } = await import('./commands/diagram/index');
      const command = new DiagramCommand();
      await command.execute(options);
    } catch (error) {
      console.error('❌ Diagram command failed to load');
      console.error('💡 This command requires TUI dependencies');
      process.exit(1);
    }
  });

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Unexpected error:', error.message);
  if ((program.opts() as any).verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});

// Parse and execute
program.parse();
