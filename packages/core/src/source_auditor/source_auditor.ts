import * as fs from "fs/promises";
import * as path from "path";
import type { GdprFinding, DetectorName } from "../pii_detector/types";
import type {
  SourceAuditorDependencies,
  AuditOptions,
  AuditResult,
  AuditSummary,
  ActiveWaiver,
} from "./types";
import { ScopeSelector } from "./scope_selector";
import { ScoringEngine } from "./scoring_engine";

const BATCH_SIZE = 100;

/**
 * Source Auditor Module - Main audit pipeline for source code.
 *
 * Pipeline: Scope -> Detect -> Filter -> Score -> Output
 *
 * Orchestrates the complete flow: file selection, PII/secrets detection,
 * waiver filtering, scoring, and structured result generation.
 */
export class SourceAuditorModule {
  private scopeSelector: ScopeSelector;
  private scoringEngine: ScoringEngine;

  /**
   * Creates module instance with injected dependencies.
   * ScopeSelector and ScoringEngine are internal components.
   */
  constructor(private deps: SourceAuditorDependencies) {
    this.scopeSelector = new ScopeSelector();
    this.scoringEngine = new ScoringEngine();
  }

  /**
   * Executes complete source code audit.
   * Pipeline: Scope -> Detect -> Filter -> Score -> Output
   */
  async audit(options: AuditOptions): Promise<AuditResult> {
    const startTime = Date.now();
    const baseDir = options.baseDir || process.cwd();

    // Step 1: Scope Selection
    const files = await this.scopeSelector.selectFiles(options.scope, baseDir);

    if (files.length === 0) {
      return this.createEmptyResult(startTime);
    }

    // Step 2: Load Waivers
    let waivers: ActiveWaiver[] = [];
    try {
      waivers = await this.deps.waiverReader.loadActiveWaivers();
    } catch {
      // Graceful degradation: continue without waivers
    }

    // Step 3: Detection
    const { findings, scannedLines, detectors } = await this.runDetection(
      files,
      baseDir
    );

    // Step 4: Filter by Waivers
    const { newFindings, acknowledgedCount } = this.filterByWaivers(
      findings,
      waivers
    );

    // Step 5: Scoring
    const scoredFindings = this.scoringEngine.score(newFindings);

    // Step 6: Generate Result
    const duration = Date.now() - startTime;

    return {
      findings: scoredFindings,
      summary: this.calculateSummary(scoredFindings),
      scannedFiles: files.length,
      scannedLines,
      duration,
      detectors: [...new Set(detectors)],
      waivers: {
        acknowledged: acknowledgedCount,
        new: scoredFindings.length,
      },
    };
  }

  /**
   * Runs detection on all files, processing in batches for large file counts.
   */
  private async runDetection(
    files: string[],
    baseDir: string
  ): Promise<{
    findings: GdprFinding[];
    scannedLines: number;
    detectors: DetectorName[];
  }> {
    const allFindings: GdprFinding[] = [];
    const detectors: DetectorName[] = [];
    let scannedLines = 0;

    // Process in batches if > 1000 files
    const batches = this.createBatches(files, files.length > 1000 ? BATCH_SIZE : files.length);

    for (const batch of batches) {
      for (const file of batch) {
        const filePath = path.join(baseDir, file);

        try {
          const content = await fs.readFile(filePath, "utf-8");
          scannedLines += content.split("\n").length;

          const fileFindings = await this.deps.piiDetector.detect(content, file);

          for (const finding of fileFindings) {
            allFindings.push(finding);
            if (!detectors.includes(finding.detector)) {
              detectors.push(finding.detector);
            }
          }
        } catch {
          // Graceful degradation: skip unreadable files
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
   * @returns new findings and count of acknowledged
   */
  private filterByWaivers(
    findings: GdprFinding[],
    waivers: ActiveWaiver[]
  ): { newFindings: GdprFinding[]; acknowledgedCount: number } {
    const waiverFingerprints = new Set(waivers.map((w) => w.fingerprint));
    const newFindings = findings.filter(
      (f) => !waiverFingerprints.has(f.fingerprint)
    );
    const acknowledgedCount = findings.length - newFindings.length;
    return { newFindings, acknowledgedCount };
  }

  /**
   * Calculates summary of findings by severity, category, and detector.
   */
  private calculateSummary(findings: GdprFinding[]): AuditSummary {
    const summary: AuditSummary = {
      total: findings.length,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      byCategory: {},
      byDetector: { regex: 0, heuristic: 0, llm: 0 },
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
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        byCategory: {},
        byDetector: { regex: 0, heuristic: 0, llm: 0 },
      },
      scannedFiles: 0,
      scannedLines: 0,
      duration: Date.now() - startTime,
      detectors: [],
      waivers: { acknowledged: 0, new: 0 },
    };
  }
}
