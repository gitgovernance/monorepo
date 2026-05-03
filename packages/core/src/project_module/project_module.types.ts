import type { IProjectInitializer } from '../project_initializer';
import type { IdentityModule } from '../identity/identity_module';
import type { IBacklogAdapter } from '../adapters/backlog_adapter/backlog_adapter.types';
import type { IAgentAdapter } from '../adapters/agent_adapter/agent_adapter.types';
import type { AgentPayload } from '../record_types';

export type DefaultAgentConfig = {
  packageName: string;
  agentId: string;
  engine: NonNullable<AgentPayload['engine']>;
  purpose: string;
  metadata: Record<string, unknown>;
};

export type ProjectModuleDeps = {
  initializer: IProjectInitializer;
  identity: IdentityModule;
  backlog: Pick<IBacklogAdapter, 'createCycle'>;
  agentAdapter?: Pick<IAgentAdapter, 'createAgentRecord'>;
  defaultAgents?: DefaultAgentConfig[];
};

export type ProjectInitOptions = {
  name: string;
  login?: string;
  actorName?: string;
  type?: 'human' | 'agent';
  saasUrl?: string;
};

export type ProjectInitResult = {
  actorId: string;
  productAgentId: string;
  cycleId: string;
  commitSha?: string;
  alreadyInitialized?: boolean;
};
