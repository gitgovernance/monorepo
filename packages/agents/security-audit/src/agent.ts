import {
  SourceAuditor,
  FindingDetector,
  Sarif,
} from '@gitgov/core';
import {
  findProjectRoot,
  FsFileLister,
} from '@gitgov/core/fs';
import { DEFAULT_CONFIG } from './config';

type SarifLog = Sarif.SarifLog;

/**
 * Input received via ctx.input, constructed by AuditOrchestrator.
 */
type SecurityAuditInput = {
  /** Scan scope: diff (changed files), full (all files), baseline (full + save) */
  scope: 'diff' | 'full' | 'baseline';
  /** Glob patterns to include in scan */
  include?: string[];
  /** Glob patterns to exclude from scan */
  exclude?: string[];
  /** TaskRecord ID for traceability */
  taskId: string;
};

/**
 * Execution context passed to the agent by AgentRunner.
 */
type AgentExecutionContext = {
  agentId: string;
  actorId: string;
  taskId: string;
  runId: string;
  input?: unknown;
};

/**
 * Structured output returned by the agent.
 */
type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Entry point of the security-audit agent.
 *
 * Executes SourceAuditorModule with the scope received from the orchestrator
 * and returns a SARIF 2.1.0 log as output metadata.
 *
 * The agent does NOT apply waivers — the orchestrator handles that
 * post-consolidation.
 *
 * @param ctx - Execution context provided by AgentRunner
 * @returns AgentOutput with metadata.kind === 'sarif' and metadata.data containing SarifLog
 */
export async function runAgent(
  ctx: AgentExecutionContext
): Promise<AgentOutput> {
  // Step 1: Cast input
  const input = ctx.input as SecurityAuditInput;

  // Step 2: Load internal config (AORCH-B11 — no external --detector param)
  const config = DEFAULT_CONFIG;

  // Step 3: Map input to SourceAuditor options
  const projectRoot = findProjectRoot() || process.cwd();
  const include = input.include ?? config.defaultInclude;
  const exclude = input.exclude ?? config.defaultExclude;

  // Step 4: Create dependencies and run audit (AORCH-B9)
  const findingDetector = new FindingDetector.FindingDetectorModule(
    config.detectorConfig
  );

  const fileLister = new FsFileLister({ cwd: projectRoot });

  const noOpWaiverReader: SourceAuditor.IWaiverReader = {
    loadActiveWaivers: async () => [],
    hasActiveWaiver: async () => false,
  };

  const sourceAuditor = new SourceAuditor.SourceAuditorModule({
    findingDetector,
    waiverReader: noOpWaiverReader,
    fileLister,
  });

  const auditResult = await sourceAuditor.audit({
    baseDir: projectRoot,
    scope: {
      include,
      exclude,
    },
  });

  // Step 5: Build SARIF from findings (AORCH-B10)
  const sarifBuilder = Sarif.createSarifBuilder();

  const sarifLog: SarifLog = await sarifBuilder.build({
    toolName: 'gitgov-security-audit',
    toolVersion: '1.0.0',
    informationUri: 'https://gitgovernance.com/agents/security-audit',
    findings: auditResult.findings,
    taskId: input.taskId,
    agentId: ctx.agentId,
    scanScope: input.scope,
    scannedFiles: auditResult.scannedFiles,
    scannedLines: auditResult.scannedLines,
  });

  // Step 6: Return AgentOutput with SARIF metadata
  const findingsCount = auditResult.findings.length;

  return {
    message: `Security audit completed: ${findingsCount} finding(s) in ${auditResult.scannedFiles} files`,
    metadata: {
      kind: 'sarif',
      version: '2.1.0',
      data: sarifLog,
    },
  };
}
