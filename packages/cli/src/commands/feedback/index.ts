import { Command } from 'commander';
import { FeedbackCommand } from './feedback_command';
import type { FeedbackCreateOptions } from './feedback_command.types';

/**
 * Register feedback commands following GitGovernance CLI standard.
 * Blueprint: feedback_command.md
 *
 * Note: Only the default create action is implemented in this epic.
 * list, show, reply, thread remain 🔴.
 */
export function registerFeedbackCommands(program: Command): void {
  const feedbackCommand = new FeedbackCommand();

  // gitgov feedback (default action = create, no subcommand needed)
  program
    .command('feedback')
    .description('Create structured, immutable FeedbackRecords')
    .alias('fb')
    .requiredOption('-e, --entity-type <entityType>', 'Type of entity (task, execution, feedback, cycle)')
    .requiredOption('-i, --entity-id <entityId>', 'ID of the entity')
    .requiredOption('-t, --type <type>', 'Feedback type (blocking, suggestion, question, approval, clarification, assignment)')
    .requiredOption('-c, --content <content>', 'Feedback content')
    .option('--json', 'Output in JSON format')
    .option('-v, --verbose', 'Show detailed output')
    .option('-q, --quiet', 'Suppress output except errors')
    .action(async (options: FeedbackCreateOptions) => {
      await feedbackCommand.executeCreate(options);
    });
}
