/**
 * Filesystem AgentRunner implementation
 *
 * This module provides the filesystem-based implementation of IAgentRunner:
 * - FsAgentRunner: Loads AgentRecords from .gitgov/agents/
 * - createAgentRunner(): Factory function for DI
 *
 * Note: LocalBackend is re-exported from backends/ for convenience.
 * Use @gitgov/core/backends for direct backend imports.
 */
export { FsAgentRunner } from './fs_agent_runner';
export { LocalBackend } from '../backends';
export type { AgentRunnerDependencies as FsAgentRunnerDependencies } from '../agent_runner.types';

import type { IAgentRunner, AgentRunnerDependencies } from '../agent_runner.types';
import { FsAgentRunner } from './fs_agent_runner';

/**
 * Factory function to create a filesystem-based AgentRunner.
 */
export function createAgentRunner(deps: AgentRunnerDependencies): IAgentRunner {
  return new FsAgentRunner(deps);
}
