import type { IFeedbackAdapter } from "../adapters/feedback_adapter";
import type { Finding } from "../audit/types";
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

    // [EARS-G1] Metadata carries fingerprint, ruleId, file and line.
    const metadata: WaiverMetadata = {
      fingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      file: finding.file,
      line: finding.line,
    };

    // [EARS-G2]
    if (expiresAt) {
      metadata.expiresAt = expiresAt;
    }

    // [EARS-G3]
    if (relatedTaskId) {
      metadata.relatedTaskId = relatedTaskId;
    }

    // [EARS-G1] A FeedbackRecord of type approval, resolved.
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
    // [EARS-G4] [EARS-G5] One waiver per finding; an empty array creates nothing.
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
