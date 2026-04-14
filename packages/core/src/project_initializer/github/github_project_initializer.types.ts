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
  /** Branch to initialize (default 'gitgov-state') */
  branch?: string;
  /** Base path for all .gitgov files (default '.gitgov') */
  basePath?: string;
  /** Commit message used by finalize() (default 'gitgov: remote init') */
  commitMessage?: string;
  /** Commit author used by finalize() (default gitgov bot) */
  commitAuthor?: CommitAuthor;
};
