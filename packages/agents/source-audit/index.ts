/**
 * Source Audit Agent
 *
 * Blueprint: packages/blueprints/03_products/agents/source-audit/source_audit_agent.md
 *
 * Scans source code for sensitive data (PII, secrets, API keys).
 * Uses SourceAuditorModule for detection.
 */

import {
  SourceAuditor,
  FindingDetector,
} from '@gitgov/core';
import {
  findProjectRoot,
  FsFileLister,
} from '@gitgov/core/fs';

type AgentExecutionContext = {
  agentId: string;
  actorId: string;
  taskId: string;
  runId: string;
  input?: unknown;
};

type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

interface ScanInput {
  /** Base directory to scan (default: project root or cwd) */
  baseDir?: string;
  /** Include patterns (glob patterns) */
  include?: string[];
  /** Exclude patterns (default: node_modules, .git, dist, build) */
  exclude?: string[];
  /** Minimum severity to report (default: 'low') */
  minSeverity?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Main agent function.
 * Called by the AgentRunnerModule when the agent is executed.
 */
export async function runAgent(ctx: AgentExecutionContext): Promise<AgentOutput> {
  const startTime = Date.now();
  const input = (ctx.input as ScanInput) || {};

  // Find project root (like git works from any subfolder)
  const projectRoot = findProjectRoot() || process.cwd();
  const baseDir = input.baseDir || projectRoot;
  const include = input.include || ['**/*'];
  const exclude = input.exclude || [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.min.js',
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
  ];

  try {
    // Create finding detector with default config (regex enabled by default)
    const findingDetector = new FindingDetector.FindingDetectorModule({
      regex: { enabled: true },
    });

    // Create file lister for the base directory
    const fileLister = new FsFileLister({ cwd: baseDir });

    // Create a no-op waiver reader (waivers handled externally)
    const waiverReader: SourceAuditor.IWaiverReader = {
      loadActiveWaivers: async () => [],
      hasActiveWaiver: async () => false,
    };

    // Create source auditor with all dependencies
    const sourceAuditor = new SourceAuditor.SourceAuditorModule({
      findingDetector,
      waiverReader,
      fileLister,
    });

    // Execute scan
    const result = await sourceAuditor.audit({
      baseDir,
      scope: {
        include,
        exclude,
      },
    });

    // Filter by minimum severity if specified
    let findings = result.findings;
    if (input.minSeverity) {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const minLevel = severityOrder[input.minSeverity];
      findings = findings.filter(f => severityOrder[f.severity] >= minLevel);
    }

    const duration = Date.now() - startTime;
    const { summary } = result;

    // Build formatted message with table
    const lines: string[] = [];
    lines.push('');
    lines.push('┌──────────┬───────┬──────────────────────────┐');
    lines.push('│ Severity │ Count │ Status                   │');
    lines.push('├──────────┼───────┼──────────────────────────┤');
    lines.push(`│ Critical │ ${String(summary.bySeverity.critical).padStart(5)} │ ${summary.bySeverity.critical > 0 ? '🔴 Blocking' : '✅ None'}${' '.repeat(summary.bySeverity.critical > 0 ? 15 : 19)} │`);
    lines.push(`│ High     │ ${String(summary.bySeverity.high).padStart(5)} │ ${summary.bySeverity.high > 0 ? '🟠 Attention' : '✅ None'}${' '.repeat(summary.bySeverity.high > 0 ? 14 : 19)} │`);
    lines.push(`│ Medium   │ ${String(summary.bySeverity.medium).padStart(5)} │ ${summary.bySeverity.medium > 0 ? '🟡 Review' : '✅ None'}${' '.repeat(summary.bySeverity.medium > 0 ? 17 : 19)} │`);
    lines.push(`│ Low      │ ${String(summary.bySeverity.low).padStart(5)} │ ${summary.bySeverity.low > 0 ? '🔵 Info' : '✅ None'}${' '.repeat(summary.bySeverity.low > 0 ? 18 : 19)} │`);
    lines.push('└──────────┴───────┴──────────────────────────┘');
    lines.push('');
    lines.push(`Scanned: ${result.scannedFiles} files (${result.scannedLines.toLocaleString()} lines)`);
    lines.push(`Total:   ${findings.length} findings`);
    lines.push(`Time:    ${duration}ms`);

    return {
      message: lines.join('\n'),
      metadata: {
        executedAt: new Date().toISOString(),
        duration,
        baseDir,
        version: '1.0.0',
        summary: result.summary,
        scannedFiles: result.scannedFiles,
        scannedLines: result.scannedLines,
        detectors: result.detectors,
        waivers: result.waivers,
        findingsCount: findings.length,
        findings,
      },
    };
  } catch (error) {
    return {
      message: `Source scan failed: ${(error as Error).message}`,
      metadata: {
        executedAt: new Date().toISOString(),
        duration: Date.now() - startTime,
        baseDir,
        version: '1.0.0',
        error: (error as Error).message,
        stack: (error as Error).stack,
      },
    };
  }
}
