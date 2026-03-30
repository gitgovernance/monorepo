// All EARS prefixes map to review_advisor_agent.md

import type { ReviewAdvisorInput } from './types';
import { ReviewAdvisorAgent } from './agent';

/**
 * AgentExecutionContext from the framework (Runner namespace).
 * Defined locally to avoid deep namespace import — shape is stable.
 * Decision A8 pattern: ctx.input is `unknown`, cast explicitly.
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
 * Entry point for the review-advisor agent, invoked by AgentRunner.
 *
 * Contract: AgentRunner calls engine.function with AgentExecutionContext.
 * Input is cast explicitly (same pattern as security-audit).
 *
 * [RAV-A1] Named export from src/index.ts
 * [RAV-D1] Returns resolved Promise<AgentOutput>
 * [RAV-D4] Named export (not default)
 *
 * @param ctx - Execution context provided by AgentRunner
 * @returns AgentOutput with ReviewResult in metadata
 */
export async function runReviewAdvisor(ctx: AgentExecutionContext) {
  const input = ctx.input as ReviewAdvisorInput;

  // [RAV-D2] API key from environment — agent degrades gracefully if missing
  const agent = new ReviewAdvisorAgent({
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
  });

  return agent.run(input);
}

export type {
  ReviewAdvisorInput,
  ReviewResult,
  ReviewOpinion,
} from './types';
