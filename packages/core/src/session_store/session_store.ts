/**
 * SessionStore - Session persistence abstraction
 *
 * Interface for storing and retrieving local session state (.session.json).
 * Session state is ephemeral, machine-local, and NOT versioned in Git.
 *
 * Implementations:
 * - FsSessionStore: Filesystem-based (production)
 * - MemorySessionStore: In-memory (tests, serverless)
 */

import type { GitGovSession } from '../session_manager';

/**
 * Interface for session state persistence.
 *
 * Session state includes:
 * - Actor state (activeTaskId, activeCycleId, syncStatus)
 * - Sync preferences (pullScheduler, fileWatcher settings)
 * - Cloud session tokens
 * - Last session information
 *
 * Unlike ConfigStore, SessionStore handles ephemeral, machine-local state
 * that is NOT shared between collaborators.
 */
export interface SessionStore {
  /**
   * Load session state from storage.
   *
   * @returns GitGovSession object or null if not found
   */
  loadSession(): Promise<GitGovSession | null>;

  /**
   * Save session state to storage.
   *
   * @param session - The session state to persist
   */
  saveSession(session: GitGovSession): Promise<void>;

  /**
   * Detect actor from private key files.
   *
   * Optional method for implementations that support actor auto-detection
   * from .key files in the actors directory.
   *
   * @returns Actor ID (e.g., "human:camilo-v2") or null if not detectable
   */
  detectActorFromKeyFiles?(): Promise<string | null>;
}
