import { Command } from 'commander';
import { AgentCommand } from './agent-command';

/**
 * Register the agent command
 */
export function registerAgentCommand(program: Command): void {
  const agentCommand = new AgentCommand();
  agentCommand.register(program);
}
