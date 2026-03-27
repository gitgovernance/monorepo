/**
 * Test Echo Agent — Unit Tests
 * Blueprint: agents/test-echo/test_echo_agent.md
 * EARS: ECHO-A1 to ECHO-A4
 */

import { runAgent } from './index';

describe('test-echo agent', () => {
  const baseCtx = {
    agentId: 'agent:test-echo',
    actorId: 'agent:test-echo',
    taskId: '1700000000-task-test',
    runId: 'run-uuid-123',
    projectRoot: '/tmp/test-project',
  };

  describe('4.1. Entry Point y Output (ECHO-A1 to ECHO-A4)', () => {
    it('[ECHO-A1] should return success message', async () => {
      const result = await runAgent(baseCtx);

      expect(result.message).toContain('Echo agent executed successfully');
    });

    it('[ECHO-A2] should echo provided input', async () => {
      const input = { hello: 'world', count: 42 };
      const result = await runAgent({ ...baseCtx, input });

      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(data['echo']).toEqual(input);
    });

    it('[ECHO-A3] should return default message when no input', async () => {
      const result = await runAgent(baseCtx);

      const data = result.data as Record<string, unknown>;
      expect(data['echo']).toEqual({ message: 'No input provided' });
    });

    it('[ECHO-A4] should include projectRoot in context', async () => {
      const result = await runAgent(baseCtx);

      const data = result.data as Record<string, unknown>;
      const context = data['context'] as Record<string, unknown>;
      expect(context['projectRoot']).toBe('/tmp/test-project');
    });
  });
});
