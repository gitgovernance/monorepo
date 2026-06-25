import type { CommitAuthor } from '../../git';

/**
 * Options for GitHubProjectInitializer constructor.
 *
 * @example
 *   new GitHubProjectInitializer(
 *     gitModule,
 *     configStore,
 *     {
 *       owner: 'myorg',
 *       repo: 'myrepo',
 *       branch: 'gitgov-state',
 *       basePath: '.gitgov',
 *       commitMessage: 'gitgov: remote init',
 *       commitAuthor: { name: 'gitgov bot', email: 'bot@gitgov.dev' },
 *     },
 *   );
 */
export type GitHubProjectInitializerOptions = {
  owner: string;
  repo: string;
  /** Branch to initialize — required, caller must resolve */
  branch: string;
  /** Base path for all .gitgov files (default '.gitgov') */
  basePath?: string;
  /** Commit message used by finalize() (default 'gitgov: remote init') */
  commitMessage?: string;
  /** Commit author used by finalize() (default gitgov bot) */
  commitAuthor?: CommitAuthor;
  /** [GPI19] Octokit instance for branch protection API. Optional — without it, protection is skipped silently. */
  octokit?: { request: (route: string, options: Record<string, unknown>) => Promise<unknown> };
};
