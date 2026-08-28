import type { IProjectInitializer } from '../project_initializer';
import type { IdentityModule } from '../identity/identity_module';
import type { IBacklogAdapter } from '../adapters/backlog_adapter/backlog_adapter.types';
import type { AgentPayload, AgentRecord, GitGovAgentRecord } from '../record_types';
// Interface only — the Node-only implementation lives behind @gitgov/core/fs.
import type { IEngineValidator } from '../agent_runner/agent_runner';

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
  /**
   * [PROJ-B6] Verifies that each default agent's engine is actually executable.
   *
   * Injected rather than imported: the only implementation reaches
   * `agent_runner/backends/local_backend.ts`, which imports `node:path` and `node:module`.
   * Importing it here put both in the @gitgov/core root bundle — the last two violations
   * reported by EARS-CI02. Node consumers pass `FsEngineValidator` from `@gitgov/core/fs`.
   *
   * Optional, and that has a cost: with no validator, PROJ-B6 stops validating silently.
   * Its own test pins that path down so the degradation is documented, not discovered.
   * It cannot be required — that would break every test constructing a ProjectModule.
   */
  engineValidator?: IEngineValidator;
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
  // [PROJ-B6] Agents registered but not runnable (engine unresolvable, ARUN-M1).
  // Non-fatal — the CLI surfaces these so the user learns at creation time.
  agentWarnings?: string[];
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
