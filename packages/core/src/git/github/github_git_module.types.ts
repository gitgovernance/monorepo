/**
 * Types for GitHubGitModule.
 * All EARS prefixes map to github_git_module.md
 */

/**
 * Configuration for GitHubGitModule.
 * All operations target the specified owner/repo via GitHub REST API.
 * Note: defaultBranch (not ref) because GitModule tracks which branch
 * operations target, switchable via checkoutBranch().
 */
export type GitHubGitModuleOptions = {
  /** GitHub repository owner (user or organization) */
  owner: string;
  /** GitHub repository name */
  repo: string;
  /** GitHub access token with repo read/write permissions */
  token: string;
  /** Default branch name (default: 'main') */
  defaultBranch?: string;
  /** GitHub API base URL (default: 'https://api.github.com') */
  apiBaseUrl?: string;
};

/**
 * Internal staging buffer entry.
 * content = string means add/update, content = null means delete.
 */
export type StagingEntry = {
  /** File path relative to repo root */
  path: string;
  /** File content (null = delete) */
  content: string | null;
};

/**
 * GitHub API Ref response.
 */
export type GitHubRefResponse = {
  /** Ref name (e.g., "refs/heads/main") */
  ref: string;
  /** Object pointed to by the ref */
  object: {
    /** Object type ("commit") */
    type: string;
    /** SHA of the commit */
    sha: string;
  };
};

/**
 * GitHub API Commit response (subset).
 */
export type GitHubCommitResponse = {
  /** Commit SHA */
  sha: string;
  /** Commit details */
  commit: {
    /** Commit message */
    message: string;
    /** Author information */
    author: { name: string; email: string; date: string };
    /** Tree reference */
    tree: { sha: string };
  };
  /** Parent commits */
  parents: Array<{ sha: string }>;
};

/**
 * GitHub API Compare response (subset).
 */
export type GitHubCompareResponse = {
  /** Commits in the comparison range */
  commits: GitHubCommitResponse[];
  /** Files changed */
  files: Array<{
    /** File path */
    filename: string;
    /** Change status */
    status: 'added' | 'modified' | 'removed' | 'renamed';
  }>;
};
