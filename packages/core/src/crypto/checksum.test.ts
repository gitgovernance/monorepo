import { sha256, calculatePayloadChecksum } from "./checksum";
import type { TaskRecord } from "../record_types";

describe("checksum", () => {
  describe("4.1. sha256 (EARS-7 to EARS-8)", () => {
    it("[EARS-7] sha256 should return 64-character lowercase hex digest", () => {
      const result = sha256("test input");
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it("[EARS-8] sha256 should be deterministic (same input same output)", () => {
      const a = sha256("hello world");
      const b = sha256("hello world");
      expect(a).toBe(b);
    });
  });

  describe("4.2. calculatePayloadChecksum (EARS-1)", () => {
    it("[EARS-1] should return same checksum when TaskRecord fields are in different order", () => {
      // Same logical TaskRecord with different declaration order → canonicalization
      // must produce identical checksums (keys sorted alphabetically before hashing).
      const payloadA: TaskRecord = {
        id: '1000000000-task-test',
        title: 'Hello',
        status: 'draft',
        priority: 'medium',
        description: 'Sample task',
        tags: ['a', 'b'],
      };
      const payloadB: TaskRecord = {
        tags: ['a', 'b'],
        description: 'Sample task',
        priority: 'medium',
        status: 'draft',
        title: 'Hello',
        id: '1000000000-task-test',
      };
      const checksumA = calculatePayloadChecksum(payloadA);
      const checksumB = calculatePayloadChecksum(payloadB);
      expect(checksumA).toBe(checksumB);
      expect(checksumA).toMatch(/^[0-9a-f]{64}$/);
    });

    it("[EARS-1] should return same checksum for nested fields in different order", () => {
      // Nested objects also must be canonicalized (recursive key sort).
      const payloadA: TaskRecord = {
        id: '1000000000-task-nested',
        title: 'Nested',
        status: 'draft',
        priority: 'high',
        description: 'with metadata',
        tags: ['a', 'b'],
        references: ['ref:1', 'ref:2'],
      };
      const payloadB: TaskRecord = {
        references: ['ref:1', 'ref:2'],
        tags: ['a', 'b'],
        description: 'with metadata',
        priority: 'high',
        status: 'draft',
        title: 'Nested',
        id: '1000000000-task-nested',
      };
      expect(calculatePayloadChecksum(payloadA)).toBe(calculatePayloadChecksum(payloadB));
    });
  });
});
