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
  createAgentRecord(payload: Partial<AgentPayload>, options?: { defer?: boolean }): Promise<AgentRecord>;
  updateAgentRecord(agentId: string, updates: Partial<AgentPayload>): Promise<AgentRecord>;
}

export type ProjectModuleDeps = {
  initializer: IProjectInitializer;
  identity: IdentityModule;
  backlog: Pick<IBacklogAdapter, 'createCycle'>;
  agentAdapter?: IProjectAgentOps;
  defaultAgents?: DefaultAgentConfig[];
  eventBus?: { emit?: (event: string, payload: Record<string, unknown>) => void };
};

export type ProjectInitOptions = {
  name: string;
  login?: string;
  actorName?: string;
  type?: 'human' | 'agent';
  saasUrl?: string;
  stateBranch: string;
  repoId?: string;
  joinedVia?: EnsureActorInput['joinedVia'];
};

export type ProjectInitResult = {
  actorId: string;
  productAgentId: string;
  cycleId: string;
  commitSha?: string;
  alreadyInitialized?: boolean;
  created?: boolean;
};

// --- ensureActorInProject primitive (PROJ-H1..H6) ---

export type EnsureActorInput = {
  login: string;
  type: 'human' | 'agent';
  repoId: string;
  displayName?: string;
  roles?: string[];
  joinedVia: 'cli' | 'saas-oauth' | 'saas-webhook' | 'mcp';
  authzCheck?: (input: EnsureActorInput) => Promise<boolean>;
  skipFinalize?: boolean;
  defer?: boolean;
};

export type EnsureActorResult = {
  actorId: string;
  created: boolean;
  commitSha?: string;
};

export class EnsureActorError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;
  constructor(code: string, context: Record<string, unknown> = {}) {
    super(`EnsureActorError(${code})`);
    this.name = 'EnsureActorError';
    this.code = code;
    this.context = context;
  }
}
