/**
 * ProjectAdapter - Project Initialization Engine
 *
 * Implements Facade + Dependency Injection Pattern for testable and configurable orchestration.
 * Acts as Mediator between project initialization and the ecosystem of adapters.
 *
 * EARS Blocks:
 * - A: Project Bootstrap Core (A1-A10)
 * - B: Multi-Adapter Integration (B1-B6)
 * - C: Error Handling & Type Safety (C1-C4)
 * - D: Graceful Degradation (D1)
 * - E: Future Platform Capabilities (E1-E2)
 * - F: Critical Bug Prevention (F1-F3)
 * - G: Agent Prompt UX (G1)
 */

import type { GitGovConfig, IConfigManager } from '../../config_manager';
import { DetailedValidationError } from '../../validation/common';
import type { IdentityAdapter } from '../identity_adapter';
import type { BacklogAdapter } from '../backlog_adapter';
import { createTaskRecord } from '../../factories/task_factory';
import { createCycleRecord } from '../../factories/cycle_factory';
import type { IProjectInitializer, EnvironmentValidation } from '../../project_initializer';
import type {
  ProjectAdapterDependencies,
  ProjectInitOptions,
  ProjectInitResult,
  ProjectContext,
  TemplateProcessingResult,
  ProjectInfo,
  ProjectReport,
  IProjectAdapter,
} from './project_adapter.types';

/**
 * ProjectAdapter - The Project Initialization Engine
 *
 * Orchestrates adapters (Identity, Backlog) + ConfigManager + IProjectInitializer
 * for complete GitGovernance project bootstrap with trust root Ed25519.
 *
 * VCS checks (remote, branch, commits) are delegated to IProjectInitializer.validateEnvironment(),
 * keeping ProjectAdapter storage-agnostic.
 */
export class ProjectAdapter implements IProjectAdapter {
  private identityAdapter: IdentityAdapter;
  private backlogAdapter: BacklogAdapter;
  private configManager: IConfigManager;
  private projectInitializer: IProjectInitializer;

  constructor(dependencies: ProjectAdapterDependencies) {
    this.identityAdapter = dependencies.identityAdapter;
    this.backlogAdapter = dependencies.backlogAdapter;
    this.configManager = dependencies.configManager;
    this.projectInitializer = dependencies.projectInitializer;
  }

  // ===== FASE 1: BOOTSTRAP CORE METHODS =====

  /**
   * [EARS-A1] Initializes complete GitGovernance project with 3-adapter orchestration
   * and trust root Ed25519.
   */
  async initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult> {
    const startTime = Date.now();

    try {
      // 1. Environment Validation (delegates to IProjectInitializer)
      const envValidation = await this.validateEnvironment();
      if (!envValidation.isValid) {
        throw new Error(`Environment validation failed: ${envValidation.warnings.join(', ')}`);
      }

      // 2. Directory Structure Creation via ProjectInitializer
      await this.projectInitializer.createProjectStructure();

      // 2.5. [EARS-G1] Copy Agent Prompt to project root for IDE access
      await this.projectInitializer.copyAgentPrompt();

      // 3. Trust Root Creation via IdentityAdapter [EARS-B1]
      const actor = await this.identityAdapter.createActor(
        {
          type: 'human' as const,
          displayName: options.actorName || 'Project Owner',
          roles: [
            'admin',
            'author',
            'approver:product',
            'approver:quality',
            'developer',
          ] as const,
        },
        'bootstrap'
      );

      // 4. Root Cycle Setup via BacklogAdapter [EARS-B2]
      const rootCycleData = await createCycleRecord({
        title: 'root',
        status: 'planning' as const,
        taskIds: [],
      });

      const rootCycle = await this.backlogAdapter.createCycle(rootCycleData, actor.id);

      // 5. Template Processing (if specified)
      let templateResult: TemplateProcessingResult | undefined;
      if (options.template) {
        const projectContext: ProjectContext = {
          projectId: this.generateProjectId(options.name),
          projectName: options.name,
          actorId: actor.id,
          rootCycle: rootCycle.id,
        };
        templateResult = await this.processBlueprintTemplate(options.template, projectContext);
      }

      // 6. Configuration Persistence via ProjectInitializer [EARS-B5]
      const projectId = this.generateProjectId(options.name);
      const config: GitGovConfig = {
        protocolVersion: '1.0.0',
        projectId,
        projectName: options.name,
        rootCycle: rootCycle.id,
        state: {
          branch: 'gitgov-state',
          sync: {
            strategy: 'manual',
            maxRetries: 3,
            pushIntervalSeconds: 30,
            batchIntervalSeconds: 60,
          },
          defaults: {
            pullScheduler: {
              defaultIntervalSeconds: 30,
              defaultEnabled: false,
              defaultContinueOnNetworkError: true,
              defaultStopOnConflict: false,
            },
            fileWatcher: {
              defaultDebounceMs: 300,
              defaultIgnoredPatterns: ['*.tmp', '.DS_Store', '*.swp'],
            },
          },
        },
      };

      await this.projectInitializer.writeConfig(config);

      // 6.5. Lazy State Branch Setup [EARS-A4, EARS-B3]
      // gitgov-state branch is NOT created here - it will be created lazily on first "sync push"
      // VCS status is read from envValidation (populated by IProjectInitializer)
      if (!envValidation.hasRemote || !envValidation.hasCommits) {
        const vcsWarnings: string[] = [];
        if (!envValidation.hasCommits) {
          vcsWarnings.push('No commits in current branch');
        }
        if (!envValidation.hasRemote) {
          vcsWarnings.push("No remote 'origin' configured");
        }
        console.warn(`⚠️  ${vcsWarnings.join(', ')}.`);
        console.warn(`   State sync will be available after 'git remote add origin <url>' and first commit.`);
        console.warn(`   Run 'gitgov sync push' when ready to enable multi-machine collaboration.\n`);
      }

      // 7. Session Initialization via ProjectInitializer
      await this.projectInitializer.initializeSession(actor.id);

      // 8. Git Integration
      await this.projectInitializer.setupGitIntegration();

      const initializationTime = Date.now() - startTime;

      return {
        success: true,
        projectId,
        projectName: options.name,
        rootCycle: rootCycle.id,
        actor: {
          id: actor.id,
          displayName: actor.displayName,
          publicKeyPath: this.projectInitializer.getActorPath(actor.id),
        },
        template: templateResult
          ? {
              processed: true,
              cyclesCreated: templateResult.cyclesCreated,
              tasksCreated: templateResult.tasksCreated,
            }
          : undefined,
        initializationTime,
        nextSteps: [
          "Run 'gitgov status' to see your project overview",
          "Use 'gitgov task create' to add your first task",
          "Ask '@gitgov' for help, guidance, or project planning",
        ],
      };
    } catch (error) {
      // Error Recovery - Automatic rollback via ProjectInitializer [EARS-A5]
      await this.projectInitializer.rollback();
      throw error;
    }
  }

  /**
   * [EARS-A2] Validates environment for GitGovernance initialization.
   * Delegates to IProjectInitializer.validateEnvironment().
   */
  async validateEnvironment(): Promise<EnvironmentValidation> {
    return this.projectInitializer.validateEnvironment();
  }

  /**
   * [EARS-A3] Processes blueprint template JSON with schema validation
   * creating cycles and tasks via factories. [EARS-B4]
   */
  async processBlueprintTemplate(
    templatePath: string,
    projectContext: ProjectContext
  ): Promise<TemplateProcessingResult> {
    const startTime = Date.now();
    const createdIds = { cycles: [] as string[], tasks: [] as string[] };

    try {
      // Load and validate template JSON
      const templateContent = await this.projectInitializer.readFile(templatePath);
      const template = JSON.parse(templateContent);

      if (!template.cycles || !Array.isArray(template.cycles)) {
        throw new DetailedValidationError('Invalid template format', [
          { field: 'cycles', message: 'must be an array', value: template.cycles },
        ]);
      }

      let cyclesCreated = 0;
      let tasksCreated = 0;

      // Process cycles
      for (const cycleTemplate of template.cycles) {
        const cycleData = await createCycleRecord({
          title: cycleTemplate.title || 'Untitled Cycle',
          status: cycleTemplate.status || 'planning',
          taskIds: [],
        });

        const cycle = await this.backlogAdapter.createCycle(cycleData, projectContext.actorId);
        createdIds.cycles.push(cycle.id);
        cyclesCreated++;

        // Process tasks for this cycle
        if (cycleTemplate.tasks && Array.isArray(cycleTemplate.tasks)) {
          for (const taskTemplate of cycleTemplate.tasks) {
            const taskData = await createTaskRecord({
              title: taskTemplate.title || 'Untitled Task',
              priority: taskTemplate.priority || 'medium',
              description: taskTemplate.description || '',
              tags: taskTemplate.tags || [],
              cycleIds: [cycle.id],
            });

            const task = await this.backlogAdapter.createTask(taskData, projectContext.actorId);
            createdIds.tasks.push(task.id);
            tasksCreated++;
          }
        }
      }

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        cyclesCreated,
        tasksCreated,
        processingTime,
        createdIds,
      };
    } catch (error) {
      if (error instanceof DetailedValidationError) {
        throw error;
      }

      throw new DetailedValidationError('Template processing failed', [
        { field: 'template', message: error instanceof Error ? error.message : 'Unknown error', value: templatePath },
      ]);
    }
  }

  /**
   * [EARS-A5/A10] Cleans up partial setup artifacts if initialization fails.
   * Delegates to ProjectInitializer.rollback().
   */
  async rollbackPartialSetup(setupId: string): Promise<void> {
    try {
      await this.projectInitializer.rollback();
    } catch (error) {
      // Log error but don't throw to avoid masking original error
      console.warn(`Rollback failed for setup ${setupId}:`, error);
    }
  }

  // ===== FASE 2: FUTURE PLATFORM METHODS =====

  /**
   * [EARS-E1] Gets project information from config.json via ConfigManager (Fase 2)
   */
  async getProjectInfo(): Promise<ProjectInfo | null> {
    try {
      const config = await this.configManager.loadConfig();
      if (!config) {
        return null;
      }

      return {
        id: config.projectId,
        name: config.projectName,
        rootCycle: config.rootCycle,
        protocolVersion: config.protocolVersion,
      };
    } catch {
      return null;
    }
  }

  /**
   * [EARS-E2] Updates project configuration with validation (Fase 2)
   */
  async updateProjectConfig(updates: Partial<GitGovConfig>): Promise<void> {
    try {
      const currentConfig = await this.configManager.loadConfig();
      if (!currentConfig) {
        throw new Error('No existing configuration found');
      }
      // TODO: Implement config update with validation
    } catch (error) {
      throw new DetailedValidationError('Configuration update failed', [
        { field: 'config', message: error instanceof Error ? error.message : 'Unknown error', value: updates },
      ]);
    }
  }

  /**
   * Generates project report (Fase 2)
   */
  async generateProjectReport(): Promise<ProjectReport> {
    throw new Error('NotImplementedError: generateProjectReport not implemented yet');
  }

  // ===== PRIVATE HELPER METHODS =====

  private generateProjectId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');
  }
}
