import type { CommitAuthor, IGitModule } from '../../git';
import type { ConfigStore } from '../../config_store';
import type { GitGovConfig } from '../../config_manager';
import type {
  IProjectInitializer,
  EnvironmentValidation,
} from '../project_initializer';
import type { GitHubProjectInitializerOptions } from './github_project_initializer.types';

const DEFAULT_POLICY_YML = `version: "1.0"\nfailOn: critical\n`;

/**
 * GitHubProjectInitializer — seventh sibling of the @gitgov/core/github family.
 *
 * Implements IProjectInitializer against the GitHub REST API using GitHubGitModule
 * (staging buffer + 6-step atomic commit) and GitHubConfigStore (read-only here).
 *
 * Unlike FsProjectInitializer, writes do NOT persist immediately — they stage
 * into the shared gitModule's staging buffer and materialize in a single commit
 * via finalize() (IKS-A40, Unit of Work pattern).
 *
 * Methods that don't apply to remote state (no local filesystem artifacts) are
 * documented no-ops:
 *   - initializeSession:   sessions live in saas-api JWE tokens, not gitgov-state
 *   - copyAgentPrompt:     no local agent prompts in remote init
 *   - setupGitIntegration: no local .gitignore in remote state
 *
 * Records (ActorRecord, CycleRecord) are NOT written by this initializer — the
 * saas-api orchestrator stages them directly via gitModule.add({contentMap}) on
 * the same shared gitModule instance (IKS-A42). Sharing the gitModule means
 * finalize() commits config.json + policy.yml + actors/{id}.json + cycles/{id}.json
 * all in a single atomic commit (IKS-T6).
 *
 * @see github_project_initializer_module.md for EARS specifications (GPI01-GPI13).
 */
export class GitHubProjectInitializer implements IProjectInitializer {
  private readonly branch: string;
  private readonly basePath: string;
  private readonly commitMessage: string;
  private readonly commitAuthor: CommitAuthor;

  /**
   * Tracks whether createProjectStructure() created the branch in this init run.
   * Used by rollback() to decide whether to delete the branch (we created it)
   * or leave it alone (it preexisted).
   */
  private branchCreatedByThisInit: boolean = false;

  constructor(
    private readonly gitModule: IGitModule,
    private readonly configStore: ConfigStore<unknown>,
    options: GitHubProjectInitializerOptions,
  ) {
    // owner/repo are required options for caller-declared intent + future extensibility,
    // but not stored internally — the injected gitModule and configStore already carry
    // them. Re-storing would be dead state (TypeScript noUnusedLocals rejects unused private fields).
    this.branch = options.branch ?? 'gitgov-state';
    this.basePath = options.basePath ?? '.gitgov';
    this.commitMessage = options.commitMessage ?? 'gitgov: remote init';
    this.commitAuthor = options.commitAuthor ?? {
      name: 'gitgov bot',
      email: 'bot@gitgov.dev',
    };
  }

  // GPI01/GPI02/GPI03 — IKS-T1: create branch (if needed) + stage policy.yml
  async createProjectStructure(): Promise<void> {
    const exists = await this.gitModule.branchExists(this.branch);
    if (!exists) {
      // startPoint undefined → create from default branch via GitHubGitModule semantics
      await this.gitModule.createBranch(this.branch, undefined);
      this.branchCreatedByThisInit = true;
    }

    // Stage policy.yml in the shared gitModule buffer. No .gitkeep —
    // directories emerge naturally from the files written in the final commit.
    const policyPath = `${this.basePath}/policy.yml`;
    await this.gitModule.add([policyPath], {
      contentMap: { [policyPath]: DEFAULT_POLICY_YML },
    });
  }

  // GPI10 — project is initialized iff branch exists AND config.json is loadable
  async isInitialized(): Promise<boolean> {
    const branchExists = await this.gitModule.branchExists(this.branch);
    if (!branchExists) return false;
    const config = await this.configStore.loadConfig();
    return config !== null;
  }

  // GPI05 — IKS-T4: stage config.json in the shared gitModule buffer.
  // Does NOT delegate to configStore.saveConfig() — that makes an immediate
  // Contents API PUT which would violate IKS-T6 "all in 1 commit".
  async writeConfig(config: GitGovConfig): Promise<void> {
    const configPath = `${this.basePath}/config.json`;
    const content = JSON.stringify(config, null, 2);
    await this.gitModule.add([configPath], {
      contentMap: { [configPath]: content },
    });
  }

  // GPI07 — no-op in remote backend
  async initializeSession(_actorId: string): Promise<void> {
    // intentional no-op: sessions tracked via JWE tokens in saas-api, not gitgov-state
  }

  // GPI04 — IKS-T5: cleanup on init failure. Delete branch if we created it.
  async rollback(): Promise<void> {
    if (this.branchCreatedByThisInit) {
      await this.gitModule.deleteBranch(this.branch);
      this.branchCreatedByThisInit = false;
    }
    // If the branch preexisted, rollback is a no-op — we do not touch state we did not create.
  }

  // GPI11 — environment validation for remote backend
  async validateEnvironment(): Promise<EnvironmentValidation> {
    const branchExists = await this.gitModule.branchExists(this.branch);
    const config = branchExists ? await this.configStore.loadConfig() : null;
    const isAlreadyInitialized = branchExists && config !== null;

    return {
      isValid: !isAlreadyInitialized,
      isGitRepo: true, // semantically true for a remote GitHub repo
      hasWritePermissions: true, // assumed post-OAuth; real probe would cost an API call
      isAlreadyInitialized,
      hasRemote: true,
      hasCommits: true,
      currentBranch: this.branch,
      warnings: isAlreadyInitialized
        ? [
            `Project already initialized at ${this.basePath}/config.json in branch '${this.branch}'`,
          ]
        : [],
      suggestions: [],
    };
  }

  // GPI06 — read via gitModule Contents API
  async readFile(filePath: string): Promise<string> {
    return this.gitModule.getFileContent(this.branch, filePath);
  }

  // GPI08 — no-op in remote (no local agent prompt in remote init)
  async copyAgentPrompt(): Promise<void> {
    // intentional no-op
  }

  // GPI09 — no-op in remote (no local .gitignore in remote state)
  async setupGitIntegration(): Promise<void> {
    // intentional no-op
  }

  // GPI12 — canonical remote path for an actor record
  getActorPath(actorId: string): string {
    return `${this.basePath}/actors/${actorId}.json`;
  }

  // GPI13 — IKS-T6: transaction boundary. Materializes all staged writes in 1 commit.
  // Returns the commit SHA for observability (used by RemoteInitService to emit
  // `INIT_COMPLETE` event via `RepoStateMachineService.transition` with commitSha).
  async finalize(): Promise<string | undefined> {
    return await this.gitModule.commit(this.commitMessage, this.commitAuthor);
  }
}
