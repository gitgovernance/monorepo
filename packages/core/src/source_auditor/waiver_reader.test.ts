import { WaiverReader } from "./waiver_reader";
import type { IFeedbackAdapter } from "../adapters/feedback_adapter";
import type { FeedbackRecord } from "../types";
import type { WaiverMetadata } from "./types";

describe("WaiverReader", () => {
  let mockFeedbackAdapter: jest.Mocked<IFeedbackAdapter>;
  let reader: WaiverReader;

  beforeEach(() => {
    mockFeedbackAdapter = {
      create: jest.fn(),
      resolve: jest.fn(),
      getFeedback: jest.fn(),
      getFeedbackByEntity: jest.fn(),
      getAllFeedback: jest.fn(),
      getFeedbackThread: jest.fn(),
    };
    reader = new WaiverReader(mockFeedbackAdapter);
  });

  describe("4.6. WaiverReader (EARS-F1 to EARS-F7)", () => {
    it("[EARS-F1] should load waivers with type approval and fingerprint", async () => {
      const waiverFeedback: FeedbackRecord<WaiverMetadata> = {
        id: "feedback-1",
        entityType: "execution",
        entityId: "exec-1",
        type: "approval",
        status: "resolved",
        content: "Waived - false positive",
        metadata: {
          fingerprint: "abc123",
          ruleId: "PII-001",
          file: "test.ts",
          line: 10,
        },
      };

      mockFeedbackAdapter.getAllFeedback.mockResolvedValue([waiverFeedback]);

      const waivers = await reader.loadActiveWaivers();

      expect(waivers).toHaveLength(1);
      expect(waivers[0]?.fingerprint).toBe("abc123");
      expect(waivers[0]?.ruleId).toBe("PII-001");
    });

    it("[EARS-F2] should filter out non-approval feedback", async () => {
      const feedbacks: FeedbackRecord[] = [
        {
          id: "feedback-1",
          entityType: "execution",
          entityId: "exec-1",
          type: "suggestion",
          status: "open",
          content: "Just a suggestion",
        },
        {
          id: "feedback-2",
          entityType: "execution",
          entityId: "exec-1",
          type: "approval",
          status: "resolved",
          content: "Waived",
          metadata: {
            fingerprint: "abc123",
            ruleId: "PII-001",
            file: "test.ts",
            line: 10,
          },
        },
      ];

      mockFeedbackAdapter.getAllFeedback.mockResolvedValue(feedbacks);

      const waivers = await reader.loadActiveWaivers();

      expect(waivers).toHaveLength(1);
      expect(waivers[0]?.fingerprint).toBe("abc123");
    });

    it("[EARS-F3] should filter out expired waivers", async () => {
      const expiredDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow

      const feedbacks: FeedbackRecord<WaiverMetadata>[] = [
        {
          id: "feedback-1",
          entityType: "execution",
          entityId: "exec-1",
          type: "approval",
          status: "resolved",
          content: "Expired waiver",
          metadata: {
            fingerprint: "expired123",
            ruleId: "PII-001",
            file: "test.ts",
            line: 10,
            expiresAt: expiredDate,
          },
        },
        {
          id: "feedback-2",
          entityType: "execution",
          entityId: "exec-1",
          type: "approval",
          status: "resolved",
          content: "Valid waiver",
          metadata: {
            fingerprint: "valid123",
            ruleId: "PII-002",
            file: "test.ts",
            line: 20,
            expiresAt: futureDate,
          },
        },
      ];

      mockFeedbackAdapter.getAllFeedback.mockResolvedValue(feedbacks);

      const waivers = await reader.loadActiveWaivers();

      expect(waivers).toHaveLength(1);
      expect(waivers[0]?.fingerprint).toBe("valid123");
    });

    it("[EARS-F4] should treat waivers without expiresAt as permanent", async () => {
      const waiverFeedback: FeedbackRecord<WaiverMetadata> = {
        id: "feedback-1",
        entityType: "execution",
        entityId: "exec-1",
        type: "approval",
        status: "resolved",
        content: "Permanent waiver",
        metadata: {
          fingerprint: "permanent123",
          ruleId: "PII-001",
          file: "test.ts",
          line: 10,
          // No expiresAt
        },
      };

      mockFeedbackAdapter.getAllFeedback.mockResolvedValue([waiverFeedback]);

      const waivers = await reader.loadActiveWaivers();

      expect(waivers).toHaveLength(1);
      expect(waivers[0]?.expiresAt).toBeUndefined();
    });

    it("[EARS-F5] hasActiveWaiver should return true if fingerprint has active waiver", async () => {
      const waiverFeedback: FeedbackRecord<WaiverMetadata> = {
        id: "feedback-1",
        entityType: "execution",
        entityId: "exec-1",
        type: "approval",
        status: "resolved",
        content: "Waived",
        metadata: {
          fingerprint: "abc123",
          ruleId: "PII-001",
          file: "test.ts",
          line: 10,
        },
      };

      mockFeedbackAdapter.getAllFeedback.mockResolvedValue([waiverFeedback]);

      const hasWaiver = await reader.hasActiveWaiver("abc123");

      expect(hasWaiver).toBe(true);
    });

    it("[EARS-F6] hasActiveWaiver should return false if fingerprint has no waiver", async () => {
      mockFeedbackAdapter.getAllFeedback.mockResolvedValue([]);

      const hasWaiver = await reader.hasActiveWaiver("nonexistent");

      expect(hasWaiver).toBe(false);
    });

    it("[EARS-F7] getWaiversForExecution should return waivers for specific execution", async () => {
      const waiverFeedback: FeedbackRecord<WaiverMetadata> = {
        id: "feedback-1",
        entityType: "execution",
        entityId: "exec-1",
        type: "approval",
        status: "resolved",
        content: "Waived",
        metadata: {
          fingerprint: "abc123",
          ruleId: "PII-001",
          file: "test.ts",
          line: 10,
        },
      };

      mockFeedbackAdapter.getFeedbackByEntity.mockResolvedValue([waiverFeedback]);

      const waivers = await reader.getWaiversForExecution("exec-1");

      expect(waivers).toHaveLength(1);
      expect(mockFeedbackAdapter.getFeedbackByEntity).toHaveBeenCalledWith("exec-1");
    });
  });
});
