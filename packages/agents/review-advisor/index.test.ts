/**
 * ReviewAdvisor Entry Point Tests
 *
 * Tests for the runReviewAdvisor entry point.
 *
 * Reference: review_advisor_agent.md §4.1, §4.4
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
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

    it('[RAV-A1] should export runReviewAdvisor from the BUILT package', async () => {
      // The EARS conditions on "WHEN the package is built". The assert above imports
      // the SOURCE, so a dist/index.mjs that dropped the export would stay green —
      // and dist is what AgentRunner actually loads (engine.entrypoint points there).
      // `pnpm test` runs the build first so this measures a fresh artifact.
      const distPath = path.join(__dirname, 'dist', 'index.mjs');
      expect(fs.existsSync(distPath)).toBe(true);

      // Freshness must be asserted HERE, not delegated to `pnpm test`. Running
      // `npx jest` or the IDE runner skips the build step, and this test would
      // happily measure a bundle from hours ago.
      const srcDir = path.join(__dirname, 'src');
      const newestSrc = fs.readdirSync(srcDir)
        .filter(f => f.endsWith('.ts'))
        .map(f => fs.statSync(path.join(srcDir, f)).mtimeMs)
        .reduce((a, b) => Math.max(a, b), 0);
      expect(newestSrc).toBeGreaterThan(0); // anti-vacuity: the scan found sources
      expect(fs.statSync(distPath).mtimeMs).toBeGreaterThan(newestSrc);

      const built = fs.readFileSync(distPath, 'utf-8');

      // Anti-vacuity: an empty or truncated bundle would satisfy a naive "does not
      // contain the wrong thing" check.
      expect(built.length).toBeGreaterThan(1000);

      expect(built).toMatch(/export\s*\{[^}]*runReviewAdvisor/);
    });
  });

  describe('4.4. Entry Point y Error Handling (RAV-D1 to RAV-D4)', () => {
    it('[RAV-D1] should return AgentOutput with feedback-review kind', async () => {
      const ctx = {
        agentId: 'agent:review-advisor',
        actorId: 'agent:review-advisor',
        taskId: 'task-test',
        runId: 'run-test',
        // Required by AgentExecutionContext (src/index.ts). AgentRunner always supplies
        // it; omitting it here made the file fail `tsc --noEmit`, which [RAV-A2] forbids.
        projectRoot: '/tmp/review-advisor-test',
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
