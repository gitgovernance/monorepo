import type { GitGovConfig } from '../config_manager';
import type { EnvironmentValidation } from './project_initializer.types';

/**
 * Public interface for project initialization operations (pure - no I/O assumptions).
 *
 * This interface defines the contract for initializing GitGovernance projects
 * across different backends (filesystem, database, API).
 *
 * The project context (path, tenant ID, etc.) is injected at construction time,
 * so methods operate on the pre-configured project without needing explicit paths.
 *
 * Implementations:
 * - FsProjectInitializer: Local filesystem (.gitgov/ directory)
 * - DbProjectInitializer: Database (SaaS multi-tenant)
 * - ApiProjectInitializer: Remote API (agents, serverless)
 *
 * @example
 * ```typescript
 * // CLI uses FsProjectInitializer with projectRoot injected
 * const initializer: IProjectInitializer = new FsProjectInitializer('/path/to/project');
 * await initializer.createProjectStructure();
 *
 * // SaaS uses DbProjectInitializer with tenant injected
 * const initializer: IProjectInitializer = new DbProjectInitializer(pool, 'tenant-123');
 * await initializer.createProjectStructure();
 * ```
 */
export interface IProjectInitializer {
  /**
   * Creates the project structure (directories for fs, tables for db, etc).
   */
  createProjectStructure(): Promise<void>;

  /**
   * Checks if a project is already initialized.
   *
   * @returns true if already initialized
   */
  isInitialized(): Promise<boolean>;

  /**
   * Writes the project configuration.
   *
   * @param config - GitGovConfig to persist
   */
  writeConfig(config: GitGovConfig): Promise<void>;

  /**
   * Initializes a session for the bootstrap actor.
   *
   * @param actorId - ID of the bootstrap actor
   */
  initializeSession(actorId: string): Promise<void>;

  /**
   * Cleans up partial setup if initialization fails.
   */
  rollback(): Promise<void>;

  /**
   * Validates environment for project initialization.
   *
   * @returns Validation result with warnings and suggestions
   */
  validateEnvironment(): Promise<EnvironmentValidation>;

  /**
   * Reads a file from the project context.
   *
   * @param filePath - Path to the file (relative or absolute depending on backend)
   * @returns File contents as string
   */
  readFile(filePath: string): Promise<string>;

  /**
   * Copies the agent prompt to the project root for IDE access.
   */
  copyAgentPrompt(): Promise<void>;

  /**
   * Sets up version control integration (e.g., .gitignore for fs).
   */
  setupGitIntegration(): Promise<void>;

  /**
   * Gets the path/identifier for an actor record.
   *
   * @param actorId - Actor ID
   * @returns Path or identifier for the actor
   */
  getActorPath(actorId: string): string;
}

// EnvironmentValidation is defined in ./project_initializer.types.ts
export type { EnvironmentValidation } from './project_initializer.types';
