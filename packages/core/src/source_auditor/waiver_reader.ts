import type { IFeedbackAdapter } from "../adapters/feedback_adapter";
import type { WaiverMetadata, Waiver, IWaiverReader } from "./types";

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
  async loadWaivers(): Promise<Waiver[]> {
    const allFeedback = await this.feedbackAdapter.getAllFeedback();
    const now = new Date();
    const result: Waiver[] = [];

    for (const f of allFeedback) {
      const payload = f.payload;
      if (payload.type !== "approval" || !payload.metadata) continue;
      const meta = payload.metadata as WaiverMetadata;
      if (typeof meta.fingerprint !== "string") continue;
      if (meta.expiresAt && new Date(meta.expiresAt) <= now) continue;

      const waiver: Waiver = {
        fingerprint: meta.fingerprint,
        ruleId: meta.ruleId,
        feedback: f,
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
  async hasWaiver(fingerprint: string): Promise<boolean> {
    const waivers = await this.loadWaivers();
    return waivers.some((w) => w.fingerprint === fingerprint);
  }

  /**
   * Gets waivers for a specific ExecutionRecord.
   */
  async getWaiversForExecution(executionId: string): Promise<Waiver[]> {
    const feedback = await this.feedbackAdapter.getFeedbackByEntity(executionId);
    const now = new Date();
    const result: Waiver[] = [];

    for (const f of feedback) {
      const payload = f.payload;
      if (payload.type !== "approval" || !payload.metadata) continue;
      const meta = payload.metadata as WaiverMetadata;
      if (typeof meta.fingerprint !== "string") continue;
      if (meta.expiresAt && new Date(meta.expiresAt) <= now) continue;

      const waiver: Waiver = {
        fingerprint: meta.fingerprint,
        ruleId: meta.ruleId,
        feedback: f,
      };
      if (meta.expiresAt) {
        waiver.expiresAt = new Date(meta.expiresAt);
      }
      result.push(waiver);
    }

    return result;
  }
}
