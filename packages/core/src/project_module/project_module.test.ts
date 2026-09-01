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
 * - BacklogAdapter: mock of Pick<IBacklogAdapter, 'createCycle'> (interface subset)
 */

import { ProjectModule } from './project_module';
import type { ProjectModuleDeps, ProjectInitResult, ProjectInitialized } from './project_module.types';
import { EventBus } from '../event_bus/event_bus';
import type { ActorJoinedEvent } from '../event_bus/types';
// Node-only implementation of IEngineValidator. A test file may import from the fs
// subpath even though ProjectModule itself must not: EARS-CI02 measures dist/src/index.js,
// and tests never reach the bundle.
import { FsEngineValidator } from '../agent_runner/fs/fs_engine_validator';
import { DEFAULT_STATE_BRANCH } from '../sync_state/fs_worktree/fs_worktree_sync_state.types';
import type { IProjectInitializer } from '../project_initializer';
import { IdentityModule } from '../identity/identity_module';
import { MemoryRecordStore } from '../record_store/memory/memory_record_store';
import { MockKeyProvider } from '../key_provider/memory/mock_key_provider';
import type { GitGovActorRecord } from '../record_types';

/**
 * Narrows a `ProjectInitResult` to the fresh-init variant, and fails loudly when the run
 * took the idempotent path instead.
 *
 * The narrowing is the point: `productAgentId`, `cycleId` and `agentWarnings` exist only on
 * `ProjectInitialized`, so reading them off the union would be reading fields the re-init
 * path never produces. It doubles as an anti-vacuity control — a test that silently landed
 * on `alreadyInitialized` used to read `undefined` and assert against it.
 */
function assertFreshInit(result: ProjectInitResult): asserts result is ProjectInitialized {
  if (result.alreadyInitialized) {
    throw new Error(`expected a fresh init, got alreadyInitialized: ${JSON.stringify(result)}`);
  }
}

const mockCycle = {
  id: '1234567890-cycle-root',
  title: 'root',
  status: 'planning' as const,
  taskIds: [],
};

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

function createMockBacklog() {
  return {
    createCycle: jest.fn().mockResolvedValue(mockCycle),
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
  const backlog = createMockBacklog();

  const deps: ProjectModuleDeps = {
    initializer,
    identity,
    backlog,
  };

  return { deps, actorStore, keyProvider, initializer, backlog };
}

describe('ProjectModule', () => {
  // 4.1. Init Flow (PROJ-A1 to A3)
  describe('4.1. Init Flow (PROJ-A1 to A3)', () => {
    it('[PROJ-A1] should run full init flow via initializer', async () => {
      const { deps, actorStore, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo', stateBranch: DEFAULT_STATE_BRANCH });

      expect(initializer.createProjectStructure).toHaveBeenCalled();
      expect(initializer.writeConfig).toHaveBeenCalled();
      expect(initializer.setupGitIntegration).toHaveBeenCalled();
      expect(initializer.finalize).toHaveBeenCalled();
      assertFreshInit(result);
      expect(result.actorId).toBe('human:camilo');
      expect(result.productAgentId).toBe('agent:gitgov-audit');
      expect(result.cycleId).toBe('1234567890-cycle-root');

      const humanActor = await actorStore.get('human:camilo');
      expect(humanActor).not.toBeNull();
      const productAgent = await actorStore.get('agent:gitgov-audit');
      expect(productAgent).not.toBeNull();
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
      expect(result).not.toHaveProperty('cycleId');
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
      expect(stored!.payload.roles).toContain('admin');
      expect(stored!.payload.roles).toContain('author');
      expect(stored!.payload.roles).toContain('developer');
      expect(stored!.payload.roles).toContain('approver:product');
      expect(stored!.payload.roles).toContain('approver:quality');
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

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH }))
        .rejects.toThrow('createProductAgent');
      expect(initializer.rollback).toHaveBeenCalled();
    });
  });

  // 4.3. Structure + Config + Finalize (PROJ-C1 to C4)
  describe('4.3. Structure + Config + Finalize (PROJ-C1 to C4)', () => {
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

    it('[PROJ-C2] should call writeConfig with protocolVersion, projectId, rootCycle', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'Test Project', login: 'dev', saasUrl: 'https://app.gitgov.com', stateBranch: DEFAULT_STATE_BRANCH });

      expect(initializer.writeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          protocolVersion: '1.0.0',
          projectId: 'test-project',
          projectName: 'Test Project',
          rootCycle: '1234567890-cycle-root',
          saasUrl: 'https://app.gitgov.com',
        }),
      );
    });

    it('[PROJ-C2b] should create root cycle with a deterministic id (not Date.now-based)', async () => {
      const { deps, backlog } = createRealDeps();
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'Test Project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      // The root cycle ID must be the deterministic sentinel so two inits of the same repo
      // produce a byte-identical config.json (no gitgov-state divergence).
      expect(backlog.createCycle).toHaveBeenCalledWith(
        expect.objectContaining({ id: '0000000000-cycle-root', title: 'root' }),
        expect.any(String),
      );
    });

    it('[PROJ-C2b] two inits request the same deterministic root cycle id', async () => {
      const a = createRealDeps();
      const b = createRealDeps();
      await new ProjectModule(a.deps).initializeProject({ name: 'Same Repo', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });
      await new ProjectModule(b.deps).initializeProject({ name: 'Same Repo', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      const idA = (a.backlog.createCycle.mock.calls[0][0] as { id: string }).id;
      const idB = (b.backlog.createCycle.mock.calls[0][0] as { id: string }).id;
      expect(idA).toBe(idB); // deterministic — no timestamp drift between inits
    });

    it('[PROJ-C3] should call finalize and return commitSha', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      expect(initializer.finalize).toHaveBeenCalled();
      expect(result.commitSha).toBe('abc123def456abc123def456abc123def456abc1');
    });

    it('[PROJ-C4] should call setupGitIntegration before the final finalize', async () => {
      const { deps, initializer } = createRealDeps();
      const callOrder: string[] = [];
      (initializer.setupGitIntegration as jest.Mock).mockImplementation(() => { callOrder.push('gitIntegration'); return Promise.resolve(); });
      (initializer.finalize as jest.Mock).mockImplementation(() => { callOrder.push('finalize'); return Promise.resolve('sha'); });
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH });

      const gitIdx = callOrder.indexOf('gitIntegration');
      const lastFinIdx = callOrder.lastIndexOf('finalize');
      expect(gitIdx).toBeLessThan(lastFinIdx);
      expect(callOrder.filter(c => c === 'finalize').length).toBeGreaterThanOrEqual(1);
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

    it('[PROJ-D2] should throw original error even if rollback fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('Original error'));
      (initializer.rollback as jest.Mock).mockRejectedValue(new Error('Rollback failed'));
      const pm = new ProjectModule(deps);

      const err = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH }).catch(e => e);
      expect(err.message).toBe('Original error');
    });

    it('[PROJ-D3] should rollback when createProjectStructure fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.createProjectStructure as jest.Mock).mockRejectedValue(new Error('Structure failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH }))
        .rejects.toThrow('Structure failed');
      expect(initializer.rollback).toHaveBeenCalled();
    });

    it('[PROJ-D4] should rollback when finalize fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('Commit failed'));
      const pm = new ProjectModule(deps);

      const err = await pm.initializeProject({ name: 'test-project', login: 'dev', stateBranch: DEFAULT_STATE_BRANCH }).catch(e => e);
      expect(err.message).toBe('Commit failed');
      expect(initializer.rollback).toHaveBeenCalled();
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
        metadata: { target: 'findings', outputFormat: 'feedback-review' },
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

      const orchestrationCall = mockAgentAdapter.buildSignedAgentRecord.mock.calls[0][0];
      expect(orchestrationCall.metadata).toEqual(expect.objectContaining({ purpose: 'orchestration' }));

      const auditCall = mockAgentAdapter.buildSignedAgentRecord.mock.calls[1][0];
      expect(auditCall.metadata).toEqual(expect.objectContaining({ purpose: 'audit' }));

      const reviewCall = mockAgentAdapter.buildSignedAgentRecord.mock.calls[2][0];
      expect(reviewCall.metadata).toEqual(expect.objectContaining({ purpose: 'review' }));
    });
  });

  // 4.6. Default Agent Registration (PROJ-B4 to B5)
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
        }),
      );
      // Signed record persisted via the initializer (homologated FS/GitHub), not the store
      expect(deps.initializer.addAgent as jest.Mock).toHaveBeenCalledTimes(1);
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
      // ...but the caller is warned that it won't run (EARS-M1 validation)
      assertFreshInit(result);
      expect(result.agentWarnings).toBeDefined();
      expect(result.agentWarnings).toHaveLength(1);
      expect(result.agentWarnings![0]).toContain('agent:phantom');
      expect(result.agentWarnings![0]).toContain('not runnable');
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
      // Precedent that the distinction bites: [AORCH-P4b] "should write audit-index.json
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
  });

  // 4.7. Agent Config Source of Truth (PROJ-F1 to F3)
  describe('4.7. Agent Config Source of Truth (PROJ-F1 to F3)', () => {
    it('[PROJ-F1] should use AgentRecord triggers type not inline union', () => {
      // Type-level test: DefaultAgentConfig.triggers must accept AgentRecord trigger values.
      // If the type is wrong, this file won't compile — the assertion is the type check itself.
      const config: import('./project_module.types').DefaultAgentConfig = {
        packageName: 'test',
        agentId: 'agent:test',
        displayName: 'Test',
        engine: { type: 'local', entrypoint: 'x', function: 'f' },
        purpose: 'test',
        triggers: [{ type: 'webhook', event: 'push' }, { type: 'scheduled', cron: '* * * * *' }],
        metadata: {},
      };
      // The triggers accept the same union as AgentRecord — 'manual' | 'webhook' | 'scheduled'
      expect(config.triggers[0]!.type).toBe('webhook');
      expect(config.triggers[1]!.type).toBe('scheduled');
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

      const security = DEFAULT_AGENTS.find((a: { agentId: string }) => a.agentId === 'agent:security-audit');
      expect(security).toBeDefined();
      expect(security.purpose).toBe('audit');
      expect(security.metadata.target).toBe('code');

      const review = DEFAULT_AGENTS.find((a: { agentId: string }) => a.agentId === 'agent:review-advisor');
      expect(review).toBeDefined();
      expect(review.purpose).toBe('review');
      expect(review.metadata.outputFormat).toBe('feedback-review');
    });

    it('[PROJ-F3] github_backends should use DEFAULT_AGENTS from core', () => {
      // Structural test: DEFAULT_AGENTS has the same shape as what github_backends needs.
      // The real assertion is in github_backends.ts where `defaultAgents: DEFAULT_AGENTS` compiles.
      const { DEFAULT_AGENTS } = require('./default_agents');
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

  // 4.8. Agent Config Update (GAUD-E1 to E3)
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
    });
  });

  describe('4.9. addActor (PROJ-H1 to H6, incl. H3b)', () => {
    it('[PROJ-H1] should create actor and commit when actor not in store', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-join-commit');
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'collab', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      });

      expect(result.created).toBe(true);
      expect(result.actorId).toBe('human:collab');
      expect(result.commitSha).toBe('sha-join-commit');
    });

    it('[PROJ-H2] should return created false when actor already exists', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-first');
      const pm = new ProjectModule(deps);

      await pm.addActor({
        login: 'collab', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      });

      const result = await pm.addActor({
        login: 'collab', type: 'human', repoId: 'repo-1', joinedVia: 'saas-oauth',
      });

      expect(result.created).toBe(false);
      expect(result.actorId).toBe('human:collab');
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
      expect(getActorCalls).toBeGreaterThan(1);
    });

    it('[PROJ-H3b] should throw GIT_WRITE_FAILED when finalize fails and actor not in store', async () => {
      const { deps, initializer } = createRealDeps();
      // finalize fails with "Nothing to commit" BUT getActor returns null (store didn't write either)
      initializer.finalize = jest.fn()
        .mockRejectedValue(new Error('Nothing to commit: staging buffer is empty'));
      deps.identity.getActor = jest.fn().mockResolvedValue(null);
      const pm = new ProjectModule(deps);

      // First create the actor so it's in the store
      await expect(pm.addActor({
        login: 'ghost-actor', type: 'human', repoId: 'repo-1', joinedVia: 'cli',
      })).rejects.toMatchObject({ code: 'GIT_WRITE_FAILED' });
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

      await pm.addActor({ login: 'twice', type: 'human', repoId: 'repo-42', joinedVia: 'mcp' });

      expect(received).toHaveLength(1);
      expect(received[0]!.payload).toEqual(expect.objectContaining({
        actorId: 'human:twice',
        wasCreated: false,
      }));
    });

    it('[PROJ-H5] should write only to the repo where called', async () => {
      const { deps, initializer } = createRealDeps();
      initializer.finalize = jest.fn().mockResolvedValue('sha-lazy');
      const pm = new ProjectModule(deps);

      const result = await pm.addActor({
        login: 'lazy-user', type: 'human', repoId: 'repo-specific', joinedVia: 'saas-webhook',
      });

      expect(result.created).toBe(true);
      expect(initializer.finalize).toHaveBeenCalled();
    });

    it('[PROJ-H6] should throw UNAUTHORIZED when authzCheck returns false', async () => {
      const { deps } = createRealDeps();
      const pm = new ProjectModule(deps);

      await expect(pm.addActor({
        login: 'blocked-user', type: 'agent', repoId: 'repo-1', joinedVia: 'mcp',
        authzCheck: async () => false,
      })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        context: expect.objectContaining({ login: 'blocked-user' }),
      });
    });
  });
});
