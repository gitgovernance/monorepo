import type { IProjectInitializer } from '../project_initializer';
import type { IdentityModule } from '../identity/identity_module';
import type { AgentPayload, AgentRecord } from '../record_types';
import type { IAgentAdapter } from '../adapters/agent_adapter/agent_adapter.types';
// Interface only — the Node-only implementation lives behind @gitgov/core/fs.
import type { IEngineValidator } from '../agent_runner/agent_runner';
import type { IEventStream } from '../event_bus/event_bus';
import type { ActorJoinVia } from '../event_bus/types';

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

// What the default-agents loop uses from AgentAdapter (PROJ-B4, GAUD-E1/E2). A Pick, not a
// restatement: until 2026-09-13 this interface redeclared the four signatures by hand, so the
// contract could only stay in sync by coincidence (audit 527f).
// [EARS-G1] buildSignedAgentRecord builds+signs without committed-read — the caller persists via
// initializer.addAgent (PROJ-B4)
export type IProjectAgentOps = Pick<IAgentAdapter, 'getAgentRecord' | 'createAgentRecord' | 'updateAgentRecord' | 'buildSignedAgentRecord'>;

export type ProjectModuleDeps = {
  initializer: IProjectInitializer;
  identity: IdentityModule;
  // [PROJ-C5] `backlog: Pick<IBacklogAdapter, 'createCycle'>` was here for the root cycle only
  // and left with it (D29). Re-adding it — optional included, which would NOT be an excess
  // property anywhere — fails `tsc` at the keyof probe in the PROJ-C5 test. backlog_adapter
  // itself is untouched: createCycle stays for
  // `gitgov cycle new` and the MCP cycle_new tool.
  agentAdapter?: IProjectAgentOps;
  defaultAgents?: DefaultAgentConfig[];
  /**
   * [PROJ-H4] Optional because not every host runs a bus — but when one is supplied it
   * must be a real `IEventStream`. The previous shape, `{ emit?: (...) => void }`, matched
   * no implementation in the codebase: `IEventStream` exposes `publish`, and `emit` lives
   * only on the private EventEmitter inside `EventBus`. Passing the real bus left `emit`
   * undefined and the double optional-chain swallowed every emission in silence.
   */
  eventBus?: IEventStream;
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
  /** Default '' — only the project.actor.joined payload reads it (PROJ-H4) */
  repoId?: string;
  /**
   * Default 'cli': it describes the CLI, the one caller that does not pass it. Every other host
   * passes its own (saas-api: PSVC-A8, 'saas-oauth'); otherwise its actors are recorded as CLI joins.
   */
  joinedVia?: AddActorInput['joinedVia'];
};

/**
 * [PROJ-A1] A fresh init: the project was created now, so both identifiers exist. This is the
 * only variant that carries them.
 *
 * [PROJ-C5] `cycleId: string` was here too, and left with the root cycle (D29). Removing it
 * from a discriminated union is type-safe by construction: the compiler finds every reader.
 * There were two, both in init-command.ts.
 */
export type ProjectInitialized = {
  alreadyInitialized?: false;
  actorId: string;
  productAgentId: string;
  commitSha?: string;
  // [PROJ-B6] [PROJ-B5] Agents registered but not runnable (engine unresolvable, ARUN-M1), and
  // agents that could not be registered at all. Non-fatal — the CLI surfaces these so the user
  // learns at creation time.
  agentWarnings?: string[];
};

/**
 * [PROJ-A2] An idempotent re-init: the project was already there. Only the caller's actor
 * was resolved, and only when a `login` was supplied — hence `actorId` optional here and
 * required in the other variant. No `productAgentId`, because this path does not create the
 * product agent. (`cycleId` left both variants with the root cycle, PROJ-C5.)
 */
export type ProjectAlreadyInitialized = {
  alreadyInitialized: true;
  actorId?: string;
  created?: boolean;
  commitSha?: string;
};

/**
 * Discriminated on `alreadyInitialized`, so a consumer must narrow before reading the
 * identifiers only a fresh init produces.
 *
 * It used to be one flat record declaring all three as required, which contradicted
 * `PROJ-A2` — its own spec text and pseudocode always described the two shapes. Two
 * `as ProjectInitResult` casts in `initializeProject` kept the compiler quiet, and the
 * type then let any consumer read `cycleId` off a re-init, where it is `undefined`.
 */
export type ProjectInitResult = ProjectInitialized | ProjectAlreadyInitialized;

// --- addActor primitive (PROJ-H1..H6) ---

export type AddActorInput = {
  login: string;
  type: 'human' | 'agent';
  repoId: string;
  displayName?: string;
  roles?: string[];
  // [PROJ-H4] Same union as the event's payload, declared once in event_bus/types
  joinedVia: ActorJoinVia;
  authzCheck?: (input: AddActorInput) => Promise<boolean>;
  /**
   * The caller finalizes later and announces the actor (PROJ-H4): addActor neither commits nor
   * publishes, and returns no commitSha (PROJ-H1). Used by initializeProject.
   */
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

/** [PROJ-B3] The init steps an error can name. */
export type ProjectInitStep = 'createProductAgent';

/**
 * [PROJ-B3] [PROJ-D2] What initializeProject throws when it has something to ADD to the
 * original error: the step that broke, or that the rollback failed too. With nothing to add
 * the original is rethrown unwrapped (PROJ-D1). The original travels intact in the native
 * `cause`, so its class — and an AddActorError's `code` and `context` — survive.
 *
 * A consumer in another bundle must still read `step` and `rollbackError` by shape, not by
 * `instanceof` (IKS-A23).
 */
export class ProjectInitError extends Error {
  public readonly step?: ProjectInitStep;
  public readonly rollbackError?: string;
  constructor(message: string, options: { cause: unknown; step?: ProjectInitStep; rollbackError?: string }) {
    super(message, { cause: options.cause });
    this.name = 'ProjectInitError';
    if (options.step !== undefined) this.step = options.step;
    if (options.rollbackError !== undefined) this.rollbackError = options.rollbackError;
  }
}
