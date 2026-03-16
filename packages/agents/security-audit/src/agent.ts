import type { SourceAuditor, Sarif } from '@gitgov/core';

type SarifBuilder = Sarif.SarifBuilder;
type SarifLog = Sarif.SarifLog;
import type {
  SecurityAuditInput,
  AgentDetectorConfig,
  AuditSummary,
  SecurityAuditMetadata,
} from './types';

type AuditResult = SourceAuditor.AuditResult;
type ScopeConfig = SourceAuditor.ScopeConfig;

/**
 * AgentOutput from the framework (Runner namespace).
 * Defined locally to avoid deep namespace import — shape is stable.
 */
type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Dependencias inyectadas del agente.
 * Permite mockear en tests sin patching de modulos.
 */
type AuditOptions = SourceAuditor.AuditOptions;

export type SecurityAuditAgentDeps = {
  sourceAuditor: { audit(options: AuditOptions): Promise<AuditResult> };
  sarifBuilder: SarifBuilder;
};

/**
 * Agente de auditoria de seguridad.
 *
 * Orquesta el pipeline: scope → detect → sarif.
 * No conoce el protocolo de firma — AgentRunner firma el ExecutionRecord.
 * No aplica waivers — el orquestador lo hace (Decision A12/A13).
 */
export class SecurityAuditAgent {
  constructor(private readonly deps: SecurityAuditAgentDeps) {}

  async run(
    input: SecurityAuditInput,
    config: AgentDetectorConfig,
  ): Promise<AgentOutput> {
    const scopeConfig = buildScopeConfig(input);

    // Execute pipeline — conditional stages skip if previous stage = 0 findings
    let lastFindingsCount = -1; // -1 = no previous stage
    let auditResult: AuditResult | undefined;

    for (const stage of config.pipeline) {
      if (stage.conditional && lastFindingsCount === 0) {
        continue; // AAV2-C6, AAV2-A5: skip conditional stage
      }

      // NOTE: stage.config is reserved for future per-detector configuration
      // (e.g., custom regex rules, LLM endpoints). MVP pipeline uses conditional
      // flow control only — SourceAuditorModule handles detection internally.
      auditResult = await this.deps.sourceAuditor.audit({
        scope: scopeConfig,
        baseDir: input.baseDir,
      });

      lastFindingsCount = auditResult.findings.length;
    }

    // If no stages ran (empty pipeline), run default audit
    if (!auditResult) {
      auditResult = await this.deps.sourceAuditor.audit({
        scope: scopeConfig,
        baseDir: input.baseDir,
      });
    }

    // Build SARIF — agent emits ALL findings without filtering (Decision A12/A13)
    const sarifLog: SarifLog = await this.deps.sarifBuilder.build({
      toolName: 'gitgov-security-audit',
      toolVersion: '2.0.0',
      informationUri: 'https://github.com/gitgovernance/monorepo/tree/main/packages/agents/security-audit',
      findings: auditResult.findings,
      getLineContent: async (file: string, line: number) => {
        const fs = await import('node:fs/promises');
        try {
          const content = await fs.readFile(file, 'utf-8');
          return content.split('\n')[line - 1] ?? null;
        } catch {
          return null;
        }
      },
    });

    const summary = buildSummary(auditResult, input.scope);

    const metadata: SecurityAuditMetadata = {
      kind: 'sarif',
      version: '2.1.0',
      data: sarifLog,
      summary,
    };

    return {
      message: `Scan completed: ${summary.totalFindings} findings across ${summary.filesScanned} files`,
      metadata,
    };
  }
}

function buildScopeConfig(input: SecurityAuditInput): ScopeConfig {
  return {
    include: input.include ?? ['**/*'],
    exclude: input.exclude ?? ['node_modules/**', '.git/**', 'dist/**', '*.lock'],
    ...(input.scope === 'diff' ? { changedSince: 'HEAD' } : {}),
  };
}

function buildSummary(
  result: AuditResult,
  scope: SecurityAuditInput['scope'],
): AuditSummary {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const finding of result.findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
  }

  return {
    totalFindings: result.findings.length,
    bySeverity,
    byCategory,
    scopeType: scope,
    filesScanned: result.scannedFiles ?? 0,
  };
}
