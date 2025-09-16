import { Command } from 'commander';
import { CycleCommand } from './cycle-command';
import type {
  CycleNewOptions,
  CycleListOptions,
  CycleShowOptions,
  CycleActivateOptions,
  CycleCompleteOptions,
  CycleAddTaskOptions,
  CycleEditOptions,
  CycleAddChildOptions
} from './cycle-command';

/**
 * Register cycle commands following GitGovernance CLI standard
 */
export function registerCycleCommands(program: Command): void {
  const cycleCommand = new CycleCommand();

  const cycle = program
    .command('cycle')
    .description('Create and manage CycleRecords - Strategic planning interface')
    .alias('c');

  // gitgov cycle new
  cycle
    .command('new <title>')
    .description('Create new CycleRecord with $EDITOR integration')
    .alias('n')
    .option('-d, --description <desc>', 'Provide description directly (avoids opening $EDITOR)')
    .option('-s, --status <status>', 'Set initial status (planning, active)', 'planning')
    .option('--task-ids <ids>', 'Associate existing Tasks to the Cycle (comma-separated)')
    .option('-t, --tags <tags>', 'Add tags for categorization (comma-separated)')
    .option('-n, --notes <notes>', 'Add planning notes')
    .option('--json', 'Output in JSON format for automation')
    .option('-v, --verbose', 'Show detailed creation process')
    .option('-q, --quiet', 'Suppress output except errors')
    .action(async (title: string, options: CycleNewOptions) => {
      await cycleCommand.executeNew(title, options);
    });

  // gitgov cycle list
  cycle
    .command('list')
    .description('List cycles from cache with hierarchy filtering and auto-indexation')
    .alias('ls')
    .option('-s, --status <status>', 'Filter by status (planning, active, completed, archived)')
    .option('-t, --tags <tags>', 'Filter by specific tags (comma-separated)')
    .option('--has-tasks', 'Filter cycles that have tasks assigned')
    .option('--has-children', 'Filter cycles that have child cycles')
    .option('-l, --limit <number>', 'Limit number of results', parseInt)
    .option('--from-source', 'Read directly from Records (bypass cache)')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show additional metadata (task counts, hierarchy)')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (options: CycleListOptions) => {
      await cycleCommand.executeList(options);
    });

  // gitgov cycle show
  cycle
    .command('show <cycleId>')
    .description('Show complete CycleRecord details with task hierarchy')
    .alias('s')
    .option('--from-source', 'Read directly from Record (includes signatures)')
    .option('-t, --tasks', 'Include detailed list of tasks in the cycle')
    .option('-c, --children', 'Include detailed list of child cycles')
    .option('-h, --hierarchy', 'Show complete hierarchy (parent + children)')
    .option('--health', 'Include health analysis of cycle tasks')
    .option('-f, --format <format>', 'Output format (cursor, kiro, json, text)', 'text')
    .option('--json', 'Output in structured JSON format')
    .option('-v, --verbose', 'Include all metadata and relationships')
    .option('-q, --quiet', 'Minimal output (core fields only)')
    .action(async (cycleId: string, options: CycleShowOptions) => {
      await cycleCommand.executeShow(cycleId, options);
    });

  // gitgov cycle activate
  cycle
    .command('activate <cycleId>')
    .description('Transition CycleRecord from planning to active with validation')
    .alias('a')
    .option('-f, --force', 'Activate without validating task readiness')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show activation process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (cycleId: string, options: CycleActivateOptions) => {
      await cycleCommand.executeActivate(cycleId, options);
    });

  // gitgov cycle complete
  cycle
    .command('complete <cycleId>')
    .description('Transition CycleRecord from active to completed with validation')
    .alias('comp')
    .option('-f, --force', 'Complete without validating task completion')
    .option('--auto-parent', 'Auto-complete parent cycle if all children done')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show completion process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (cycleId: string, options: CycleCompleteOptions) => {
      await cycleCommand.executeComplete(cycleId, options);
    });

  // gitgov cycle add-task
  cycle
    .command('add-task <cycleId>')
    .description('Add TaskRecord to CycleRecord with bidirectional linking')
    .alias('at')
    .requiredOption('-t, --task <taskIds>', 'Task IDs to add to the cycle (comma-separated)')
    .option('-p, --position <number>', 'Specific position in taskIds array', parseInt)
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show linking process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (cycleId: string, options: CycleAddTaskOptions) => {
      await cycleCommand.executeAddTask(cycleId, options);
    });

  // gitgov cycle edit
  cycle
    .command('edit <cycleId>')
    .description('Edit CycleRecord fields with validation')
    .alias('e')
    .option('--title <title>', 'Update cycle title')
    .option('-d, --description <desc>', 'Update cycle description/planning')
    .option('-n, --notes <notes>', 'Update cycle notes')
    .option('--add-tags <tags>', 'Add tags (comma-separated)')
    .option('--remove-tags <tags>', 'Remove tags (comma-separated)')
    .option('-e, --editor', 'Open $EDITOR with complete cycle payload')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show validation and change details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (cycleId: string, options: CycleEditOptions) => {
      await cycleCommand.executeEdit(cycleId, options);
    });

  // gitgov cycle add-child
  cycle
    .command('add-child <parentCycleId>')
    .description('Add child CycleRecord for complex hierarchies')
    .requiredOption('-c, --child <childIds>', 'Child Cycle IDs to add (comma-separated)')
    .option('-p, --position <number>', 'Specific position in childCycleIds array', parseInt)
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show hierarchy setup details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (parentCycleId: string, options: CycleAddChildOptions) => {
      await cycleCommand.executeAddChild(parentCycleId, options);
    });
}
