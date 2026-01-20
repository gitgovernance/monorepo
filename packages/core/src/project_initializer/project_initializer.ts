import type { GitGovConfig } from '../config_manager';

/**
 * Public interface for project initialization operations (pure - no I/O assumptions).
 *
 * This interface defines the contract for initializing GitGovernance projects
 * across different backends (filesystem, database, API).
 *
 * Implementations:
 * - FsProjectInitializer: Local filesystem (.gitgov/ directory)
 * - DbProjectInitializer: Database (SaaS multi-tenant)
 * - ApiProjectInitializer: Remote API (agents, serverless)
 *
 * @example
 * ```typescript
 * // CLI uses FsProjectInitializer
 * const initializer: IProjectInitializer = new FsProjectInitializer();
 * await initializer.createProjectStructure('/path/to/project');
 *
 * // SaaS uses DbProjectInitializer
 * const initializer: IProjectInitializer = new DbProjectInitializer(pool);
 * await initializer.createProjectStructure('tenant-123');
 * ```
 */
export interface IProjectInitializer {
  /**
   * Creates the project structure (directories for fs, tables for db, etc).
   *
   * @param projectRoot - For Fs: path like '/path/to/project'
   *                      For Db: tenant/project identifier
   */
  createProjectStructure(projectRoot: string): Promise<void>;

  /**
   * Checks if a project is already initialized.
   *
   * @param projectRoot - Project identifier or path
   * @returns true if already initialized
   */
  isInitialized(projectRoot: string): Promise<boolean>;

  /**
   * Writes the project configuration.
   *
   * @param config - GitGovConfig to persist
   * @param projectRoot - Project identifier or path
   */
  writeConfig(config: GitGovConfig, projectRoot: string): Promise<void>;

  /**
   * Initializes a session for the bootstrap actor.
   *
   * @param actorId - ID of the bootstrap actor
   * @param projectRoot - Project identifier or path
   */
  initializeSession(actorId: string, projectRoot: string): Promise<void>;

  /**
   * Cleans up partial setup if initialization fails.
   *
   * @param projectRoot - Project identifier or path
   */
  rollback(projectRoot: string): Promise<void>;

  /**
   * Validates environment for project initialization.
   *
   * @param projectRoot - Project identifier or path (optional, uses cwd if not provided)
   * @returns Validation result with warnings and suggestions
   */
  validateEnvironment(projectRoot?: string): Promise<EnvironmentValidation>;

  /**
   * Reads a file from the project context.
   *
   * @param filePath - Path to the file (relative or absolute depending on backend)
   * @returns File contents as string
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Copies the agent prompt to the project root for IDE access.
   *
   * @param projectRoot - Project identifier or path
   */
  copyAgentPrompt(projectRoot: string): Promise<void>;

  /**
   * Sets up version control integration (e.g., .gitignore for fs).
   *
   * @param projectRoot - Project identifier or path
   */
  setupGitIntegration(projectRoot: string): Promise<void>;

  /**
   * Gets the path/identifier for an actor record.
   *
   * @param actorId - Actor ID
   * @param projectRoot - Project identifier or path
   * @returns Path or identifier for the actor
   */
  getActorPath(actorId: string, projectRoot: string): string;
}

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
};
