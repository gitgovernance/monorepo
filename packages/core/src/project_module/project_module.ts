import type { ProjectModuleDeps, ProjectInitOptions, ProjectInitResult } from './project_module.types';

export class ProjectModule {
  constructor(private readonly deps: ProjectModuleDeps) {}

  // [PROJ-A1] [PROJ-A2] [PROJ-A3]
  async initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult> {
    // [PROJ-A2] Idempotency
    if (await this.deps.initializer.isInitialized()) {
      return { alreadyInitialized: true } as ProjectInitResult;
    }

    try {
      // [PROJ-C1] Structure (dirs + policy.yml) — before actors
      await this.deps.initializer.createProjectStructure();

      // [PROJ-B1] Human actor
      const actorType = options.type ?? 'human';
      const actorId = options.login ? `${actorType}:${options.login}` : undefined;
      const human = await this.deps.identity.createActor({
        ...(actorId && { id: actorId }),
        type: actorType as 'human' | 'agent',
        displayName: options.actorName || options.login || 'Project Owner',
        roles: ['admin', 'author', 'approver:product', 'approver:quality', 'developer'],
      }, 'bootstrap');

      // [PROJ-B2] Product agent (G21 Two-Tier Actor Model)
      let productAgent;
      try {
        productAgent = await this.deps.identity.createActor({
          id: 'agent:gitgov-audit',
          type: 'agent',
          displayName: 'GitGov Audit',
          roles: ['orchestrator'],
          metadata: { purpose: 'orchestration' },
        }, human.id);
      } catch (err) {
        // [PROJ-B3] Include step context
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Init failed at step createProductAgent: ${message}`);
      }

      // Root cycle
      const rootCycle = await this.deps.backlog.createCycle({
        title: 'root',
        status: 'planning' as const,
        taskIds: [],
      }, human.id);

      // [PROJ-C2] Config
      const config = {
        protocolVersion: '1.0.0',
        projectId: this.generateProjectId(options.name),
        projectName: options.name,
        rootCycle: rootCycle.id,
        ...(options.saasUrl && { saasUrl: options.saasUrl }),
      };
      await this.deps.initializer.writeConfig(config);

      // Initialize session with human actor (so getCurrentActor resolves to human, not product agent)
      await this.deps.initializer.initializeSession(human.id);

      // [PROJ-B4] Register default agents via AgentAdapter
      if (this.deps.agentAdapter && this.deps.defaultAgents?.length) {
        for (const agentConfig of this.deps.defaultAgents) {
          try {
            // [PROJ-E3] Product agent already has ActorRecord from PROJ-B2 — skip
            // [PROJ-E1] Specialist agents need their own ActorRecord before AgentRecord
            if (agentConfig.agentId !== productAgent.id) {
              await this.deps.identity.createActor({
                id: agentConfig.agentId,
                type: 'agent',
                displayName: agentConfig.displayName,
                roles: ['specialist'],
                metadata: { purpose: agentConfig.purpose },
              }, human.id);
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
              });
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
        actorId: human.id,
        productAgentId: productAgent.id,
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

  private generateProjectId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  }
}
