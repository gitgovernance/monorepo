/**
 * ProjectModule Tests
 *
 * All EARS prefixes map to project_module.md
 *
 * Uses real instances with mock I/O:
 * - IdentityModule: real instance with MemoryRecordStore + MockKeyProvider
 * - IProjectInitializer: mock of interface (pure interface — acceptable per CLAUDE.md)
 * - BacklogAdapter: mock of Pick<IBacklogAdapter, 'createCycle'> (interface subset)
 */

import { ProjectModule } from './project_module';
import type { ProjectModuleDeps } from './project_module.types';
import type { IProjectInitializer } from '../project_initializer';
import { IdentityModule } from '../identity/identity_module';
import { MemoryRecordStore } from '../record_store/memory/memory_record_store';
import { MockKeyProvider } from '../key_provider/memory/mock_key_provider';
import type { GitGovActorRecord } from '../record_types';

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
    copyAgentPrompt: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    validateEnvironment: jest.fn().mockResolvedValue({ isValid: true, isGitRepo: true, hasWritePermissions: true, isAlreadyInitialized: false, warnings: [], suggestions: [] }),
    readFile: jest.fn().mockResolvedValue(''),
    getActorPath: jest.fn().mockReturnValue('.gitgov/actors/test.json'),
    finalize: jest.fn().mockResolvedValue('abc123def456abc123def456abc123def456abc1'),
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

  return {
    deps: {
      initializer,
      identity,
      backlog,
    } satisfies ProjectModuleDeps,
    actorStore,
    keyProvider,
    initializer,
    backlog,
  };
}

describe('ProjectModule', () => {
  // 4.1. Init Flow (PROJ-A1 to A3)
  describe('4.1. Init Flow (PROJ-A1 to A3)', () => {
    it('[PROJ-A1] should run full init flow via initializer', async () => {
      const { deps, actorStore, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo' });

      expect(initializer.createProjectStructure).toHaveBeenCalled();
      expect(initializer.writeConfig).toHaveBeenCalled();
      expect(initializer.setupGitIntegration).toHaveBeenCalled();
      expect(initializer.finalize).toHaveBeenCalled();
      expect(result.actorId).toBe('human:camilo');
      expect(result.productAgentId).toBe('agent:gitgov-audit');
      expect(result.cycleId).toBe('1234567890-cycle-root');

      const humanActor = await actorStore.get('human:camilo');
      expect(humanActor).not.toBeNull();
      const productAgent = await actorStore.get('agent:gitgov-audit');
      expect(productAgent).not.toBeNull();
    });

    it('[PROJ-A2] should return alreadyInitialized when initializer.isInitialized is true', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.isInitialized as jest.Mock).mockResolvedValue(true);
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project' });

      expect(result.alreadyInitialized).toBe(true);
      expect(initializer.createProjectStructure).not.toHaveBeenCalled();
      expect(initializer.finalize).not.toHaveBeenCalled();
    });

    it('[PROJ-A3] should use human as default actor type', async () => {
      const { deps } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'dev' });

      expect(result.actorId).toBe('human:dev');
    });
  });

  // 4.2. Actor Creation (PROJ-B1 to B3)
  describe('4.2. Actor Creation (PROJ-B1 to B3)', () => {
    it('[PROJ-B1] should create human actor with admin and developer roles', async () => {
      const { deps, actorStore } = createRealDeps();
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'camilo', actorName: 'Camilo' });

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

      const result = await pm.initializeProject({ name: 'test-project', login: 'camilo' });

      expect(result.productAgentId).toBe('agent:gitgov-audit');
      const stored = await actorStore.get('agent:gitgov-audit');
      expect(stored).not.toBeNull();
      expect(stored!.payload.type).toBe('agent');
      expect(stored!.payload.roles).toEqual(['orchestrator']);
      expect(stored!.payload.metadata).toEqual(expect.objectContaining({ purpose: 'orchestration' }));
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

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev' }))
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

      await pm.initializeProject({ name: 'test-project', login: 'dev' });

      expect(callOrder[0]).toBe('structure');
      expect(callOrder[1]).toBe('actor');
    });

    it('[PROJ-C2] should call writeConfig with protocolVersion, projectId, rootCycle', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'Test Project', login: 'dev', saasUrl: 'https://app.gitgov.com' });

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

    it('[PROJ-C3] should call finalize and return commitSha', async () => {
      const { deps, initializer } = createRealDeps();
      const pm = new ProjectModule(deps);

      const result = await pm.initializeProject({ name: 'test-project', login: 'dev' });

      expect(initializer.finalize).toHaveBeenCalled();
      expect(result.commitSha).toBe('abc123def456abc123def456abc123def456abc1');
    });

    it('[PROJ-C4] should call setupGitIntegration before finalize', async () => {
      const { deps, initializer } = createRealDeps();
      const callOrder: string[] = [];
      (initializer.setupGitIntegration as jest.Mock).mockImplementation(() => { callOrder.push('gitIntegration'); return Promise.resolve(); });
      (initializer.finalize as jest.Mock).mockImplementation(() => { callOrder.push('finalize'); return Promise.resolve('sha'); });
      const pm = new ProjectModule(deps);

      await pm.initializeProject({ name: 'test-project', login: 'dev' });

      const gitIdx = callOrder.indexOf('gitIntegration');
      const finIdx = callOrder.indexOf('finalize');
      expect(gitIdx).toBeLessThan(finIdx);
    });
  });

  // 4.4. Rollback (PROJ-D1 to D4)
  describe('4.4. Rollback (PROJ-D1 to D4)', () => {
    it('[PROJ-D1] should call initializer.rollback on failure', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('Finalize failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev' }))
        .rejects.toThrow('Finalize failed');
      expect(initializer.rollback).toHaveBeenCalled();
    });

    it('[PROJ-D2] should throw original error even if rollback fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('Original error'));
      (initializer.rollback as jest.Mock).mockRejectedValue(new Error('Rollback failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev' }))
        .rejects.toThrow('Original error');
    });

    it('[PROJ-D3] should rollback when createProjectStructure fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.createProjectStructure as jest.Mock).mockRejectedValue(new Error('Structure failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev' }))
        .rejects.toThrow('Structure failed');
      expect(initializer.rollback).toHaveBeenCalled();
    });

    it('[PROJ-D4] should rollback when finalize fails', async () => {
      const { deps, initializer } = createRealDeps();
      (initializer.finalize as jest.Mock).mockRejectedValue(new Error('Commit failed'));
      const pm = new ProjectModule(deps);

      await expect(pm.initializeProject({ name: 'test-project', login: 'dev' }))
        .rejects.toThrow('Commit failed');
      expect(initializer.rollback).toHaveBeenCalled();
    });
  });
});
