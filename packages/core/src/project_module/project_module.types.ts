import type { IProjectInitializer } from '../project_initializer';
import type { IdentityModule } from '../identity/identity_module';
import type { IBacklogAdapter } from '../adapters/backlog_adapter/backlog_adapter.types';
import type { AgentPayload, AgentRecord, GitGovAgentRecord } from '../record_types';

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
  // [EARS-G1] Build+sign without committed-read — caller persists via initializer.addAgent (PROJ-B4)
  buildSignedAgentRecord(payload: Partial<AgentPayload>): Promise<GitGovAgentRecord>;
}

export type ProjectModuleDeps = {
  initializer: IProjectInitializer;
  identity: IdentityModule;
  backlog: Pick<IBacklogAdapter, 'createCycle'>;
  agentAdapter?: IProjectAgentOps;
  defaultAgents?: DefaultAgentConfig[];
  eventBus?: { emit?: (event: string, payload: Record<string, unknown>) => void };
  // [P1] Optional: resolves existing keypair for an actor from the org (SaaS API).
  // If present and returns a keypair, createActor uses it instead of generating a new one.
  // If absent or returns null → generate new key (standalone CLI, no SaaS).
  keyResolver?: (actorId: string) => Promise<{ publicKey: string; privateKey: string } | null>;
};

export type ProjectInitOptions = {
  name: string;
  login?: string;
  actorName?: string;
  type?: 'human' | 'agent';
  saasUrl?: string;
  stateBranch: string;
  repoId?: string;
  joinedVia?: AddActorInput['joinedVia'];
};

export type ProjectInitResult = {
  actorId: string;
  productAgentId: string;
  cycleId: string;
  commitSha?: string;
  alreadyInitialized?: boolean;
  created?: boolean;
};

// --- addActor primitive (PROJ-H1..H6) ---

export type AddActorInput = {
  login: string;
  type: 'human' | 'agent';
  repoId: string;
  displayName?: string;
  roles?: string[];
  joinedVia: 'cli' | 'saas-oauth' | 'saas-webhook' | 'mcp';
  authzCheck?: (input: AddActorInput) => Promise<boolean>;
  skipFinalize?: boolean;
  defer?: boolean;
  // [P1] Pre-resolved keypair from the org (skips key generation in createActor)
  existingKeypair?: { publicKey: string; privateKey: string };
};

export type AddActorResult = {
  actorId: string;
  created: boolean;
  commitSha?: string;
};

export class AddActorError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;
  constructor(code: string, context: Record<string, unknown> = {}) {
    super(`AddActorError(${code})`);
    this.name = 'AddActorError';
    this.code = code;
    this.context = context;
  }
}
