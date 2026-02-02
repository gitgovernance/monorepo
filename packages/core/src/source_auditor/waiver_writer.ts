import type { IFeedbackAdapter } from "../adapters/feedback_adapter";
import type { Finding } from "../finding_detector/types";
import type { WaiverMetadata, CreateWaiverOptions } from "./types";

/**
 * Creates waivers as FeedbackRecords with structured metadata.
 * Uses FeedbackAdapter for signature and event handling.
 */
export class WaiverWriter {
  constructor(private feedbackAdapter: IFeedbackAdapter) { }

  /**
   * Creates a waiver for a specific finding.
   * The waiver is stored as FeedbackRecord with type: "approval".
   */
  async createWaiver(
    options: CreateWaiverOptions,
    actorId: string
  ): Promise<void> {
    const { finding, executionId, justification, expiresAt, relatedTaskId } =
      options;

    const metadata: WaiverMetadata = {
      fingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      file: finding.file,
      line: finding.line,
    };

    if (expiresAt) {
      metadata.expiresAt = expiresAt;
    }

    if (relatedTaskId) {
      metadata.relatedTaskId = relatedTaskId;
    }

    await this.feedbackAdapter.create(
      {
        entityType: "execution",
        entityId: executionId,
        type: "approval",
        status: "resolved",
        content: justification,
        metadata,
      },
      actorId
    );
  }

  /**
   * Creates waivers in batch for multiple findings.
   */
  async createWaiversBatch(
    findings: Finding[],
    executionId: string,
    justification: string,
    actorId: string
  ): Promise<void> {
    for (const finding of findings) {
      await this.createWaiver(
        {
          finding,
          executionId,
          justification,
        },
        actorId
      );
    }
  }
}
