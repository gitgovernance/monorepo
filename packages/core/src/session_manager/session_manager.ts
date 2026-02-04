/**
 * SessionManager - Local Session State Manager
 *
 * Provides typed access to GitGovernance session state (.session.json).
 * Session state is ephemeral, machine-local, and NOT versioned in Git.
 *
 * Uses SessionStore abstraction for backend-agnostic persistence.
 */

import type { SessionStore } from '../session_store/session_store';
import type {
  ISessionManager,
  GitGovSession,
  ActorState,
  SyncPreferencesUpdate
} from './session_manager.types';

/**
 * Session Manager Class
 *
 * Provides typed access to GitGovernance session state.
 * Uses SessionStore abstraction for backend-agnostic persistence.
 *
 * @example
 * ```typescript
 * // Production usage
 * import { FsSessionStore } from '@gitgov/core/fs';
 * const sessionStore = new FsSessionStore('/path/to/project');
 * const sessionManager = new SessionManager(sessionStore);
 *
 * // Test usage
 * import { MemorySessionStore } from '@gitgov/core/memory';
 * const sessionStore = new MemorySessionStore();
 * sessionStore.setSession({ ... });
 * const sessionManager = new SessionManager(sessionStore);
 * ```
 */
export class SessionManager implements ISessionManager {
  private readonly sessionStore: SessionStore;

  constructor(sessionStore: SessionStore) {
    this.sessionStore = sessionStore;
  }

  /**
   * Load GitGovernance session state
   * [EARS-E1] Auto-detects actor from .key files if no session or no actorId exists
   */
  async loadSession(): Promise<GitGovSession | null> {
    let session = await this.sessionStore.loadSession();

    // [EARS-E1] If session exists but no lastSession.actorId, try to auto-detect
    if (session && !session.lastSession?.actorId) {
      const detectedActorId = await this.detectActorFromKeyFiles();
      if (detectedActorId) {
        session.lastSession = {
          actorId: detectedActorId,
          timestamp: new Date().toISOString()
        };
        await this.sessionStore.saveSession(session);
      }
    }

    // [EARS-E1] If no session, try to create from .key files
    if (!session) {
      const detectedActorId = await this.detectActorFromKeyFiles();
      if (detectedActorId) {
        const newSession: GitGovSession = {
          lastSession: {
            actorId: detectedActorId,
            timestamp: new Date().toISOString()
          },
          actorState: {}
        };
        try {
          await this.sessionStore.saveSession(newSession);
          return newSession;
        } catch {
          return newSession;
        }
      }
    }

    return session;
  }

  /**
   * [EARS-E1] Detect actor from .key files in .gitgov/actors/
   */
  async detectActorFromKeyFiles(): Promise<string | null> {
    if (this.sessionStore.detectActorFromKeyFiles) {
      return this.sessionStore.detectActorFromKeyFiles();
    }
    return null;
  }

  /**
   * Get actor state for a specific actor
   */
  async getActorState(actorId: string): Promise<ActorState | null> {
    const session = await this.loadSession();
    return session?.actorState?.[actorId] || null;
  }

  /**
   * Update actor state for a specific actor
   */
  async updateActorState(actorId: string, state: Partial<ActorState>): Promise<void> {
    const session = await this.loadSession() || {};
    if (!session.actorState) session.actorState = {};

    session.actorState[actorId] = {
      ...session.actorState[actorId],
      ...state,
      lastSync: new Date().toISOString()
    };

    // Update lastSession if the actor is a human (not an agent)
    if (actorId.startsWith('human:')) {
      session.lastSession = {
        actorId,
        timestamp: new Date().toISOString()
      };
    }

    await this.sessionStore.saveSession(session);
  }

  /**
   * Get cloud session token
   */
  async getCloudSessionToken(): Promise<string | null> {
    const session = await this.loadSession();
    return session?.cloud?.sessionToken || null;
  }

  /**
   * Get sync preferences from session
   */
  async getSyncPreferences(): Promise<GitGovSession['syncPreferences'] | null> {
    const session = await this.loadSession();
    return session?.syncPreferences || null;
  }

  /**
   * Update sync preferences in .session.json
   * These are local machine preferences that override project defaults
   */
  async updateSyncPreferences(preferences: SyncPreferencesUpdate): Promise<void> {
    const session = await this.loadSession() || {};

    if (!session.syncPreferences) {
      session.syncPreferences = {};
    }

    if (preferences.pullScheduler) {
      session.syncPreferences.pullScheduler = {
        ...session.syncPreferences.pullScheduler,
        ...preferences.pullScheduler
      };
    }

    if (preferences.fileWatcher) {
      session.syncPreferences.fileWatcher = {
        ...session.syncPreferences.fileWatcher,
        ...preferences.fileWatcher
      };
    }

    await this.sessionStore.saveSession(session);
  }

  /**
   * Get last session info (last human who interacted)
   */
  async getLastSession(): Promise<{ actorId: string; timestamp: string } | null> {
    const session = await this.loadSession();
    return session?.lastSession || null;
  }
}
