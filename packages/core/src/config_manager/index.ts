/**
 * ConfigManager Module
 *
 * Provides typed access to GitGovernance project configuration (config.json).
 * Configuration is versioned in Git and shared between collaborators.
 *
 * @see packages/blueprints/03_products/protocol/10_appendices/config_file.md
 */

// Types
export type {
  GitGovConfig,
  AuditState,
  SyncConfig,
  SyncDefaults,
  AuditStateUpdate,
  IConfigManager
} from './config_manager.types';

// Implementation
export { ConfigManager } from './config_manager';

// Re-export session types for backward compatibility during migration
// TODO: Remove these after full migration to SessionManager
export type { GitGovSession, ActorState, SyncStatus } from '../session_manager';

// Re-export SessionManager for backward compatibility during migration
// TODO: Remove after full migration - use direct import from '../session_manager'
export { SessionManager } from '../session_manager';
