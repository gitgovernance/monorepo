/**
 * SessionManager Module
 *
 * Provides typed access to GitGovernance session state (.session.json).
 * Session state is ephemeral, machine-local, and NOT versioned in Git.
 *
 * @see packages/blueprints/03_products/protocol/10_appendices/session_state.md
 */

// Types
export type {
  SyncStatus,
  ActorState,
  GitGovSession,
  SyncPreferencesUpdate,
  ISessionManager
} from './session_manager.types';

// Implementation
export { SessionManager } from './session_manager';
