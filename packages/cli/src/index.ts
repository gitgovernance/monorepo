#!/usr/bin/env node

import { Command } from 'commander';
import { DiagramCommand } from './commands/diagram';
import { registerIndexerCommands } from './commands/indexer/indexer';
import { registerInitCommands } from './commands/init/init';
import { registerTaskCommands } from './commands/task/task';
import { registerCycleCommands } from './commands/cycle/cycle';
import { registerStatusCommands } from './commands/status/status';
import { registerDashboardCommands } from './commands/dashboard/dashboard';
import { registerContextCommands } from './commands/context/context';
import { registerLintCommand } from './commands/lint/lint';
import { registerAuditCommand } from './commands/audit/audit';
import { registerAgentCommand } from './commands/agent/agent';
import { registerSyncCommands } from './commands/sync/sync';
import { registerActorCommands } from './commands/actor';
import { registerExecCommands } from './commands/exec';
import { registerFeedbackCommands } from './commands/feedback';
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

    // Register context commands (no dependencies required, uses ConfigManager)
    registerContextCommands(program);

    // Register diagram commands (no dependencies required)
    const diagramCommand = new DiagramCommand();
    diagramCommand.register(program);

    // Register sync commands EARLY (before indexer) so they're available for bootstrap
    // This allows "gitgov sync pull" to work even when .gitgov/ doesn't exist yet
    registerSyncCommands(program);

    // Register actor commands EARLY so "gitgov actor new" works on clone (after pull)
    registerActorCommands(program);

    // Setup adapters dependency injection
    const diService = DependencyInjectionService.getInstance();
    const projector = await diService.getRecordProjector();

    // Register indexer commands with dependencies
    registerIndexerCommands(program, projector);

    // Register task commands
    registerTaskCommands(program);

    // Register cycle commands
    registerCycleCommands(program);

    // Register status commands
    registerStatusCommands(program);

    // Register dashboard commands
    registerDashboardCommands(program);

    // Register lint commands
    registerLintCommand(program);

    // Register audit commands
    registerAuditCommand(program);

    // Register agent commands
    registerAgentCommand(program);

    // Register exec commands (execution proof-of-work)
    registerExecCommands(program);

    // Register feedback commands (structured collaboration)
    registerFeedbackCommands(program);
  } catch (error) {
    // Handle initialization errors gracefully
    if (error instanceof Error) {
      if (error.message.includes('GitGovernance not initialized')) {
        // Check if user is running 'init' command - don't show warning in that case
        const commandArg = process.argv[2];
        const isInitCommand = commandArg === 'init';

        if (!isInitCommand) {
          console.warn("⚠️  GitGovernance not initialized. Some commands may not be available.\n");
          console.warn("💡 Run 'gitgov init' to initialize GitGovernance in this repository.\n");
        }
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