import { Command } from 'commander';
import { DashboardCommand } from './dashboard-command';
import type { DashboardCommandOptions } from './dashboard-command';

/**
 * Registers all dashboard-related commands
 */
export function registerDashboardCommands(program: Command): void {
  const dashboardCommand = new DashboardCommand();

  program
    .command('dashboard')
    .description('Launch intelligent TUI dashboard with multi-adapter convergence')
    .option('--template <type>', 'Dashboard template (row-based, kanban-4col, kanban-7col, scrum-board)', 'row-based')
    .option('--view <name>', 'Specific view from current methodology')
    .option('--methodology <type>', 'Methodology (default, scrum)', 'default')
    .option('--refresh-interval <seconds>', 'Refresh interval in seconds (default: 5)', '5')
    .option('--no-live', 'Disable real-time updates (static snapshot)')
    .option('--actor <actorId>', 'Specific actor view (admin feature)')
    .option('--theme <type>', 'Visual theme (dark, light)', 'dark')
    .option('--no-cache', 'Bypass cache and use adapters directly')
    .option('--debug', 'Show debug panel with adapter performance')
    .option('--config <path>', 'Path to custom config file')
    .option('--json', 'Output dashboard metadata in JSON format')
    .option('--verbose', 'Show detailed adapter and methodology info')
    .option('--quiet', 'Suppress output except critical errors')
    .action(async (options: DashboardCommandOptions, command: Command) => {
      // Handle --help flag when passed via pnpm start
      if (process.argv.includes('--help') || process.argv.includes('-h')) {
        command.help();
      }
      await dashboardCommand.execute(options);
    });
}
