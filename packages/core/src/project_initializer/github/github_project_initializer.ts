import type { CommitAuthor, IGitModule } from '../../git';
import type { ConfigStore } from '../../config_store';
import type { GitGovConfig } from '../../config_manager';
import type { GitGovAgentRecord } from '../../record_types';
import { DEFAULT_ID_ENCODER } from '../../record_store';
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
  private readonly owner: string;
  private readonly repo: string;
  private readonly octokit: GitHubProjectInitializerOptions['octokit'];

  private branchCreatedByThisInit: boolean = false;

  // [PROJ-G1] One-shot cache from isInitialized() → createProjectStructure()
  private branchExistsCache: boolean | null = null;

  constructor(
    private readonly gitModule: IGitModule,
    private readonly configStore: ConfigStore<unknown>,
    options: GitHubProjectInitializerOptions,
  ) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.branch = options.branch;
    this.basePath = options.basePath ?? '.gitgov';
    this.commitMessage = options.commitMessage ?? 'gitgov: remote init';
    this.commitAuthor = options.commitAuthor ?? {
      name: 'gitgov bot',
      email: 'bot@gitgov.dev',
    };
    this.octokit = options.octokit;
  }

  // GPI01/GPI02/GPI03 — IKS-T1: create branch (if needed) + stage policy.yml
  // [PROJ-G1] Consumes cached branchExists from isInitialized() if available
  async createProjectStructure(): Promise<void> {
    const exists = this.branchExistsCache ?? await this.gitModule.branchExists(this.branch);
    this.branchExistsCache = null;
    if (!exists) {
      // startPoint undefined → create from default branch via GitHubGitModule semantics
      // [GPI01] [EARS-C6c] Orphan branch — satellite with only .gitgov/ files
      await this.gitModule.createBranch(this.branch, { orphan: true });
      this.branchCreatedByThisInit = true;
    }

    // [GPI03] Stage policy.yml in the shared gitModule buffer. No .gitkeep —
    // directories emerge naturally from the files written in the final commit.
    const policyPath = `${this.basePath}/policy.yml`;
    await this.gitModule.add([policyPath], {
      contentMap: { [policyPath]: DEFAULT_POLICY_YML },
    });

    // [GPI17] Stage security .gitignore to prevent keys from being committed
    const gitignorePath = `${this.basePath}/.gitignore`;
    const securityGitignore = '# Security: prevent private keys and local files from being committed\n*.key\n.session.json\nindex.json\n';
    await this.gitModule.add([gitignorePath], {
      contentMap: { [gitignorePath]: securityGitignore },
    });

    // [GPI19] Attempt branch protection after creating a new branch
    if (this.branchCreatedByThisInit) {
      await this.protectBranch();
    }
  }

  // [GPI19] Private — attempt to protect the state branch via platform API.
  // Graceful degradation: 403 (no administration:write) → warn and continue.
  // No octokit → skip silently (backward-compatible).
  private async protectBranch(): Promise<void> {
    if (!this.octokit) return;
    try {
      await this.octokit.request('PUT /repos/{owner}/{repo}/branches/{branch}/protection', {
        owner: this.owner,
        repo: this.repo,
        branch: this.branch,
        required_status_checks: null,
        enforce_admins: false,
        required_pull_request_reviews: null,
        restrictions: null,
        allow_deletions: false,
        allow_force_pushes: false,
      });
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Upgrade to GitHub Pro') || message.includes('make this repository public')) {
        console.warn(`[gitgov] branch protection for '${this.branch}' skipped — requires GitHub Pro/Team/Enterprise plan for private repos.`);
      } else if (status === 403) {
        console.warn(`[gitgov] branch protection for '${this.branch}' skipped — add 'administration:write' to the GitHub App or configure manually.`);
      } else if (status === 404) {
        console.warn(`[gitgov] branch protection for '${this.branch}' skipped — branch not found (may have been deleted).`);
      } else {
        console.warn(`[gitgov] branch protection for '${this.branch}' failed: ${message}`);
      }
    }
  }

  // [GPI02] [GPI10] project is initialized iff branch exists AND config.json is loadable
  // [PROJ-G1] Caches branchExists for createProjectStructure() to consume
  async isInitialized(): Promise<boolean> {
    const exists = await this.gitModule.branchExists(this.branch);
    this.branchExistsCache = exists;
    if (!exists) return false;
    const config = await this.configStore.loadConfig();
    return config !== null;
  }

  // [GPI03] [GPI05] IKS-T4: stage config.json in the shared gitModule buffer.
  // Does NOT delegate to configStore.saveConfig() — that makes an immediate
  // Contents API PUT which would violate IKS-T6 "all in 1 commit".
  async writeConfig(config: GitGovConfig): Promise<void> {
    const configPath = `${this.basePath}/config.json`;
    const content = JSON.stringify(config, null, 2);
    await this.gitModule.add([configPath], {
      contentMap: { [configPath]: content },
    });
  }

  // [GPI18] Stage a signed AgentRecord at {basePath}/agents/{encodedId}.json in the
  // shared gitModule buffer — materialized atomically with actors/cycle/config at
  // finalize(). The record arrives already signed (no signing, no committed-read).
  // encodedId uses DEFAULT_ID_ENCODER so the file matches the record store / indexer.
  async addAgent(record: GitGovAgentRecord): Promise<void> {
    const id = record.payload?.id;
    if (!id) {
      throw new Error('addAgent requires record.payload.id');
    }
    const agentPath = `${this.basePath}/agents/${DEFAULT_ID_ENCODER.encode(id)}.json`;
    await this.gitModule.add([agentPath], {
      contentMap: { [agentPath]: JSON.stringify(record, null, 2) },
    });
  }

  // [GPI07] no-op in remote backend
  async initializeSession(_actorId: string): Promise<void> {
    // intentional no-op: sessions tracked via JWE tokens in saas-api, not gitgov-state
  }

  // [GPI04] IKS-T5: cleanup on init failure. Delete branch if we created it.
  async rollback(): Promise<void> {
    if (this.branchCreatedByThisInit) {
      await this.gitModule.deleteBranch(this.branch);
      this.branchCreatedByThisInit = false;
    }
    // If the branch preexisted, rollback is a no-op — we do not touch state we did not create.
  }

  // [GPI11] environment validation for remote backend
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

  // [GPI06] read via gitModule Contents API
  async readFile(filePath: string): Promise<string> {
    return this.gitModule.getFileContent(this.branch, filePath);
  }

  // [GPI08] no-op in remote (no local agent prompt in remote init)
  async copyAgentPrompt(): Promise<void> {
    // intentional no-op
  }

  // [GPI09] no-op in remote (no local .gitignore in remote state)
  async setupGitIntegration(): Promise<void> {
    // intentional no-op
  }

  // [GPI12] canonical remote path for an actor record
  getActorPath(actorId: string): string {
    return `${this.basePath}/actors/${actorId}.json`;
  }


  // [GPI13] [GPI14] IKS-T6: transaction boundary. Materializes all staged writes in 1 commit.
  // Returns the commit SHA for observability (used by RemoteInitService to emit
  // `INIT_COMPLETE` event via `RepoStateMachineService.transition` with commitSha).
  async finalize(): Promise<string | undefined> {
    return await this.gitModule.commit(this.commitMessage, this.commitAuthor);
  }

  // [GPI15] Returns HEAD SHA of gitgov-state branch (maps to PI12)
  async getHeadSha(): Promise<string | undefined> {
    try {
      return await this.gitModule.getCommitHash(this.branch);
    } catch {
      return undefined;
    }
  }
}
