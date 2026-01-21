import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SourceAuditorModule } from "./source_auditor";
import { FsFileLister } from "../file_lister";
import type { PiiDetectorModule } from "../pii_detector";
import type { GdprFinding } from "../pii_detector/types";
import type { IWaiverReader, ActiveWaiver, SourceAuditorDependencies } from "./types";

describe("SourceAuditorModule", () => {
  let tempDir: string;
  let mockPiiDetector: jest.Mocked<PiiDetectorModule>;
  let mockWaiverReader: jest.Mocked<IWaiverReader>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-auditor-test-"));

    // Create test file structure
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "src", "app.ts"),
      'const email = "test@test.com";\nconst name = "John";'
    );
    fs.writeFileSync(
      path.join(tempDir, "src", "utils.ts"),
      "export function helper() { return 1; }"
    );

    mockPiiDetector = {
      detect: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PiiDetectorModule>;

    mockWaiverReader = {
      loadActiveWaivers: jest.fn().mockResolvedValue([]),
      hasActiveWaiver: jest.fn().mockResolvedValue(false),
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Creates SourceAuditorDependencies with FsFileLister for tempDir
   */
  const createDeps = (): SourceAuditorDependencies => ({
    piiDetector: mockPiiDetector,
    waiverReader: mockWaiverReader,
    fileLister: new FsFileLister({ cwd: tempDir }),
  });

  const createFinding = (overrides: Partial<GdprFinding> = {}): GdprFinding => ({
    id: "finding-1",
    ruleId: "PII-001",
    category: "pii-email",
    severity: "high",
    file: "src/app.ts",
    line: 1,
    snippet: 'const email = "test@test.com"',
    message: "Email detected",
    detector: "regex",
    fingerprint: "abc123",
    confidence: 1.0,
    ...overrides,
  });

  describe("4.1. Scope Selection (EARS-A1 to EARS-A3)", () => {
    it("[EARS-A1] should select files matching include globs", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(mockPiiDetector.detect).toHaveBeenCalledTimes(2);
    });

    it("[EARS-A2] should exclude files matching exclude globs", async () => {
      fs.mkdirSync(path.join(tempDir, "node_modules"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "node_modules", "lib.ts"), "export const x = 1;");

      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: ["node_modules/**"] },
        baseDir: tempDir,
      });

      expect(mockPiiDetector.detect).toHaveBeenCalledTimes(2);
      expect(mockPiiDetector.detect).not.toHaveBeenCalledWith(
        expect.any(String),
        "node_modules/lib.ts"
      );
    });

    it("[EARS-A3] should return empty result when include is empty", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: [], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.findings).toHaveLength(0);
      expect(result.scannedFiles).toBe(0);
      expect(mockPiiDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe("4.2. Detection Pipeline (EARS-B1 to EARS-B4)", () => {
    it("[EARS-B1] should run piiDetector.detect() on each selected file", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(mockPiiDetector.detect).toHaveBeenCalledTimes(2);
      expect(mockPiiDetector.detect).toHaveBeenCalledWith(
        expect.any(String),
        "src/app.ts"
      );
      expect(mockPiiDetector.detect).toHaveBeenCalledWith(
        expect.any(String),
        "src/utils.ts"
      );
    });

    it("[EARS-B2] should accumulate findings with correct file path", async () => {
      mockPiiDetector.detect.mockImplementation(async (_content, file) => {
        if (file === "src/app.ts") {
          return [createFinding({ file: "src/app.ts" })];
        }
        return [];
      });

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.file).toBe("src/app.ts");
    });

    it("[EARS-B3] should continue when file cannot be read", async () => {
      // Create unreadable file scenario by removing file after glob
      const auditor = new SourceAuditorModule(createDeps());

      // Delete one file to simulate read error
      fs.unlinkSync(path.join(tempDir, "src", "utils.ts"));

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      // Should still process the remaining file
      expect(mockPiiDetector.detect).toHaveBeenCalledTimes(1);
    });

    it("[EARS-B4] should track detectors used in result.detectors", async () => {
      mockPiiDetector.detect.mockResolvedValue([
        createFinding({ detector: "regex" }),
        createFinding({ id: "2", detector: "heuristic", fingerprint: "def456" }),
      ]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.detectors).toContain("regex");
      expect(result.detectors).toContain("heuristic");
    });
  });

  describe("4.3. Waiver Filtering (EARS-C1 to EARS-C5)", () => {
    it("[EARS-C1] should load active waivers before filtering", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(mockWaiverReader.loadActiveWaivers).toHaveBeenCalled();
    });

    it("[EARS-C2] should exclude findings matching active waiver fingerprint", async () => {
      const finding = createFinding({ fingerprint: "waived-fingerprint" });
      mockPiiDetector.detect.mockResolvedValue([finding]);

      const waiver: ActiveWaiver = {
        fingerprint: "waived-fingerprint",
        ruleId: "PII-001",
        feedback: {} as ActiveWaiver["feedback"],
      };
      mockWaiverReader.loadActiveWaivers.mockResolvedValue([waiver]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.findings).toHaveLength(0);
      expect(result.waivers.acknowledged).toBe(1);
    });

    it("[EARS-C3] should ignore expired waivers", async () => {
      // Expired waivers are filtered by WaiverReader, not SourceAuditor
      // This test verifies integration behavior
      const finding = createFinding();
      mockPiiDetector.detect.mockResolvedValue([finding]);
      mockWaiverReader.loadActiveWaivers.mockResolvedValue([]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.findings).toHaveLength(1);
    });

    it("[EARS-C4] should treat waivers without expiresAt as permanent", async () => {
      const finding = createFinding({ fingerprint: "permanent-waiver" });
      mockPiiDetector.detect.mockResolvedValue([finding]);

      const permanentWaiver: ActiveWaiver = {
        fingerprint: "permanent-waiver",
        ruleId: "PII-001",
        // No expiresAt
        feedback: {} as ActiveWaiver["feedback"],
      };
      mockWaiverReader.loadActiveWaivers.mockResolvedValue([permanentWaiver]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.findings).toHaveLength(0);
      expect(result.waivers.acknowledged).toBe(1);
    });

    it("[EARS-C5] should report waivers.new count correctly", async () => {
      mockPiiDetector.detect.mockResolvedValue([
        createFinding({ fingerprint: "new-1" }),
        createFinding({ id: "2", fingerprint: "new-2" }),
        createFinding({ id: "3", fingerprint: "waived-1" }),
      ]);

      const waiver: ActiveWaiver = {
        fingerprint: "waived-1",
        ruleId: "PII-001",
        feedback: {} as ActiveWaiver["feedback"],
      };
      mockWaiverReader.loadActiveWaivers.mockResolvedValue([waiver]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.waivers.new).toBe(2);
      expect(result.waivers.acknowledged).toBe(1);
    });
  });

  describe("4.4. Summary Calculation (EARS-D1 to EARS-D4)", () => {
    it("[EARS-D1] should calculate summary.total correctly", async () => {
      mockPiiDetector.detect.mockResolvedValue([
        createFinding({ fingerprint: "1" }),
        createFinding({ id: "2", fingerprint: "2" }),
      ]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.summary.total).toBe(2);
    });

    it("[EARS-D2] should calculate summary.bySeverity correctly", async () => {
      mockPiiDetector.detect.mockResolvedValue([
        createFinding({ severity: "critical", fingerprint: "1" }),
        createFinding({ id: "2", severity: "high", fingerprint: "2" }),
        createFinding({ id: "3", severity: "high", fingerprint: "3" }),
        createFinding({ id: "4", severity: "medium", fingerprint: "4" }),
      ]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.summary.bySeverity.critical).toBe(1);
      expect(result.summary.bySeverity.high).toBe(2);
      expect(result.summary.bySeverity.medium).toBe(1);
      expect(result.summary.bySeverity.low).toBe(0);
    });

    it("[EARS-D3] should calculate summary.byCategory correctly", async () => {
      mockPiiDetector.detect.mockResolvedValue([
        createFinding({ category: "pii-email", fingerprint: "1" }),
        createFinding({ id: "2", category: "pii-email", fingerprint: "2" }),
        createFinding({ id: "3", category: "hardcoded-secret", fingerprint: "3" }),
      ]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.summary.byCategory["pii-email"]).toBe(2);
      expect(result.summary.byCategory["hardcoded-secret"]).toBe(1);
    });

    it("[EARS-D4] should calculate summary.byDetector correctly", async () => {
      mockPiiDetector.detect.mockResolvedValue([
        createFinding({ detector: "regex", fingerprint: "1" }),
        createFinding({ id: "2", detector: "regex", fingerprint: "2" }),
        createFinding({ id: "3", detector: "heuristic", fingerprint: "3" }),
      ]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.summary.byDetector.regex).toBe(2);
      expect(result.summary.byDetector.heuristic).toBe(1);
      expect(result.summary.byDetector.llm).toBe(0);
    });
  });

  describe("4.5. Metrics and Performance (EARS-E1 to EARS-E4)", () => {
    it("[EARS-E1] should report scannedFiles count", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.scannedFiles).toBe(2);
    });

    it("[EARS-E2] should report scannedLines count", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      // app.ts has 2 lines, utils.ts has 1 line
      expect(result.scannedLines).toBe(3);
    });

    it("[EARS-E3] should report duration in milliseconds", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe("number");
    });

    it("[EARS-E4] should process in batches for large file counts", async () => {
      // Create many files
      for (let i = 0; i < 150; i++) {
        fs.writeFileSync(path.join(tempDir, "src", `file${i}.ts`), `// file ${i}`);
      }

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      // Should process all files (152 = 2 original + 150 new)
      expect(result.scannedFiles).toBe(152);
    });
  });
});
