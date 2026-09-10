import type { Finding, DetectorName } from "../finding_detector/types";
import type {
  SourceAuditorDependencies,
  ScopeSelectorDependencies,
  AuditOptions,
  AuditResult,
  AuditSummary,
  AuditContentsInput,
  FileContent,
  Waiver,
} from "./types";
import { ScopeSelector } from "./scope_selector";
import { ScoringEngine } from "./scoring_engine";

const BATCH_SIZE = 100;

/**
 * Source Auditor Module - Main audit pipeline for source code.
 *
 * Two entry points:
 * - auditContents(): Pure mode - receives FileContent[] directly (no I/O)
 * - audit(): FileLister mode - discovers and reads files, then delegates to auditContents()
 *
 * Pipeline: Detect -> Filter -> Score -> Output
 *
 * Store Backends Epic: FileLister abstracts file access for serverless compatibility.
 * auditContents() enables direct mode without any FileLister (API, pre-loaded, etc.)
 */
export class SourceAuditorModule {
  private scopeSelector?: ScopeSelector;
  private scoringEngine: ScoringEngine;

  /**
   * Creates module instance with injected dependencies.
   * Only findingDetector is required. fileLister/waiverReader are needed only for audit().
   */
  constructor(private deps: SourceAuditorDependencies) {
    // Only create ScopeSelector if FileLister is available (needed for audit())
    if (deps.fileLister) {
      const scopeDeps: ScopeSelectorDependencies = {
        fileLister: deps.fileLister,
      };
      if (deps.gitModule) {
        scopeDeps.gitModule = deps.gitModule;
      }
      this.scopeSelector = new ScopeSelector(scopeDeps);
    }
    this.scoringEngine = new ScoringEngine();
  }

  /**
   * Pure audit mode - receives pre-loaded file contents directly.
   * No FileLister or I/O needed.
   *
   * Use cases:
   * - API/serverless: files fetched from GitHub API, S3, etc.
   * - Testing: files created in memory
   * - Direct: caller already has file contents
   */
  async auditContents(input: AuditContentsInput): Promise<AuditResult> {
    const startTime = Date.now();

    if (input.files.length === 0) {
      return this.createEmptyResult(startTime);
    }

    // Step 1: Detection on pre-loaded content
    const { findings, scannedLines, detectors } = await this.runDetectionOnContents(input.files);

    // Step 2: Filter by Waivers (if provided)
    const waivers = input.waivers ?? [];
    const { newFindings, acknowledgedCount, unmatchedCount } = this.filterByWaivers(findings, waivers);

    // Step 3: Scoring
    const scoredFindings = this.scoringEngine.score(newFindings);

    // Step 4: Generate Result
    const duration = Date.now() - startTime;

    return {
      findings: scoredFindings,
      summary: this.calculateSummary(scoredFindings),
      scannedFiles: input.files.length,
      scannedLines,
      duration,
      detectors: [...new Set(detectors)],
      waivers: {
        acknowledged: acknowledgedCount,
        new: scoredFindings.length,
        // [EARS-C6]
        unmatched: unmatchedCount,
      },
    };
  }

  /**
   * FileLister-based audit - discovers files via scope selection, reads them,
   * then delegates to auditContents().
   *
   * Requires fileLister in dependencies. Use auditContents() for direct mode.
   */
  async audit(options: AuditOptions): Promise<AuditResult> {
    if (!this.deps.fileLister || !this.scopeSelector) {
      throw new Error('FileLister required for audit(). Use auditContents() for direct mode.');
    }

    const startTime = Date.now();
    const baseDir = options.baseDir || process.cwd();

    // Step 1: Scope Selection
    const filePaths = await this.scopeSelector.selectFiles(options.scope, baseDir);

    if (filePaths.length === 0) {
      return this.createEmptyResult(startTime);
    }

    // Step 2: Read file contents via FileLister
    const files: FileContent[] = [];
    for (const filePath of filePaths) {
      try {
        const content = await this.deps.fileLister.read(filePath);
        files.push({ path: filePath, content });
      } catch {
        // Graceful degradation: skip unreadable files
        continue;
      }
    }

    // Step 3: Load Waivers
    let waivers: Waiver[] = [];
    if (this.deps.waiverReader) {
      try {
        waivers = await this.deps.waiverReader.loadWaivers();
      } catch {
        // Graceful degradation: continue without waivers
      }
    }

    // Step 4: Delegate to pure pipeline
    const result = await this.auditContents({ files, waivers });

    // Adjust duration to include scope selection + file reading
    return {
      ...result,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Runs detection on pre-loaded file contents, processing in batches.
   */
  private async runDetectionOnContents(
    files: FileContent[]
  ): Promise<{
    findings: Finding[];
    scannedLines: number;
    detectors: DetectorName[];
  }> {
    const allFindings: Finding[] = [];
    const detectors: DetectorName[] = [];
    let scannedLines = 0;

    const batches = this.createBatches(files, files.length > 1000 ? BATCH_SIZE : files.length);

    for (const batch of batches) {
      for (const file of batch) {
        try {
          scannedLines += file.content.split("\n").length;

          const fileFindings = await this.deps.findingDetector.detect(file.content, file.path);

          for (const finding of fileFindings) {
            allFindings.push(finding);
            if (!detectors.includes(finding.detector)) {
              detectors.push(finding.detector);
            }
          }
        } catch {
          // Graceful degradation: skip files that fail detection
          continue;
        }
      }
    }

    return { findings: allFindings, scannedLines, detectors };
  }

  /**
   * Creates batches of files for processing.
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Filters findings that already have active waivers.
   * @returns new findings, count of acknowledged, and count of waivers that matched nothing
   */
  private filterByWaivers(
    findings: Finding[],
    waivers: Waiver[]
  ): { newFindings: Finding[]; acknowledgedCount: number; unmatchedCount: number } {
    const waiverFingerprints = new Set(waivers.map((w) => w.fingerprint));
    const findingFingerprints = new Set(findings.map((f) => f.fingerprint));
    const newFindings = findings.filter(
      (f) => !waiverFingerprints.has(f.fingerprint)
    );
    const acknowledgedCount = findings.length - newFindings.length;
    // [EARS-C6] Waivers pointing at an identity nothing produced. After the cut
    // (AUDIT-K1..K6) every waiver written with the old value lands here, and these are the
    // ones the user has to re-create. It is not derivable from the other two counts: a run
    // with a stale waiver and a run with no waivers at all agree on both of them.
    const unmatchedCount = waivers.filter(
      (w) => !findingFingerprints.has(w.fingerprint)
    ).length;
    return { newFindings, acknowledgedCount, unmatchedCount };
  }

  /**
   * Calculates summary of findings by severity, category, and detector.
   */
  private calculateSummary(findings: Finding[]): AuditSummary {
    const summary: AuditSummary = {
      total: findings.length,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byCategory: {},
      byDetector: { regex: 0, heuristic: 0, llm: 0, sast: 0 },
    };

    for (const finding of findings) {
      summary.bySeverity[finding.severity]++;
      summary.byCategory[finding.category] =
        (summary.byCategory[finding.category] || 0) + 1;
      summary.byDetector[finding.detector]++;
    }

    return summary;
  }

  /**
   * Creates empty result for when no files are selected.
   */
  private createEmptyResult(startTime: number): AuditResult {
    return {
      findings: [],
      summary: {
        total: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        byCategory: {},
        byDetector: { regex: 0, heuristic: 0, llm: 0, sast: 0 },
      },
      scannedFiles: 0,
      scannedLines: 0,
      duration: Date.now() - startTime,
      detectors: [],
      // [EARS-C6] Zero on purpose, and the asymmetry with AORCH-B15 is deliberate. Nothing
      // was scanned here, so no waiver was tested against anything — that is a different
      // fact from "the scan ran and no waiver matched", which is what this counter reports.
      // AORCH-B15's early return does count them because there the trigger is a
      // misconfiguration (no audit agents registered); a scope that selects no files is
      // ordinary in incremental mode. Counting them here would also give two answers for
      // one situation: auditContents() receives waivers in its input, while audit() reaches
      // this path before loading them at all.
      waivers: { acknowledged: 0, new: 0, unmatched: 0 },
    };
  }
}
