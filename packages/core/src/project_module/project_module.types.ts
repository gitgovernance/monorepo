import type { IProjectInitializer } from '../project_initializer';
import type { IdentityModule } from '../identity/identity_module';
import type { IBacklogAdapter } from '../adapters/backlog_adapter/backlog_adapter.types';
import type { AgentPayload, AgentRecord } from '../record_types';

// [PROJ-F1] Trigger type derived from AgentRecord — single source of truth
export type DefaultAgentConfig = {
  packageName: string;
  agentId: string;
  displayName: string;
  engine: NonNullable<AgentPayload['engine']>;
  purpose: string;
  triggers: NonNullable<AgentRecord['triggers']>;
  metadata: Record<string, unknown>;
};

export interface IProjectAgentOps {
  getAgentRecord(agentId: string): Promise<AgentRecord | null>;
  createAgentRecord(payload: Partial<AgentPayload>): Promise<AgentRecord>;
  updateAgentRecord(agentId: string, updates: Partial<AgentPayload>): Promise<AgentRecord>;
}

export type ProjectModuleDeps = {
  initializer: IProjectInitializer;
  identity: IdentityModule;
  backlog: Pick<IBacklogAdapter, 'createCycle'>;
  agentAdapter?: IProjectAgentOps;
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
