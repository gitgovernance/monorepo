/**
 * GDPR Audit Agent
 *
 * Executes GDPR/PII audit on source code using SourceAuditorModule.
 * Detects sensitive data (emails, API keys, credit cards) in code.
 */

import {
  SourceAuditor,
  PiiDetector,
  Config,
} from '@gitgov/core';

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

interface AuditInput {
  /** Base directory to audit (default: process.cwd()) */
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
export async function runAudit(ctx: AgentExecutionContext): Promise<AgentOutput> {
  const startTime = Date.now();
  const input = (ctx.input as AuditInput) || {};

  // Use ConfigManager to find project root (like git works from any subfolder)
  const projectRoot = Config.ConfigManager.findProjectRoot() || process.cwd();
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
    // Create PII detector with default config (regex enabled by default)
    const piiDetector = new PiiDetector.PiiDetectorModule({
      regex: { enabled: true },
    });

    // Create a no-op waiver reader (waivers handled externally)
    const waiverReader: SourceAuditor.IWaiverReader = {
      loadActiveWaivers: async () => [],
      hasActiveWaiver: async () => false,
    };

    // Create source auditor
    const sourceAuditor = new SourceAuditor.SourceAuditorModule({
      piiDetector,
      waiverReader,
    });

    // Execute audit
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
      message: `GDPR audit failed: ${(error as Error).message}`,
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
