// Sections: §4.1 (EARS-A1 to EARS-A3), §4.2 (EARS-B1 to EARS-B4), §4.3 (EARS-C1 to EARS-C6), §4.4 (EARS-D1 to EARS-D4), §4.5 (EARS-E1 to EARS-E4), §4.8 (EARS-H1 to EARS-H3)
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SourceAuditorModule } from "./source_auditor";
import { FsFileLister } from "../file_lister/fs";
import type { FindingDetectorModule } from "../finding_detector";
import type { Finding } from "../audit/types";
import { createFinding as coreCreateFinding } from "../audit/types";
import { makeTestWaiver } from "../audit/testing";
import type { IWaiverReader, Waiver, SourceAuditorDependencies } from "./types";

describe("SourceAuditorModule", () => {
  let tempDir: string;
  let mockFindingDetector: jest.Mocked<FindingDetectorModule>;
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

    mockFindingDetector = {
      detect: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<FindingDetectorModule>;

    mockWaiverReader = {
      loadWaivers: jest.fn().mockResolvedValue([]),
      hasWaiver: jest.fn().mockResolvedValue(false),
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Creates SourceAuditorDependencies with FsFileLister for tempDir
   */
  /** An active waiver whose FeedbackRecord was written for a finding in `file`. */
  const waiverOn = (fingerprint: string, file: string): Waiver => {
    const base = makeTestWaiver({ fingerprint, ruleId: "PII-001" });
    return {
      ...base,
      feedback: {
        ...base.feedback,
        payload: { ...base.feedback.payload, metadata: { fingerprint, ruleId: "PII-001", file, line: 1 } },
      },
    };
  };

  const createDeps = (): SourceAuditorDependencies => ({
    findingDetector: mockFindingDetector,
    waiverReader: mockWaiverReader,
    fileLister: new FsFileLister({ cwd: tempDir }),
  });

  // [AUDIT-K1] The identity is computed from file + category + anchor, so a test that needs
  // two DISTINCT findings varies one of those three — `anchor` is the cheapest. Pinning a
  // `fingerprint` here used to work; now the factory ignores it, and two findings that
  // differ only in a pinned fingerprint would come out identical.
  const createFinding = (
    overrides: Partial<Omit<Finding, 'fingerprint' | 'snippetHash'>> & { anchor?: string } = {},
  ): Finding => coreCreateFinding({
    ruleId: "PII-001",
    category: "pii-email",
    severity: "high",
    file: "src/app.ts",
    line: 1,
    snippet: 'const email = "test@test.com"',
    message: "Email detected",
    detector: "regex",
    confidence: 1.0,
    executionId: "",
    reportedBy: [],
    isWaived: false,
    ...overrides,
  });

  describe("4.1. Scope Selection (EARS-A1 to EARS-A3)", () => {
    it("[EARS-A1] should select files matching include globs", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(mockFindingDetector.detect).toHaveBeenCalledTimes(2);
    });

    it("[EARS-A2] should exclude files matching exclude globs", async () => {
      fs.mkdirSync(path.join(tempDir, "node_modules"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "node_modules", "lib.ts"), "export const x = 1;");

      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: ["node_modules/**"] },
        baseDir: tempDir,
      });

      expect(mockFindingDetector.detect).toHaveBeenCalledTimes(2);
      expect(mockFindingDetector.detect).not.toHaveBeenCalledWith(
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
      expect(mockFindingDetector.detect).not.toHaveBeenCalled();
    });
  });

  describe("4.2. Detection Pipeline (EARS-B1 to EARS-B4)", () => {
    it("[EARS-B1] should run findingDetector.detect() on each selected file", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(mockFindingDetector.detect).toHaveBeenCalledTimes(2);
      expect(mockFindingDetector.detect).toHaveBeenCalledWith(
        expect.any(String),
        "src/app.ts"
      );
      expect(mockFindingDetector.detect).toHaveBeenCalledWith(
        expect.any(String),
        "src/utils.ts"
      );
    });

    it("[EARS-B2] should accumulate findings with correct file path", async () => {
      mockFindingDetector.detect.mockImplementation(async (_content, file) => {
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
      // The read must fail AFTER scope selection. The previous version deleted the file
      // BEFORE audit(), so the glob never listed it, read() was never asked for a missing
      // file, and the catch was never entered — the test passed because only one file
      // existed, not because one failed. Verified by mutation: removing the try/catch
      // entirely left it green.
      const fileLister = new FsFileLister({ cwd: tempDir });
      const realRead = fileLister.read.bind(fileLister);
      jest.spyOn(fileLister, "read").mockImplementation(async (p: string) => {
        if (p.endsWith("utils.ts")) throw new Error("EACCES: permission denied");
        return realRead(p);
      });

      const auditor = new SourceAuditorModule({
        findingDetector: mockFindingDetector,
        waiverReader: mockWaiverReader,
        fileLister,
      });

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      // ANTI-VACUITY: both files were in scope, so the single detect call below is the
      // consequence of one read failing, not of one file existing.
      expect(fileLister.read).toHaveBeenCalledTimes(2);

      // The readable one was still processed, and the audit completed.
      expect(mockFindingDetector.detect).toHaveBeenCalledTimes(1);
      expect(result.scannedFiles).toBe(1);
    });

    it("[EARS-B3] should warn naming the file it could not read", async () => {
      // The EARS says "emitir warning y continuar". The catch was silent, and the test above
      // cannot see that: it asserts continuation, which happens either way. A skipped file
      // that reports nothing is a scan with a hole and no record of it.
      const warn = jest.spyOn(console, "warn").mockImplementation(() => { /* captured */ });
      try {
        const fileLister = new FsFileLister({ cwd: tempDir });
        const realRead = fileLister.read.bind(fileLister);
        jest.spyOn(fileLister, "read").mockImplementation(async (p: string) => {
          if (p.endsWith("utils.ts")) throw new Error("EACCES: permission denied");
          return realRead(p);
        });

        const auditor = new SourceAuditorModule({
          findingDetector: mockFindingDetector,
          waiverReader: mockWaiverReader,
          fileLister,
        });

        await auditor.audit({
          scope: { include: ["**/*.ts"], exclude: [] },
          baseDir: tempDir,
        });

        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0]?.[0] ?? "");
        expect(message).toContain("utils.ts");
        expect(message).toContain("EARS-B3");
      } finally {
        warn.mockRestore();
      }
    });

    it("[EARS-B4] should track detectors used in result.detectors", async () => {
      mockFindingDetector.detect.mockResolvedValue([
        createFinding({ detector: "regex" }),
        createFinding({ detector: "heuristic", anchor: "def456" }),
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

  describe("4.3. Waiver Filtering (EARS-C1 to EARS-C6)", () => {
    it("[EARS-C1] should load active waivers before filtering", async () => {
      const auditor = new SourceAuditorModule(createDeps());

      await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(mockWaiverReader.loadWaivers).toHaveBeenCalled();
    });

    it("[EARS-C2] should exclude findings matching active waiver fingerprint", async () => {
      const finding = createFinding({ anchor: "waived-fingerprint" });
      mockFindingDetector.detect.mockResolvedValue([finding]);

      // The waiver keys on the finding's REAL identity. Pairing them through a shared
      // literal used to work because the fingerprint was whatever the test typed; now it is
      // derived, and a literal here would silently stop matching.
      const waiver = waiverOn(finding.fingerprint, "src/app.ts");
      mockWaiverReader.loadWaivers.mockResolvedValue([waiver]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.findings).toHaveLength(0);
      expect(result.waivers.acknowledged).toBe(1);
    });

    // EARS-C3 and EARS-C4 are retired from this block. Expiry is
    // resolved by WaiverReader.loadWaivers() and is specified and tested there as EARS-F3/F4;
    // filterByWaivers never reads expiresAt. The C3 test here had no expired waiver in its
    // fixture, and the C4 test was byte-equivalent to C2. See EARS-H2 for what this means
    // for callers of auditContents({ waivers }).

    it("[EARS-C5] should report waivers.new count correctly", async () => {
      // Three distinct anchors → three distinct identities, which is what makes the count
      // meaningful. Same anchor three times would be ONE finding (EARS-33).
      const waivedFinding = createFinding({ anchor: "waived-1" });
      mockFindingDetector.detect.mockResolvedValue([
        createFinding({ anchor: "new-1" }),
        createFinding({ anchor: "new-2" }),
        waivedFinding,
      ]);

      const waiver = waiverOn(waivedFinding.fingerprint, "src/app.ts");
      mockWaiverReader.loadWaivers.mockResolvedValue([waiver]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.waivers.new).toBe(2);
      expect(result.waivers.acknowledged).toBe(1);
    });

    it("[EARS-C6] should report the count of active waivers that matched no finding", async () => {
      const detected = createFinding({ anchor: "still-here" });
      mockFindingDetector.detect.mockResolvedValue([detected]);

      // Shaped like the earlier line-hash identity (`sha256(line)[0:16]:occurrence`) — what a
      // waiver written with that identity still carries in .gitgov/feedbacks/.
      const staleWaiver = (hash: string): Waiver => waiverOn(hash, "src/app.ts");
      const matched = waiverOn(detected.fingerprint, "src/app.ts");

      // ONE matched and TWO stale, deliberately asymmetric. With one of each, "count the
      // waivers that matched nothing" and "count the waivers that matched" both return 1,
      // so the test would pass against an inverted predicate. Verified by mutation.
      mockWaiverReader.loadWaivers.mockResolvedValue([
        matched,
        staleWaiver("a1b2c3d4e5f60718:1"),
        staleWaiver("f0e1d2c3b4a59687:1"),
      ]);

      const auditor = new SourceAuditorModule(createDeps());
      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.waivers.unmatched).toBe(2);

      // ANTI-VACUITY: the other waiver really did match. Without this, `unmatched: 2` could
      // just as well mean all three failed and the count happens to be right by accident.
      expect(result.waivers.acknowledged).toBe(1);
    });

    it("[EARS-C6] should distinguish a stale waiver from having had no waivers at all", async () => {
      // The negative control for the counter. `acknowledged` and `new` CANNOT tell these two
      // runs apart — that indistinguishability is the whole reason EARS-C6 exists. The
      // control collapses exactly where the counter separates.
      const detected = createFinding({ anchor: "still-here" });
      mockFindingDetector.detect.mockResolvedValue([detected]);

      const stale = waiverOn("a1b2c3d4e5f60718:1", "src/app.ts");

      const runWith = async (waivers: Waiver[]) => {
        mockWaiverReader.loadWaivers.mockResolvedValue(waivers);
        const auditor = new SourceAuditorModule(createDeps());
        return auditor.audit({
          scope: { include: ["src/app.ts"], exclude: [] },
          baseDir: tempDir,
        });
      };

      const withNoWaivers = await runWith([]);
      const withStaleWaiver = await runWith([stale]);

      // The two fields that existed before C6 are identical across both runs.
      expect(withStaleWaiver.waivers.acknowledged).toBe(withNoWaivers.waivers.acknowledged);
      expect(withStaleWaiver.waivers.new).toBe(withNoWaivers.waivers.new);

      // The new one separates them.
      expect(withNoWaivers.waivers.unmatched).toBe(0);
      expect(withStaleWaiver.waivers.unmatched).toBe(1);
    });

    it("[EARS-C6] should count only waivers on a file this run read", async () => {
      const detected = createFinding({ anchor: "still-here" });
      mockFindingDetector.detect.mockResolvedValue([detected]);
      // A waiver on a file the scope leaves out: fine, and not this run's business.
      mockWaiverReader.loadWaivers.mockResolvedValue([
        waiverOn(detected.fingerprint, "src/app.ts"),
        waiverOn("f".repeat(64), "src/utils.ts"),
      ]);
      const auditor = new SourceAuditorModule(createDeps());

      const narrow = await auditor.audit({ scope: { include: ["src/app.ts"], exclude: [] }, baseDir: tempDir });
      expect(narrow.scannedFiles).toBe(1);
      expect(narrow.waivers.unmatched).toBe(0);

      // Negative control — the run that reads src/utils.ts measures that waiver, and reports it.
      const wide = await auditor.audit({ scope: { include: ["src/**"], exclude: [] }, baseDir: tempDir });
      expect(wide.scannedFiles).toBe(2);
      expect(wide.waivers.unmatched).toBe(1);

      // auditContents reads exactly the files it is handed.
      const direct = await auditor.auditContents({
        files: [{ path: "src/app.ts", content: "const x = 1;" }],
        waivers: [waiverOn("f".repeat(64), "src/utils.ts")],
      });
      expect(direct.waivers.unmatched).toBe(0);
    });
  });

  describe("4.4. Summary Calculation (EARS-D1 to EARS-D4)", () => {
    it("[EARS-D1] should calculate summary.total correctly", async () => {
      mockFindingDetector.detect.mockResolvedValue([
        createFinding({ anchor: "1" }),
        createFinding({ anchor: "2" }),
      ]);

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["src/app.ts"], exclude: [] },
        baseDir: tempDir,
      });

      expect(result.summary.total).toBe(2);
    });

    it("[EARS-D2] should calculate summary.bySeverity correctly", async () => {
      mockFindingDetector.detect.mockResolvedValue([
        createFinding({ severity: "critical", anchor: "1" }),
        createFinding({ severity: "high", anchor: "2" }),
        createFinding({ severity: "high", anchor: "3" }),
        createFinding({ severity: "medium", anchor: "4" }),
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
      mockFindingDetector.detect.mockResolvedValue([
        createFinding({ category: "pii-email", anchor: "1" }),
        createFinding({ category: "pii-email", anchor: "2" }),
        createFinding({ category: "hardcoded-secret", anchor: "3" }),
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
      mockFindingDetector.detect.mockResolvedValue([
        createFinding({ detector: "regex", anchor: "1" }),
        createFinding({ detector: "regex", anchor: "2" }),
        createFinding({ detector: "heuristic", anchor: "3" }),
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

    it("[EARS-E4] should detect the first batch before reading the last file", async () => {
      // THE discriminating assertion. The old test asserted `scannedFiles === 152` with 152
      // files against a 1000-file threshold, so one batch was produced and `scannedFiles`
      // comes from `input.files.length` anyway — unrelated to batching. Deleting
      // `createBatches` or setting BATCH_SIZE = 1 both left it green.
      //
      // What bounds memory is interleaving: if detection waits for every read to finish,
      // every file's content is resident at once and there is no batch. So the observable
      // property is ORDER — at least one detect call must happen while reads are still
      // pending.
      const TOTAL = 250; // > BATCH_SIZE (100), so at least three batches
      for (let i = 0; i < TOTAL; i++) {
        fs.writeFileSync(path.join(tempDir, "src", `batch${i}.ts`), `// file ${i}`);
      }

      const fileLister = new FsFileLister({ cwd: tempDir });
      const order: string[] = [];
      const realRead = fileLister.read.bind(fileLister);
      jest.spyOn(fileLister, "read").mockImplementation(async (p: string) => {
        order.push("read");
        return realRead(p);
      });
      mockFindingDetector.detect.mockImplementation(async () => {
        order.push("detect");
        return [];
      });

      const auditor = new SourceAuditorModule({
        findingDetector: mockFindingDetector,
        waiverReader: mockWaiverReader,
        fileLister,
      });

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      // ANTI-VACUITY: every file was really read and detected, so the order below describes a
      // full scan and not a truncated one.
      const reads = order.filter((o) => o === "read").length;
      const detects = order.filter((o) => o === "detect").length;
      expect(reads).toBe(TOTAL + 2); // +2 = app.ts and utils.ts from beforeEach
      expect(detects).toBe(TOTAL + 2);
      expect(result.scannedFiles).toBe(TOTAL + 2);

      // The requirement: detection starts before the last read. With a read-everything-first
      // pipeline this index equals `reads`, and the assertion fails.
      const firstDetect = order.indexOf("detect");
      expect(firstDetect).toBeLessThan(reads);

      // And the bound is the batch size, not the repository size: the first detect must come
      // within the first batch, not after 252 reads.
      expect(firstDetect).toBeLessThanOrEqual(100);
    });

    it("should scan every file when the count is large", async () => {
      for (let i = 0; i < 150; i++) {
        fs.writeFileSync(path.join(tempDir, "src", `file${i}.ts`), `// file ${i}`);
      }

      const auditor = new SourceAuditorModule(createDeps());

      const result = await auditor.audit({
        scope: { include: ["**/*.ts"], exclude: [] },
        baseDir: tempDir,
      });

      // What this really asserts: nothing is dropped at scale. 152 = 2 original + 150 new.
      expect(result.scannedFiles).toBe(152);
    });
  });

  describe("4.8. Direct Audit Mode (EARS-H1 to EARS-H3)", () => {
    it("[EARS-H1] should detect findings from FileContent[] without FileLister", async () => {
      const finding = createFinding({ file: "src/app.ts" });
      mockFindingDetector.detect.mockResolvedValue([finding]);

      // No fileLister — only findingDetector
      const auditor = new SourceAuditorModule({ findingDetector: mockFindingDetector });

      const result = await auditor.auditContents({
        files: [{ path: "src/app.ts", content: 'const email = "test@test.com";' }],
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.file).toBe("src/app.ts");
      expect(result.scannedFiles).toBe(1);
      expect(mockFindingDetector.detect).toHaveBeenCalledTimes(1);
    });

    it("[EARS-H2] should filter findings by waiver fingerprint in auditContents()", async () => {
      const finding = createFinding({ anchor: "waived-fp" });
      mockFindingDetector.detect.mockResolvedValue([finding]);

      const auditor = new SourceAuditorModule({ findingDetector: mockFindingDetector });

      const result = await auditor.auditContents({
        files: [{ path: "src/app.ts", content: 'const email = "test@test.com";' }],
        waivers: [waiverOn(finding.fingerprint, "src/app.ts")],
      });

      expect(result.findings).toHaveLength(0);
      expect(result.waivers.acknowledged).toBe(1);
      expect(result.waivers.new).toBe(0);
    });

    it("[EARS-H3] should throw when audit() is called without FileLister", async () => {
      const auditor = new SourceAuditorModule({ findingDetector: mockFindingDetector });

      await expect(
        auditor.audit({
          scope: { include: ["**/*.ts"], exclude: [] },
          baseDir: tempDir,
        })
      ).rejects.toThrow("FileLister required for audit()");
    });
  });
});
