/**
 * ProjectAdapter Module
 *
 * Re-exports for the Project Initialization Engine.
 */

// Types and Interfaces
export type {
  ProjectAdapterDependencies,
  ProjectInitOptions,
  ProjectInitResult,
  ProjectContext,
  TemplateProcessingResult,
  ProjectInfo,
  ProjectReport,
  IProjectAdapter,
  EnvironmentValidation,
} from './project_adapter.types';

// Implementation
export { ProjectAdapter } from './project_adapter';
