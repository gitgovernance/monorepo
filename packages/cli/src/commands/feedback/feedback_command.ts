import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { FeedbackCreateOptions } from './feedback_command.types';

/**
 * FeedbackCommand — Structured collaboration via FeedbackRecords.
 *
 * Only the default create action is implemented in this epic.
 * Blueprint: feedback_command.md
 */
export class FeedbackCommand extends BaseCommand<BaseCommandOptions> {

  register(program: Command): void {
    // Not used — registration happens via registerFeedbackCommands()
  }

  async execute(options: BaseCommandOptions): Promise<void> {
    this.handleError('No action specified. Use --help for available options.', options);
  }

  /**
   * gitgov feedback (default action — create)
   * EARS: ICOMP-F1..F3
   */
  async executeCreate(options: FeedbackCreateOptions): Promise<void> {
    try {
      // [ICOMP-F1] Validate all 4 required fields
      const missing: string[] = [];
      if (!options.entityType) missing.push('--entity-type');
      if (!options.entityId) missing.push('--entity-id');
      if (!options.type) missing.push('--type');
      if (!options.content) missing.push('--content');

      if (missing.length > 0) {
        this.handleError(`Missing required: ${missing.join(', ')}`, options);
        return;
      }

      const feedbackAdapter = await this.dependencyService.getFeedbackAdapter();
      const projector = await this.dependencyService.getRecordProjector();
      const { actorId } = await this.requireActor(options);

      // [ICOMP-F2] Delegate to adapter
      const feedback = await feedbackAdapter.create(
        {
          entityType: options.entityType,
          entityId: options.entityId,
          type: options.type,
          content: options.content,
        },
        actorId,
      );

      // Invalidate projector cache
      await projector.invalidateCache();

      // [ICOMP-F3] Output
      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          data: {
            id: feedback.id,
            entityType: feedback.entityType,
            entityId: feedback.entityId,
            type: feedback.type,
            status: feedback.status,
          }
        }, null, 2));
      } else if (!options.quiet) {
        console.log(`✅ Feedback created: ${feedback.id}`);
        console.log(`   Entity: ${feedback.entityType}/${feedback.entityId}`);
        console.log(`   Type:   ${feedback.type}`);
        console.log(`   Status: ${feedback.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (options.json) {
        console.log(JSON.stringify({ success: false, error: `❌ Feedback creation failed: ${message}`, exitCode: 1 }, null, 2));
      } else {
        console.error(`❌ Feedback creation failed: ${message}`);
        if (options.verbose && error instanceof Error) {
          console.error(`🔍 Technical details: ${error.stack}`);
        }
      }

      process.exit(1);
    }
  }
}
