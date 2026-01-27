/**
 * Environment validation result.
 * Used by filesystem implementations to check prerequisites.
 */
export type EnvironmentValidation = {
  /** Whether environment is valid for initialization */
  isValid: boolean;
  /** Whether directory contains Git repository (fs-only) */
  isGitRepo: boolean;
  /** Whether process has write permissions */
  hasWritePermissions: boolean;
  /** Whether GitGovernance is already initialized */
  isAlreadyInitialized: boolean;
  /** Path to .gitgov directory (if already initialized) */
  gitgovPath?: string;
  /** List of validation warnings */
  warnings: string[];
  /** Actionable suggestions for user */
  suggestions: string[];

  // VCS status fields (populated by implementations that support VCS)
  /** Whether a remote 'origin' is configured */
  hasRemote?: boolean;
  /** Whether the current branch has commits */
  hasCommits?: boolean;
  /** Name of the current branch */
  currentBranch?: string;
};
