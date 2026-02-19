import type { McpToolDefinition } from '../../server/mcp_server.types.js';
import type { McpDependencyInjectionService } from '../../di/mcp_di.js';
import type { AgentRunInput } from './audit_tools.types.js';
import { successResult, errorResult } from '../helpers.js';

/** gitgov_agent_run [MSRV-M1, MSRV-M2] */
export const agentRunTool: McpToolDefinition<AgentRunInput> = {
  name: 'gitgov_agent_run',
  description: 'Execute a registered agent by name with optional arguments. Requires an associated task.',
  inputSchema: {
    type: 'object',
    properties: {
      agentName: { type: 'string', description: 'Agent name/ID to execute.' },
      taskId: { type: 'string', description: 'Task ID triggering this execution.' },
      input: { type: 'object', description: 'Input data for the agent.' },
    },
    required: ['agentName', 'taskId'],
    additionalProperties: false,
  },
  handler: async (input: AgentRunInput, di: McpDependencyInjectionService) => {
    try {
      const { agentRunner, stores } = await di.getContainer();

      // Verify agent exists
      const agentRecord = await stores.agents.get(input.agentName);
      if (!agentRecord) {
        return errorResult(`Agent not found: ${input.agentName}`, 'NOT_FOUND');
      }

      const result = await agentRunner.runOnce({
        agentId: input.agentName,
        taskId: input.taskId,
        input: input.input,
      });
      return successResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(`Failed to run agent: ${message}`, 'AGENT_RUN_ERROR');
    }
  },
};
