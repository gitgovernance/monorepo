// Blueprint: packages/blueprints/03_products/core/specs/modules/source_auditor/source_auditor_module.md
// Sections: §4.7 (EARS-G1 to EARS-G5)
import { WaiverWriter } from "./waiver_writer";
import type { IFeedbackAdapter } from "../adapters/feedback_adapter";
import type { Finding } from "../finding_detector/types";
import type { FeedbackRecord } from "../types";

describe("WaiverWriter", () => {
  let mockFeedbackAdapter: jest.Mocked<IFeedbackAdapter>;
  let writer: WaiverWriter;

  beforeEach(() => {
    mockFeedbackAdapter = {
      create: jest.fn().mockResolvedValue({} as FeedbackRecord),
      resolve: jest.fn(),
      getFeedback: jest.fn(),
      getFeedbackByEntity: jest.fn(),
      getAllFeedback: jest.fn(),
      getFeedbackThread: jest.fn(),
    };
    writer = new WaiverWriter(mockFeedbackAdapter);
  });

  const mockFinding: Finding = {
    id: "finding-1",
    ruleId: "PII-001",
    category: "pii-email",
    severity: "high",
    file: "src/app.ts",
    line: 42,
    snippet: 'const email = "test@test.com"',
    message: "Email detected",
    detector: "regex",
    fingerprint: "abc123def456",
    confidence: 1.0,
  };

  describe("4.7. WaiverWriter (EARS-G1 to EARS-G5)", () => {
    it("[EARS-G1] should create waiver with correct metadata", async () => {
      await writer.createWaiver(
        {
          finding: mockFinding,
          executionId: "exec-123",
          justification: "False positive - test data",
        },
        "human:camilo"
      );

      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith(
        {
          entityType: "execution",
          entityId: "exec-123",
          type: "approval",
          status: "resolved",
          content: "False positive - test data",
          metadata: {
            fingerprint: "abc123def456",
            ruleId: "PII-001",
            file: "src/app.ts",
            line: 42,
          },
        },
        "human:camilo"
      );
    });

    it("[EARS-G2] should include expiresAt when provided", async () => {
      const expiresAt = "2025-12-31T23:59:59Z";

      await writer.createWaiver(
        {
          finding: mockFinding,
          executionId: "exec-123",
          justification: "Temporary waiver",
          expiresAt,
        },
        "human:camilo"
      );

      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            expiresAt,
          }),
        }),
        "human:camilo"
      );
    });

    it("[EARS-G3] should include relatedTaskId when provided", async () => {
      await writer.createWaiver(
        {
          finding: mockFinding,
          executionId: "exec-123",
          justification: "Linked to task",
          relatedTaskId: "task-456",
        },
        "human:camilo"
      );

      expect(mockFeedbackAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            relatedTaskId: "task-456",
          }),
        }),
        "human:camilo"
      );
    });

    it("[EARS-G4] should create waivers for all findings in batch", async () => {
      const findings: Finding[] = [
        mockFinding,
        { ...mockFinding, id: "finding-2", fingerprint: "xyz789" },
      ];

      await writer.createWaiversBatch(
        findings,
        "exec-123",
        "Bulk waiver",
        "human:camilo"
      );

      expect(mockFeedbackAdapter.create).toHaveBeenCalledTimes(2);
    });

    it("[EARS-G5] should handle empty findings array", async () => {
      await writer.createWaiversBatch([], "exec-123", "No findings", "human:camilo");

      expect(mockFeedbackAdapter.create).not.toHaveBeenCalled();
    });
  });
});
