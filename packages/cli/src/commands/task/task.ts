import { Command } from 'commander';
import { TaskCommand } from './task-command';
import type {
  TaskNewOptions,
  TaskListOptions,
  TaskShowOptions,
  TaskSubmitOptions,
  TaskApproveOptions,
  TaskActivateOptions,
  TaskPauseOptions,
  TaskResumeOptions,
  TaskCompleteOptions,
  TaskCancelOptions,
  TaskRejectOptions,
  TaskDeleteOptions,
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
    .alias('t')
    .addHelpText('after', `
TASK WORKFLOW (GitGovernance Default Methodology):
  draft → review → ready → active → done → archived

  Step 1: Create task     → gitgov task new "Fix login bug"
  Step 2: Submit review   → gitgov task submit <taskId>
  Step 3: Approve         → gitgov task approve <taskId>
  Step 4: Start work      → gitgov task activate <taskId> (auto-assigns if unassigned)
  Step 5: Complete        → gitgov task complete <taskId>

REJECTION/CANCELLATION/DELETION PATHS:
  draft → deleted         → gitgov task delete <taskId>
  review → discarded      → gitgov task reject <taskId>
  ready/active → discarded → gitgov task cancel <taskId>

STATUS MEANINGS:
  draft     - Planning: Define requirements, write specs
  review    - Review: Validate requirements before approval
  ready     - Approved: Ready to start implementation
  active    - Working: Currently being implemented
  done      - Complete: Implementation finished
  archived  - Final: Task completed and documented
  discarded - Cancelled: Task rejected or cancelled (formal workflow)
  deleted   - Removed: Draft task removed (never entered workflow)

ASSIGNMENT (Flexible - Any Status):
  Manual Assignment:      gitgov task assign <taskId> --to human:developer
  Auto-Assignment:        Automatic when activating unassigned task
  Check Assignments:      gitgov task list --assigned-to me

COMMON SCENARIOS:
  📝 Create task:         gitgov task new "Your task title"
  🔍 Find work:           gitgov task list --status ready
  ⚡ Start work:          gitgov task activate <taskId>
  ✅ Complete:            gitgov task complete <taskId>
  👥 Assign:              gitgov task assign <taskId> --to human:dev
  🗑️  Delete draft:       gitgov task delete <taskId>
  📊 View status:         gitgov status

EXAMPLES:
  gitgov task new "Implement user login"
  gitgov task submit 1758573661-task-implement-user-login
  gitgov task approve 1758573661-task-implement-user-login
  gitgov task activate 1758573661-task-implement-user-login
  gitgov task complete 1758573661-task-implement-user-login
`);

  // gitgov task new
  task
    .command('new <title>')
    .description('Create new TaskRecord with $EDITOR integration')
    .alias('n')
    .option('-d, --description <desc>', 'Provide description directly (avoids opening $EDITOR)')
    .option('-f, --description-file <path>', 'Read description from file (for long markdown descriptions)')
    .option('--cleanup-file', 'Delete the description file after task creation (requires --description-file)')
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

  // gitgov task pause
  task
    .command('pause <taskId>')
    .description('Pause active TaskRecord from active to paused with optional reason tracking')
    .alias('p')
    .option('-r, --reason <reason>', 'Reason for pausing (tracked in notes with [PAUSED] prefix)')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show pause process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskPauseOptions) => {
      await taskCommand.executePause(taskId, options);
    });

  // gitgov task resume
  task
    .command('resume <taskId>')
    .description('Resume paused TaskRecord from paused to active with blocking validation')
    .alias('r')
    .option('-f, --force', 'Force resume ignoring blocking feedbacks')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show blocking validation details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskResumeOptions) => {
      await taskCommand.executeResume(taskId, options);
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

  // gitgov task cancel
  task
    .command('cancel <taskId>')
    .description('Cancel TaskRecord from ready/active to discarded with optional reason')
    .alias('can')
    .option('-r, --reason <reason>', 'Reason for cancellation')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show cancellation process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskCancelOptions) => {
      await taskCommand.executeCancel(taskId, options);
    });

  // gitgov task reject
  task
    .command('reject <taskId>')
    .description('Reject TaskRecord from review to discarded with optional reason')
    .alias('rej')
    .option('-r, --reason <reason>', 'Reason for rejection')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show rejection process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskRejectOptions) => {
      await taskCommand.executeReject(taskId, options);
    });

  // gitgov task delete
  task
    .command('delete <taskId>')
    .description('Delete draft TaskRecord completely (no discarded state)')
    .alias('del')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show deletion process details')
    .option('-q, --quiet', 'Minimal output for scripting')
    .action(async (taskId: string, options: TaskDeleteOptions) => {
      await taskCommand.executeDelete(taskId, options);
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
