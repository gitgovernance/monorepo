import type { GitGovConfig } from '../../config_manager';
import { ConfigManager } from '../../config_manager';
import { DetailedValidationError } from '../../validation/common';
import type { IdentityAdapter } from '../identity_adapter';
import type { BacklogAdapter } from '../backlog_adapter';
import type { GitModule } from '../../git';
import { createTaskRecord } from '../../factories/task_factory';
import { createCycleRecord } from '../../factories/cycle_factory';
import type { IProjectInitializer, EnvironmentValidation } from '../../project_initializer';

/**
 * ProjectAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface ProjectAdapterDependencies {
  // Core Adapters (REQUIRED - Fase 1)
  identityAdapter: IdentityAdapter;
  backlogAdapter: BacklogAdapter;
  gitModule: GitModule;

  // Infrastructure Layer (REQUIRED)
  configManager: ConfigManager;

  // Project Initialization (REQUIRED - caller injects appropriate implementation)
  projectInitializer: IProjectInitializer;
}

// Return types specific to the adapter
export type ProjectInitOptions = {
  name: string;
  template?: string; // Path to JSON template file
  actorName?: string;
  actorEmail?: string;
  methodology?: "default" | "scrum" | "kanban";
  skipValidation?: boolean;
  verbose?: boolean;
};

export type ProjectInitResult = {
  success: boolean;
  projectId: string;
  projectName: string;
  rootCycle: string;
  actor: {
    id: string;
    displayName: string;
    publicKeyPath: string;
  };
  template?: {
    processed: boolean;
    cyclesCreated: number;
    tasksCreated: number;
  } | undefined;
  initializationTime: number;
  nextSteps: string[];
};

// Re-export EnvironmentValidation from project_initializer
export type { EnvironmentValidation } from '../../project_initializer';

export type ProjectContext = {
  projectId: string;
  projectName: string;
  actorId: string;
  rootCycle: string;
};

export type TemplateProcessingResult = {
  success: boolean;
  cyclesCreated: number;
  tasksCreated: number;
  processingTime: number;
  createdIds: {
    cycles: string[];
    tasks: string[];
  };
};

// Fase 2: Future types
export type ProjectInfo = {
  id: string;
  name: string;
  rootCycle: string;
  protocolVersion: string;
  createdAt?: string;
  lastModified?: string;
};

export type ProjectReport = {
  project: ProjectInfo;
  statistics: {
    totalTasks: number;
    totalCycles: number;
    completedTasks: number;
  };
  health: {
    overallScore: number;
    recommendations: string[];
  };
};

/**
 * ProjectAdapter Interface - The Project Initialization Engine
 */
export interface IProjectAdapter {
  // FASE 1: Bootstrap Core (Crítico para CLI init)
  initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult>;
  validateEnvironment(path?: string): Promise<EnvironmentValidation>;
  processBlueprintTemplate(
    templatePath: string,
    projectContext: ProjectContext
  ): Promise<TemplateProcessingResult>;
  rollbackPartialSetup(setupId: string): Promise<void>;

  // FASE 2: Future capabilities (Platform Integration)
  getProjectInfo(): Promise<ProjectInfo | null>;
  updateProjectConfig(updates: Partial<GitGovConfig>): Promise<void>;
  generateProjectReport(): Promise<ProjectReport>;
}

/**
 * ProjectAdapter - The Project Initialization Engine
 *
 * Implements Facade + Dependency Injection Pattern for testeable and configurable orchestration.
 * Acts as Mediator between project initialization and the ecosystem of adapters.
 */
export class ProjectAdapter implements IProjectAdapter {
  private identityAdapter: IdentityAdapter;
  private backlogAdapter: BacklogAdapter;
  private gitModule: GitModule;
  private configManager: ConfigManager;
  private projectInitializer: IProjectInitializer;

  constructor(dependencies: ProjectAdapterDependencies) {
    this.identityAdapter = dependencies.identityAdapter;
    this.backlogAdapter = dependencies.backlogAdapter;
    this.gitModule = dependencies.gitModule;
    this.configManager = dependencies.configManager;
    this.projectInitializer = dependencies.projectInitializer;
  }

  // ===== FASE 1: BOOTSTRAP CORE METHODS =====

  /**
   * [EARS-A1] Initializes complete GitGovernance project with 3-adapter orchestration (Identity, Backlog, GitModule) and trust root Ed25519
   */
  async initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult> {
    const startTime = Date.now();
    const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();

    try {
      // 1. Environment Validation (delegates to IProjectInitializer)
      const envValidation = await this.validateEnvironment();
      if (!envValidation.isValid) {
        throw new Error(`Environment validation failed: ${envValidation.warnings.join(', ')}`);
      }

      // 2. Directory Structure Creation via ProjectInitializer
      await this.projectInitializer.createProjectStructure(projectRoot);

      // 2.5. Copy Agent Prompt
      await this.projectInitializer.copyAgentPrompt(projectRoot);

      // 3. Trust Root Creation via IdentityAdapter
      const actor = await this.identityAdapter.createActor(
        {
          type: "human" as const,
          displayName: options.actorName || "Project Owner",
          roles: [
            "admin",             // Platform admin (future use)
            "author",            // Create & submit tasks
            "approver:product",  // Approve tasks (product decisions)
            "approver:quality",  // Complete tasks (quality validation)
            "developer"          // General development work
          ] as const,
        },
        "bootstrap"
      );

      // 4. Root Cycle Setup via BacklogAdapter
      const rootCycleData = await createCycleRecord({
        title: "root",  // Will generate ID: {timestamp}-root
        status: "planning" as const,
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

      // 6. Configuration Persistence via ProjectInitializer
      const projectId = this.generateProjectId(options.name);
      const config: GitGovConfig = {
        protocolVersion: "1.0.0",
        projectId,
        projectName: options.name,
        rootCycle: rootCycle.id,
        state: {
          branch: "gitgov-state",
          sync: {
            strategy: "manual",
            maxRetries: 3,
            pushIntervalSeconds: 30,
            batchIntervalSeconds: 60
          },
          defaults: {
            pullScheduler: {
              defaultIntervalSeconds: 30,
              defaultEnabled: false,
              defaultContinueOnNetworkError: true,
              defaultStopOnConflict: false
            },
            fileWatcher: {
              defaultDebounceMs: 300,
              defaultIgnoredPatterns: ["*.tmp", ".DS_Store", "*.swp"]
            }
          }
        }
      };

      await this.projectInitializer.writeConfig(config, projectRoot);

      // 6.5. Lazy State Branch Setup (EARS-A4, EARS-B3)
      // gitgov-state branch is NOT created here - it will be created lazily on first "sync push"
      // This allows init to work in repos without remote or without commits
      const hasRemote = await this.gitModule.isRemoteConfigured("origin");
      const currentBranch = await this.gitModule.getCurrentBranch();
      const hasCommits = await this.gitModule.branchExists(currentBranch);

      if (!hasRemote || !hasCommits) {
        const warnings: string[] = [];
        if (!hasCommits) {
          warnings.push("No commits in current branch");
        }
        if (!hasRemote) {
          warnings.push("No remote 'origin' configured");
        }
        console.warn(`⚠️  ${warnings.join(", ")}.`);
        console.warn(`   State sync will be available after 'git remote add origin <url>' and first commit.`);
        console.warn(`   Run 'gitgov sync push' when ready to enable multi-machine collaboration.\n`);
      }

      // 7. Session Initialization via ProjectInitializer
      await this.projectInitializer.initializeSession(actor.id, projectRoot);

      // 8. Git Integration
      await this.projectInitializer.setupGitIntegration(projectRoot);

      const initializationTime = Date.now() - startTime;

      return {
        success: true,
        projectId,
        projectName: options.name,
        rootCycle: rootCycle.id,
        actor: {
          id: actor.id,
          displayName: actor.displayName,
          publicKeyPath: this.projectInitializer.getActorPath(actor.id, projectRoot),
        },
        template: templateResult ? {
          processed: true,
          cyclesCreated: templateResult.cyclesCreated,
          tasksCreated: templateResult.tasksCreated,
        } : undefined,
        initializationTime,
        nextSteps: [
          "Run 'gitgov status' to see your project overview",
          "Use 'gitgov task create' to add your first task",
          "Ask '@gitgov' for help, guidance, or project planning"
        ],
      };

    } catch (error) {
      // Error Recovery - Automatic rollback via ProjectInitializer
      await this.projectInitializer.rollback(projectRoot);
      throw error;
    }
  }

  /**
   * [EARS-A2] Validates environment for GitGovernance initialization
   * Delegates to IProjectInitializer.validateEnvironment().
   */
  async validateEnvironment(path?: string): Promise<EnvironmentValidation> {
    return this.projectInitializer.validateEnvironment(path);
  }

  /**
   * [EARS-A3] Processes blueprint template JSON with schema validation creating cycles and tasks
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
          { field: 'cycles', message: 'must be an array', value: template.cycles }
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
        { field: 'template', message: error instanceof Error ? error.message : 'Unknown error', value: templatePath }
      ]);
    }
  }

  /**
   * [EARS-A5/A10] Cleans up partial setup artifacts if initialization fails
   * Delegates to ProjectInitializer.rollback().
   */
  async rollbackPartialSetup(setupId: string): Promise<void> {
    try {
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();
      await this.projectInitializer.rollback(projectRoot);
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
        // TODO: Add createdAt and lastModified from file stats
      };

    } catch (error) {
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

    } catch (error) {
      throw new DetailedValidationError('Configuration update failed', [
        { field: 'config', message: error instanceof Error ? error.message : 'Unknown error', value: updates }
      ]);
    }
  }

  /**
   * Generates project report (Fase 2)
   */
  async generateProjectReport(): Promise<ProjectReport> {
    // TODO: Implement project report generation
    throw new Error('NotImplementedError: generateProjectReport not implemented yet');
  }

  // ===== PRIVATE HELPER METHODS =====

  private generateProjectId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  }
}
