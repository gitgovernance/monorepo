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
