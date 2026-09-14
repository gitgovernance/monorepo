/**
 * ProjectModule Tests
 *
 * PROJ-* prefixes map to project_module.md.
 * GAUD-E1..E3 map to gitgov_audit.md §4.5 — the requirement is the agent's, the code it
 * covers is this module's. Declared in project_module.md §4 so the marker is not an orphan.
 *
 * Uses real instances with mock I/O:
 * - IdentityModule: real instance with MemoryRecordStore + MockKeyProvider
 * - IProjectInitializer: mock of interface (pure interface — acceptable per CLAUDE.md)
 * - No BacklogAdapter: the dependency left ProjectModuleDeps with the root cycle (PROJ-C5)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectModule } from './project_module';
import type { ProjectModuleDeps, ProjectInitResult, ProjectInitialized, DefaultAgentConfig, AddActorInput } from './project_module.types';
import { AddActorError, ProjectInitError } from './project_module.types';
import { EventBus } from '../event_bus/event_bus';
import type { ActorJoinedEvent } from '../event_bus/types';
import type { IEventStream } from '../event_bus/event_bus';
// Node-only implementation of IEngineValidator. A test file may import from the fs
// subpath even though ProjectModule itself must not: EARS-CI02 measures dist/src/index.js,
// and tests never reach the bundle.
import { FsEngineValidator } from '../agent_runner/fs/fs_engine_validator';
import { DEFAULT_STATE_BRANCH } from '../sync_state/fs_worktree/fs_worktree_sync_state.types';
import type { IProjectInitializer } from '../project_initializer';
import { IdentityModule } from '../identity/identity_module';
import { MemoryRecordStore } from '../record_store/memory/memory_record_store';
import { MockKeyProvider } from '../key_provider/memory/mock_key_provider';
import type { AgentRecord, GitGovActorRecord } from '../record_types';

/**
 * Narrows a `ProjectInitResult` to the fresh-init variant, and fails loudly when the run
 * took the idempotent path instead.
 *
 * The narrowing is the point: `productAgentId` and `agentWarnings` exist only on
 * `ProjectInitialized`, so reading them off the union would be reading fields the re-init
 * path never produces. It doubles as an anti-vacuity control — a test that silently landed
 * on `alreadyInitialized` used to read `undefined` and assert against it.
 */
function assertFreshInit(result: ProjectInitResult): asserts result is ProjectInitialized {
  if (result.alreadyInitialized) {
    throw new Error(`expected a fresh init, got alreadyInitialized: ${JSON.stringify(result)}`);
  }
}

function createMockInitializer(): IProjectInitializer {
  return {
    isInitialized: jest.fn().mockResolvedValue(false),
    createProjectStructure: jest.fn().mockResolvedValue(undefined),
    writeConfig: jest.fn().mockResolvedValue(undefined),
    initializeSession: jest.fn().mockResolvedValue(undefined),
    setupGitIntegration: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    validateEnvironment: jest.fn().mockResolvedValue({ isValid: true, isGitRepo: true, hasWritePermissions: true, isAlreadyInitialized: false, warnings: [], suggestions: [] }),
    readFile: jest.fn().mockResolvedValue(''),
    getActorPath: jest.fn().mockReturnValue('.gitgov/actors/test.json'),
    addAgent: jest.fn().mockResolvedValue(undefined),
    finalize: jest.fn().mockResolvedValue('abc123def456abc123def456abc123def456abc1'),
    getHeadSha: jest.fn().mockResolvedValue('abc123def456abc123def456abc123def456abc1'),
  };
}

function createRealDeps() {
  const actorStore = new MemoryRecordStore<GitGovActorRecord>();
  const keyProvider = new MockKeyProvider();
  const identity = new IdentityModule({
    stores: { actors: actorStore },
    keyProvider,
  });
  const initializer = createMockInitializer();

  // [PROJ-C5] No `backlog` mock: the dependency left ProjectModuleDeps with the root cycle.
  const deps: ProjectModuleDeps = {
    initializer,
    identity,
  };

  return { deps, actorStore, keyProvider, initializer };
}

describe('ProjectModule', () => {
  // 4.1. Init Flow (PROJ-A1 to A3)
  describe('4.1. Init Flow (PROJ-A1 to A3)', () => {
    it('[PROJ-A1] should run full init flow via initializer', async () => {
      const { deps, actorStore, initializer } = createRealDeps();
      const createActor = jest.spyOn(deps.identity, 'createActor');
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // [PROJ-A1] The EARS declares an ORDER, so the test reads the calls back in the order
      // they happened. It used `toHaveBeenCalled` per step until 2026-09-13, which let the spec
      // keep a retired root-cycle step and omit initializeSession without anything going red.
      // No agentAdapter in these deps, so the default-agents step (PROJ-B4) is correctly absent.
      const steps: Array<[string, jest.Mock | jest.SpyInstance]> = [
        ['createProjectStructure', initializer.createProjectStructure as jest.Mock],
        ['createActor', createActor],
        ['writeConfig', initializer.writeConfig as jest.Mock],
        ['initializeSession', initializer.initializeSession as jest.Mock],
        ['setupGitIntegration', initializer.setupGitIntegration as jest.Mock],
        ['finalize', initializer.finalize as jest.Mock],
      ];
      const sequence = steps
        .flatMap(([name, mock]) => mock.mock.invocationCallOrder.map((order) => ({ name, order })))
        .sort((a, b) => a.order - b.order)
        .map(({ name }) => name);
      expect(sequence).toEqual([
        'createProjectStructure', 'createActor', 'createActor', 'writeConfig',
        'initializeSession', 'setupGitIntegration', 'finalize',
      ]);
      // The two actor creations are the human first, then the product agent
      expect(createActor.mock.calls.map(([payload]) => payload.id)).toEqual(['human:camilo', 'agent:gitgov-audit']);
      // Both participate in the init's unit of work (IDM-G1): without `defer` each would commit on
      // its own and the init would stop being one commit (PROJ-C4). Nothing observed this before
      // 2026-09-13 — MemoryRecordStore's putDeferred equals put, so the suite could not tell.
      expect(createActor.mock.calls.map(([, , options]) => options)).toEqual([{ defer: true }, { defer: true }]);
      assertFreshInit(result);
      expect(result.actorId).toBe('human:camilo');
      expect(result.productAgentId).toBe('agent:gitgov-audit');

      const humanActor = await actorStore.get('human:camilo');
      expect(humanActor).not.toBeNull();
      const productAgent = await actorStore.get('agent:gitgov-audit');
      expect(productAgent).not.toBeNull();
    });

    // [PROJ-A1] The test above has no agentAdapter, so the default-agents step never shows up in
    // its sequence. A mutant that moved git integration and finalize BEFORE the loop passed the
    // whole file — with GitHub that would leave the AgentRecords out of the single commit — and
    // one that dropped `defer` from the specialists' addActor passed too (audit 527f).
    it('[PROJ-A1] should register default agents after the session and before git integration, deferring every actor', async () => {
      const { deps, initializer } = createRealDeps();
      const createActor = jest.spyOn(deps.identity, 'createActor');
      deps.agentAdapter = {
        getAgentRecord: jest.fn().mockResolvedValue(null),
        createAgentRecord: jest.fn(),
        updateAgentRecord: jest.fn(),
        buildSignedAgentRecord: jest.fn().mockImplementation(async (payload: { id?: string }) => ({
          header: { version: '1.0', type: 'agent', payloadChecksum: 'mock-checksum', signatures: [] },
          payload,
        })),
      };
      deps.defaultAgents = [
        { packageName: '@gitgov/core', agentId: 'agent:gitgov-audit', displayName: 'GitGov Audit', engine: { type: 'local' }, purpose: 'orchestration', triggers: [], metadata: {} },
        { packageName: '@gitgov/agent-security-audit', agentId: 'agent:security-audit', displayName: 'Security Audit', engine: { type: 'local', entrypoint: '@gitgov/agent-security-audit', function: 'runAgent' }, purpose: 'audit', triggers: [], metadata: {} },
      ];
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      const steps: Array<[string, jest.Mock | jest.SpyInstance]> = [
        ['createProjectStructure', initializer.createProjectStructure as jest.Mock],
        ['createActor', createActor],
        ['writeConfig', initializer.writeConfig as jest.Mock],
        ['initializeSession', initializer.initializeSession as jest.Mock],
        ['addAgent', initializer.addAgent as jest.Mock],
        ['setupGitIntegration', initializer.setupGitIntegration as jest.Mock],
        ['finalize', initializer.finalize as jest.Mock],
      ];
      const sequence = steps
        .flatMap(([name, mock]) => mock.mock.invocationCallOrder.map((order) => ({ name, order })))
        .sort((a, b) => a.order - b.order)
        .map(({ name }) => name);
      // product agent: no addActor (PROJ-E3), its AgentRecord; specialist: addActor, then AgentRecord
      expect(sequence).toEqual([
        'createProjectStructure', 'createActor', 'createActor', 'writeConfig', 'initializeSession',
        'addAgent', 'createActor', 'addAgent', 'setupGitIntegration', 'finalize',
      ]);
      // Every actor of the fresh init participates in the unit of work, specialists included
      expect(createActor.mock.calls.map(([payload, , options]) => [payload.id, options])).toEqual([
        ['human:camilo', { defer: true }],
        ['agent:gitgov-audit', { defer: true }],
        ['agent:security-audit', { defer: true }],
      ]);
    });

    // [PROJ-A1] [PROJ-B1] [PROJ-E1] No initializeProject test injected a bus, and none passed joinedVia: a
    // hardcoded 'cli' and an init that published nothing both passed the whole file (audit 527f). The
    // fix had no default agents and an empty store, so four mutants of the announcement loop still
    // passed: specialists never joined, only the first two announced, wasCreated fixed at true, and
    // only created actors announced (audit 33ea, M-2). A specialist already in the store — a partial
    // init, §1 — is the wasCreated:false case inside an init.
    it('[PROJ-A1] should publish project.actor.joined for every actor it joins, with wasCreated and the caller joinedVia', async () => {
      const { deps, actorStore, initializer } = createRealDeps();
      deps.agentAdapter = createMockAgentAdapter();
      deps.defaultAgents = [
        { packageName: '@gitgov/core', agentId: 'agent:gitgov-audit', displayName: 'GitGov Audit', engine: { type: 'local' }, purpose: 'orchestration', triggers: [], metadata: {} },
        { packageName: '@gitgov/agent-security-audit', agentId: 'agent:security-audit', displayName: 'Security Audit', engine: { type: 'local', entrypoint: '@gitgov/agent-security-audit', function: 'runAgent' }, purpose: 'audit', triggers: [], metadata: {} },
        { packageName: '@gitgov/agent-review-advisor', agentId: 'agent:review-advisor', displayName: 'Review Advisor', engine: { type: 'local', entrypoint: '@gitgov/agent-review-advisor', function: 'runAgent' }, purpose: 'review', triggers: [], metadata: {} },
      ];
      await deps.identity.createActor({ id: 'agent:security-audit', type: 'agent', displayName: 'Security Audit', roles: ['specialist'] }, 'bootstrap');
      const received: Array<{ event: ActorJoinedEvent; finalizeCallsAtPublish: number }> = [];
      const bus = new EventBus();
      bus.subscribe<ActorJoinedEvent>('project.actor.joined', (event) => {
        received.push({ event, finalizeCallsAtPublish: (initializer.finalize as jest.Mock).mock.calls.length });
      });
      deps.eventBus = bus;
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH, joinedVia: 'saas-oauth' });

      expect(received.map(({ event: e }) => [e.payload.actorId, e.payload.wasCreated, e.payload.joinedVia])).toEqual([
        ['human:camilo', true, 'saas-oauth'],
        ['agent:gitgov-audit', true, 'saas-oauth'],
        ['agent:security-audit', false, 'saas-oauth'],
        ['agent:review-advisor', true, 'saas-oauth'],
      ]);
      // Announced once the actors are written: after the closing finalize, not inside addActor
      expect(received.map(({ finalizeCallsAtPublish }) => finalizeCallsAtPublish)).toEqual([1, 1, 1, 1]);
      const human = await actorStore.get('human:camilo');
      expect(human?.payload.metadata).toEqual(expect.objectContaining({ joinedVia: 'saas-oauth' }));
      // [PROJ-E1] the specialist created by this init carries the caller's channel too
      const specialist = await actorStore.get('agent:review-advisor');
      expect(specialist?.payload.metadata).toEqual(expect.objectContaining({ joinedVia: 'saas-oauth' }));
    });

    // [PROJ-A1] Events used to leave from inside addActor, before the closing finalize: an init that
    // failed afterwards announced actors its rollback deleted (audit 527f, L-i).
    it('[PROJ-A1] should publish no project.actor.joined when the init rolls back', async () => {
      const { deps, initializer } = createRealDeps();
      const received: ActorJoinedEvent[] = [];
      const bus = new EventBus();
      bus.subscribe<ActorJoinedEvent>('project.actor.joined', (e) => { received.push(e); });
      deps.eventBus = bus;
      (initializer.setupGitIntegration as jest.Mock).mockRejectedValue(new Error('gitignore write failed'));
      const createActor = jest.spyOn(deps.identity, 'createActor');
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH }))
        .rejects.toThrow('gitignore write failed');

      // Anti-vacuity: both actors were created before the failure, and the rollback ran
      expect(createActor).toHaveBeenCalledTimes(2);
      expect(initializer.rollback).toHaveBeenCalledTimes(1);
      expect(received).toHaveLength(0);
    });

    it('[PROJ-A1] should propagate a publish failure without rolling back the written init', async () => {
      const { deps, initializer } = createRealDeps();
      const bus = new EventBus();
      const publish = jest.spyOn(bus, 'publish').mockImplementation(() => { throw new Error('malformed event'); });
      deps.eventBus = bus;
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH }))
        .rejects.toThrow('malformed event');

      // Anti-vacuity: the init reached its closing finalize and the stream was called
      expect(initializer.finalize).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalled();
      expect(initializer.rollback).not.toHaveBeenCalled();
    });

    it('[PROJ-A2] should return alreadyInitialized with commitSha when initializer.isInitialized is true', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.isInitialized as jest.Mock).mockResolvedValue(true);
      (initializer.getHeadSha as jest.Mock).mockResolvedValue('sha-from-gitgov-state');
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', stateBranch: DEFAULT_STATE_BRANCH });

      expect(result.alreadyInitialized).toBe(true);
      expect(result.commitSha).toBe('sha-from-gitgov-state');
      expect(initializer.getHeadSha).toHaveBeenCalled();
      expect(initializer.createProjectStructure).not.toHaveBeenCalled();
      expect(initializer.finalize).not.toHaveBeenCalled();
    });

    it('[PROJ-A2] should not carry productAgentId or cycleId when already initialized', async () => {
      // [PROJ-A2] This path creates neither, so the result must not claim them. Runtime
      // already behaved this way; what was missing is the contract saying so — the flat type
      // declared both as required and two `as ProjectInitResult` casts kept the compiler quiet.
      const { deps, initializer } = createRealDeps();
      (initializer.isInitialized as jest.Mock).mockResolvedValue(true);
      (initializer.getHeadSha as jest.Mock).mockResolvedValue('sha-from-gitgov-state');
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      // Anti-vacuity: assert the path was actually taken. Without this, a fresh init would
      // also satisfy the two `not.toHaveProperty` below by never reaching this branch.
      expect(result.alreadyInitialized).toBe(true);
      expect(result).not.toHaveProperty('productAgentId');
      // Not part of A2 any more: cycleId left BOTH variants with the root cycle (PROJ-C5). Kept as
      // a regression control so the retired field cannot come back through this path.
      expect(result).not.toHaveProperty('cycleId');
    });

    // The main SHALL of A2 — "ensure the caller's actor exists and return its actorId" — had
    // no assertion in either A2 test: one passed no login, the other checked only the
    // absent fields. This is the exact bug the spec's own 4.9 origin note describes.
    it('[PROJ-A2] should ensure the caller actor exists and return its actorId on re-init', async () => {
      const { deps, initializer, actorStore } = createRealDeps();
      (initializer.isInitialized as jest.Mock).mockResolvedValue(true);
      (initializer.getHeadSha as jest.Mock).mockResolvedValue('sha-head');
      initializer.finalize = jest.fn().mockResolvedValue('sha-actor');
      const pm = new ProjectModule(deps);

      // Anti-vacuity: the actor is absent before, so `created: true` below proves the
      // re-init path materialised it rather than found it.
      expect(await actorStore.get('human:late-joiner')).toBeNull();

      const result = await pm.initializeProject({ name: 'test-project', login: 'late-joiner', stateBranch: DEFAULT_STATE_BRANCH });

      // Narrow on the discriminant: `created` lives only on the re-init variant.
      if (!result.alreadyInitialized) throw new Error(`expected re-init, got fresh: ${JSON.stringify(result)}`);
      expect(result.actorId).toBe('human:late-joiner');
      expect(result.created).toBe(true);
      // The actor's own commit wins over the head read beforehand (audit 527f: prepared both
      // values and asserted neither)
      expect(result.commitSha).toBe('sha-actor');
      expect(await actorStore.get('human:late-joiner')).not.toBeNull();
      // createProjectStructure must not run: this is re-init, not init.
      expect(initializer.createProjectStructure).not.toHaveBeenCalled();
    });

    // [PROJ-A2] The CLI path: FS finalize returns undefined, so the head read on entry is the sha the
    // caller gets, and a returning actor reports created:false. Every re-init test used a finalize that
    // returned a sha and a new actor, so dropping the fallback and fixing created at true both passed
    // (audit 33ea, M-3 and M-8).
    it('[PROJ-A2] should return created false and the state head sha when the caller actor already exists', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.isInitialized as jest.Mock).mockResolvedValue(true);
      (initializer.getHeadSha as jest.Mock).mockResolvedValue('sha-head');
      initializer.finalize = jest.fn().mockResolvedValue(undefined);
      await deps.identity.createActor({ id: 'human:returning', type: 'human', displayName: 'returning', roles: ['author'] }, 'bootstrap');
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'returning', stateBranch: DEFAULT_STATE_BRANCH });

      if (!result.alreadyInitialized) throw new Error(`expected re-init, got fresh: ${JSON.stringify(result)}`);
      expect(result).toEqual({ alreadyInitialized: true, actorId: 'human:returning', created: false, commitSha: 'sha-head' });
      expect(initializer.finalize).toHaveBeenCalledTimes(1); // anti-vacuity: the resume ran and produced no sha
    });

    it('[PROJ-A3] should use human as default actor type', async () => {
      const { deps } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      expect(result.actorId).toBe('human:dev');
    });
  });

  // 4.2. Actor Creation (PROJ-B1 to B3)
  describe('4.2. Actor Creation (PROJ-B1 to B3)', () => {
    it('[PROJ-B1] should create human actor with admin and developer roles', async () => {
      const { deps, actorStore } = createRealDeps();
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', actorName: 'Camilo', stateBranch: DEFAULT_STATE_BRANCH });

      const stored = await actorStore.get('human:camilo');
      expect(stored).not.toBeNull();
      expect(stored!.payload.type).toBe('human');
      expect(stored!.payload.displayName).toBe('Camilo');
      // The exact list PROJ-B1 declares: `toContain` per role let an extra role through (audit 33ea, L-16)
      expect(stored!.payload.roles).toEqual(['admin', 'author', 'approver:product', 'approver:quality', 'developer']);
    });

    it('[PROJ-B2] should create agent:gitgov-audit with orchestrator role', async () => {
      const { deps, actorStore } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      assertFreshInit(result);
      expect(result.productAgentId).toBe('agent:gitgov-audit');
      const stored = await actorStore.get('agent:gitgov-audit');
      expect(stored).not.toBeNull();
      expect(stored!.payload.type).toBe('agent');
      expect(stored!.payload.roles).toEqual(['orchestrator']);
      expect(stored!.payload.metadata).toEqual(expect.objectContaining({ joinedVia: 'cli' }));
    });

    it('[PROJ-B3] should rollback and include step context when product agent creation fails', async () => {
      const { deps, initializer } = createRealDeps();
      const originalCreateActor = deps.identity.createActor.bind(deps.identity);
      let callCount = 0;
      jest.spyOn(deps.identity, 'createActor').mockImplementation(async (payload, signerId) => {
        callCount++;
        if (callCount === 2) throw new Error('Key generation failed');
        return originalCreateActor(payload, signerId);
      });
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      // The step is a property a consumer can read, not a substring of the message
      expect(err).toBeInstanceOf(ProjectInitError);
      if (!(err instanceof ProjectInitError)) throw new Error('unreachable');
      expect(err.step).toBe('createProductAgent');
      // ...and the message still names it, which is what the CLI prints (init_command EARS-B3)
      expect(err.message).toContain('createProductAgent');
      expect(err.message).toContain('Key generation failed');
      expect(initializer.rollback).toHaveBeenCalled();
      // Anti-vacuity: the human actor went through, so the failure is the product agent's
      expect(callCount).toBe(2);
    });

    // [PROJ-B3] During init addActor does not wrap identity errors, so the original can be of
    // any class. An AddActorError is the case that loses the most when flattened: its message is
    // only `AddActorError(<code>)` and the real reason lives in context.cause.
    it('[PROJ-B3] should keep the original error intact in cause and read an AddActorError cause into the message', async () => {
      const { deps } = createRealDeps();
      const originalCreateActor = deps.identity.createActor.bind(deps.identity);
      const original = new AddActorError('GIT_WRITE_FAILED', { actorId: 'agent:gitgov-audit', cause: 'remote rejected push' });
      let callCount = 0;
      jest.spyOn(deps.identity, 'createActor').mockImplementation(async (payload, signerId) => {
        callCount++;
        if (callCount === 2) throw original;
        return originalCreateActor(payload, signerId);
      });
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ProjectInitError);
      if (!(err instanceof ProjectInitError)) throw new Error('unreachable');
      expect(err.cause).toBe(original);
      if (!(err.cause instanceof AddActorError)) throw new Error('unreachable');
      expect(err.cause.code).toBe('GIT_WRITE_FAILED');
      expect(err.cause.context).toEqual(expect.objectContaining({ cause: 'remote rejected push' }));
      expect(err.message).toContain('remote rejected push');
    });

    it('[PROJ-B3] should expose ProjectInitError from the package root', async () => {
      const { ProjectInitError: ExportedError } = await import('../index');
      const { deps } = createRealDeps();
      let callCount = 0;
      const originalCreateActor = deps.identity.createActor.bind(deps.identity);
      jest.spyOn(deps.identity, 'createActor').mockImplementation(async (payload, signerId) => {
        callCount++;
        if (callCount === 2) throw new Error('Key generation failed');
        return originalCreateActor(payload, signerId);
      });
      const pm = new ProjectModule(deps);

      const thrown = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      expect(ExportedError).toBeDefined();
      expect(thrown).toBeInstanceOf(ExportedError);
    });
  });

  // 4.3. Structure + Config + Finalize (PROJ-C1 to C6)
  describe('4.3. Structure + Config + Finalize (PROJ-C1 to C6)', () => {
    it('[PROJ-C1] should call createProjectStructure before creating actors', async () => {
      const { deps, initializer } = createRealDeps();
      const callOrder: string[] = [];
      (initializer.createProjectStructure as jest.Mock).mockImplementation(() => { callOrder.push('structure'); return Promise.resolve(); });
      jest.spyOn(deps.identity, 'createActor').mockImplementation(async (payload) => {
        callOrder.push('actor');
        return { id: payload.id || 'test', type: payload.type || 'human', displayName: payload.displayName || 'Test', publicKey: 'key', roles: payload.roles || ['author'] };
      });
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      expect(callOrder[0]).toBe('structure');
      expect(callOrder[1]).toBe('actor');
    });

    it('[PROJ-C2] should call writeConfig with protocolVersion, projectId and state.branch', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      // [PROJ-C2] A branch that is NOT the default: with DEFAULT_STATE_BRANCH a hardcoded
      // 'gitgov-state' in the module would pass (audit 1c19, M9).
      await pm.initializeProject({ name: 'Test Project', login: 'dev', saasUrl: 'https://app.gitgov.com', stateBranch: 'team-governance-state' });

      expect(initializer.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: '1.0.0',
          projectId: 'test-project',
          projectName: 'Test Project',
          saasUrl: 'https://app.gitgov.com',
          // state.branch is the third clause of INIT-L1's SHALL: the branch name is persisted
          // so every later command reads it from here. It was written since that EARS existed
          // and no vertex asserted it until 2026-09.
          state: { branch: 'team-governance-state' },
        }),
      );

      // "saasUrl only if the caller passed it": without it the key is absent, not defaulted (audit 33ea, L-17)
      const second = createRealDeps();
      await new ProjectModule(second.deps).initializeProject({ name: 'Test Project', login: 'dev', stateBranch: 'team-governance-state' });
      const written = (second.initializer.writeConfig as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(written).toBeDefined();
      expect(written).not.toHaveProperty('saasUrl');
    });

    it('[PROJ-C5] should not write rootCycle into the config', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'Test Project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      const written = (initializer.writeConfig as jest.Mock).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(written).toBeDefined();
      expect(written).not.toHaveProperty('rootCycle');
    });

    // [PROJ-C5] Until 2026-09-13 this asserted `expect(deps).not.toHaveProperty('backlog')` on the
    // fixture this very test built without one — it could not fail (audit 1c19, H6). The module can
    // only create a cycle through a dependency, so what can be measured is the type and the source,
    // each with its instrument. The runtime observation that no cycle is written lives in the CLI
    // e2e: init_command_e2e (EARS-E5 of init_command) asserts gitgov-state has actors and agents but no cycles.
    it('[PROJ-C5] should not create a root cycle nor require a backlog dependency', () => {
      // tsc: fails if ProjectModuleDeps declares `backlog` again — optional included, because
      // keyof lists optional keys.
      type DeclaresBacklog = 'backlog' extends keyof ProjectModuleDeps ? true : false;
      const declaresBacklog: DeclaresBacklog = false;
      expect(declaresBacklog).toBe(false);
      // tsc: the 'backlog' probe misses the same dependency under another name (audit 527f). The
      // exact key set does not — a new dependency fails here and has to be declared in the spec's §3.4 first.
      type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      const exactDeps: Equals<keyof ProjectModuleDeps,
        'initializer' | 'identity' | 'agentAdapter' | 'defaultAgents' | 'eventBus' | 'engineValidator'> = true;
      expect(exactDeps).toBe(true);

      const source = readFileSync(join(__dirname, 'project_module.ts'), 'utf8');
      // A line comment starts at a line start or after whitespace; `//` inside a string such as
      // 'https://…' does not, so stripping it cannot hide the code that follows (audit 527f).
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
      // Anti-vacuity: stripping comments left the code, so the absence below reads real code
      expect(code).toMatch(/this\.deps\.initializer\.finalize\(\)/);
      // Every mention of a cycle in this file is a comment, so any match is code: createCycle,
      // createRootCycle, a `cycles` dependency, a `rootCycle` key.
      expect(code).not.toMatch(/cycle|\bbacklog\b/i);
    });

    it('[PROJ-C6] should initialize the session with the human actor, not the product agent', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'Test Project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });
      // Narrowed by assertion, not by cast: a cast to Extract hid a run that took the re-init path
      assertFreshInit(result);

      expect(initializer.initializeSession).toHaveBeenCalledWith(result.actorId);
      expect(result.actorId).toBe('human:dev');
      // The distinction is the point: if this regressed to the product agent, every later
      // command would attribute actions to agent:gitgov-audit.
      expect(initializer.initializeSession).not.toHaveBeenCalledWith(result.productAgentId);
    });

    it('[PROJ-C6] should rollback and rethrow when initializeSession fails', async () => {
      const { deps, initializer } = createRealDeps();
      const original = new Error('session write failed');
      (initializer.initializeSession as jest.Mock).mockRejectedValueOnce(original);
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.initializeProject({ name: 'Test Project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      // Rethrown unwrapped (PROJ-D1): same reference. `toThrow('session write failed')` matched by
      // substring, so a wrapper would have passed it (audit 1c19, L7).
      expect(err).toBe(original);

      expect(initializer.rollback).toHaveBeenCalled();
      // Anti-vacuity: finalize must NOT have run, otherwise the failure happened somewhere
      // after the step under test and this would pass for the wrong reason.
      expect(initializer.finalize).not.toHaveBeenCalled();
    });

    it('[PROJ-C3] should call finalize and return commitSha', async () => {
      const { deps, initializer } = createRealDeps();
      // Distinct shas: the fixture's finalize and getHeadSha returned the same value, so a result
      // taken from getHeadSha passed (audit 33ea, M-9)
      (initializer.finalize as jest.Mock).mockResolvedValue('sha-from-finalize');
      (initializer.getHeadSha as jest.Mock).mockResolvedValue('sha-from-head');
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      expect(initializer.finalize).toHaveBeenCalledTimes(1);
      expect(result.commitSha).toBe('sha-from-finalize');
    });

    it('[PROJ-C4] should call setupGitIntegration before the final finalize', async () => {
      const { deps, initializer } = createRealDeps();
      const callOrder: string[] = [];
      (initializer.setupGitIntegration as jest.Mock).mockImplementation(() => { callOrder.push('gitIntegration'); return Promise.resolve(); });
      (initializer.finalize as jest.Mock).mockImplementation(() => { callOrder.push('finalize'); return Promise.resolve('sha'); });
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      // The whole sequence, not two indices. `indexOf` returns -1 for a call that never
      // happened, and -1 < 0 passed — so the old assertions stayed green with
      // setupGitIntegration removed entirely. Exactly one finalize: the init is a single
      // Unit of Work (IDM-G1), and `>= 1` was written around that ambiguity.
      expect(callOrder).toEqual(['gitIntegration', 'finalize']);
    });
  });

  // 4.4. Rollback (PROJ-D1 to D4)
  describe('4.4. Rollback (PROJ-D1 to D4)', () => {
    it('[PROJ-D1] should call initializer.rollback on failure', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('Finalize failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH }))
        .rejects.toThrow('Finalize failed');
      expect(initializer.rollback).toHaveBeenCalled();
    });

    it('[PROJ-D1] should rethrow the original error unwrapped when rollback succeeds', async () => {
      const { deps, initializer } = createRealDeps();
      const original = new Error('Finalize failed');
      (initializer.finalize as jest.Mock).mockRejectedValue(original);
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      // Nothing to add, so nothing wraps it: same reference, not a ProjectInitError
      expect(err).toBe(original);
      expect(err).not.toBeInstanceOf(ProjectInitError);
      expect(initializer.rollback).toHaveBeenCalled();
    });

    // [PROJ-D2] The generic branch: an original that is NOT a ProjectInitError (here the closing
    // finalize) plus a failed rollback — the typical ROLLBACK_FAILED case in SaaS. Until
    // 2026-09-13 this test only checked message and cause, so dropping `rollbackError` from that
    // branch kept every test green (audit 1c19, H4), and its name claimed the original was thrown.
    it('[PROJ-D2] should keep the original message and carry rollbackError when rollback fails', async () => {
      const { deps, initializer } = createRealDeps();
      const original = new Error('Original error');
      (initializer.finalize as jest.Mock).mockRejectedValue(original);
      (initializer.rollback as jest.Mock).mockRejectedValue(new Error('Rollback failed'));
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ProjectInitError);
      if (!(err instanceof ProjectInitError)) throw new Error('unreachable');
      expect(err.message).toBe('Original error');
      expect(err.cause).toBe(original);
      expect(err.rollbackError).toBe('Rollback failed');
      // Not the product agent step: no step is invented for a failure that had none
      expect(err.step).toBeUndefined();
    });

    // [PROJ-D2] The rollback failure is what separates an init that left the state clean from
    // one that left a half-written branch. Until 2026-09-13 an empty catch discarded it, which is
    // why repo_state_machine's ROLLBACK_FAILED has never had an emitter (PSVC-B6).
    it('[PROJ-D2] should carry the rollback failure in rollbackError without losing step or cause', async () => {
      const { deps, initializer } = createRealDeps();
      const originalCreateActor = deps.identity.createActor.bind(deps.identity);
      const original = new Error('Key generation failed');
      let callCount = 0;
      jest.spyOn(deps.identity, 'createActor').mockImplementation(async (payload, signerId) => {
        callCount++;
        if (callCount === 2) throw original;
        return originalCreateActor(payload, signerId);
      });
      (initializer.rollback as jest.Mock).mockRejectedValue(new Error('branch delete refused'));
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ProjectInitError);
      if (!(err instanceof ProjectInitError)) throw new Error('unreachable');
      expect(err.rollbackError).toBe('branch delete refused');
      expect(err.step).toBe('createProductAgent');
      expect(err.cause).toBe(original);
      // "The original's message stays on top" holds on this branch too, not only the generic one (audit 33ea, M-14)
      expect(err.message).toBe('Init failed at step createProductAgent: Key generation failed');
      expect(initializer.rollback).toHaveBeenCalledTimes(1);
    });

    it('[PROJ-D3] should rollback when createProjectStructure fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.createProjectStructure as jest.Mock).mockRejectedValue(new Error('Structure failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH }))
        .rejects.toThrow('Structure failed');
      expect(initializer.rollback).toHaveBeenCalled();
    });

    // D4 is about the finalize INSIDE addActor, and its error envelope. The old test drove
    // initializeProject, whose addActor calls all pass skipFinalize — so the failure it
    // tripped was initializeProject's closing finalize, which is D1's scenario and has its own
    // test. Nothing asserted the AddActorError shape D4 exists to specify.
    it('[PROJ-D4] should wrap a failed finalize in AddActorError GIT_WRITE_FAILED with actorId and cause', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('remote rejected push'));
      const pm = new ProjectModule(deps);

      const err: unknown = await pm.addActor({
        login: 'unlucky', type: 'human', repoId: 'repo-1', joinedVia: 'mcp',
      }).catch(e => e);

      expect(err).toBeInstanceOf(AddActorError);
      if (!(err instanceof AddActorError)) throw new Error('unreachable');
      expect(err.code).toBe('GIT_WRITE_FAILED');
      expect(err.context).toEqual(expect.objectContaining({
        actorId: 'human:unlucky',
        cause: 'remote rejected push',
      }));
      // Anti-vacuity: finalize was the thing that failed — it must have been reached.
      expect(initializer.finalize).toHaveBeenCalledTimes(1);
      // [PROJ-D4] SHALL NOT roll back: this actor joins an existing project
      expect(initializer.rollback).not.toHaveBeenCalled();
    });
  });

  function createMockAgentAdapter(overrides?: Partial<Record<string, jest.Mock>>) {
    return {
      createAgentRecord: jest.fn().mockResolvedValue({}),
      getAgentRecord: jest.fn().mockResolvedValue(null),
      updateAgentRecord: jest.fn().mockResolvedValue({}),
      buildSignedAgentRecord: jest.fn().mockImplementation(async (payload: { id?: string }) => ({
        header: { version: '1.0', type: 'agent', payloadChecksum: 'mock-checksum', signatures: [] },
        payload,
      })),
      ...overrides,
    };
  }

  // 4.5. Specialist Agent Creation (PROJ-E1 to E4)
  describe('4.5. Specialist Agent Creation (PROJ-E1 to E4)', () => {
    const defaultAgents = [
      {
        packageName: '@gitgov/core',
        agentId: 'agent:gitgov-audit',
        displayName: 'GitGov Audit',
        engine: { type: 'local' as const, runtime: 'typescript' },
        purpose: 'orchestration',
        triggers: [{ type: 'webhook' as const, event: 'pull_request.opened' }],
        metadata: { description: 'Product agent' },
      },
      {
        packageName: '@gitgov/agent-security-audit',
        agentId: 'agent:security-audit',
        displayName: 'Security Audit',
        engine: { type: 'local' as const, entrypoint: '@gitgov/agent-security-audit', function: 'runAgent' },
        purpose: 'audit',
        triggers: [] as Array<{ type: 'manual' | 'webhook' | 'scheduled' }>,
        metadata: { target: 'code', outputFormat: 'sarif' },
      },
      {
        packageName: '@gitgov/agent-review-advisor',
        agentId: 'agent:review-advisor',
        displayName: 'Review Advisor',
        engine: { type: 'local' as const, entrypoint: '@gitgov/agent-review-advisor', function: 'runReviewAdvisor' },
        purpose: 'review',
        triggers: [] as Array<{ type: 'manual' | 'webhook' | 'scheduled' }>,
        metadata: { defaultModel: 'anthropic/claude-sonnet-4-6' },
      },
    ];

    it('[PROJ-E1] should create ActorRecord for each specialist agent before AgentRecord', async () => {
      const { deps, actorStore } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = defaultAgents;
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // security-audit specialist should have its own ActorRecord
      const securityActor = await actorStore.get('agent:security-audit');
      expect(securityActor).not.toBeNull();
      expect(securityActor!.payload.type).toBe('agent');
      expect(securityActor!.payload.roles).toEqual(['specialist']);
      expect(securityActor!.payload.metadata).toEqual(expect.objectContaining({ joinedVia: 'cli' }));

      // review-advisor specialist should have its own ActorRecord
      const reviewActor = await actorStore.get('agent:review-advisor');
      expect(reviewActor).not.toBeNull();
      expect(reviewActor!.payload.type).toBe('agent');
      expect(reviewActor!.payload.roles).toEqual(['specialist']);
      expect(reviewActor!.payload.metadata).toEqual(expect.objectContaining({ joinedVia: 'cli' }));

      // AgentRecords built+persisted for all 3 (product + 2 specialists) via the homologated path
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(3);
      expect(deps.initializer.addAgent as jest.Mock).toHaveBeenCalledTimes(3);
    });

    // The "before" clause is the whole point of E1: the AgentRecord is SIGNED with the
    // agent's own key, so the ActorRecord (and its key) must already exist when it is built.
    // The test above proves both ended up present, never the order — a mock adapter needs no
    // key, so building first and creating the actor after would have passed just the same.
    it('[PROJ-E1] should have the specialist ActorRecord in the store when its AgentRecord is built', async () => {
      const { deps, actorStore } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      const actorPresentAtBuild: Record<string, boolean> = {};
      mockAgentAdapter.buildSignedAgentRecord.mockImplementation(async (payload: { id?: string }) => {
        const id = payload.id ?? 'unknown';
        actorPresentAtBuild[id] = (await actorStore.get(id)) !== null;
        return { header: { version: '1.0', type: 'agent', payloadChecksum: 'x', signatures: [] }, payload: { ...payload, id } };
      });
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = defaultAgents;

      await new ProjectModule(deps).initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // Anti-vacuity: the probe ran for both specialists — a missing key here means it never
      // observed anything.
      expect(Object.keys(actorPresentAtBuild).sort()).toEqual(
        expect.arrayContaining(['agent:review-advisor', 'agent:security-audit']),
      );
      expect(actorPresentAtBuild['agent:security-audit']).toBe(true);
      expect(actorPresentAtBuild['agent:review-advisor']).toBe(true);
    });

    it('[PROJ-E2] should skip failed specialist and continue with remaining agents', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = defaultAgents;

      // Make createActor fail for security-audit (2nd specialist) but succeed for others
      const originalCreateActor = deps.identity.createActor.bind(deps.identity);
      jest.spyOn(deps.identity, 'createActor').mockImplementation(async (payload, signerId) => {
        if ((payload as { id?: string }).id === 'agent:security-audit') {
          throw new Error('KeyProvider unavailable');
        }
        return originalCreateActor(payload, signerId);
      });

      const pm = new ProjectModule(deps);
      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // Init succeeded despite security-audit specialist failure
      expect(result.actorId).toBe('human:camilo');
      // Product agent AgentRecord built (createActor skipped for it)
      // security-audit: createActor failed → entire agent skipped (no buildSignedAgentRecord)
      // review-advisor: createActor succeeded → buildSignedAgentRecord called
      // Total: 2 buildSignedAgentRecord calls (product + review-advisor)
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(2);
      // [PROJ-B5] ...and the skipped specialist is not silent: the ActorRecord failure reaches the
      // warnings channel too, not only build/update failures (audit 527f)
      assertFreshInit(result);
      expect(result.agentWarnings).toEqual([expect.stringContaining('agent:security-audit')]);
      expect(result.agentWarnings?.[0]).toContain('KeyProvider unavailable');
      // "The init does NOT roll back on specialist failures" had no assertion (audit 33ea, M-10)
      expect(deps.initializer.rollback).not.toHaveBeenCalled();
    });

    it('[PROJ-E3] should not create duplicate ActorRecord for agent:gitgov-audit', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = defaultAgents;
      const pm = new ProjectModule(deps);

      const identitySpy = jest.spyOn(deps.identity, 'createActor');
      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // createActor called for: human, product agent (PROJ-B2), security-audit, review-advisor
      // NOT called again for agent:gitgov-audit in PROJ-B4 loop (already created in PROJ-B2)
      const agentCalls = identitySpy.mock.calls.filter(
        call => (call[0] as { id?: string }).id?.startsWith('agent:')
      );
      // agent:gitgov-audit (PROJ-B2) + agent:security-audit (PROJ-E1) + agent:review-advisor (PROJ-E1) = 3
      expect(agentCalls).toHaveLength(3);
      expect(agentCalls[0]![0]).toEqual(expect.objectContaining({ id: 'agent:gitgov-audit' }));
      expect(agentCalls[1]![0]).toEqual(expect.objectContaining({ id: 'agent:security-audit' }));
      expect(agentCalls[2]![0]).toEqual(expect.objectContaining({ id: 'agent:review-advisor' }));
    });

    it('[PROJ-E4] should include purpose in AgentRecord metadata', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = defaultAgents;
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // The whole merge — the agent's own metadata plus purpose — not only the purpose key: a record
      // written with `{ purpose }` alone passed `objectContaining` (audit 33ea, M-11)
      const metadataWritten = mockAgentAdapter.buildSignedAgentRecord.mock.calls.map(([payload]) => payload.metadata);
      expect(metadataWritten).toEqual(defaultAgents.map((agent) => ({ ...agent.metadata, purpose: agent.purpose })));
      // Anti-vacuity: the fixture's metadata is not empty, so the merge is observable
      expect(Object.keys(defaultAgents[1]!.metadata).length).toBeGreaterThan(0);

      // The order is contract: a metadata that already carries `purpose` must not override the config's,
      // which is what discovery filters on. No fixture had that key, so `{ purpose, ...metadata }` passed
      // the assertion above (mutant measured on the fix of audit 33ea).
      const stale = createRealDeps();
      const staleAdapter = createMockAgentAdapter();
      stale.deps.agentAdapter = staleAdapter;
      stale.deps.defaultAgents = [{ ...defaultAgents[1]!, metadata: { ...defaultAgents[1]!.metadata, purpose: 'legacy-purpose' } }];
      await new ProjectModule(stale.deps).initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });
      expect(staleAdapter.buildSignedAgentRecord.mock.calls[0]![0].metadata.purpose).toBe(defaultAgents[1]!.purpose);
    });
  });

  // 4.6. Default Agent Registration (PROJ-B4 to B7)
  describe('4.6. Default Agent Registration (PROJ-B4 to B7)', () => {
    it('[PROJ-B4] should build+sign each defaultAgent and persist via initializer.addAgent', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = [{
        packageName: '@gitgov/core',
        agentId: 'agent:gitgov-audit',
        displayName: 'GitGov Audit',
        engine: { type: 'local' as const, runtime: 'typescript' },
        purpose: 'orchestration',
        triggers: [{ type: 'webhook' as const, event: 'pull_request.opened' }],
        metadata: { description: 'Product agent' },
      }];
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(1);
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent:gitgov-audit',
          status: 'active',
          // Runtime-only: the product agent declares no entrypoint (nothing dispatches it).
          engine: expect.objectContaining({ runtime: 'typescript' }),
          // The config's triggers, which nothing asserted (audit 33ea, M-12)
          triggers: [{ type: 'webhook', event: 'pull_request.opened' }],
        }),
      );
      // Signed record persisted via the initializer (homologated FS/GitHub), not the store — and it is
      // the SAME object the adapter signed, not a rebuilt copy that could drop the signature
      expect(deps.initializer.addAgent as jest.Mock).toHaveBeenCalledTimes(1);
      const signed = await mockAgentAdapter.buildSignedAgentRecord.mock.results[0]!.value;
      expect((deps.initializer.addAgent as jest.Mock).mock.calls[0]![0]).toBe(signed);
    });

    // [PROJ-B4] "Skip silently" had no observation: §2.2 claimed the degradation was seen in tests that
    // build deps without an adapter, and none asserted that nothing was registered (audit 33ea, L-8).
    it('[PROJ-B4] should skip agent registration without agentAdapter or with no defaultAgents', async () => {
      const agentConfig: DefaultAgentConfig = { packageName: '@gitgov/core', agentId: 'agent:gitgov-audit', displayName: 'GitGov Audit', engine: { type: 'local' }, purpose: 'orchestration', triggers: [], metadata: {} };

      const withoutAdapter = createRealDeps();
      withoutAdapter.deps.defaultAgents = [agentConfig];
      const first = await new ProjectModule(withoutAdapter.deps).initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });
      assertFreshInit(first);
      expect(withoutAdapter.initializer.addAgent).not.toHaveBeenCalled();
      expect(first.agentWarnings).toBeUndefined();

      const withoutAgents = createRealDeps();
      const adapter = createMockAgentAdapter();
      withoutAgents.deps.agentAdapter = adapter;
      withoutAgents.deps.defaultAgents = [];
      const second = await new ProjectModule(withoutAgents.deps).initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });
      assertFreshInit(second);
      expect(adapter.buildSignedAgentRecord).not.toHaveBeenCalled();
      expect(withoutAgents.initializer.addAgent).not.toHaveBeenCalled();
      // Anti-vacuity: both inits completed
      expect(withoutAdapter.initializer.finalize).toHaveBeenCalledTimes(1);
      expect(withoutAgents.initializer.finalize).toHaveBeenCalledTimes(1);
    });

    it('[PROJ-B5] should continue with remaining agents when one fails', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter({
        buildSignedAgentRecord: jest.fn()
          .mockRejectedValueOnce(new Error('Agent 1 failed'))
          .mockResolvedValueOnce({ header: {}, payload: { id: 'agent:second' } }),
      });
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = [
        { packageName: 'pkg1', agentId: 'agent:gitgov-audit', displayName: 'Agent 1', engine: { type: 'local' as const, entrypoint: 'a', function: 'f' }, purpose: 'orchestration', triggers: [], metadata: {} },
        { packageName: 'pkg2', agentId: 'agent:second', displayName: 'Agent 2', engine: { type: 'local' as const, entrypoint: 'b', function: 'g' }, purpose: 'test', triggers: [], metadata: {} },
      ];
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // Init succeeded despite first agent failure
      expect(result.actorId).toBe('human:camilo');
      // Both agents were attempted
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(2);
      // [PROJ-B5] ...and the failure is visible, not swallowed (audit 1c19, M15)
      assertFreshInit(result);
      expect(result.agentWarnings).toEqual([expect.stringContaining('agent:gitgov-audit')]);
      expect(result.agentWarnings?.[0]).toContain('Agent 1 failed');
      // "The init does not roll back for agent registration failures" (audit 33ea, M-10)
      expect(deps.initializer.rollback).not.toHaveBeenCalled();
    });

    it('[PROJ-B6] should collect agentWarnings when a default agent engine is unresolvable', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      // The validator is INJECTED now — ProjectModule no longer imports it. Importing it
      // dragged `path` and `node:module` into the @gitgov/core bundle (EARS-CI02).
      // [PROJ-B7] It arrives already bound to its root: ProjectModule passes none.
      deps.engineValidator = new FsEngineValidator('/tmp/gitgov-repo-root-fixture');
      // The session-63 phantom-agent case: npm entrypoint not installed anywhere
      deps.defaultAgents = [{
        packageName: '@gitgov/agent-does-not-exist',
        agentId: 'agent:phantom',
        displayName: 'Phantom Agent',
        engine: { type: 'local' as const, entrypoint: '@gitgov/agent-does-not-exist', function: 'runAgent' },
        purpose: 'audit',
        triggers: [],
        metadata: {},
      }];
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // Non-fatal: the agent IS registered (valid declaration)...
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(1);
      // ...but the caller is warned that it won't run (ARUN-M1 validation)
      assertFreshInit(result);
      expect(result.agentWarnings).toBeDefined();
      expect(result.agentWarnings).toHaveLength(1);
      expect(result.agentWarnings![0]).toContain('agent:phantom');
      expect(result.agentWarnings![0]).toContain('not runnable');
      // ...and names the cause the validator gave, not only that there is one (audit 33ea, L-15)
      expect(result.agentWarnings![0]).toContain("entrypoint '@gitgov/agent-does-not-exist' does not resolve");
    });

    it('[PROJ-B6] should skip engine validation when no engineValidator is injected', async () => {
      // `engineValidator` is OPTIONAL, and that has a cost worth pinning down: without it,
      // PROJ-B6 silently stops validating and nothing turns red. This test makes the
      // degraded path explicit instead of leaving it to be discovered.
      //
      // It is also the negative control for the test above: same unresolvable engine, the
      // only difference is the injection. If that assertion ever passed for a reason other
      // than the validator actually running, this one would pass too — and it must not.
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      delete deps.engineValidator; // `exactOptionalPropertyTypes` — absent, not undefined
      deps.defaultAgents = [{
        packageName: '@gitgov/agent-does-not-exist',
        agentId: 'agent:phantom',
        displayName: 'Phantom Agent',
        engine: { type: 'local' as const, entrypoint: '@gitgov/agent-does-not-exist', function: 'runAgent' },
        purpose: 'audit',
        triggers: [],
        metadata: {},
      }];
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // The agent is still registered — validation was never the gate.
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(1);
      // But nobody was warned, because nobody was there to check.
      assertFreshInit(result);
      expect(result.agentWarnings ?? []).toHaveLength(0);
    });

    // [PROJ-B6] ARUN-M1 says validate() never throws; if an implementation does anyway, the agent is
    // still registered, but the error is no longer swallowed without a trace (audit 527f).
    it('[PROJ-B6] should register the agent and warn when the engine validator throws', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter();
      deps.agentAdapter = mockAgentAdapter;
      deps.engineValidator = { validate: jest.fn().mockRejectedValue(new Error('validator exploded')) };
      deps.defaultAgents = [{
        packageName: '@gitgov/core', agentId: 'agent:gitgov-audit', displayName: 'GitGov Audit',
        engine: { type: 'local' as const }, purpose: 'orchestration', triggers: [], metadata: {},
      }];
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      expect(deps.engineValidator.validate).toHaveBeenCalledTimes(1); // anti-vacuity: it did run
      expect(mockAgentAdapter.buildSignedAgentRecord).toHaveBeenCalledTimes(1);
      assertFreshInit(result);
      expect(result.agentWarnings).toEqual([expect.stringContaining('agent:gitgov-audit')]);
      expect(result.agentWarnings?.[0]).toContain('validator exploded');
    });

    // [PROJ-B6] The "not runnable" warning was pushed before registration: an agent whose record then
    // failed to build carried "registered but not runnable" AND "registration failed", and the first was
    // false (audit 33ea, L-7).
    it('[PROJ-B6] should not report an agent as registered when its registration fails', async () => {
      const { deps } = createRealDeps();
      const mockAgentAdapter = createMockAgentAdapter({
        buildSignedAgentRecord: jest.fn().mockRejectedValue(new Error('signing key unavailable')),
      });
      deps.agentAdapter = mockAgentAdapter;
      deps.engineValidator = { validate: jest.fn().mockResolvedValue({ resolvable: false, reason: "entrypoint 'x' does not resolve" }) };
      deps.defaultAgents = [{
        packageName: '@gitgov/core', agentId: 'agent:gitgov-audit', displayName: 'GitGov Audit',
        engine: { type: 'local' as const }, purpose: 'orchestration', triggers: [], metadata: {},
      }];
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      expect(deps.engineValidator.validate).toHaveBeenCalledTimes(1); // anti-vacuity: validation reported it
      assertFreshInit(result);
      expect(result.agentWarnings).toEqual([expect.stringContaining('registration failed')]);
      expect(result.agentWarnings?.[0]).toContain('signing key unavailable');
    });

    it('[PROJ-B7] should call validate with the engine only and never process.cwd', async () => {
      // Pins WHICH root resolves a default agent's entrypoint. During `gitgov init` the DI
      // puts ProjectModule in worktree mode — `initializer` writes to
      // ~/.gitgov/worktrees/<hash> — while this validation ran against process.cwd().
      // Two anchors, one method, and the call-site comment claimed they were the same.
      //
      // The repo root is the correct one: ARUN-M2 resolves npm packages with
      // require.resolve, and node_modules lives in the repo, not in the worktree. cwd
      // happens to be the repo today because init runs there — this test makes that a
      // guarantee instead of a coincidence.
      //
      // Precedent that the distinction bites: AORCH-P4b "should write audit-index.json
      // to worktree, not local project dir".
      //
      // The fix is not "pass the right root" — it is that ProjectModule passes NONE. While
      // the signature was validate(engine, projectRoot), the choice between two
      // indistinguishable strings sat with every caller, and this one knows neither concept.
      // The root is now bound when the validator is built (ARUN-M1), by the DI, which is the
      // only component that holds both (EARS-C16).
      const capturedArgs: unknown[][] = [];
      const { deps } = createRealDeps();
      deps.agentAdapter = createMockAgentAdapter();
      deps.engineValidator = {
        validate: async (...args: unknown[]) => {
          capturedArgs.push(args);
          return { resolvable: true };
        },
      } as unknown as NonNullable<typeof deps.engineValidator>;
      deps.defaultAgents = [{
        packageName: '@gitgov/agent-does-not-exist',
        agentId: 'agent:phantom',
        displayName: 'Phantom Agent',
        engine: { type: 'local' as const, entrypoint: '@gitgov/agent-does-not-exist', function: 'runAgent' },
        purpose: 'audit',
        triggers: [],
        metadata: {},
      }];

      await new ProjectModule(deps).initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // Anti-vacuity: if the validator was never called the assertions below prove nothing.
      expect(capturedArgs).toHaveLength(1);
      // The requirement: ONE argument. A second one would be a root, and there is no root
      // this module could legitimately supply.
      expect(capturedArgs[0]).toHaveLength(1);
      expect(capturedArgs[0]![0]).toEqual(
        expect.objectContaining({ type: 'local', entrypoint: '@gitgov/agent-does-not-exist' })
      );
      // Explicit about the value that used to be passed, so a regression names itself.
      expect(capturedArgs[0]).not.toContain(process.cwd());

      // "NEVER read process.cwd()" covers more than the arguments: cwd read anywhere in the module —
      // a repoId default, a condition — passed the assertions above (audit 33ea, M-16). The source is
      // the only place that absence exists, so the test reads it, without comments (the history of
      // this very requirement quotes `process.cwd()` in them).
      const source = readFileSync(join(__dirname, 'project_module.ts'), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
      expect(code).toMatch(/this\.deps\.engineValidator\.validate\(agentConfig\.engine\)/); // anti-vacuity
      expect(code).not.toMatch(/process\.cwd\s*\(/);
    });
  });

  // 4.7. Agent Config Source of Truth (PROJ-F1 to F2 here; PROJ-F3 is tested in saas-api)
  describe('4.7. Agent Config Source of Truth (PROJ-F1 to F2)', () => {
    // [PROJ-F1] Two halves, two instruments. Until 2026-09-13 this test re-read a literal it had
    // just written, and claimed "the assertion is the type check itself" — but ts-jest runs
    // without diagnostics, and a literal being assignable cannot tell a derived type from an
    // equivalent inline union (audit 1c19, C1).
    //  · Type equality: `triggersMatchAgentRecord` only compiles while both types are identical,
    //    so a drift between DefaultAgentConfig and AgentRecord fails `tsc`, not jest.
    //  · "Never redefine the union inline": TypeScript is structural, so an identical inline copy
    //    passes the equality. The only place that difference exists is the source, so the test
    //    reads it.
    it('[PROJ-F1] should use AgentRecord triggers type not inline union', () => {
      type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      const triggersMatchAgentRecord: Equals<DefaultAgentConfig['triggers'], NonNullable<AgentRecord['triggers']>> = true;
      expect(triggersMatchAgentRecord).toBe(true);

      const source = readFileSync(join(__dirname, 'project_module.types.ts'), 'utf8');
      const typeBody = source.match(/export type DefaultAgentConfig = \{([\s\S]*?)\n\};/)?.[1];
      // Anti-vacuity: the declaration was found, so the assertions below read real text
      expect(typeBody).toBeDefined();
      expect(typeBody).toMatch(/triggers:\s*NonNullable<AgentRecord\['triggers'\]>;/);
      expect(typeBody).not.toMatch(/'manual'|'webhook'|'scheduled'/);
      // `AgentRecord` must be the record type, not a local alias with an inline union (audit 527f)
      expect(source).toMatch(/import type \{[^}]*\bAgentRecord\b[^}]*\} from '\.\.\/record_types';/);
      expect(source).not.toMatch(/\b(type|interface)\s+AgentRecord\b/);
    });

    it('[PROJ-F2] should export DEFAULT_AGENTS with config from agent packages', () => {
      const { DEFAULT_AGENTS } = require('./default_agents');
      expect(DEFAULT_AGENTS).toBeDefined();
      expect(Array.isArray(DEFAULT_AGENTS)).toBe(true);
      expect(DEFAULT_AGENTS.length).toBe(3);

      const product = DEFAULT_AGENTS.find((a: { agentId: string }) => a.agentId === 'agent:gitgov-audit');
      expect(product).toBeDefined();
      expect(product.purpose).toBe('orchestration');
      expect(product.displayName).toBe('GitGov Audit');

      // [PROJ-F2] "Derived from gitgov.agent" is checked against the package.json itself, not
      // against a second hand copy. Until 2026-09-13 this test pinned review-advisor's registry
      // metadata ({ target, outputFormat }), which had never been in its package.json
      // ({ defaultModel }) — and `gitgov agent new` registers from the package.json, so the two
      // paths overwrote each other through GAUD-E1's update (audit 1c19, H5). The product agent
      // is the documented exception: core is its package.
      const specialists = DEFAULT_AGENTS.filter((a: { agentId: string }) => a.agentId !== 'agent:gitgov-audit');
      expect(specialists.map((a: { agentId: string }) => a.agentId)).toEqual(['agent:security-audit', 'agent:review-advisor']);
      for (const agent of specialists) {
        const dir = agent.packageName.replace('@gitgov/agent-', '');
        const pkg = JSON.parse(readFileSync(join(__dirname, '../../../agents', dir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe(agent.packageName);
        const declared = pkg.gitgov.agent;
        expect({ purpose: agent.purpose, function: agent.engine.function, metadata: agent.metadata })
          .toEqual({ purpose: declared.purpose, function: declared.function, metadata: declared.metadata });
        // The whole engine, not just the function: `runtime` is a field no package.json declares,
        // and LocalBackend runs it BEFORE the entrypoint with no handler registered — measured
        // as 0 findings on `gitgov init` → `gitgov audit` over a repo with a live secret.
        expect(agent.engine).toEqual({ type: 'local', entrypoint: agent.packageName, function: declared.function });
      }
    });

    // Formerly tagged PROJ-F3. That EARS is about saas-api's github_backends.ts, which
    // this package cannot load — so this test could only ever check the registry's shape,
    // and did, while its name claimed something about another package. PROJ-F3 now lives
    // in saas-api/project_service.test.ts, where the factory can actually be invoked.
    it('[PROJ-F2] DEFAULT_AGENTS entries should carry every field DefaultAgentConfig requires', () => {
      const { DEFAULT_AGENTS } = require('./default_agents');
      // Anti-vacuity: an empty registry would make the loop below assert nothing (audit 1c19, L9)
      expect(DEFAULT_AGENTS.length).toBe(3);
      for (const agent of DEFAULT_AGENTS) {
        expect(agent).toHaveProperty('packageName');
        expect(agent).toHaveProperty('agentId');
        expect(agent).toHaveProperty('displayName');
        expect(agent).toHaveProperty('engine');
        expect(agent).toHaveProperty('purpose');
        expect(agent).toHaveProperty('triggers');
        expect(agent).toHaveProperty('metadata');
      }
    });
  });

  // gitgov_audit.md 4.5. Agent Config Update (GAUD-E1 to E3)
  // Section number belongs to gitgov_audit.md, not project_module.md: these EARS are the
  // agent's, and §4.8 of this module's spec is Branch Check Caching (PROJ-G1).
  describe('gitgov_audit.md 4.5. Agent Config Update (GAUD-E1 to E3)', () => {
    const singleAgent = [{
      packageName: '@gitgov/core',
      agentId: 'agent:gitgov-audit',
      displayName: 'GitGov Audit',
      engine: { type: 'local' as const, entrypoint: 'v2/index.mjs', function: 'run' },
      purpose: 'orchestration',
      triggers: [{ type: 'webhook' as const, event: 'pull_request.opened' }],
      metadata: { version: '2.0.0' },
    }];

    it('[GAUD-E1] should update AgentRecord when engine config differs from defaultAgent', async () => {
      const { deps } = createRealDeps();
      const existingRecord = {
        id: 'agent:gitgov-audit',
        engine: { type: 'local' as const, entrypoint: 'v1/index.mjs', function: 'run' },
        status: 'active' as const,
        triggers: [{ type: 'webhook' as const, event: 'pull_request.opened' }],
        metadata: { version: '1.0.0', purpose: 'orchestration' },
      };
      const mockAgentAdapter = createMockAgentAdapter({
        getAgentRecord: jest.fn().mockResolvedValue(existingRecord),
      });
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = singleAgent;
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // Engine changed (v1 → v2) → updateAgentRecord called
      expect(mockAgentAdapter.updateAgentRecord).toHaveBeenCalledTimes(1);
      expect(mockAgentAdapter.updateAgentRecord).toHaveBeenCalledWith(
        'agent:gitgov-audit',
        expect.objectContaining({
          engine: expect.objectContaining({ entrypoint: 'v2/index.mjs' }),
        }),
      );
      // createAgentRecord NOT called (agent already exists)
      expect(mockAgentAdapter.createAgentRecord).not.toHaveBeenCalled();
    });

    it('[GAUD-E2] should preserve agent identity and status when updating config', async () => {
      const { deps } = createRealDeps();
      const existingRecord = {
        id: 'agent:gitgov-audit',
        engine: { type: 'local' as const, entrypoint: 'old/path.mjs', function: 'run' },
        status: 'active' as const,
        triggers: [{ type: 'manual' as const }],
        metadata: { version: '1.0.0', purpose: 'orchestration' },
      };
      const mockAgentAdapter = createMockAgentAdapter({
        getAgentRecord: jest.fn().mockResolvedValue(existingRecord),
      });
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = singleAgent;
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      // updateAgentRecord was called with engine + metadata only — NOT id, status, triggers
      const updateCall = mockAgentAdapter.updateAgentRecord.mock.calls[0];
      expect(updateCall[0]).toBe('agent:gitgov-audit');
      const updates = updateCall[1];
      expect(updates).toHaveProperty('engine');
      expect(updates).toHaveProperty('metadata');
      expect(updates).not.toHaveProperty('id');
      expect(updates).not.toHaveProperty('status');
      expect(updates).not.toHaveProperty('triggers');
    });

    it('[GAUD-E3] should continue init when agent config update fails', async () => {
      const { deps } = createRealDeps();
      const existingRecord = {
        id: 'agent:gitgov-audit',
        engine: { type: 'local' as const, entrypoint: 'old.mjs', function: 'run' },
        status: 'active' as const,
        triggers: [],
        metadata: { version: '1.0.0', purpose: 'orchestration' },
      };
      const mockAgentAdapter = createMockAgentAdapter({
        getAgentRecord: jest.fn().mockResolvedValue(existingRecord),
        updateAgentRecord: jest.fn().mockRejectedValue(new Error('Update failed')),
      });
      deps.agentAdapter = mockAgentAdapter;
      deps.defaultAgents = singleAgent;
      const pm = new ProjectModule(deps);

      // Init should NOT throw even though update failed
      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      expect(result.actorId).toBe('human:camilo');
      expect(mockAgentAdapter.updateAgentRecord).toHaveBeenCalledTimes(1);
      // [GAUD-E3] ...and the warning the EARS requires reaches the channel the CLI prints
      assertFreshInit(result);
      expect(result.agentWarnings).toEqual([expect.stringContaining('Update failed')]);
      expect(deps.initializer.rollback).not.toHaveBeenCalled(); // non-fatal means no rollback (audit 33ea, M-10)
    });
  });

  describe('4.9. addActor (PROJ-H1 to H6, incl. H3b)', () => {
    it('[PROJ-H1] should create actor and commit when actor not in store', async () => {
      const { deps, initializer, actorStore } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-join-commit');
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'collab', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      });

      expect(result.created).toBe(true);
      expect(result.actorId).toBe('human:collab');
      expect(result.commitSha).toBe('sha-join-commit');
      // What H1 persists, and the default roles §3.3 declares for a human without `roles` — neither
      // was observed by any test until 2026-09-13
      const stored = await actorStore.get('human:collab');
      expect(stored?.payload.metadata).toEqual(expect.objectContaining({ joinedVia: 'cli', joinedAt: expect.any(String) }));
      expect(stored?.payload.roles).toEqual(['author', 'developer']);
    });

    // [PROJ-H1] The IF branch: no test captured the result of an addActor with skipFinalize, so a
    // commitSha taken from anywhere else passed (audit 33ea, L-20).
    it('[PROJ-H1] should skip the commit and return no commitSha when skipFinalize is set', async () => {
      const { deps, initializer, actorStore } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'staged-only', type: 'human', repoId: 'repo-1', joinedVia: 'cli', skipFinalize: true,
      });

      expect(result).toEqual({ actorId: 'human:staged-only', created: true });
      expect(initializer.finalize).not.toHaveBeenCalled();
      expect(initializer.getHeadSha).not.toHaveBeenCalled();
      expect(await actorStore.get('human:staged-only')).not.toBeNull(); // anti-vacuity: it was created
    });

    it('[PROJ-H2] should return created false when actor already exists', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-first');
      const createActor = jest.spyOn(deps.identity, 'createActor');
      const pm = new ProjectModule(deps);

      await pm.addActor({
        login: 'collab', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      });

      const result = await pm.addActor({
        login: 'collab', type: 'human', repoId: 'repo-1', joinedVia: 'saas-oauth',
      });

      expect(result.created).toBe(false);
      expect(result.actorId).toBe('human:collab');
      // "Without duplicating": createActor overwrites silently and mints a new key, so re-running it on
      // an existing actor would rotate the key unseen (audit 33ea, L-19)
      expect(createActor).toHaveBeenCalledTimes(1);
    });

    it('[PROJ-H3] should throw GIT_WRITE_FAILED when finalize fails, then resume commit on retry', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn()
        .mockRejectedValueOnce(new Error('GitHub API timeout'))
        .mockResolvedValueOnce('sha-retry-commit');
      const pm = new ProjectModule(deps);

      await expect(pm.addActor({
        login: 'retry-user', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      })).rejects.toMatchObject({ code: 'GIT_WRITE_FAILED' });

      expect(initializer.finalize).toHaveBeenCalledTimes(1);

      // Retry — actor exists in store, finalize is re-called to complete the git write
      const result = await pm.addActor({
        login: 'retry-user', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      });

      expect(result.created).toBe(false);
      expect(result.actorId).toBe('human:retry-user');
      expect(initializer.finalize).toHaveBeenCalledTimes(2);
      expect(result.commitSha).toBe('sha-retry-commit');
    });

    // [PROJ-H3] The resume path swallows a second finalize failure: the actor already exists, so
    // addActor returns created:false and the missing commitSha is the signal. The code always did
    // this; PROJ-D4, §3.2 and the D1 note claimed it threw (audit 527f, H-1).
    it('[PROJ-H3] should not throw on the resume path when finalize fails again, and return no commitSha', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn()
        .mockRejectedValueOnce(new Error('GitHub API timeout'))
        .mockRejectedValueOnce(new Error('GitHub API timeout again'));
      const pm = new ProjectModule(deps);

      await expect(pm.addActor({
        login: 'flaky-user', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      })).rejects.toMatchObject({ code: 'GIT_WRITE_FAILED' });

      const result = await pm.addActor({
        login: 'flaky-user', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      });

      expect(initializer.finalize).toHaveBeenCalledTimes(2); // anti-vacuity: the resume did retry
      expect(result).toEqual({ actorId: 'human:flaky-user', created: false });
      expect(initializer.rollback).not.toHaveBeenCalled();
    });

    it('[PROJ-H3b] should succeed when store already committed and finalize has nothing to commit', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn()
        .mockRejectedValue(new Error('Nothing to commit: staging buffer is empty'));
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'store-committed', type: 'human', repoId: 'repo-1', joinedVia: 'saas-oauth',
      });

      expect(result.actorId).toBe('human:store-committed');
      expect(result.created).toBe(true);
    });

    it('[PROJ-H3b] should poll getActor before concluding the actor is absent', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn()
        .mockRejectedValue(new Error('Nothing to commit: staging buffer is empty'));

      // The store is backed by an eventually consistent source that does not see its own
      // write immediately: null, null, then the actor. Measured in production (OB-I2,
      // 2026-08-14): the commit landed 1.4s BEFORE the guard read null and threw.
      // A single read concludes GIT_WRITE_FAILED on an actor that IS on the branch.
      const realGetActor = deps.identity.getActor.bind(deps.identity);
      let getActorCalls = 0;
      deps.identity.getActor = jest.fn(async (id: string) => {
        getActorCalls++;
        return getActorCalls <= 2 ? null : realGetActor(id);
      });
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'late-visible', type: 'human', repoId: 'repo-1', joinedVia: 'saas-oauth',
      });

      expect(result.actorId).toBe('human:late-visible');
      // Anti-vacuity: a green here would be meaningless if the guard had found the actor
      // on the first read — the polling is only exercised when it had to retry.
      // Calibration: addActor reads getActor once unconditionally (the existence check at
      // the top) and the guard reads once more before it ever polls, so a guard WITHOUT a
      // poll loop already produces 2 calls. A third call proves the retry happened — and
      // EXACTLY three proves the poll stopped as soon as the actor appeared: `> 2` let a
      // poll that ignored the found actor run to its deadline, 253 ms → 5 s (audit 33ea, M-15).
      expect(getActorCalls).toBe(3);
    });

    it('[PROJ-H3b] should throw GIT_WRITE_FAILED when finalize fails and actor not in store', async () => {
      const { deps, initializer } = createRealDeps();
      // finalize fails with "Nothing to commit" BUT getActor returns null (store didn't write either)
      initializer.finalize = jest.fn()
        .mockRejectedValue(new Error('Nothing to commit: staging buffer is empty'));
      const getActor = jest.fn().mockResolvedValue(null);
      deps.identity.getActor = getActor;
      const pm = new ProjectModule(deps);

      // The actor never shows up: getActor is null for the whole deadline
      await expect(pm.addActor({
        login: 'ghost-actor', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      })).rejects.toMatchObject({ code: 'GIT_WRITE_FAILED' });
      // The `else` branch throws the same code without polling, so the code alone does not prove
      // this went through the guard. More than two reads does: existence check + guard read + poll
      // (audit 1c19, L8).
      expect(getActor.mock.calls.length).toBeGreaterThan(2);
      // [PROJ-D4] addActor never rolls back, on this branch included (audit 527f).
      expect(initializer.rollback).not.toHaveBeenCalled();
    });

    // [PROJ-H4] The event carries the producer's union, not a widened string (audit 1c19, H7).
    // `tsc` is the instrument: the probe only compiles while both types are identical.
    it('[PROJ-H4] should type the event joinedVia with the same union as AddActorInput', () => {
      type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      const sameUnion: Equals<ActorJoinedEvent['payload']['joinedVia'], AddActorInput['joinedVia']> = true;
      expect(sameUnion).toBe(true);
    });

    // [PROJ-H4] "SHALL be typed as IEventStream, SHALL NOT be a structural shape of its own": the
    // original defect was exactly such a shape (`{ emit?: ... }`), and the C5 probe only checks key
    // names, so `eventBus?: { publish(e: ActorJoinedEvent): void }` compiled (audit 33ea, M-13).
    it('[PROJ-H4] should type the eventBus dependency as IEventStream', () => {
      type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
      const isEventStream: Equals<NonNullable<ProjectModuleDeps['eventBus']>, IEventStream> = true;
      expect(isEventStream).toBe(true);
    });

    // Uses the REAL EventBus and a real subscriber, not a hand-shaped stub. The previous
    // version asserted against `{ emit: jest.fn() }` — a shape no implementation in the
    // codebase has — so it stayed green while production emitted nothing at all.
    it('[PROJ-H4] should publish project.actor.joined with wasCreated true when the actor is minted', async () => {
      const received: ActorJoinedEvent[] = [];
      const bus = new EventBus();
      bus.subscribe<ActorJoinedEvent>('project.actor.joined', (e) => { received.push(e); });

      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-event');
      deps.eventBus = bus;
      const pm = new ProjectModule(deps);

      await pm.addActor({
        login: 'event-user', type: 'human', repoId: 'repo-42', joinedVia: 'mcp',
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.source).toBe('project_module');
      expect(received[0]!.payload).toEqual({
        actorId: 'human:event-user',
        repoId: 'repo-42',
        joinedVia: 'mcp',
        wasCreated: true,
      });
    });

    // The `wasCreated: false` branch is the reason the field exists, and nothing covered it.
    it('[PROJ-H4] should publish project.actor.joined with wasCreated false when the actor already exists', async () => {
      const received: ActorJoinedEvent[] = [];
      const bus = new EventBus();
      bus.subscribe<ActorJoinedEvent>('project.actor.joined', (e) => { received.push(e); });

      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-event');
      deps.eventBus = bus;
      const pm = new ProjectModule(deps);

      await pm.addActor({ login: 'twice', type: 'human', repoId: 'repo-42', joinedVia: 'mcp' });
      received.length = 0; // drop the creation event; this test is about the second join

      // The FS backend: finalize returns no sha. The actor is in the store, so it is announced
      // anyway; a publish gated on commitSha silenced every CLI confirmation (audit 33ea, L-4)
      initializer.finalize = jest.fn().mockResolvedValue(undefined);
      await pm.addActor({ login: 'twice', type: 'human', repoId: 'repo-42', joinedVia: 'mcp' });

      expect(received).toHaveLength(1);
      expect(received[0]!.payload).toEqual(expect.objectContaining({
        actorId: 'human:twice',
        wasCreated: false,
      }));
    });

    it('[PROJ-H4] should not publish when skipFinalize is set, leaving it to the caller that closes the unit of work', async () => {
      const received: ActorJoinedEvent[] = [];
      const bus = new EventBus();
      bus.subscribe<ActorJoinedEvent>('project.actor.joined', (e) => { received.push(e); });
      const { deps, actorStore, initializer } = createRealDeps();
      deps.eventBus = bus;
      const pm = new ProjectModule(deps);

      await pm.addActor({ login: 'staged', type: 'human', repoId: 'repo-42', joinedVia: 'mcp', skipFinalize: true });
      // Both branches: the actor now exists, so the second call takes the wasCreated:false path
      await pm.addActor({ login: 'staged', type: 'human', repoId: 'repo-42', joinedVia: 'mcp', skipFinalize: true });

      // Anti-vacuity: the actor was written, the commit was left to the caller
      expect(await actorStore.get('human:staged')).not.toBeNull();
      expect(initializer.finalize).not.toHaveBeenCalled();
      expect(received).toHaveLength(0);
    });

    // Isolation is structural — one ProjectModule is bound to one repo's initializer and
    // store — so it can only be observed with two of them. The old test had one instance,
    // never looked at the repoId it passed, and asserted the same thing as PROJ-H1.
    it('[PROJ-H5] should write only to the repo where called', async () => {
      const repoA = createRealDeps();
      const repoB = createRealDeps();
      repoA.initializer.finalize = jest.fn().mockResolvedValue('sha-a');
      repoB.initializer.finalize = jest.fn().mockResolvedValue('sha-b');

      await new ProjectModule(repoA.deps).addActor({
        login: 'lazy-user', type: 'human', repoId: 'repo-a', joinedVia: 'saas-webhook',
      });

      // Written where called…
      expect(await repoA.actorStore.get('human:lazy-user')).not.toBeNull();
      expect(repoA.initializer.finalize).toHaveBeenCalledTimes(1);
      // …and nowhere else. Anti-vacuity: repoB's store is a real MemoryRecordStore that
      // would have the row if anything had crossed over.
      expect(await repoB.actorStore.get('human:lazy-user')).toBeNull();
      expect(repoB.initializer.finalize).not.toHaveBeenCalled();
    });

    // [PROJ-H6] The allow branch: every test passed an authzCheck that denied, so an addActor that denied
    // whenever a check was present passed the file (audit 33ea, L-18).
    it('[PROJ-H6] should create the actor when authzCheck returns true', async () => {
      const { deps, actorStore } = createRealDeps();
      const authzCheck = jest.fn().mockResolvedValue(true);
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'allowed-user', type: 'human', repoId: 'repo-1', joinedVia: 'mcp', authzCheck,
      });

      expect(authzCheck).toHaveBeenCalledTimes(1); // anti-vacuity: the check did run
      expect(result).toEqual(expect.objectContaining({ actorId: 'human:allowed-user', created: true }));
      expect(await actorStore.get('human:allowed-user')).not.toBeNull();
    });

    it('[PROJ-H6] should throw UNAUTHORIZED when authzCheck returns false', async () => {
      const { deps, actorStore, initializer } = createRealDeps();
      const bus = new EventBus();
      const received: ActorJoinedEvent[] = [];
      bus.subscribe<ActorJoinedEvent>('project.actor.joined', (e) => { received.push(e); });
      const createActor = jest.spyOn(deps.identity, 'createActor');
      const authzCheck = jest.fn().mockResolvedValue(false);
      const pm = new ProjectModule({ ...deps, eventBus: bus });

      await expect(pm.addActor({
        login: 'blocked-user', type: 'agent', repoId: 'repo-1', joinedVia: 'mcp', authzCheck,
      })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        // The context PROJ-H6 declares — `{ login, type, reason }` —, not only the login (audit 33ea, L-18)
        context: { login: 'blocked-user', type: 'agent', reason: 'authz check denied' },
      });

      // [PROJ-H6] The prohibitions, which were not asserted until 2026-09-13 (audit 1c19, M10):
      // no actor created, no event published, no state change.
      expect(authzCheck).toHaveBeenCalledTimes(1); // anti-vacuity: the check did run
      expect(createActor).not.toHaveBeenCalled();
      expect(await actorStore.get('agent:blocked-user')).toBeNull();
      expect(received).toHaveLength(0);
      expect(initializer.finalize).not.toHaveBeenCalled();
    });

    // PROJ-D4 and PROJ-H6 require callers to catch AddActorError, and so does the re-init path of
    // PROJ-A2, where addActor runs outside the try (the PROJ-D1 note: a fresh init never lets one
    // out, it arrives wrapped in ProjectInitError's cause). Every other
    // test in this file imports it from './project_module.types', the internal path, so a
    // consumer's view was never exercised — and the root barrel did not re-export the class
    // at all. `toMatchObject` above passes on a plain object, so it would not have caught it.
    // This asserts the reachable-from-the-package view: instanceof, not a message match.
    it('[PROJ-H6] should expose AddActorError from the package root so callers can use instanceof', async () => {
      const { AddActorError: ExportedError } = await import('../index');
      const { deps } = createRealDeps();
      const pm = new ProjectModule(deps);

      const thrown = await pm.addActor({
        login: 'blocked-user', type: 'agent', repoId: 'repo-1', joinedVia: 'mcp',
        authzCheck: async () => false,
      }).catch((err: unknown) => err);

      expect(ExportedError).toBeDefined();
      expect(thrown).toBeInstanceOf(ExportedError);
    });
  });
});
