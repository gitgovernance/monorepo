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
   * Cleanup-on-failure for a failed initialization — NOT an uninstall command.
   *
   * Called in the failure path of the sequence `createProjectStructure →
   * writeConfig → initializeSession → ...` to leave the backend in the state
   * it was in before the failed init attempt. It is NOT a command to
   * uninstall an already successfully-initialized project — that would be
   * a distinct operation outside this contract.
   *
   * Implementations should be graceful: if called when there is nothing to
   * roll back (e.g. no artifacts created yet), it SHALL complete without
   * throwing.
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

  /**
   * Finalize the initialization transaction — Unit of Work pattern
   * (added in Cycle 5, IKS-A40 / EARS-PI11).
   *
   * Materializes pending writes on backends with transactional semantics.
   * Must be called as the final step of an initialization sequence for writes
   * to become durable on transactional backends.
   *
   * - **Filesystem backend (`FsProjectInitializer`):** no-op. All write methods
   *   persist immediately via `fs.writeFile`/`fs.mkdir` — there is no
   *   transaction buffer to commit.
   *
   * - **GitHub backend (`GitHubProjectInitializer`, Task 5.1a):** triggers the
   *   commit (`gitModule.commit(message, author)`) that materializes all staged
   *   writes (config.json, policy.yml, and orchestrator-staged records) into a
   *   single atomic commit via the 6-step transaction of `GitHubGitModule`.
   *
   * Calling `finalize()` more than once in a single initialization sequence
   * is an error.
   */
  finalize(): Promise<void>;
}

// EnvironmentValidation is defined in ./project_initializer.types.ts
export type { EnvironmentValidation } from './project_initializer.types';
