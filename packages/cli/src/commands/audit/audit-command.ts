import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { SourceAuditor, PiiDetector } from '@gitgov/core';

/**
 * CLI-specific options for audit command
 * Maps to AuditOptions in core module
 */
export interface AuditCommandOptions extends BaseCommandOptions {
  /** Scope of files to audit (default: 'full') */
  scope: 'full' | 'git-diff' | 'pr' | string;
  /** Output format (default: 'text') */
  output: 'text' | 'json' | 'sarif';
  /** Minimum severity for exit 1 (default: 'critical') */
  failOn: 'critical' | 'high' | 'medium' | 'low';
  /** Detector type to use */
  detector?: 'regex' | 'heuristic' | 'llm';
  /** Additional globs to include (CSV) */
  include?: string;
  /** Additional globs to exclude (CSV) */
  exclude?: string;
  /** Quiet mode - only fatal errors */
  quiet?: boolean;
}

/**
 * Options for waive subcommand
 */
export interface WaiveCommandOptions extends BaseCommandOptions {
  /** Justification for the waiver */
  justification?: string;
  /** List active waivers */
  list?: boolean;
}

// Severity order for comparison
const SEVERITY_ORDER = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
} as const;

const DEFAULT_THRESHOLD = SEVERITY_ORDER.critical;

/**
 * Audit Command - Thin wrapper for @gitgov/core/source_auditor module
 *
 * Responsibilities (CLI only):
 * - Parse CLI arguments
 * - Format output (text/json/sarif)
 * - Exit codes based on --fail-on
 *
 * All audit logic lives in source_auditor_module (core).
 */
export class AuditCommand extends BaseCommand<AuditCommandOptions> {
  protected commandName = 'audit';
  protected description = 'Audit source code for PII/secrets (GDPR compliance)';

  constructor() {
    super();
  }

  /**
   * Register the audit command with Commander
   * [EARS-A1, EARS-A2]
   */
  register(program: Command): void {
    const auditCmd = program
      .command('audit')
      .description(this.description)
      .option('-s, --scope <scope>', 'Scope: full, git-diff, pr, or glob pattern', 'full')
      .option('-o, --output <format>', 'Output format: text, json, sarif', 'text')
      .option('-f, --fail-on <severity>', 'Exit 1 on: critical, high, medium, low', 'critical')
      .option('-d, --detector <type>', 'Detector: regex, heuristic, llm')
      .option('-i, --include <globs>', 'Additional globs to include (CSV)')
      .option('-e, --exclude <globs>', 'Additional globs to exclude (CSV)')
      .option('-q, --quiet', 'Quiet mode - only fatal errors', false)
      .option('--json', 'Alias for --output json', false)
      .action(async (options: AuditCommandOptions & { json?: boolean }) => {
        // [EARS-A1] Handle --json alias
        if (options.json) {
          options.output = 'json';
        }
        await this.execute(options);
      });

    // Register waive subcommand
    auditCmd
      .command('waive [fingerprint]')
      .description('Create or list waivers for findings')
      .option('-j, --justification <text>', 'Justification for the waiver')
      .option('-l, --list', 'List active waivers', false)
      .action(async (fingerprint: string | undefined, options: WaiveCommandOptions) => {
        await this.executeWaive(fingerprint, options);
      });
  }

  /**
   * Execute audit command
   * [EARS-A1, EARS-A2, EARS-A3, EARS-A4]
   */
  async execute(options: AuditCommandOptions): Promise<void> {
    try {
      const startTime = Date.now();

      // [EARS-A4] Initialize dependencies
      const sourceAuditor = await this.container.getSourceAuditorModule();

      // [EARS-A2] Map CLI options to AuditOptions
      const auditOptions = this.mapToAuditOptions(options);

      if (!options.quiet) {
        this.logger.log('Scanning repository...');
      }

      // Invoke core module - ALL logic lives here
      const result = await sourceAuditor.audit(auditOptions);

      // Format and display output
      this.formatOutput(result, options);

      // [EARS-D1, EARS-D2] Calculate exit code
      const exitCode = this.calculateExitCode(result, options.failOn);
      process.exit(exitCode);

    } catch (error) {
      // [EARS-A4] Handle initialization errors
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (options.output === 'json') {
        console.log(JSON.stringify({ success: false, error: message }, null, 2));
      } else {
        console.error(`❌ ${message}`);
      }
      process.exit(1);
    }
  }

  /**
   * Map CLI options to core AuditOptions
   * [EARS-A2, EARS-B1, EARS-B2, EARS-B3, EARS-B4]
   */
  private mapToAuditOptions(options: AuditCommandOptions): SourceAuditor.AuditOptions {
    const scope = this.resolveScope(options);

    return {
      scope,
    };
  }

  /**
   * Resolve scope configuration based on CLI option
   * [EARS-B1, EARS-B2, EARS-B3, EARS-B4]
   */
  private resolveScope(options: AuditCommandOptions): SourceAuditor.ScopeConfig {
    const baseInclude: string[] = [];
    const baseExclude: string[] = [];

    // [EARS-B1] full scope - all files
    if (options.scope === 'full') {
      baseInclude.push('**/*');
    }
    // [EARS-B4] Custom glob pattern
    else if (!['git-diff', 'pr'].includes(options.scope)) {
      baseInclude.push(options.scope);
    }
    // [EARS-B2, EARS-B3] git-diff and pr handled by core module

    // Add user-provided includes/excludes
    if (options.include) {
      baseInclude.push(...options.include.split(',').map(g => g.trim()));
    }
    if (options.exclude) {
      baseExclude.push(...options.exclude.split(',').map(g => g.trim()));
    }

    return {
      include: baseInclude.length > 0 ? baseInclude : ['**/*'],
      exclude: baseExclude,
    };
  }

  /**
   * Format and display output based on --output option
   * [EARS-C1, EARS-C2, EARS-C3, EARS-C4]
   */
  private formatOutput(result: SourceAuditor.AuditResult, options: AuditCommandOptions): void {
    // [EARS-C4] Quiet mode - only show critical findings
    if (options.quiet) {
      const criticals = result.findings.filter(f => f.severity === 'critical');
      if (criticals.length > 0) {
        console.log(`❌ ${criticals.length} critical finding(s) detected`);
        criticals.forEach(f => {
          console.log(`   ${f.file}:${f.line} [${f.ruleId}] ${f.message}`);
        });
      }
      return;
    }

    switch (options.output) {
      case 'json':
        // [EARS-C2] JSON output
        this.formatJsonOutput(result);
        break;
      case 'sarif':
        // [EARS-C3] SARIF output
        this.formatSarifOutput(result);
        break;
      default:
        // [EARS-C1] Text output
        this.formatTextOutput(result);
    }
  }

  /**
   * Format text output with colors and severity
   * [EARS-C1]
   */
  private formatTextOutput(result: SourceAuditor.AuditResult): void {
    const { findings, summary, scannedFiles, duration, waivers } = result;

    // Header
    console.log('\n' + '═'.repeat(60));
    console.log('                    GITGOV SECURITY AUDIT');
    console.log('═'.repeat(60) + '\n');

    // Scan info
    console.log(`Scanned: ${scannedFiles} files in ${duration}ms`);
    console.log(`Waivers: ${waivers.acknowledged} acknowledged, ${waivers.new} new\n`);

    // Findings
    if (findings.length > 0) {
      console.log('─'.repeat(60));
      console.log('FINDINGS');
      console.log('─'.repeat(60) + '\n');

      // Group by file
      const byFile = this.groupByFile(findings);
      for (const [file, fileFindings] of Object.entries(byFile)) {
        console.log(`\x1b[1m${file}\x1b[0m`);
        for (const f of fileFindings) {
          const icon = this.getSeverityIcon(f.severity);
          const color = this.getSeverityColor(f.severity);
          console.log(`  ${icon} ${color}${f.severity.toUpperCase()}\x1b[0m :${f.line}`);
          console.log(`     ${f.message}`);
          console.log(`     Fingerprint: ${f.fingerprint.slice(0, 12)}...`);
        }
        console.log('');
      }
    }

    // Summary
    console.log('─'.repeat(60));
    console.log('SUMMARY');
    console.log('─'.repeat(60) + '\n');

    console.log('┌──────────┬───────┐');
    console.log('│ Severity │ Count │');
    console.log('├──────────┼───────┤');
    console.log(`│ Critical │   ${summary.bySeverity.critical.toString().padStart(3)}   │`);
    console.log(`│ High     │   ${summary.bySeverity.high.toString().padStart(3)}   │`);
    console.log(`│ Medium   │   ${summary.bySeverity.medium.toString().padStart(3)}   │`);
    console.log(`│ Low      │   ${summary.bySeverity.low.toString().padStart(3)}   │`);
    console.log('└──────────┴───────┘');
    console.log(`\nTotal: ${summary.total} findings\n`);
  }

  /**
   * Format JSON output
   * [EARS-C2]
   */
  private formatJsonOutput(result: SourceAuditor.AuditResult): void {
    console.log(JSON.stringify(result, null, 2));
  }

  /**
   * Format SARIF output for GitHub Code Scanning
   * [EARS-C3]
   */
  private formatSarifOutput(result: SourceAuditor.AuditResult): void {
    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [{
        tool: {
          driver: {
            name: 'gitgov-audit',
            version: '1.0.0',
            informationUri: 'https://gitgovernance.com/audit',
            rules: this.extractRules(result.findings),
          },
        },
        results: result.findings.map(f => ({
          ruleId: f.ruleId,
          level: this.mapSeverityToSarifLevel(f.severity),
          message: { text: f.message },
          locations: [{
            physicalLocation: {
              artifactLocation: { uri: f.file },
              region: { startLine: f.line, startColumn: f.column },
            },
          }],
          fingerprints: { 'gitgov/v1': f.fingerprint },
        })),
      }],
    };
    console.log(JSON.stringify(sarif, null, 2));
  }

  /**
   * Calculate exit code based on --fail-on option
   * [EARS-D1, EARS-D2]
   */
  private calculateExitCode(
    result: SourceAuditor.AuditResult,
    failOn: string
  ): 0 | 1 {
    const severityKey = failOn as keyof typeof SEVERITY_ORDER;
    const threshold = SEVERITY_ORDER[severityKey] ?? DEFAULT_THRESHOLD;

    // [EARS-D2] Check if any finding meets or exceeds threshold
    const hasFailingFinding = result.findings.some(f => {
      const findingKey = f.severity as keyof typeof SEVERITY_ORDER;
      const findingSeverity = SEVERITY_ORDER[findingKey] ?? 0;
      return findingSeverity >= threshold;
    });

    // [EARS-D1] Exit 0 if no findings match threshold
    // [EARS-D2] Exit 1 if findings match threshold
    return hasFailingFinding ? 1 : 0;
  }

  /**
   * Execute waive subcommand
   * [EARS-E1, EARS-E2, EARS-E3, EARS-E4]
   */
  async executeWaive(
    fingerprint: string | undefined,
    options: WaiveCommandOptions
  ): Promise<void> {
    try {
      // [EARS-E3] List waivers
      if (options.list) {
        const waiverReader = await this.container.getWaiverReader();
        const waivers = await waiverReader.loadActiveWaivers();

        if (waivers.length === 0) {
          console.log('\nNo active waivers found.\n');
          return;
        }

        console.log('\n' + '═'.repeat(60));
        console.log(`                    Active Waivers (${waivers.length})`);
        console.log('═'.repeat(60) + '\n');

        waivers.forEach((w, i) => {
          console.log(`${i + 1}. ${w.fingerprint}`);
          console.log(`   Rule: ${w.ruleId}`);
          console.log(`   Justification: ${w.feedback.content}`);
          if (w.expiresAt) {
            console.log(`   Expires: ${w.expiresAt.toISOString()}`);
          }
          console.log('');
        });
        return;
      }

      // [EARS-E2] Require justification for creating waiver
      if (!fingerprint) {
        console.error('❌ Fingerprint required. Usage: gitgov audit waive <fingerprint> -j "reason"');
        process.exit(1);
      }

      if (!options.justification) {
        console.error('❌ Justification required. Use --justification or -j flag.');
        process.exit(1);
      }

      // [EARS-E1] Create waiver
      // Note: WaiverWriter.createWaiver requires a GdprFinding object.
      // For CLI, we create a minimal waiver using FeedbackAdapter directly.
      const feedbackAdapter = await this.container.getFeedbackAdapter();
      const identityAdapter = await this.container.getIdentityAdapter();
      const currentActor = await identityAdapter.getCurrentActor();

      await feedbackAdapter.create(
        {
          entityType: 'execution',
          entityId: 'cli-waiver', // Placeholder - waivers created from CLI
          type: 'approval',
          status: 'resolved',
          content: options.justification,
          metadata: {
            fingerprint,
            ruleId: 'CLI-WAIVER',
            file: 'unknown',
            line: 0,
          },
        },
        currentActor.id
      );

      // [EARS-E4] Show confirmation
      console.log('\n✅ Waiver created successfully');
      console.log(`   Fingerprint: ${fingerprint}`);
      console.log(`   Justification: ${options.justification}`);
      console.log(`   Created by: ${currentActor.id}\n`);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to process waiver: ${message}`);
      process.exit(1);
    }
  }

  // Helper methods

  private groupByFile(findings: PiiDetector.GdprFinding[]): Record<string, PiiDetector.GdprFinding[]> {
    const result: Record<string, PiiDetector.GdprFinding[]> = {};
    for (const f of findings) {
      const existing = result[f.file];
      if (existing) {
        existing.push(f);
      } else {
        result[f.file] = [f];
      }
    }
    return result;
  }

  private getSeverityIcon(severity: string): string {
    const icons: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: '⚪',
    };
    return icons[severity] ?? '⚪';
  }

  private getSeverityColor(severity: string): string {
    const colors: Record<string, string> = {
      critical: '\x1b[31m', // red
      high: '\x1b[33m',     // yellow
      medium: '\x1b[33m',   // yellow
      low: '\x1b[34m',      // blue
      info: '\x1b[37m',     // white
    };
    return colors[severity] ?? '\x1b[37m';
  }

  private extractRules(findings: PiiDetector.GdprFinding[]): Array<{ id: string; name: string; shortDescription: { text: string } }> {
    const ruleMap = new Map<string, { id: string; name: string; shortDescription: { text: string } }>();
    for (const f of findings) {
      if (!ruleMap.has(f.ruleId)) {
        ruleMap.set(f.ruleId, {
          id: f.ruleId,
          name: f.ruleId,
          shortDescription: { text: f.message },
        });
      }
    }
    return Array.from(ruleMap.values());
  }

  private mapSeverityToSarifLevel(severity: string): string {
    const map: Record<string, string> = {
      critical: 'error',
      high: 'error',
      medium: 'warning',
      low: 'note',
      info: 'note',
    };
    return map[severity] ?? 'note';
  }
}
