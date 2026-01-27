/**
 * ProjectAdapter Types and Interfaces
 *
 * Type definitions for the Project Initialization Engine.
 *
 * EARS Blocks:
 * - Types are used across all EARS (A1-A10, B1-B6, C1-C4, D1, E1-E2, F1-F3, G1)
 */

import type { GitGovConfig, IConfigManager } from '../../config_manager';
import type { IdentityAdapter } from '../identity_adapter';
import type { BacklogAdapter } from '../backlog_adapter';
import type { IProjectInitializer, EnvironmentValidation } from '../../project_initializer';

// Re-export EnvironmentValidation for consumers
export type { EnvironmentValidation } from '../../project_initializer';

/**
 * ProjectAdapter Dependencies - Facade + Dependency Injection Pattern
 *
 * All dependencies are REQUIRED. The caller (CLI, SaaS, tests) is responsible
 * for providing appropriate implementations:
 * - CLI: FsConfigStore, FsSessionStore, FsProjectInitializer
 * - SaaS: DbConfigStore, DbSessionStore, DbProjectInitializer
 * - Tests: MemoryConfigStore, MemorySessionStore, MockProjectInitializer
 */
export interface ProjectAdapterDependencies {
  // Core Adapters (REQUIRED)
  /** Identity management for actor/trust root creation */
  identityAdapter: IdentityAdapter;
  /** Backlog management for cycle/task creation */
  backlogAdapter: BacklogAdapter;

  // Infrastructure Layer (REQUIRED)
  /** Configuration manager (backend-agnostic via ConfigStore) */
  configManager: IConfigManager;

  // Project Initialization (REQUIRED)
  /**
   * Abstraction for project structure creation across backends.
   * VCS checks (remote, branch, commits) are handled by IProjectInitializer.validateEnvironment().
   * - CLI: FsProjectInitializer (filesystem)
   * - SaaS: DbProjectInitializer (database)
   * - Tests: MockProjectInitializer
   */
  projectInitializer: IProjectInitializer;
}

/**
 * Options for project initialization
 */
export type ProjectInitOptions = {
  /** Project name (will be slugified for projectId) */
  name: string;
  /** Path to JSON template file for initial cycles/tasks */
  template?: string;
  /** Display name for bootstrap actor */
  actorName?: string;
  /** Email for bootstrap actor */
  actorEmail?: string;
  /** Workflow methodology (future use) */
  methodology?: 'default' | 'scrum' | 'kanban';
  /** Skip environment validation (for testing) */
  skipValidation?: boolean;
  /** Verbose logging */
  verbose?: boolean;
};

/**
 * Result of project initialization with complete metadata
 */
export type ProjectInitResult = {
  /** Whether initialization succeeded */
  success: boolean;
  /** Generated project identifier */
  projectId: string;
  /** Project display name */
  projectName: string;
  /** Root cycle ID for navigation hierarchy */
  rootCycle: string;
  /** Bootstrap actor information */
  actor: {
    id: string;
    displayName: string;
    publicKeyPath: string;
  };
  /** Template processing results (if template was provided) */
  template?: {
    processed: boolean;
    cyclesCreated: number;
    tasksCreated: number;
  } | undefined;
  /** Initialization time in milliseconds */
  initializationTime: number;
  /** Next steps for CLI display */
  nextSteps: string[];
};

/**
 * Project context for template processing
 */
export type ProjectContext = {
  /** Project identifier */
  projectId: string;
  /** Project name */
  projectName: string;
  /** Bootstrap actor ID */
  actorId: string;
  /** Root cycle ID */
  rootCycle: string;
};

/**
 * Template processing results with detailed metrics
 */
export type TemplateProcessingResult = {
  /** Whether processing succeeded */
  success: boolean;
  /** Number of cycles created */
  cyclesCreated: number;
  /** Number of tasks created */
  tasksCreated: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** IDs of created records */
  createdIds: {
    cycles: string[];
    tasks: string[];
  };
};

/**
 * Project information (Fase 2 - Platform API)
 */
export type ProjectInfo = {
  /** Project identifier */
  id: string;
  /** Project name */
  name: string;
  /** Root cycle ID */
  rootCycle: string;
  /** Protocol version */
  protocolVersion: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Last modification timestamp */
  lastModified?: string;
};

/**
 * Project report with statistics and health analysis (Fase 2)
 */
export type ProjectReport = {
  /** Project basic information */
  project: ProjectInfo;
  /** Project statistics */
  statistics: {
    totalTasks: number;
    totalCycles: number;
    completedTasks: number;
  };
  /** Health analysis */
  health: {
    overallScore: number;
    recommendations: string[];
  };
};

/**
 * ProjectAdapter Interface - Project Bootstrap Engine
 */
export interface IProjectAdapter {
  // FASE 1: Bootstrap Core (Crítico para CLI init)
  initializeProject(options: ProjectInitOptions): Promise<ProjectInitResult>;
  validateEnvironment(): Promise<EnvironmentValidation>;
  processBlueprintTemplate(
    templatePath: string,
    projectContext: ProjectContext
  ): Promise<TemplateProcessingResult>;
  rollbackPartialSetup(setupId: string): Promise<void>;

  // FASE 2: Future capabilities (Platform Integration)
  getProjectInfo(): Promise<ProjectInfo | null>;
  updateProjectConfig(updates: Partial<GitGovConfig>): Promise<void>;
  generateProjectReport(): Promise<ProjectReport>;
}
