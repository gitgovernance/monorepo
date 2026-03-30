/**
 * Test Echo Agent
 *
 * Simple agent for testing the agent runner.
 * Echoes input and returns a success message.
 */

import type { Records } from '@gitgov/core';

type AgentExecutionContext = {
  agentId: string;
  actorId: string;
  taskId: string;
  runId: string;
  input?: unknown;
  /** Root directory of the project. Use instead of process.cwd(). */
  projectRoot: string;
};

type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Main agent function.
 * Called by the AgentRunnerModule when the agent is executed.
 */
export async function runAgent(ctx: AgentExecutionContext): Promise<AgentOutput> {
  const timestamp = new Date().toISOString();

  return {
    message: `Echo agent executed successfully at ${timestamp}`,
    data: {
      echo: ctx.input || { message: 'No input provided' },
      context: {
        agentId: ctx.agentId,
        taskId: ctx.taskId,
        runId: ctx.runId,
        projectRoot: ctx.projectRoot,
      },
    },
    artifacts: [],
    metadata: {
      executedAt: timestamp,
      version: '1.0.0',
    },
  };
}
