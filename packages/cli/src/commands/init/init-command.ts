import type { Adapters } from '@gitgov/core';
import { DependencyInjectionService } from '../../services/dependency-injection';

import * as pathUtils from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { existsSync, promises as fsPromises } from 'fs';

/**
 * Init Command Options interface
 */
export interface InitCommandOptions {
  name?: string;
  template?: string;
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
  private container = DependencyInjectionService.getInstance();

  /**
   * [EARS-A1] Main execution method with complete project bootstrap
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
      progressTracker.start("🚀 Initializing GitGovernance Project...\n");

      // [EARS-D1] Build ProjectInitOptions handling all flag combinations correctly
      // [EARS-A2] Root cycle created via ProjectAdapter with project name
      const projectInitOptions: Adapters.ProjectInitOptions = {
        name: completeOptions.name!,
      };

      // [EARS-A3] Process template when specified
      if (completeOptions.template) projectInitOptions.template = completeOptions.template;
      if (completeOptions.actorName) projectInitOptions.actorName = completeOptions.actorName;
      if (completeOptions.actorEmail) projectInitOptions.actorEmail = completeOptions.actorEmail;
      // [EARS-A4] Configure methodology according to flag
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
   * [EARS-C5] Validates environment before initialization
   * [EARS-B2] Shows validation errors with warnings and suggestions
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
   * [EARS-B1, CLIINT-B1] Gets ProjectAdapter for complete orchestration via DI.
   * Creates worktree at ~/.gitgov/worktrees/<hash>/ before initializing.
   */
  private async getProjectAdapter(): Promise<Adapters.ProjectAdapter> {
    const projectRoot = process.cwd();

    // [CLIINT-B1] Create worktree BEFORE FsProjectInitializer runs
    await this.ensureWorktreeForInit(projectRoot);

    this.container.setInitMode(projectRoot);
    return this.container.getProjectAdapter();
  }

  /**
   * [CLIINT-B1] Create worktree at ~/.gitgov/worktrees/<hash>/ for init.
   * Creates orphan gitgov-state branch if needed, then creates worktree.
   */
  private async ensureWorktreeForInit(repoRoot: string): Promise<void> {
    const hash = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
    const worktreePath = pathUtils.join(os.homedir(), '.gitgov', 'worktrees', hash);

    // Idempotent: skip if worktree already exists
    if (existsSync(worktreePath)) return;

    // Ensure ~/.gitgov/worktrees/ exists
    await fsPromises.mkdir(pathUtils.join(os.homedir(), '.gitgov', 'worktrees'), { recursive: true });

    // Create orphan gitgov-state branch if it doesn't exist
    const { execSync } = await import('child_process');
    try {
      execSync('git rev-parse --verify gitgov-state', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Branch doesn't exist — create orphan
      const emptyTree = execSync('git hash-object -t tree /dev/null', { cwd: repoRoot, encoding: 'utf8' }).trim();
      const commitHash = execSync(
        `git commit-tree ${emptyTree} -m "gitgov: initialize state branch"`,
        { cwd: repoRoot, encoding: 'utf8' },
      ).trim();
      execSync(`git update-ref refs/heads/gitgov-state ${commitHash}`, { cwd: repoRoot, stdio: 'pipe' });
    }

    // Create worktree at ~/.gitgov/worktrees/<hash>/
    execSync(`git worktree add "${worktreePath}" gitgov-state`, { cwd: repoRoot, stdio: 'pipe' });
  }

  /**
   * [EARS-C1] Creates progress tracker for visual feedback with --verbose
   * [EARS-C3] Respects --quiet flag for scripting
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
        // Note: Success message is shown by showSuccessOutput(), not here
        // to avoid duplicate/redundant messages
      }
    };
  }

  /**
   * [EARS-D3] Gathers missing information through interactive prompts
   * [EARS-A5] Uses intelligent defaults from git config and directory name
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
    const currentDir = process.cwd();
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
   * [EARS-C4] Shows success output with visual impact
   * [EARS-C2] Handles --json output for automation
   * [EARS-B4] Shows performance metrics in output
   */
  private showSuccessOutput(result: Adapters.ProjectInitResult, options: InitCommandOptions): void {
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
      console.log("✅ GitGovernance initialized successfully!\n");

      console.log("🏗️  Project Structure Created:");
      console.log("   📁 ~/.gitgov/worktrees/<id>/.gitgov/");
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
   * [EARS-D2] Handles errors with user-friendly messages and troubleshooting suggestions
   * [EARS-B3] Captures adapter errors with specific context
   * [EARS-B5] Shows rollback message when adapter fails
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
      } else if (error.message.includes('Template') && error.message.includes('not found')) {
        message = "❌ Template not found. Available: basic, saas-mvp, ai-product, enterprise.";
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
