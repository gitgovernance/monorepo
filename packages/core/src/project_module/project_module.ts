import type { ProjectModuleDeps, ProjectInitOptions, ProjectInitResult, AddActorInput, AddActorResult } from './project_module.types';
import { AddActorError } from './project_module.types';

// [PROJ-C2b] Deterministic root cycle ID. The root cycle is unique per project, so its ID
// must be stable across inits (not Date.now()). Two inits of the same repo then produce a
// byte-identical config.json (rootCycle field), so gitgov-state cannot diverge → no conflict.
// The 10-zero prefix is a sentinel ("not a real timestamp") satisfying the cycle ID schema
// ^\d{10}-cycle-[a-z0-9-]{1,50}$. Per-repo scope means no cross-repo collision.
const ROOT_CYCLE_ID = '0000000000-cycle-root';

export class ProjectModule {
  constructor(private readonly deps: ProjectModuleDeps) {}

  // [PROJ-A1] [PROJ-A2] [PROJ-A3]
  async initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult> {
    const joinedVia = options.joinedVia ?? 'cli';
    const repoId = options.repoId ?? '';

    // [PROJ-A2] Idempotency — if already initialized, ensure caller's actor exists
    const isInit = await this.deps.initializer.isInitialized();
    if (isInit) {
      const commitSha = await this.deps.initializer.getHeadSha();
      if (options.login) {
        const ensureInput: AddActorInput = {
          login: options.login,
          type: options.type ?? 'human',
          repoId,
          joinedVia,
        };
        if (options.actorName) ensureInput.displayName = options.actorName;
        const actorResult = await this.addActor(ensureInput);
        return { alreadyInitialized: true, actorId: actorResult.actorId, created: actorResult.created, commitSha: actorResult.commitSha ?? commitSha } as ProjectInitResult;
      }
      return { alreadyInitialized: true, commitSha } as ProjectInitResult;
    }

    try {
      // [PROJ-C1] Structure (dirs + policy.yml) — before actors
      await this.deps.initializer.createProjectStructure();

      // [PROJ-A1] [PROJ-B1] Human actor — via addActor for consistent metadata + events
      // skipFinalize: true — initializeProject calls finalize() once at the end
      const actorType = options.type ?? 'human';
      const humanResult = await this.addActor({
        login: options.login || 'owner',
        type: actorType as 'human' | 'agent',
        repoId,
        displayName: options.actorName || options.login || 'Project Owner',
        roles: ['admin', 'author', 'approver:product', 'approver:quality', 'developer'],
        joinedVia,
        skipFinalize: true,
        defer: true,
      });

      // [PROJ-B2] Product agent (G21 Two-Tier Actor Model) — via addActor
      let productAgentResult: AddActorResult;
      try {
        productAgentResult = await this.addActor({
          login: 'gitgov-audit',
          type: 'agent',
          skipFinalize: true,
          defer: true,
          repoId,
          displayName: 'GitGov Audit',
          roles: ['orchestrator'],
          joinedVia,
        });
      } catch (err) {
        // [PROJ-B3] Include step context
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Init failed at step createProductAgent: ${message}`);
      }

      // Root cycle — [PROJ-C2b] deterministic ID so two inits converge on identical config.json
      const rootCycle = await this.deps.backlog.createCycle({
        id: ROOT_CYCLE_ID,
        title: 'root',
        status: 'planning' as const,
        taskIds: [],
      }, humanResult.actorId);

      // [PROJ-C2] Config
      const config = {
        protocolVersion: '1.0.0',
        projectId: this.generateProjectId(options.name),
        projectName: options.name,
        rootCycle: rootCycle.id,
        ...(options.saasUrl && { saasUrl: options.saasUrl }),
        // [INIT-L1] State branch written to config for all commands to read
        state: { branch: options.stateBranch },
      };
      await this.deps.initializer.writeConfig(config);

      // Initialize session with human actor (so getCurrentActor resolves to human, not product agent)
      await this.deps.initializer.initializeSession(humanResult.actorId);

      // [PROJ-B4] Register default agents via AgentAdapter
      if (this.deps.agentAdapter && this.deps.defaultAgents?.length) {
        for (const agentConfig of this.deps.defaultAgents) {
          try {
            // [PROJ-E3] Product agent already has ActorRecord — skip
            // [PROJ-E1] Specialist agents need their own ActorRecord before AgentRecord
            if (agentConfig.agentId !== productAgentResult.actorId) {
              await this.addActor({
                login: agentConfig.agentId.replace('agent:', ''),
                type: 'agent',
                repoId,
                displayName: agentConfig.displayName,
                joinedVia,
                skipFinalize: true,
                defer: true,
              });
            }

            const mergedMetadata = { ...agentConfig.metadata, purpose: agentConfig.purpose };

            // [GAUD-E1] Check if AgentRecord already exists — update if config changed, skip if identical
            const existing = await this.deps.agentAdapter.getAgentRecord(agentConfig.agentId);
            if (existing) {
              const engineChanged = JSON.stringify(existing.engine) !== JSON.stringify(agentConfig.engine);
              const metadataChanged = JSON.stringify(existing.metadata) !== JSON.stringify(mergedMetadata);
              if (engineChanged || metadataChanged) {
                // [GAUD-E2] Preserve id, status, triggers — only update engine and metadata
                await this.deps.agentAdapter.updateAgentRecord(agentConfig.agentId, {
                  engine: agentConfig.engine,
                  metadata: mergedMetadata,
                });
              }
            } else {
              await this.deps.agentAdapter.createAgentRecord({
                id: agentConfig.agentId,
                engine: agentConfig.engine,
                status: 'active',
                triggers: agentConfig.triggers,
                // [PROJ-E4] Purpose merged into AgentRecord metadata
                metadata: mergedMetadata,
              }, { defer: true });
            }
          } catch {
            // [PROJ-B5] [PROJ-E2] [GAUD-E3] Non-fatal — agent create/update failure doesn't block init
          }
        }
      }

      // [PROJ-C4] Git integration (.gitignore, gitgov.yml)
      await this.deps.initializer.setupGitIntegration();

      // [PROJ-C3] Finalize (commit in GitHub, no-op in Fs)
      const finalized = await this.deps.initializer.finalize();

      const result: ProjectInitResult = {
        actorId: humanResult.actorId,
        productAgentId: productAgentResult.actorId,
        cycleId: rootCycle.id,
      };
      if (finalized) result.commitSha = finalized;
      return result;
    } catch (err) {
      // [PROJ-D1] [PROJ-D3] [PROJ-D4] Rollback via initializer
      try {
        await this.deps.initializer.rollback();
      } catch {
        // [PROJ-D2] Best-effort rollback — throw original error
      }
      throw err;
    }
  }

  // [PROJ-H1] [PROJ-H2] [PROJ-H3] [PROJ-H4] [PROJ-H5] [PROJ-H6]
  async addActor(input: AddActorInput): Promise<AddActorResult> {
    const actorId = `${input.type}:${input.login}`;

    // [PROJ-H6] authzCheck — invoke before any creation
    if (input.authzCheck) {
      const allowed = await input.authzCheck(input);
      if (!allowed) {
        throw new AddActorError('UNAUTHORIZED', { login: input.login, type: input.type, reason: 'authz check denied' });
      }
    }

    // [PROJ-H2] [PROJ-H3] Check if actor already exists in store
    const existing = await this.deps.identity.getActor(actorId);
    if (existing) {
      // [PROJ-H3] Detect-and-resume: actor in store but maybe not in git.
      let commitSha: string | undefined;
      if (!input.skipFinalize) {
        try {
          const finalized = await this.deps.initializer.finalize();
          if (finalized) commitSha = finalized;
        } catch {
          // finalize failed — caller can retry later.
        }
      }

      // [PROJ-H4] Emit ACTOR_JOINED with wasCreated: false
      this.deps.eventBus?.emit?.('ACTOR_JOINED', {
        actorId, repoId: input.repoId, type: input.type,
        joinedVia: input.joinedVia, wasCreated: false,
        timestamp: new Date().toISOString(),
      });

      const result: AddActorResult = { actorId, created: false };
      if (commitSha) result.commitSha = commitSha;
      return result;
    }

    // [PROJ-H1] Create actor — with joinedVia + joinedAt metadata
    // [PROJ-H5] Writes only to the repo where called (lazy per-repo)
    await this.deps.identity.createActor({
      id: actorId,
      type: input.type,
      displayName: input.displayName || input.login,
      roles: (input.roles && input.roles.length > 0 ? input.roles : (input.type === 'human'
        ? ['author', 'developer']
        : ['specialist'])) as [string, ...string[]],
      metadata: {
        joinedVia: input.joinedVia,
        joinedAt: new Date().toISOString(),
      },
    }, 'bootstrap', input.defer ? { defer: true } : undefined);

    // [PROJ-H3] Finalize commits the actor to git.
    // When skipFinalize is set (called from initializeProject), the caller
    // will finalize once at the end for all staged files atomically.
    let commitSha: string | undefined;
    if (!input.skipFinalize) {
      try {
        const finalized = await this.deps.initializer.finalize();
        if (finalized) commitSha = finalized;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Nothing to commit')) {
          const verified = await this.deps.identity.getActor(actorId);
          if (!verified) {
            throw new AddActorError('GIT_WRITE_FAILED', { actorId, cause: message });
          }
        } else {
          throw new AddActorError('GIT_WRITE_FAILED', { actorId, cause: message });
        }
      }
    }

    // [PROJ-H4] Emit ACTOR_JOINED with wasCreated: true
    this.deps.eventBus?.emit?.('ACTOR_JOINED', {
      actorId, repoId: input.repoId, type: input.type,
      joinedVia: input.joinedVia, wasCreated: true,
      timestamp: new Date().toISOString(),
    });

    const result: AddActorResult = { actorId, created: true };
    if (commitSha) result.commitSha = commitSha;
    return result;
  }

  private generateProjectId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  }
}
