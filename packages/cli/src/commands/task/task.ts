import { Command } from 'commander';
import { TaskCommand } from './task-command';
import type {
  TaskNewOptions,
  TaskListOptions,
  TaskShowOptions,
  TaskSubmitOptions,
  TaskApproveOptions,
  TaskActivateOptions,
  TaskCompleteOptions,
  TaskAssignOptions,
  TaskEditOptions,
  TaskPromoteOptions
} from './task-command';

/**
 * Register task commands following GitGovernance CLI standard
 */
export function registerTaskCommands(program: Command): void {
  const taskCommand = new TaskCommand();

  const task = program
    .command('task')
    .description('Create and manage TaskRecords - Core operational interface')
    .alias('t');

  // gitgov task new
  task
    .command('new <title>')
    .description('Create new TaskRecord with $EDITOR integration')
    .alias('n')
    .option('-d, --description <desc>', 'Provide description directly (avoids opening $EDITOR)')
    .option('-p, --priority <priority>', 'Set priority (low, medium, high, critical)', 'medium')
    .option('-c, --cycle-ids <ids>', 'Associate Task to specific Cycles (comma-separated)')
    .option('-t, --tags <tags>', 'Add tags for categorization (comma-separated)')
    .option('-r, --references <refs>', 'Add references (URLs, task IDs, etc.) (comma-separated)')
    .option('--json', 'Output in JSON format for automation')
    .option('-v, --verbose', 'Show detailed creation process')
    .option('-q, --quiet', 'Suppress output except errors')
    .action(async (title: string, options: TaskNewOptions) => {
      await taskCommand.executeNew(title, options);
    });

  // gitgov task list
  task
    .command('list')
    .description('List tasks from cache with advanced filtering and auto-indexation')
    .alias('ls')
    .option('-s, --status <status>', 'Filter by status (draft, review, ready, active, done)')
    .option('-p, --priority <priority>', 'Filter by priority (low, medium, high, critical)')
    .option('-a, --assignee <actor>', 'Filter by tasks assigned to specific actor')
    .option('-c, --cycle-ids <ids>', 'Filter by tasks in specific cycles (comma-separated)')
    .option('-t, --tags <tags>', 'Filter by specific tags (comma-separated)')
    .option('-l, --limit <number>', 'Limit number of results', parseInt)
    .option('--stalled', 'Filter stalled tasks (derived state)')
    .option('--at-risk', 'Filter at-risk tasks (derived state)')
    .option('--from-source', 'Read directly from Records (bypass cache)')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show additional metadata (health, derived states)')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (options: TaskListOptions) => {
      await taskCommand.executeList(options);
    });

  // gitgov task show
  task
    .command('show <taskId>')
    .description('Show complete TaskRecord details with health analysis')
    .alias('s')
    .option('--from-source', 'Read directly from Record (includes signatures)')
    .option('-h, --health', 'Include health analysis using MetricsAdapter')
    .option('--history', 'Include history of executions and feedback')
    .option('-f, --format <format>', 'Output format (cursor, kiro, json, text)', 'text')
    .option('--json', 'Output in structured JSON format')
    .option('-v, --verbose', 'Include all metadata and derived states')
    .option('-q, --quiet', 'Minimal output (core fields only)')
    .action(async (taskId: string, options: TaskShowOptions) => {
      await taskCommand.executeShow(taskId, options);
    });

  // gitgov task submit
  task
    .command('submit <taskId>')
    .description('Transition TaskRecord from draft to review with workflow validation')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show workflow validation details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskSubmitOptions) => {
      await taskCommand.executeSubmit(taskId, options);
    });

  // gitgov task approve
  task
    .command('approve <taskId>')
    .description('Approve TaskRecord with signature validation and auto-transition')
    .alias('ap')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show signature validation details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskApproveOptions) => {
      await taskCommand.executeApprove(taskId, options);
    });

  // gitgov task activate
  task
    .command('activate <taskId>')
    .description('Activate TaskRecord from ready to active with permission validation')
    .alias('act')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show activation process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskActivateOptions) => {
      await taskCommand.executeActivate(taskId, options);
    });

  // gitgov task complete
  task
    .command('complete <taskId>')
    .description('Complete TaskRecord from active to done with signature validation')
    .alias('comp')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show completion process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskCompleteOptions) => {
      await taskCommand.executeComplete(taskId, options);
    });

  // gitgov task assign
  task
    .command('assign <taskId>')
    .description('Assign TaskRecord to specific actor via FeedbackAdapter')
    .alias('as')
    .requiredOption('-t, --to <actorId>', 'Actor ID to assign the task to')
    .option('-m, --message <message>', 'Custom assignment message')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show assignment process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskAssignOptions) => {
      await taskCommand.executeAssign(taskId, options);
    });

  // gitgov task edit
  task
    .command('edit <taskId>')
    .description('Edit TaskRecord fields with immutability validation')
    .alias('e')
    .option('--title <title>', 'Update task title')
    .option('-d, --description <desc>', 'Update task description')
    .option('-p, --priority <priority>', 'Update priority (low, medium, high, critical)')
    .option('--add-tags <tags>', 'Add tags (comma-separated)')
    .option('--remove-tags <tags>', 'Remove tags (comma-separated)')
    .option('--add-refs <refs>', 'Add references (comma-separated)')
    .option('-e, --editor', 'Open $EDITOR with complete task payload')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show validation and change details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskEditOptions) => {
      await taskCommand.executeEdit(taskId, options);
    });

  // gitgov task promote
  task
    .command('promote <taskId>')
    .description('Promote epic TaskRecord to CycleRecord with bidirectional linking')
    .option('--cycle-title <title>', 'Title for the new cycle (default: task title)')
    .option('-p, --parent-cycle <cycleId>', 'Parent cycle for hierarchy')
    .option('-y, --no-prompt', 'Execute promotion without confirmation')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show promotion process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskPromoteOptions) => {
      await taskCommand.executePromote(taskId, options);
    });
}
