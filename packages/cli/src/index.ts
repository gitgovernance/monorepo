#!/usr/bin/env node

import { Command } from 'commander';
import { DiagramCommand } from './commands/diagram';
import { registerIndexerCommands } from './commands/indexer/indexer';
import { registerInitCommands } from './commands/init/init';
import { registerTaskCommands } from './commands/task/task';
import { registerCycleCommands } from './commands/cycle/cycle';
import { registerStatusCommands } from './commands/status/status';
import { registerDashboardCommands } from './commands/dashboard/dashboard';
import { DependencyInjectionService } from './services/dependency-injection';
import packageJson from '../package.json' assert { type: 'json' };

const program = new Command();

program
  .name('gitgov')
  .description('GitGovernance CLI - AI-first governance for intelligent work')
  .version(packageJson.version);

// Setup dependency injection and register commands
async function setupCommands() {
  try {
    // Register init commands first (no dependencies required for basic usage)
    registerInitCommands(program);

    // Register diagram commands (no dependencies required)
    const diagramCommand = new DiagramCommand();
    diagramCommand.register(program);

    // Setup adapters dependency injection
    const diService = DependencyInjectionService.getInstance();
    const indexerAdapter = await diService.getIndexerAdapter();

    // Register indexer commands with dependencies
    registerIndexerCommands(program, indexerAdapter);

    // Register task commands
    registerTaskCommands(program);

    // Register cycle commands
    registerCycleCommands(program);

    // Register status commands
    registerStatusCommands(program);

    // Register dashboard commands
    registerDashboardCommands(program);

  } catch (error) {
    // Handle initialization errors gracefully
    if (error instanceof Error) {
      if (error.message.includes('GitGovernance not initialized')) {
        // Only register diagram commands if not initialized
        console.warn("⚠️ GitGovernance not initialized. Some commands may not be available.");
        console.warn("💡 Run 'gitgov init' to initialize GitGovernance in this repository.");
      } else {
        console.error("❌ Error initializing GitGovernance CLI:", error.message);
        process.exit(1);
      }
    } else {
      console.error("❌ Unknown error initializing GitGovernance CLI");
      process.exit(1);
    }
  }
}

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Unexpected error:', error.message);
  const opts = program.opts() as any;
  if (opts['verbose']) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});

// Initialize commands and parse
setupCommands().then(() => {
  // Filter out the '--' argument that pnpm/npm add when using 'pnpm start -- args'
  // This prevents Commander from treating all subsequent args as positional arguments
  const args = process.argv.filter((arg, index) => {
    // Keep first two args (node path and script path)
    if (index < 2) return true;
    // Remove standalone '--' separator
    if (arg === '--' && index === 2) return false;
    return true;
  });
  
  program.parse(args);
}).catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});