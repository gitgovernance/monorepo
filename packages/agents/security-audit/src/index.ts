import {
  SourceAuditor,
  FindingDetector,
  Sarif,
} from '@gitgov/core';
import { FsFileLister } from '@gitgov/core/fs';
import type { SecurityAuditInput } from './types';
import { SecurityAuditAgent } from './agent';
import { buildConfig } from './config';

/**
 * AgentExecutionContext from the framework (Runner namespace).
 * Defined locally to avoid deep namespace import — shape is stable.
 * Decision A8: ctx.input is `unknown`, cast explicitly in this function.
 */
type AgentExecutionContext = {
  agentId: string;
  actorId: string;
  taskId: string;
  runId: string;
  input?: unknown;
  /** Root directory of the project. Use instead of process.cwd(). */
  projectRoot: string;
};

/**
 * Entry point del agente, invocado por AgentRunner.
 *
 * Contrato: AgentRunner llama engine.function con AgentExecutionContext.
 * Decision A8: ctx.input es `unknown` — se castea explicitamente.
 *
 * @param ctx - Contexto de ejecucion provisto por AgentRunner
 * @returns AgentOutput con SarifLog en metadata
 */
export async function runAgent(ctx: AgentExecutionContext) {
  // Decision A8: cast explicito — ver overview.md §A8
  const input = ctx.input as SecurityAuditInput;
  const config = buildConfig(input);

  // FsFileLister required by SourceAuditorModule.audit() — without it, audit() throws
  // Use ctx.projectRoot (injected by AgentRunner) instead of process.cwd()
  const fileLister = new FsFileLister({ cwd: input.baseDir ?? ctx.projectRoot ?? process.cwd() });

  // No WaiverReader — agent emits ALL findings (Decision A12/A13)
  const sourceAuditor = new SourceAuditor.SourceAuditorModule({
    findingDetector: new FindingDetector.FindingDetectorModule(),
    fileLister,
  });

  const agent = new SecurityAuditAgent({
    sourceAuditor,
    sarifBuilder: Sarif.createSarifBuilder(),
  });

  return agent.run(input, config);
}

export type {
  SecurityAuditInput,
  SecurityAuditMetadata,
  AgentDetectorConfig,
  DetectorStage,
  AuditSummary,
} from './types';
