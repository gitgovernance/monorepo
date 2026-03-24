/**
 * ReviewAdvisor Entry Point Tests
 *
 * Tests for the runReviewAdvisor entry point.
 *
 * Reference: review_advisor_agent.md §4.1, §4.4
 */

import { runReviewAdvisor } from './src/index';

// Mock the agent to avoid Claude SDK dependency in unit tests
jest.mock('./src/agent', () => {
  return {
    ReviewAdvisorAgent: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue({
        message: 'Review complete',
        metadata: {
          kind: 'feedback-review',
          data: {
            opinions: [],
            summary: 'No findings to review',
            model: 'none',
          },
        },
      }),
    })),
  };
});

describe('ReviewAdvisor Entry Point', () => {
  describe('4.1. Package y Estructura (RAV-A1)', () => {
    it('[RAV-A1] should export runReviewAdvisor as named export from src/index.ts', () => {
      expect(runReviewAdvisor).toBeDefined();
      expect(typeof runReviewAdvisor).toBe('function');
    });
  });

  describe('4.4. Entry Point y Error Handling (RAV-D1 to RAV-D4)', () => {
    it('[RAV-D1] should return AgentOutput with feedback-review kind', async () => {
      const ctx = {
        agentId: 'agent:gitgov:review-advisor',
        actorId: 'agent:gitgov:review-advisor',
        taskId: 'task-test',
        runId: 'run-test',
        input: {
          findings: [],
          policyDecision: { decision: 'pass', reason: 'No issues' },
          taskId: 'task-test',
        },
      };

      const output = await runReviewAdvisor(ctx);

      expect(output).toBeDefined();
      expect(output.metadata).toBeDefined();
      const metadata = output.metadata as Record<string, unknown>;
      expect(metadata['kind']).toBe('feedback-review');
    });

    // RAV-D2 and RAV-D3 tested in agent.test.ts (no mock interference)

    it('[RAV-D4] should export runReviewAdvisor as named export', async () => {
      const mod = await import('./src/index');
      expect(mod.runReviewAdvisor).toBeDefined();
      expect(typeof mod.runReviewAdvisor).toBe('function');
      // Verify it's NOT a default export
      expect((mod as Record<string, unknown>)['default']).toBeUndefined();
    });
  });
});
