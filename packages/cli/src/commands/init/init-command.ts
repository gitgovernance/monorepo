import type { ProjectModule } from '@gitgov/core';
import { SyncState } from '@gitgov/core';
import { DependencyInjectionService } from '../../services/dependency-injection';

import * as pathUtils from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { existsSync, realpathSync, promises as fsPromises } from 'fs';

/**
 * Init Command Options interface
 */
export interface InitCommandOptions {
  name?: string;
  type?: 'human' | 'agent';
  template?: string;
  methodology?: 'default' | 'scrum' | 'kanban';
  actorName?: string;
  actorEmail?: string;
  force?: boolean;
  forceLocal?: boolean;
  login?: string;
  saasUrl?: string;
  stateBranch?: string;
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
 * Delegates all business logic to ProjectModule and focuses on UX excellence.
 */
export class InitCommand {
  private container = DependencyInjectionService.getInstance();

  /**
   * [EARS-A1] Main execution method with complete project bootstrap
   */
  async execute(options: InitCommandOptions): Promise<void> {
    try {
      // [INIT-L1] Set the state-branch override BEFORE anything can trigger the worktree
      // bootstrap. The DI guard throws if a store init happens pre-setInitMode without it
      // (mirror LoginCommand). Without this, `gitgov init --state-branch X` fails to init cache.
      this.container.setStateBranchOverride(options.stateBranch ?? SyncState.DEFAULT_STATE_BRANCH);

      // 1. Environment validation (unless skipped or force-local)
      if (!options.skipValidation && !options.forceLocal) {
        await this.validateEnvironment(options);
      }

      // 2. [EARS-C5] Remote gitgov-state check: if exists, allow join path (INIT-J1/J2).
      // ensureWorktreeForInit will fetch the remote branch and ProjectModule detects alreadyInitialized.

      // 3. Interactive prompts for missing information
      const completeOptions = await this.gatherMissingInfo(options);

      // [INIT-K1] Login is required — derived from --login flag or git config user.name
      if (!completeOptions.login) {
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Cannot determine login',
            suggestion: 'gitgov init --login <your-github-login>',
            exitCode: 1,
          }, null, 2));
        } else {
          console.error("❌ Cannot determine your login.");
          console.log("   Set git config user.name or provide --login explicitly:");
          console.log("   gitgov init --login <your-github-login>");
        }
        process.exit(1);
        return; // needed for test mocks where process.exit doesn't terminate
      }

      // 4. Setup visual progress tracking
      const progressTracker = this.createProgressTracker(options);

      // [INIT-L1] [INIT-L2] Resolve state branch name
      const stateBranch = completeOptions.stateBranch || SyncState.DEFAULT_STATE_BRANCH;

      // [EARS-B1] Get ProjectModule from dependency injection
      const projectModule = await this.getProjectModule(stateBranch);

      // [EARS-D1] Build ProjectInitOptions — filter undefined for exactOptionalPropertyTypes
      const saasUrl = completeOptions.saasUrl || process.env['GITGOV_SAAS_URL'] || 'https://app.gitgov.dev';
      const initOptions: import('@gitgov/core').ProjectModuleInitOptions = { name: completeOptions.name!, saasUrl, stateBranch };
      initOptions.login = completeOptions.login;
      if (completeOptions.actorName) initOptions.actorName = completeOptions.actorName;
      if (completeOptions.type) initOptions.type = completeOptions.type;
      const result = await projectModule.initializeProject(initOptions);

      // [EARS-B1] Show progress only for actual initialization (not re-runs)
      if (!result.alreadyInitialized) {
        progressTracker.start("🚀 Initializing GitGovernance Project...\n");
        progressTracker.complete();
      }

      // [EARS-B4] Format success output
      if (result.alreadyInitialized) {
        if (result.actorId && result.created) {
          // [INIT-J1] Joined as new member — run postInitConcerns for push + DX
          console.log(`Joined existing project as ${result.actorId}`);
          await this.postInitConcerns(options);
        } else if (result.actorId) {
          // [INIT-J2] [INIT-J2b] Already a member — skip postInitConcerns
          console.log(`Already a member of this project as ${result.actorId}`);
          return;
        } else {
          console.log("ℹ️  Project already initialized.");
          return;
        }
      } else {
        this.showSuccessOutput(result, options);
        // [EARS-G1] Post-init: best-effort push + DX concerns
        await this.postInitConcerns(options);
      }

    } catch (error) {
      // 7. Format errors for user-friendly display
      this.handleError(error, options);
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * [EARS-C5] Validates environment — blocks only if not a git repo.
   * [EARS-B2] Shows validation errors with warnings and suggestions.
   * Already initialized without --force is allowed (join path INIT-J1/J2).
   */
  // [EARS-B2] Validate environment before init
  private async validateEnvironment(options: InitCommandOptions): Promise<void> {
    const { execSync } = await import('child_process');
    const repoRoot = process.cwd();

    const warnings: string[] = [];
    const suggestions: string[] = [];
    let isValid = true;

    // Check git repo
    try {
      execSync('git rev-parse --git-dir', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      warnings.push('Not a Git repository.');
      suggestions.push("Run 'git init' first.");
      isValid = false;
    }

    // [EARS-C5] Already initialized without --force → allow join path (INIT-J1/J2)
    // ProjectModule.initializeProject() handles idempotency internally:
    // returns { alreadyInitialized: true } → join path creates collaborator actor

    if (!isValid) {
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: "Environment validation failed", warnings, suggestions, exitCode: 1 }, null, 2));
      } else {
        console.error("❌ Environment validation failed:");
        warnings.forEach((w: string) => console.error(`  • ${w}`));
        console.log("\n💡 Suggestions:");
        suggestions.forEach((s: string) => console.log(`  • ${s}`));
      }
      process.exit(1);
    }

    if (options.verbose && !options.quiet) {
      console.log("✅ Environment validation passed");
    }
  }

  /**
   * [EARS-B1] Gets ProjectModule for complete orchestration via DI.
   * Creates worktree at ~/.gitgov/worktrees/<hash>/ before initializing.
   */
  private async getProjectModule(stateBranch: string): Promise<ProjectModule> {
    const projectRoot = process.cwd();

    // [INIT-L1] Create worktree with configured branch name
    await this.ensureWorktreeForInit(projectRoot, stateBranch);

    this.container.setInitMode(projectRoot);
    return this.container.getProjectModule();
  }

  /**
   * [EARS-G1] Post-init: best-effort push + DX concerns.
   * ProjectModule already committed internally — no commitStateToWorktree needed.
   */
  private async postInitConcerns(options: InitCommandOptions): Promise<void> {
    const repoRoot = process.cwd();
    const stateBranch = options.stateBranch || SyncState.DEFAULT_STATE_BRANCH;

    // [EARS-G1] [INIT-L1] Best-effort push to remote using configured branch
    try {
      const { execSync } = await import('child_process');
      execSync(`git push origin ${stateBranch}`, {
        cwd: repoRoot,
        stdio: 'pipe',
        timeout: 10000,
        env: { ...process.env, GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=5 -o BatchMode=yes' },
      });
    } catch {
      if (!options.quiet) {
        console.log('\n⚠️  Could not push to remote.');
        console.log('   Run \'gitgov sync push\' when your remote is ready.\n');
      }
    }

    // DX concerns: .gitignore + gitgov.yml (in repoRoot), agent prompt, session
    // Uses FsProjectInitializer temporarily for these 3 DX functions — cleanup in Task 4.6
    try {
      const { FsProjectInitializer } = await import('@gitgov/core/fs');
      const resolvedRoot = realpathSync(repoRoot);
      const hash = createHash('sha256').update(resolvedRoot).digest('hex').slice(0, 12);
      const worktreePath = pathUtils.join(os.homedir(), '.gitgov', 'worktrees', hash);
      const dxHelper = new FsProjectInitializer(worktreePath, repoRoot);
      await dxHelper.setupGitIntegration();
      await dxHelper.copyAgentPrompt();
    } catch {
      // Non-fatal DX concerns
    }
  }

  /**
   * [CLIINT-B1] [INIT-L1] Create worktree at ~/.gitgov/worktrees/<hash>/ for init.
   * Creates state branch (configurable name) if needed, then creates worktree.
   */
  private async ensureWorktreeForInit(repoRoot: string, stateBranch: string): Promise<void> {
    const hash = createHash('sha256').update(realpathSync(repoRoot)).digest('hex').slice(0, 12);
    const worktreePath = pathUtils.join(os.homedir(), '.gitgov', 'worktrees', hash);

    // Idempotent: skip if worktree already exists
    if (existsSync(worktreePath)) return;

    // Ensure ~/.gitgov/worktrees/ exists
    await fsPromises.mkdir(pathUtils.join(os.homedir(), '.gitgov', 'worktrees'), { recursive: true });

    // Create or fetch state branch
    const { execSync } = await import('child_process');
    try {
      execSync(`git rev-parse --verify ${stateBranch}`, { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Local branch doesn't exist — try fetching from remote (collaborator clone scenario)
      try {
        execSync(`git fetch origin ${stateBranch}`, { cwd: repoRoot, stdio: 'pipe' });
        execSync(`git branch ${stateBranch} origin/${stateBranch}`, { cwd: repoRoot, stdio: 'pipe' });
      } catch {
        // No remote branch either — create orphan (fresh project)
        const emptyTree = execSync('git hash-object -t tree /dev/null', { cwd: repoRoot, encoding: 'utf8' }).trim();
        const commitHash = execSync(
          `git commit-tree ${emptyTree} -m "gitgov: initialize state branch"`,
          { cwd: repoRoot, encoding: 'utf8' },
        ).trim();
        execSync(`git update-ref refs/heads/${stateBranch} ${commitHash}`, { cwd: repoRoot, stdio: 'pipe' });
      }
    }

    // Create worktree at ~/.gitgov/worktrees/<hash>/
    execSync(`git worktree add "${worktreePath}" ${stateBranch}`, { cwd: repoRoot, stdio: 'pipe' });
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

    // [INIT-K1] Derive login: --login flag > git config user.name (slugified)
    const login = options.login || await this.deriveLoginDefault();

    const result: Required<Pick<InitCommandOptions, 'name' | 'actorName'>> & InitCommandOptions = {
      ...options,
      name: projectName,
      actorName: actorName,
    };
    if (login) result.login = login;
    return result;
  }

  /**
   * [INIT-K1] Derives a login slug from git config user.name.
   * Returns undefined if git config is unavailable.
   */
  private async deriveLoginDefault(): Promise<string | undefined> {
    try {
      const { execSync } = await import('child_process');
      const gitUserName = execSync('git config user.name', { encoding: 'utf8' }).trim();
      if (!gitUserName) return undefined;
      return gitUserName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    } catch {
      return undefined;
    }
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
   * [EARS-B4] Shows result with actorId and commitSha
   */
  private showSuccessOutput(result: import('@gitgov/core').ProjectModuleInitResult, options: InitCommandOptions): void {
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        actorId: result.actorId,
        productAgentId: result.productAgentId,
        cycleId: result.cycleId,
        commitSha: result.commitSha,
      }, null, 2));
    } else {
      console.log("✅ GitGovernance initialized successfully!\n");

      console.log("🔐 Cryptographic Trust Established:");
      console.log(`   👤 Actor: ${result.actorId}`);
      console.log(`   🤖 Product Agent: ${result.productAgentId}`);
      console.log("   ✅ Self-signed root of trust created\n");

      console.log("🎯 Root Cycle Created:");
      console.log(`   📋 ${result.cycleId}`);
      console.log("   📊 Status: planning\n");

      if (result.commitSha) {
        console.log(`📝 Committed: ${result.commitSha.slice(0, 8)}\n`);
      }

      console.log("🚀 Next Steps:");
      console.log("   gitgov agent new @gitgov/agent-security-audit");
      console.log("   gitgov audit");
      console.log("   gitgov status");
    }
  }

  /**
   * [EARS-F1/F2] Check if gitgov-state branch exists on the remote (Task 5.4).
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
