import type { IFeedbackAdapter } from "../adapters/feedback_adapter";
import type { FeedbackRecord } from "../record_types";
import type { WaiverMetadata, ActiveWaiver, IWaiverReader } from "./types";

/**
 * Reads active waivers from FeedbackRecords.
 * Uses FeedbackAdapter for access to feedback data.
 */
export class WaiverReader implements IWaiverReader {
  constructor(private feedbackAdapter: IFeedbackAdapter) {}

  /**
   * Loads all active waivers (non-expired).
   * Filters by type: "approval" and metadata.fingerprint present.
   */
  async loadActiveWaivers(): Promise<ActiveWaiver[]> {
    const allFeedback = await this.feedbackAdapter.getAllFeedback();
    const now = new Date();
    const result: ActiveWaiver[] = [];

    for (const f of allFeedback) {
      if (f.type !== "approval" || !f.metadata) continue;
      const meta = f.metadata as WaiverMetadata;
      if (typeof meta.fingerprint !== "string") continue;
      if (meta.expiresAt && new Date(meta.expiresAt) <= now) continue;

      const waiver: ActiveWaiver = {
        fingerprint: meta.fingerprint,
        ruleId: meta.ruleId,
        feedback: f as FeedbackRecord<WaiverMetadata>,
      };
      if (meta.expiresAt) {
        waiver.expiresAt = new Date(meta.expiresAt);
      }
      result.push(waiver);
    }

    return result;
  }

  /**
   * Checks if a specific finding has an active waiver.
   */
  async hasActiveWaiver(fingerprint: string): Promise<boolean> {
    const waivers = await this.loadActiveWaivers();
    return waivers.some((w) => w.fingerprint === fingerprint);
  }

  /**
   * Gets waivers for a specific ExecutionRecord.
   */
  async getWaiversForExecution(executionId: string): Promise<ActiveWaiver[]> {
    const feedback = await this.feedbackAdapter.getFeedbackByEntity(executionId);
    const now = new Date();
    const result: ActiveWaiver[] = [];

    for (const f of feedback) {
      if (f.type !== "approval" || !f.metadata) continue;
      const meta = f.metadata as WaiverMetadata;
      if (typeof meta.fingerprint !== "string") continue;
      if (meta.expiresAt && new Date(meta.expiresAt) <= now) continue;

      const waiver: ActiveWaiver = {
        fingerprint: meta.fingerprint,
        ruleId: meta.ruleId,
        feedback: f as FeedbackRecord<WaiverMetadata>,
      };
      if (meta.expiresAt) {
        waiver.expiresAt = new Date(meta.expiresAt);
      }
      result.push(waiver);
    }

    return result;
  }
}
