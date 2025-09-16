import { DependencyInjectionService } from '../../services/dependency-injection';
import { ConfigManager } from '../../../../core/src/config_manager';
import type { ProjectAdapter, ProjectInitOptions, ProjectInitResult, EnvironmentValidation } from '../../../../core/src/adapters/project_adapter';
import type { TaskRecord } from '../../../../core/src/types/task_record';
import type { CycleRecord } from '../../../../core/src/types/cycle_record';
import type { ActorRecord } from '../../../../core/src/types/actor_record';
import type { AgentRecord } from '../../../../core/src/types/agent_record';
import type { FeedbackRecord } from '../../../../core/src/types/feedback_record';
import type { ExecutionRecord } from '../../../../core/src/types/execution_record';
import type { ChangelogRecord } from '../../../../core/src/types/changelog_record';
import { FeedbackAdapter } from '../../../../core/src/adapters/feedback_adapter';
import { ExecutionAdapter } from '../../../../core/src/adapters/execution_adapter';
import { ChangelogAdapter } from '../../../../core/src/adapters/changelog_adapter';
import { MetricsAdapter } from '../../../../core/src/adapters/metrics_adapter';
import * as pathUtils from 'path';

/**
 * Init Command Options interface
 */
export interface InitCommandOptions {
  name?: string;
  blueprint?: string;
  methodology?: 'default' | 'scrum' | 'kanban';
  actorName?: string;
  actorEmail?: string;
  force?: boolean;
  cache?: boolean; // Note: --no-cache sets this to false
  skipValidation?: boolean;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * InitCommand - Perfect First Impression
 * 
 * Implements the cornerstone of GitGovernance CLI following the blueprint specification.
 * Delegates all business logic to ProjectAdapter and focuses on UX excellence.
 */
export class InitCommand {
  private dependencyService = DependencyInjectionService.getInstance();

  /**
   * [EARS-1] Main execution method with complete project bootstrap
   */
  async execute(options: InitCommandOptions): Promise<void> {
    try {
      // 1. Environment validation (unless skipped)
      if (!options.skipValidation) {
        await this.validateEnvironment(options);
      }

      // 2. Interactive prompts for missing information
      const completeOptions = await this.gatherMissingInfo(options);

      // 3. Setup visual progress tracking
      const progressTracker = this.createProgressTracker(options);

      // 4. Get ProjectAdapter from dependency injection
      const projectAdapter = await this.getProjectAdapter();

      // 5. Delegate ALL business logic to ProjectAdapter
      progressTracker.start("🚀 Initializing GitGovernance Project...");

      // Build ProjectInitOptions with only defined values
      const projectInitOptions: ProjectInitOptions = {
        name: completeOptions.name!,
      };

      if (completeOptions.blueprint) projectInitOptions.template = completeOptions.blueprint;
      if (completeOptions.actorName) projectInitOptions.actorName = completeOptions.actorName;
      if (completeOptions.actorEmail) projectInitOptions.actorEmail = completeOptions.actorEmail;
      if (completeOptions.methodology) projectInitOptions.methodology = completeOptions.methodology;
      if (completeOptions.skipValidation) projectInitOptions.skipValidation = completeOptions.skipValidation;
      if (completeOptions.verbose) projectInitOptions.verbose = completeOptions.verbose;

      const result = await projectAdapter.initializeProject(projectInitOptions);

      progressTracker.complete();

      // 6. Format success output with visual impact
      this.showSuccessOutput(result, options);

    } catch (error) {
      // 7. Format errors for user-friendly display
      this.handleError(error, options);
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * [EARS-15] Validates environment before initialization
   */
  private async validateEnvironment(options: InitCommandOptions): Promise<void> {
    const projectAdapter = await this.getProjectAdapter();
    const validation = await projectAdapter.validateEnvironment();

    if (!validation.isValid) {
      if (options.json) {
        console.log(JSON.stringify({
          success: false,
          error: "Environment validation failed",
          warnings: validation.warnings,
          suggestions: validation.suggestions,
          exitCode: 1
        }, null, 2));
      } else {
        console.error("❌ Environment validation failed:");
        validation.warnings.forEach(warning => console.error(`  • ${warning}`));
        console.log("\n💡 Suggestions:");
        validation.suggestions.forEach(suggestion => console.log(`  • ${suggestion}`));
      }
      process.exit(1);
    }

    // Show validation success if verbose
    if (options.verbose && !options.quiet) {
      console.log("✅ Environment validation passed");
    }
  }

  /**
   * Gets ProjectAdapter from dependency injection
   */
  private async getProjectAdapter(): Promise<ProjectAdapter> {
    // For init command, ALWAYS create adapter manually using current directory
    // NEVER use DependencyInjectionService which searches for existing .gitgov
    try {
      const { ProjectAdapter } = await import('../../../../core/src/adapters/project_adapter');
      const { IdentityAdapter } = await import('../../../../core/src/adapters/identity_adapter');
      const { BacklogAdapter } = await import('../../../../core/src/adapters/backlog_adapter');
      const { WorkflowMethodologyAdapter } = await import('../../../../core/src/adapters/workflow_methodology_adapter');
      const { RecordStore } = await import('../../../../core/src/store');
      const { EventBus } = await import('../../../../core/src/modules/event_bus_module');
      const { ConfigManager } = await import('../../../../core/src/config_manager');

      // For init: Use original directory where user executed command
      const projectRoot = process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();
      const eventBus = new EventBus();

      const taskStore = new RecordStore<TaskRecord>('tasks', projectRoot);
      const cycleStore = new RecordStore<CycleRecord>('cycles', projectRoot);
      const actorStore = new RecordStore<ActorRecord>('actors', projectRoot);
      const agentStore = new RecordStore<AgentRecord>('agents', projectRoot);
      const feedbackStore = new RecordStore<FeedbackRecord>('feedback', projectRoot);
      const executionStore = new RecordStore<ExecutionRecord>('executions', projectRoot);
      const changelogStore = new RecordStore<ChangelogRecord>('changelogs', projectRoot);

      // Create adapters
      const identityAdapter = new IdentityAdapter({
        actorStore,
        agentStore,
        eventBus
      });

      // Create other adapters first
      const feedbackAdapter = new FeedbackAdapter({
        feedbackStore,
        identity: identityAdapter,
        eventBus
      });

      const executionAdapter = new ExecutionAdapter({
        executionStore,
        identity: identityAdapter,
        eventBus
      });

      const changelogAdapter = new ChangelogAdapter({
        changelogStore,
        identity: identityAdapter,
        eventBus
      });

      const metricsAdapter = new MetricsAdapter({
        taskStore,
        cycleStore,
        feedbackStore,
        executionStore,
        changelogStore,
        actorStore
      });

      const backlogAdapter = new BacklogAdapter({
        taskStore,
        cycleStore,
        feedbackStore,
        executionStore,
        changelogStore,
        feedbackAdapter,
        executionAdapter,
        changelogAdapter,
        metricsAdapter,
        workflowMethodology: new WorkflowMethodologyAdapter(),
        identity: identityAdapter,
        eventBus
      });

      return new ProjectAdapter({
        identityAdapter,
        backlogAdapter,
        workflowMethodologyAdapter: new WorkflowMethodologyAdapter(),
        configManager: new ConfigManager(projectRoot), // Pass explicit project root
        taskStore,
        cycleStore,
      });
    } catch (error) {
      throw new Error(`Failed to create ProjectAdapter for init: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates progress tracker for visual feedback
   */
  private createProgressTracker(options: InitCommandOptions) {
    return {
      start: (message: string) => {
        if (!options.quiet) {
          console.log(message);
        }
      },
      update: (step: number, message: string) => {
        if (options.verbose && !options.quiet) {
          console.log(`[${step}/8] ${message}`);
        }
      },
      complete: () => {
        if (!options.quiet) {
          console.log("🎉 GitGovernance initialization completed successfully!");
        }
      }
    };
  }

  /**
   * Gathers missing information through interactive prompts
   */
  private async gatherMissingInfo(options: InitCommandOptions): Promise<Required<Pick<InitCommandOptions, 'name' | 'actorName'>> & InitCommandOptions> {
    // Get project name
    const projectName = options.name || await this.getProjectNameDefault();

    // Get actor name
    const actorName = options.actorName || await this.getActorNameDefault();

    return {
      ...options,
      name: projectName,
      actorName: actorName,
    };
  }

  /**
   * Gets default project name from directory
   */
  private async getProjectNameDefault(): Promise<string> {
    // For project name, always use current directory, not search upward
    const currentDir = process.env['GITGOV_ORIGINAL_DIR'] || process.cwd();
    return pathUtils.basename(currentDir);
  }

  /**
   * Gets default actor name from git config
   */
  private async getActorNameDefault(): Promise<string> {
    try {
      // Try to get from git config
      const { execSync } = await import('child_process');
      const gitUserName = execSync('git config user.name', { encoding: 'utf8' }).trim();
      return gitUserName || 'Project Owner';
    } catch {
      return 'Project Owner';
    }
  }

  /**
   * [EARS-14] Shows success output with visual impact
   */
  private showSuccessOutput(result: ProjectInitResult, options: InitCommandOptions): void {
    if (options.json) {
      console.log(JSON.stringify({
        success: result.success,
        project: {
          id: result.projectId,
          name: result.projectName,
          rootCycle: result.rootCycle
        },
        actor: result.actor,
        template: result.template,
        performance: {
          initializationTime: result.initializationTime
        },
        nextSteps: result.nextSteps
      }, null, 2));
    } else {
      // Demo-optimized visual output
      console.log("\n✅ GitGovernance initialized successfully!\n");

      console.log("🏗️  Project Structure Created:");
      console.log("   📁 .gitgov/");
      console.log("   ├── 📁 actors/     (1 ActorRecord created)");
      console.log("   ├── 📁 cycles/     (1 Root Cycle created)");
      console.log("   ├── 📁 tasks/      (ready for work)");
      console.log("   ├── 📁 feedback/   (ready for collaboration)");
      console.log("   ├── 📁 executions/ (ready for tracking)");
      console.log("   └── 📄 config.json (project configuration)\n");

      console.log("🔐 Cryptographic Trust Established:");
      console.log(`   👤 Actor: ${result.actor.displayName} (${result.actor.id})`);
      console.log(`   🔑 Public key: ${result.actor.publicKeyPath}`);
      console.log("   ✅ Self-signed root of trust created\n");

      console.log("🎯 Root Cycle Created:");
      console.log(`   📋 "${result.projectName}" (${result.rootCycle})`);
      console.log("   📊 Status: planning");
      console.log("   🎯 Ready for task creation and planning\n");

      if (result.template) {
        console.log("📋 Blueprint Template Processed:");
        console.log(`   ✅ ${result.template.cyclesCreated} cycles created`);
        console.log(`   ✅ ${result.template.tasksCreated} tasks created`);
        console.log("   🎯 Project structure ready for work\n");
      }

      console.log("⚡ Performance Optimized:");
      console.log("   🚀 Methodology: GitGovernance Default");
      console.log(`   ⏱️  Initialization completed in ${result.initializationTime}ms`);
      console.log("   💡 Configuration persisted in config.json\n");

      console.log("🚀 Next Steps:");
      result.nextSteps.forEach(step => {
        console.log(`   ${step}`);
      });

      console.log("\n💡 Pro Tips:");
      console.log("   • Use 'gitgov task new' to create work items");
      console.log("   • Use 'gitgov status' for project dashboard");
      console.log("   • All changes are local until you commit to Git");
    }
  }

  /**
   * Handles errors with user-friendly messages
   */
  private handleError(error: unknown, options: InitCommandOptions): void {
    let message: string;
    let exitCode = 1;

    if (error instanceof Error) {
      if (error.message.includes('Environment validation failed')) {
        message = error.message;
      } else if (error.message.includes('already initialized')) {
        message = "❌ GitGovernance already initialized. Use --force to re-initialize.";
      } else if (error.message.includes('Not a Git repository')) {
        message = "❌ Not a Git repository. Please run 'git init' first.";
      } else if (error.message.includes('No write permissions')) {
        message = "❌ Cannot write to directory. Please check file permissions.";
      } else if (error.message.includes('Blueprint') && error.message.includes('not found')) {
        message = "❌ Blueprint template not found. Available: basic, saas-mvp, ai-product, enterprise.";
      } else if (error.message.includes('DetailedValidationError')) {
        message = `❌ Invalid configuration: ${error.message}`;
      } else {
        message = `❌ Initialization failed: ${error.message}`;
      }
    } else {
      message = "❌ Unknown error occurred during initialization.";
    }

    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: message,
        exitCode
      }, null, 2));
    } else {
      console.error(message);
      if (options.verbose && error instanceof Error) {
        console.error(`🔍 Technical details: ${error.stack}`);
      }

      // Show helpful suggestions
      if (!options.quiet) {
        console.log("\n💡 Troubleshooting:");
        console.log("   • Ensure you're in a Git repository");
        console.log("   • Check file permissions in current directory");
        console.log("   • Use --verbose for detailed error information");
        console.log("   • Use --force if re-initialization is needed");
      }
    }

    process.exit(exitCode);
  }
}
