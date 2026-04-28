import { Command, Option } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { BaseCommandOptions } from '../../interfaces/command';
import { readFile } from 'node:fs/promises';
import { Sarif as SarifModule, generateExecutionId } from '@gitgov/core';
import type {
  AuditOrchestrationOptions,
  AuditOrchestrationResult,
  Finding,
  Finding,
  FindingCategory,
  DetectorName,
  GetLineContentFn,
} from '@gitgov/core';

/**
 * CLI-specific options for audit command
 * Maps to AuditOrchestrationOptions in core module
 */
export interface AuditCommandOptions extends BaseCommandOptions {
  /** Scope of audit (default: 'diff') */
  scope: 'diff' | 'full' | 'baseline';
  /** Output format (default: 'text') */
  output: 'text' | 'json' | 'sarif';
  /** Minimum severity for exit 1 (default: 'critical') */
  failOn: 'critical' | 'high' | 'medium' | 'low';
  /** Specific agent to run */
  agent?: string;
  /** Additional globs to include (CSV) */
  include?: string;
  /** Additional globs to exclude (CSV) */
  exclude?: string;
  /** Quiet mode - only critical findings */
  quiet?: boolean;
}

/**
 * Options for waive subcommand
 */
export interface WaiveCommandOptions extends BaseCommandOptions {
  /** Justification for the waiver (required by EARS-E2 at runtime) */
  justification?: string;
  /** List active waivers */
  list?: boolean;
}

/**
 * Audit Command - Thin wrapper for AuditOrchestrator from @gitgov/core
 *
 * Responsibilities (CLI only):
 * - Parse CLI arguments
 * - Format output (text/json/sarif)
 * - Exit codes based on policy decision
 *
 * All audit logic lives in AuditOrchestrator (core).
 */
export class AuditCommand extends BaseCommand<AuditCommandOptions> {
  protected commandName = 'audit';
  protected description = 'Audit source code for PII/secrets (GDPR compliance)';

  constructor() {
    super();
  }

  /**
   * Register the audit command with Commander
   * [AORCH-C1, AORCH-C6]
   */
  register(program: Command): void {
    const auditCmd = program
      .command('audit')
      .description(this.description)
      .addOption(new Option('-s, --scope <scope>', 'Scope: diff (incremental), full (no save), baseline (full + save)').choices(['diff', 'full', 'baseline']).default('diff'))
      .addOption(new Option('-o, --output <format>', 'Output format').choices(['text', 'json', 'sarif']).default('text'))
      .addOption(new Option('-f, --fail-on <severity>', 'Exit 1 on severity level').choices(['critical', 'high', 'medium', 'low']).default('critical'))
      .option('-a, --agent <agentId>', 'Run only a specific audit agent')
      .option('-i, --include <globs>', 'Additional globs to include (CSV)')
      .option('-e, --exclude <globs>', 'Additional globs to exclude (CSV)')
      .option('-q, --quiet', 'Quiet mode - only critical findings', false)
      .option('--json', 'Alias for --output json', false)
      .action(async (options: AuditCommandOptions & { json?: boolean }) => {
        // Handle --json alias
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
   * [AORCH-C1, AORCH-C2, AORCH-C3, AORCH-C5]
   */
  async execute(options: AuditCommandOptions): Promise<void> {
    try {
      const orchestrator = await this.container.getAuditOrchestrator();
      const backlogAdapter = await this.container.getBacklogAdapter();
      const { actorId } = await this.requireActor(options);

      if (!options.quiet && options.output !== 'json') {
        this.logger.log(`Scanning repository (scope: ${options.scope})...`);
      }

      // Create a real TaskRecord for the audit run — serves as correlation
      // node linking ExecutionRecords (scan, policy) and FeedbackRecords (review)
      const auditTask = await backlogAdapter.createTask({
        title: `Audit: ${options.scope} scan`,
        status: 'active',
        priority: 'high',
        description: `Automated audit scan (scope: ${options.scope})`,
        tags: ['audit', 'automated'],
      }, actorId);

      // Invoke orchestrator - ALL logic lives here
      const orchestrationOptions: AuditOrchestrationOptions = {
        scope: options.scope,
        taskId: auditTask.id,
        failOn: options.failOn,
      };
      if (options.agent) {
        orchestrationOptions.agentId = options.agent;
      }
      if (options.include) {
        orchestrationOptions.include = options.include.split(',').map(g => g.trim());
      }
      if (options.exclude) {
        orchestrationOptions.exclude = options.exclude.split(',').map(g => g.trim());
      }
      const result = await orchestrator.run(orchestrationOptions);

      // Format and display output
      await this.formatOutput(result, options);

      // Exit code based on policy decision
      if (result.policyDecision.decision === 'block') {
        process.exit(1);
      } else {
        process.exit(0);
      }

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
   * Format and display output based on --output option
   * [AORCH-C4]
   */
  private async formatOutput(result: AuditOrchestrationResult, options: AuditCommandOptions): Promise<void> {
    // Quiet mode - only show critical findings (but respect --output json/sarif)
    if (options.quiet && options.output !== 'json' && options.output !== 'sarif') {
      const criticals = result.findings.filter(f => f.severity === 'critical' && !f.isWaived);
      if (criticals.length > 0) {
        console.log(`❌ ${criticals.length} critical finding(s) detected`);
        criticals.forEach(f => {
          console.log(`   ${f.file}:${f.line} [${f.ruleId ?? 'unknown'}] ${f.message}`);
        });
      }
      return;
    }

    switch (options.output) {
      case 'json':
        this.formatJsonOutput(result);
        break;
      case 'sarif':
        await this.formatSarifOutput(result);
        break;
      default:
        this.formatTextOutput(result, options);
    }
  }

  /**
   * Format text output: FINDINGS -> SUMMARY -> POLICY DECISION
   */
  private formatTextOutput(result: AuditOrchestrationResult, options: AuditCommandOptions): void {
    const { findings, summary, policyDecision } = result;
    const activeFindings = findings.filter(f => !f.isWaived);

    // FINDINGS section
    if (activeFindings.length > 0) {
      console.log('\n' + '─'.repeat(60));
      console.log('FINDINGS');
      console.log('─'.repeat(60) + '\n');

      this.displayByFile(activeFindings);
    }

    // SUMMARY section
    console.log('─'.repeat(60));
    console.log('SUMMARY');
    console.log('─'.repeat(60) + '\n');

    console.log('┌──────────┬───────┬────────────────────────────────────────┐');
    console.log('│ Severity │ Count │ Status                                 │');
    console.log('├──────────┼───────┼────────────────────────────────────────┤');
    console.log(`│ Critical │ ${summary.critical.toString().padStart(5)} │ ${summary.critical > 0 ? '🔴 Blocking (exit 1)' : '✅'}${' '.repeat(summary.critical > 0 ? 19 : 38)} │`);
    console.log(`│ High     │ ${summary.high.toString().padStart(5)} │ ${summary.high > 0 ? '🟠 Requires attention' : '✅'}${' '.repeat(summary.high > 0 ? 18 : 38)} │`);
    console.log(`│ Medium   │ ${summary.medium.toString().padStart(5)} │ ${summary.medium > 0 ? '🟡 Review recommended' : '✅'}${' '.repeat(summary.medium > 0 ? 18 : 38)} │`);
    console.log(`│ Low      │ ${summary.low.toString().padStart(5)} │ ${summary.low > 0 ? '🔵 Info' : '✅'}${' '.repeat(summary.low > 0 ? 32 : 38)} │`);
    console.log('└──────────┴───────┴────────────────────────────────────────┘');
    console.log(`\nTotal: ${summary.total} findings (${summary.suppressed} waived), ${summary.agentsRun} agent(s) run\n`);

    // POLICY DECISION section
    console.log('─'.repeat(60));
    console.log('POLICY DECISION');
    console.log('─'.repeat(60) + '\n');

    console.log(`Scope:      ${options.scope}`);
    console.log(`Decision:   ${policyDecision.decision.toUpperCase()}`);
    console.log(`Reason:     ${policyDecision.reason}`);

    if (policyDecision.decision === 'block') {
      console.log(`Exit code:  \x1b[31m1 (${options.failOn} findings detected)\x1b[0m`);
    } else {
      console.log(`Exit code:  \x1b[32m0 (no ${options.failOn} findings)\x1b[0m`);
    }

    if (result.warning) {
      console.log(`\n⚠️  ${result.warning}`);
    }

    if (summary.total > 0) {
      console.log(`\nTip: gitgov audit waive <fingerprint> -j "reason"`);
    }
    console.log('');
  }

  /**
   * Display findings grouped by file
   */
  private displayByFile(findings: Finding[]): void {
    const byFile: Record<string, Finding[]> = {};
    for (const f of findings) {
      const existing = byFile[f.file];
      if (existing) {
        existing.push(f);
      } else {
        byFile[f.file] = [f];
      }
    }

    for (const [file, fileFindings] of Object.entries(byFile)) {
      console.log(`\x1b[1m${file}\x1b[0m`);
      for (const f of fileFindings) {
        const icon = this.getSeverityIcon(f.severity);
        const color = this.getSeverityColor(f.severity);
        const line = f.line.toString();
        const col = f.column?.toString() ?? '?';
        console.log(`  ${icon} ${line.padStart(4)}:${col.padEnd(3)} ${color}${f.severity.toUpperCase().padEnd(8)}\x1b[0m ${f.message}`);
        console.log(`            └── Fingerprint: ${f.fingerprint.slice(0, 12)}...`);
      }
      console.log('');
    }
  }

  /**
   * Format JSON output
   */
  private formatJsonOutput(result: AuditOrchestrationResult): void {
    console.log(JSON.stringify(result, null, 2));
  }

  /**
   * Format SARIF output using SarifBuilder from @gitgov/core
   * [AORCH-C4]
   */
  private async formatSarifOutput(result: AuditOrchestrationResult): Promise<void> {
    const builder = SarifModule.createSarifBuilder();

    const getLineContent: GetLineContentFn = async (file: string, line: number) => {
      try {
        const content = await readFile(file, 'utf-8');
        const lines = content.split('\n');
        return lines[line - 1] ?? null;
      } catch {
        return null;
      }
    };

    // Convert Findings to Finding shape for SarifBuilder
    const findings: Finding[] = result.findings.map(f => {
      const finding: Finding = {
        id: f.fingerprint,
        fingerprint: f.fingerprint,
        file: f.file,
        line: f.line,
        ruleId: f.ruleId ?? 'UNKNOWN',
        category: f.category as FindingCategory,
        severity: f.severity,
        message: f.message,
        snippet: '',
        confidence: 1.0,
        detector: (f.reportedBy[0] ?? 'regex') as DetectorName,
      };
      if (f.column !== undefined) {
        finding.column = f.column;
      }
      return finding;
    });

    const sarifLog = await builder.build({
      toolName: 'gitgov-audit',
      toolVersion: '2.1.0',
      informationUri: 'https://gitgovernance.com/audit',
      findings,
      getLineContent,
    });

    console.log(JSON.stringify(sarifLog, null, 2));
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
        const waivers = await waiverReader.loadWaivers();

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
      const feedbackAdapter = await this.container.getFeedbackAdapter();
      const currentActor = await this.container.getCurrentActor();

      await feedbackAdapter.create(
        {
          entityType: 'execution',
          entityId: generateExecutionId('cli-waiver', Math.floor(Date.now() / 1000)),
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

}
