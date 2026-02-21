import { Command } from 'commander';
import { ExecCommand } from './exec_command';
import type { ExecNewOptions, ExecListOptions, ExecShowOptions } from './exec_command.types';

/**
 * Register exec commands following GitGovernance CLI standard.
 * Blueprint: exec_command.md
 */
export function registerExecCommands(program: Command): void {
  const execCommand = new ExecCommand();

  const exec = program
    .command('exec')
    .description('Record proof-of-work via ExecutionRecords')
    .alias('x')
    .addHelpText('after', `
EXECUTION TYPES:
  analysis   - Initial analysis, technical design, investigation
  progress   - Incremental work progress (default)
  blocker    - Impediment or blocker identified
  completion - Work fully completed
  info       - Contextual information without direct work
  correction - Correction to a previous execution

EXAMPLES:
  gitgov exec new <taskId> --result "OAuth callback handler implemented"
  gitgov exec new <taskId> --result "API down" --type blocker
  gitgov exec list <taskId>
  gitgov exec show <executionId>
`);

  // gitgov exec new <taskId>
  exec
    .command('new <taskId>')
    .description('Create a new ExecutionRecord for a Task')
    .alias('n')
    .requiredOption('-r, --result <result>', 'The tangible, verifiable output (required)')
    .option('-t, --type <type>', 'Execution type (analysis, progress, blocker, completion, info, correction)', 'progress')
    .option('--title <title>', 'Human-readable title for the execution')
    .option('-n, --notes <notes>', 'Context, decisions, and rationale')
    .option('-ref, --reference <ref...>', 'Typed reference (commit:abc, pr:123, file:path, url:...)')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show detailed output')
    .option('-q, --quiet', 'Suppress output except errors')
    .action(async (taskId: string, options: ExecNewOptions) => {
      await execCommand.executeNew(taskId, options);
    });

  // gitgov exec list [taskId]
  exec
    .command('list [taskId]')
    .description('List executions, optionally filtered by Task')
    .alias('ls')
    .option('-t, --type <type>', 'Filter by execution type')
    .option('-l, --limit <limit>', 'Max number of results', '50')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show detailed output')
    .option('-q, --quiet', 'Only show IDs')
    .action(async (taskId: string | undefined, options: ExecListOptions) => {
      // Commander passes limit as string, convert to number
      if (options.limit) {
        options.limit = Number(options.limit);
      }
      await execCommand.executeList(taskId, options);
    });

  // gitgov exec show <executionId>
  exec
    .command('show <executionId>')
    .description('Show full details of an ExecutionRecord')
    .alias('s')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show detailed output with metadata')
    .option('-q, --quiet', 'Minimal output')
    .action(async (executionId: string, options: ExecShowOptions) => {
      await execCommand.executeShow(executionId, options);
    });
}
