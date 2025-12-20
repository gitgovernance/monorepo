import { Command, Option } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import type { SourceAuditor, PiiDetector, Config, Git } from '@gitgov/core';

// Types are imported from Core via the SourceAuditor namespace
// Re-export for consumers of this command
export type AuditTarget = SourceAuditor.AuditTarget;
export type CodeScope = SourceAuditor.CodeScope;
export type GroupByOption = SourceAuditor.GroupByOption;

/**
 * CLI-specific options for audit command
 * Maps to AuditOptions in core module
 */
export interface AuditCommandOptions extends BaseCommandOptions {
  /** Target to audit (default: 'code') - MVP only supports 'code' */
  target: AuditTarget;
  /** Scope of audit - values depend on target (default for code: 'diff') */
  scope: CodeScope;
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
  /** Show only summary without individual findings (default: false) */
  summary?: boolean;
  /** Limit findings shown, 0 = all (default: 50) */
  maxFindings?: number;
  /** Group findings by: file, severity, category (default: 'file') */
  groupBy?: GroupByOption;
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
      .addOption(new Option('-t, --target <target>', 'What to audit').choices(['code', 'jira', 'gitgov']).default('code'))
      .addOption(new Option('-s, --scope <scope>', 'Scope: diff (incremental), full (no save), baseline (full + save)').choices(['diff', 'full', 'baseline']).default('diff'))
      .addOption(new Option('-o, --output <format>', 'Output format').choices(['text', 'json', 'sarif']).default('text'))
      .addOption(new Option('-f, --fail-on <severity>', 'Exit 1 on severity level').choices(['critical', 'high', 'medium', 'low']).default('critical'))
      .addOption(new Option('-d, --detector <type>', 'Detector type').choices(['regex', 'heuristic', 'llm']))
      .option('-i, --include <globs>', 'Additional globs to include (CSV)')
      .option('-e, --exclude <globs>', 'Additional globs to exclude (CSV)')
      .option('-q, --quiet', 'Quiet mode - only fatal errors', false)
      .option('--json', 'Alias for --output json', false)
      .option('--summary', 'Show only summary without individual findings', false)
      .option('--max-findings <n>', 'Limit findings shown (0 = all)', (val: string) => parseInt(val, 10), 50)
      .addOption(new Option('--group-by <type>', 'Group findings by').choices(['file', 'severity', 'category']).default('file'))
      .action(async (options: AuditCommandOptions & { json?: boolean }) => {
        // Handle --json alias
        if (options.json) {
          options.output = 'json';
        }
        // Validate target (MVP only supports 'code')
        if (options.target !== 'code') {
          console.error(`❌ Target '${options.target}' not yet supported. Only 'code' is available.`);
          process.exit(1);
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
      // Initialize dependencies
      const sourceAuditor = await this.container.getSourceAuditorModule();
      const configManager = await this.container.getConfigManager();
      const gitModule = await this.container.getGitModule();

      // Map CLI options to AuditOptions
      const auditOptions = await this.mapToAuditOptions(options, configManager);

      // Determine scan mode for user feedback
      const isIncremental = options.scope === 'diff' && auditOptions.scope.changedSince;

      if (!options.quiet) {
        if (isIncremental) {
          const shortSha = auditOptions.scope.changedSince!.substring(0, 7);
          this.logger.log(`Scanning changes since ${shortSha}...`);
        } else if (options.scope === 'diff') {
          // First run - no baseline exists
          this.logger.log('Scanning repository (no baseline found)...');
        } else {
          this.logger.log(`Scanning repository (scope: ${options.scope})...`);
        }
      }

      // Invoke core module - ALL logic lives here
      const result = await sourceAuditor.audit(auditOptions);

      // If --scope baseline, save the current commit as new baseline
      if (options.scope === 'baseline') {
        try {
          const currentCommit = await gitModule.getCommitHash('HEAD');
          const shortCommit = currentCommit.substring(0, 7);
          await configManager.updateAuditState({
            lastFullAuditCommit: shortCommit,
            lastFullAuditTimestamp: new Date().toISOString(),
            lastFullAuditFindingsCount: result.summary.total,
          });
          if (!options.quiet) {
            this.logger.log(`\n📌 Baseline saved: ${shortCommit}`);
          }
        } catch {
          // Git not available or not in a repo - skip saving baseline
          if (!options.quiet) {
            this.logger.log('\n⚠️ Could not save baseline (git not available)');
          }
        }
      }

      // Format and display output
      this.formatOutput(result, options);

      // Calculate exit code
      const exitCode = this.calculateExitCode(result, options.failOn);
      process.exit(exitCode);

    } catch (error) {
      // Handle initialization errors
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
   * Loads baseline commit from config for incremental mode
   */
  private async mapToAuditOptions(
    options: AuditCommandOptions,
    configManager: Config.ConfigManager
  ): Promise<SourceAuditor.AuditOptions> {
    const scope = await this.resolveScope(options, configManager);

    return {
      scope,
    };
  }

  /**
   * Resolve scope configuration based on CLI options
   * [EARS-B1, EARS-B2, EARS-B3, EARS-B4]
   *
   * - --scope diff (default): incremental from last baseline
   * - --scope full: scan everything, don't save baseline
   * - --scope baseline: scan everything, save commit as baseline
   */
  private async resolveScope(
    options: AuditCommandOptions,
    configManager: Config.ConfigManager
  ): Promise<SourceAuditor.ScopeConfig> {
    const baseInclude: string[] = ['**/*'];
    const baseExclude: string[] = [];

    // [EARS-B4] Add user-provided includes/excludes as filters
    if (options.include) {
      baseInclude.push(...options.include.split(',').map(g => g.trim()));
    }
    if (options.exclude) {
      baseExclude.push(...options.exclude.split(',').map(g => g.trim()));
    }

    // [EARS-B2] --scope full: scan everything, don't save baseline
    // [EARS-B3] --scope baseline: scan everything (baseline saving handled in execute)
    if (options.scope === 'full' || options.scope === 'baseline') {
      return {
        include: baseInclude,
        exclude: baseExclude,
      };
    }

    // [EARS-B1] --scope diff (default): incremental mode from last baseline
    const auditState = await configManager.getAuditState();
    if (auditState.lastFullAuditCommit) {
      return {
        include: baseInclude,
        exclude: baseExclude,
        changedSince: auditState.lastFullAuditCommit,
      };
    }

    // No baseline exists - run full scan (first time)
    // Behaves like --scope full when no baseline is available
    return {
      include: baseInclude,
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
        // [EARS-C1, C5, C6, C7] Text output with grouping and limits
        this.formatTextOutput(result, options);
    }
  }

  /**
   * Format text output with new structure: FINDINGS → SUMMARY → SCAN INFO
   * [EARS-C1, EARS-C5, EARS-C6, EARS-C7]
   */
  private formatTextOutput(result: SourceAuditor.AuditResult, options: AuditCommandOptions): void {
    const { findings, summary, scannedFiles, duration } = result;
    const maxFindings = options.maxFindings ?? 50;
    const groupBy = options.groupBy ?? 'file';
    const showSummaryOnly = options.summary ?? false;

    // [EARS-C5] If --summary, skip findings section
    if (!showSummaryOnly && findings.length > 0) {
      // [EARS-C6] Limit findings if maxFindings > 0
      const displayFindings = maxFindings > 0 ? findings.slice(0, maxFindings) : findings;
      const remainingCount = findings.length - displayFindings.length;

      console.log('\n' + '─'.repeat(60));
      if (remainingCount > 0) {
        console.log(`FINDINGS (showing ${displayFindings.length} of ${findings.length})`);
      } else {
        console.log('FINDINGS');
      }
      console.log('─'.repeat(60) + '\n');

      // [EARS-C7] Group findings according to --group-by
      this.displayGroupedFindings(displayFindings, groupBy);

      // Show remaining count if limited
      if (remainingCount > 0) {
        console.log(`\x1b[33m... ${remainingCount} more finding(s) (use --max-findings 0 to see all)\x1b[0m\n`);
      }
    }

    // SUMMARY section
    console.log('─'.repeat(60));
    console.log('SUMMARY');
    console.log('─'.repeat(60) + '\n');

    console.log('┌──────────┬───────┬────────────────────────────────────────┐');
    console.log('│ Severity │ Count │ Status                                 │');
    console.log('├──────────┼───────┼────────────────────────────────────────┤');
    console.log(`│ Critical │ ${summary.bySeverity.critical.toString().padStart(5)} │ ${summary.bySeverity.critical > 0 ? '🔴 Blocking (exit 1)' : '✅'}${' '.repeat(summary.bySeverity.critical > 0 ? 19 : 38)} │`);
    console.log(`│ High     │ ${summary.bySeverity.high.toString().padStart(5)} │ ${summary.bySeverity.high > 0 ? '🟠 Requires attention' : '✅'}${' '.repeat(summary.bySeverity.high > 0 ? 18 : 38)} │`);
    console.log(`│ Medium   │ ${summary.bySeverity.medium.toString().padStart(5)} │ ${summary.bySeverity.medium > 0 ? '🟡 Review recommended' : '✅'}${' '.repeat(summary.bySeverity.medium > 0 ? 18 : 38)} │`);
    console.log(`│ Low      │ ${summary.bySeverity.low.toString().padStart(5)} │ ${summary.bySeverity.low > 0 ? '🔵 Info' : '✅'}${' '.repeat(summary.bySeverity.low > 0 ? 32 : 38)} │`);
    console.log('└──────────┴───────┴────────────────────────────────────────┘');
    console.log(`\nTotal: ${summary.total} findings in ${scannedFiles} files\n`);

    // SCAN INFO section (always at the end for visibility)
    console.log('─'.repeat(60));
    console.log('SCAN INFO');
    console.log('─'.repeat(60) + '\n');

    console.log(`Target:     ${options.target}`);
    console.log(`Scope:      ${options.scope}`);
    console.log(`Duration:   ${duration}ms`);

    const exitCode = this.calculateExitCode(result, options.failOn);
    if (exitCode === 1) {
      console.log(`Exit code:  \x1b[31m1 (${options.failOn} findings detected)\x1b[0m`);
    } else {
      console.log(`Exit code:  \x1b[32m0 (no ${options.failOn} findings)\x1b[0m`);
    }

    if (summary.total > 0) {
      console.log(`\nTip: gitgov audit waive <fingerprint> -j "reason"`);
    }
    console.log('');
  }

  /**
   * Display findings grouped by the specified option
   * [EARS-C7]
   */
  private displayGroupedFindings(findings: PiiDetector.GdprFinding[], groupBy: GroupByOption): void {
    switch (groupBy) {
      case 'severity':
        this.displayBySeverity(findings);
        break;
      case 'category':
        this.displayByCategory(findings);
        break;
      case 'file':
      default:
        this.displayByFile(findings);
        break;
    }
  }

  /**
   * Display findings grouped by file (default)
   */
  private displayByFile(findings: PiiDetector.GdprFinding[]): void {
    const byFile = this.groupByFile(findings);
    for (const [file, fileFindings] of Object.entries(byFile)) {
      console.log(`\x1b[1m${file}\x1b[0m`);
      for (const f of fileFindings) {
        const icon = this.getSeverityIcon(f.severity);
        const color = this.getSeverityColor(f.severity);
        const line = f.line?.toString() ?? '?';
        const col = f.column?.toString() ?? '?';
        console.log(`  ${icon} ${line.padStart(4)}:${col.padEnd(3)} ${color}${f.severity.toUpperCase().padEnd(8)}\x1b[0m ${f.message}`);
        console.log(`            └── Fingerprint: ${f.fingerprint?.slice(0, 12) ?? 'unknown'}...`);
      }
      console.log('');
    }
  }

  /**
   * Display findings grouped by severity
   */
  private displayBySeverity(findings: PiiDetector.GdprFinding[]): void {
    const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;

    for (const severity of severities) {
      const severityFindings = findings.filter(f => f.severity === severity);
      if (severityFindings.length === 0) continue;

      const icon = this.getSeverityIcon(severity);
      const color = this.getSeverityColor(severity);
      console.log(`${icon} ${color}${severity.toUpperCase()}\x1b[0m (${severityFindings.length})`);

      for (const f of severityFindings) {
        console.log(`  ${f.file}:${f.line}  ${f.message}`);
      }
      console.log('');
    }
  }

  /**
   * Display findings grouped by category
   */
  private displayByCategory(findings: PiiDetector.GdprFinding[]): void {
    const byCategory: Record<string, PiiDetector.GdprFinding[]> = {};

    for (const f of findings) {
      const cat = f.category || 'unknown';
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat]!.push(f);
    }

    for (const [category, catFindings] of Object.entries(byCategory)) {
      console.log(`\x1b[1m${category.toUpperCase()}\x1b[0m (${catFindings.length})`);

      for (const f of catFindings) {
        const icon = this.getSeverityIcon(f.severity);
        console.log(`  ${icon} ${f.file}:${f.line}  ${f.message}`);
      }
      console.log('');
    }
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
