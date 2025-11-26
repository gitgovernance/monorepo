import { promises as fs, existsSync } from 'fs';
import * as pathUtils from 'path';
import type { GitGovConfig } from '../../config_manager';
import { ConfigManager } from '../../config_manager';
import { DetailedValidationError } from '../../validation/common';
import type { IdentityAdapter } from '../identity_adapter';
import type { BacklogAdapter } from '../backlog_adapter';
import type { SyncModule } from '../../sync';
import { createTaskRecord } from '../../factories/task_factory';
import { createCycleRecord } from '../../factories/cycle_factory';
import { getImportMetaUrl } from '../../utils/esm_helper';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

/**
 * ProjectAdapter Dependencies - Facade + Dependency Injection Pattern
 */
export interface ProjectAdapterDependencies {
  // Core Adapters (REQUIRED - Fase 1)
  identityAdapter: IdentityAdapter;
  backlogAdapter: BacklogAdapter;
  syncModule: SyncModule;

  // Infrastructure Layer (REQUIRED)
  configManager: ConfigManager;
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

export type EnvironmentValidation = {
  isValid: boolean;
  isGitRepo: boolean;
  hasWritePermissions: boolean;
  isAlreadyInitialized: boolean;
  gitgovPath?: string | undefined;
  warnings: string[];
  suggestions: string[];
};

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
  private syncModule: SyncModule;
  private configManager: ConfigManager;

  constructor(dependencies: ProjectAdapterDependencies) {
    this.identityAdapter = dependencies.identityAdapter;
    this.backlogAdapter = dependencies.backlogAdapter;
    this.syncModule = dependencies.syncModule;
    this.configManager = dependencies.configManager;
  }

  // ===== FASE 1: BOOTSTRAP CORE METHODS =====

  /**
   * [EARS-1] Initializes complete GitGovernance project with 4-module orchestration (Identity, Backlog, WorkflowMethodology, SyncModule) and trust root Ed25519
   */
  async initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult> {
    const startTime = Date.now();
    let setupId = `setup-${Date.now()}`;

    try {
      // 1. Environment Validation
      const envValidation = await this.validateEnvironment();
      if (!envValidation.isValid) {
        throw new Error(`Environment validation failed: ${envValidation.warnings.join(', ')}`);
      }

      // 2. Directory Structure Creation
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();
      const gitgovPath = pathUtils.join(projectRoot, '.gitgov');

      await this.createDirectoryStructure(gitgovPath);

      // 2.5. Copy Agent Prompt (@gitgov instructions for AI assistants)
      await this.copyAgentPrompt(gitgovPath);

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

      // 6. Configuration Persistence via ConfigManager
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

      await this.persistConfiguration(config, gitgovPath);

      // 6.5. State Branch Setup via SyncModule (EARS-4, EARS-13)
      // Create gitgov-state orphan branch if it doesn't exist
      await this.syncModule.ensureStateBranch();

      // 6.6. Initial State Synchronization
      // Push .gitgov/ directory to gitgov-state branch so it's not empty
      // This ensures the remote has the initial project structure
      try {
        await this.syncModule.pushState({
          actorId: actor.id,
          dryRun: false,
        });
      } catch (pushError) {
        // Non-critical: local setup is complete, remote sync can happen later
        // This might fail if no remote is configured, which is OK
        console.warn('⚠️ Initial state sync skipped (no remote or push failed). Run "gitgov sync push" when ready.');
      }

      // 7. Session Initialization
      await this.initializeSession(actor.id, gitgovPath);

      // 8. Git Integration
      await this.setupGitIntegration(projectRoot);

      const initializationTime = Date.now() - startTime;

      return {
        success: true,
        projectId,
        projectName: options.name,
        rootCycle: rootCycle.id,
        actor: {
          id: actor.id,
          displayName: actor.displayName,
          publicKeyPath: pathUtils.join(gitgovPath, 'actors', `${actor.id}.json`),
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
      // Error Recovery - Automatic rollback
      await this.rollbackPartialSetup(setupId);
      throw error;
    }
  }

  /**
   * [EARS-2] Validates environment for GitGovernance initialization
   */
  async validateEnvironment(path?: string): Promise<EnvironmentValidation> {
    // For init: validate user's original directory, handling development scenarios
    const targetPath = path || process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();
    const warnings: string[] = [];
    const suggestions: string[] = [];

    try {
      // Check if it's a Git repository by looking for .git directory
      const gitPath = pathUtils.join(targetPath, '.git');
      const isGitRepo = existsSync(gitPath);

      if (!isGitRepo) {
        warnings.push(`Not a Git repository in directory: ${targetPath}`);
        suggestions.push("Run 'git init' to initialize a Git repository first");
      }

      // Check write permissions
      let hasWritePermissions = false;
      try {
        const testFile = pathUtils.join(targetPath, '.gitgov-test');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
        hasWritePermissions = true;
      } catch {
        warnings.push("No write permissions in target directory");
        suggestions.push("Ensure you have write permissions in the target directory");
      }

      // Check if already initialized (requires config.json, not just .gitgov/ directory)
      const gitgovPath = pathUtils.join(targetPath, '.gitgov');
      const configPath = pathUtils.join(gitgovPath, 'config.json');
      let isAlreadyInitialized = false;
      try {
        await fs.access(configPath);
        isAlreadyInitialized = true;
        warnings.push(`GitGovernance already initialized in directory: ${targetPath}`);
        suggestions.push("Use 'gitgov status' to check current state or choose a different directory");
      } catch {
        // config.json doesn't exist, so not fully initialized
        // Note: An empty .gitgov/ directory from bootstrap is OK to init over
      }

      const isValid = isGitRepo && hasWritePermissions && !isAlreadyInitialized;

      return {
        isValid,
        isGitRepo,
        hasWritePermissions,
        isAlreadyInitialized,
        gitgovPath: isAlreadyInitialized ? gitgovPath : undefined,
        warnings,
        suggestions,
      };

    } catch (error) {
      warnings.push(`Environment validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      suggestions.push("Check file system permissions and try again");

      return {
        isValid: false,
        isGitRepo: false,
        hasWritePermissions: false,
        isAlreadyInitialized: false,
        warnings,
        suggestions,
      };
    }
  }

  /**
   * [EARS-3] Processes blueprint template JSON with schema validation creating cycles and tasks
   */
  async processBlueprintTemplate(
    templatePath: string,
    projectContext: ProjectContext
  ): Promise<TemplateProcessingResult> {
    const startTime = Date.now();
    const createdIds = { cycles: [] as string[], tasks: [] as string[] };

    try {
      // Load and validate template JSON
      const templateContent = await fs.readFile(templatePath, 'utf-8');
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
   * [EARS-4] Cleans up partial setup artifacts if initialization fails
   */
  async rollbackPartialSetup(setupId: string): Promise<void> {
    try {
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();
      const gitgovPath = pathUtils.join(projectRoot, '.gitgov');

      // Check if .gitgov directory exists
      try {
        await fs.access(gitgovPath);
        // Remove .gitgov directory recursively
        await fs.rm(gitgovPath, { recursive: true, force: true });
      } catch {
        // Directory doesn't exist, nothing to clean up
      }

      // TODO: Cleanup any other artifacts created during initialization
      // - Remove Git config changes
      // - Delete created actor keys
      // - Restore previous state if needed

    } catch (error) {
      // Log error but don't throw to avoid masking original error
      console.warn(`Rollback failed for setup ${setupId}:`, error);
    }
  }

  // ===== FASE 2: FUTURE PLATFORM METHODS =====

  /**
   * [EARS-19] Gets project information from config.json via ConfigManager (Fase 2)
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
   * [EARS-20] Updates project configuration with validation (Fase 2)
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

  private async createDirectoryStructure(gitgovPath: string): Promise<void> {
    const directories = [
      'actors',
      'cycles',
      'tasks',
      'executions',
      'feedback',
      'changelogs',
    ];

    await fs.mkdir(gitgovPath, { recursive: true });

    for (const dir of directories) {
      await fs.mkdir(pathUtils.join(gitgovPath, dir), { recursive: true });
    }
  }

  private async copyAgentPrompt(gitgovPath: string): Promise<void> {
    const targetPrompt = pathUtils.join(gitgovPath, 'gitgov');
    const potentialSources: string[] = [];

    // 1️⃣ Development scenario: search in monorepo prompts/ (package root)
    potentialSources.push(
      pathUtils.join(process.cwd(), 'prompts/gitgov_agent_prompt.md'),
    );

    // 2️⃣ NPM installation: use require.resolve to find @gitgov/core package
    try {
      // Get import.meta.url via helper (separated to avoid Jest parse errors)
      const metaUrl = getImportMetaUrl();

      if (metaUrl) {
        const require = createRequire(metaUrl);
        const pkgJsonPath = require.resolve('@gitgov/core/package.json');
        const pkgRoot = pathUtils.dirname(pkgJsonPath);
        const promptPath = pathUtils.join(pkgRoot, 'prompts/gitgov_agent_prompt.md');
        potentialSources.push(promptPath);
      }
    } catch {
      // require.resolve failed - continue with other sources
    }

    // 3️⃣ Build fallback: relative to compiled __dirname
    try {
      // Get import.meta.url via helper (separated to avoid Jest parse errors)
      const metaUrl = getImportMetaUrl();

      if (metaUrl) {
        const __filename = fileURLToPath(metaUrl);
        const __dirname = pathUtils.dirname(__filename);
        const promptPath = pathUtils.resolve(__dirname, '../../prompts/gitgov_agent_prompt.md');
        potentialSources.push(promptPath);
      }
    } catch {
      // import.meta not available - continue with other sources
    }

    // 🔍 Find and copy the first accessible file
    for (const source of potentialSources) {
      try {
        await fs.access(source);
        await fs.copyFile(source, targetPrompt);
        console.log(`📋 @gitgov agent prompt copied to .gitgov/gitgov`);
        return;
      } catch {
        // Source not accessible, try next one
        continue;
      }
    }

    // Graceful degradation: if prompt file doesn't exist in any location
    console.warn('Warning: Could not copy @gitgov agent prompt. Project will work but AI assistant may not have local instructions.');
  }

  private generateProjectId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  }

  private async persistConfiguration(config: GitGovConfig, gitgovPath: string): Promise<void> {
    // TODO: ARCHITECTURAL IMPROVEMENT - Use ConfigManager.saveConfig() instead of direct file write
    // Currently ProjectAdapter writes config.json directly for initialization
    // Future: await this.configManager.saveConfig(config) for better separation of concerns
    // Risk: ConfigManager is used by 40+ files, requires careful backward compatibility
    const configPath = pathUtils.join(gitgovPath, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private async initializeSession(actorId: string, gitgovPath: string): Promise<void> {
    // TODO: ARCHITECTURAL IMPROVEMENT - Use ConfigManager.initializeSession() instead of direct file write
    // Currently ProjectAdapter creates .session.json directly for initialization
    // Future: await this.configManager.initializeSession(actorId) for better separation of concerns
    // Risk: ConfigManager is used by 40+ files, requires careful backward compatibility
    const sessionPath = pathUtils.join(gitgovPath, '.session.json');
    const session = {
      lastSession: {
        actorId,
        timestamp: new Date().toISOString(),
      },
      actorState: {
        [actorId]: {
          lastSync: new Date().toISOString(),
          syncStatus: {
            status: 'synced' as const  // Initialize as synced (no pending changes at init)
          }
        },
      },
    };

    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  private async setupGitIntegration(projectRoot: string): Promise<void> {
    const gitignorePath = pathUtils.join(projectRoot, '.gitignore');
    const gitignoreContent = `
# GitGovernance
# Ignore entire .gitgov/ directory (state lives in gitgov-state branch)
.gitgov/

# Exception: Don't ignore .gitgov/.gitignore itself (meta!)
!.gitgov/.gitignore
`;

    try {
      // Check if .gitignore exists
      let existingContent = '';
      try {
        existingContent = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // File doesn't exist, will create new
      }

      // Only add if not already present
      if (existingContent && !existingContent.includes('# GitGovernance')) {
        await fs.appendFile(gitignorePath, gitignoreContent);
      } else if (!existingContent) {
        await fs.writeFile(gitignorePath, gitignoreContent);
      }
    } catch (error) {
      // Non-critical error, continue
      console.warn('Failed to setup Git integration:', error);
    }
  }
}
