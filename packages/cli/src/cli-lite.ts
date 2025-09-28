#!/usr/bin/env node

/**
 * GitGovernance CLI - Lite Version
 * 
 * Lightweight version without TUI dependencies.
 * Perfect for CI/CD, Docker, and headless environments.
 */

import { program } from 'commander';
import { DependencyInjectionService } from './services/dependency-injection';

// Import commands (shared logic, no TUI)
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
  .description('GitGovernance CLI - Lite Version (no TUI)')
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
  .description('Dashboard (JSON only in lite version)')
  .option('--template <type>', 'Dashboard template', 'row-based')
  .option('--methodology <type>', 'Methodology', 'default')
  .option('--json', 'JSON output (required in lite)', true) // Force JSON in lite
  .option('--verbose', 'Verbose output')
  .option('--quiet', 'Quiet mode')
  .action(async (options) => {
    // Force JSON mode in lite version
    options.json = true;
    console.log('ℹ️  Lite version: Dashboard available in JSON mode only');
    console.log('💡 For interactive TUI, use: npm install -g @gitgov/cli && gitgov-tui dashboard');

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
