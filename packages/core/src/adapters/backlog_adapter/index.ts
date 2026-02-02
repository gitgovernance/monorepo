/**
 * BacklogAdapter - The Facade/Mediator
 *
 * Public exports for the backlog_adapter module.
 */

// Types
export type {
  IBacklogAdapter,
  BacklogAdapterDependencies,
  BacklogAdapterConfig,
  LintReport,
  AuditReport,
} from './backlog_adapter.types';

// Implementation
export { BacklogAdapter } from './backlog_adapter';
