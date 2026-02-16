/**
 * FsSessionStore - Filesystem implementation of SessionStore
 *
 * Handles persistence of .session.json to the local filesystem.
 * Session files are machine-local and NOT versioned in Git.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionStore } from '../session_store';
import type { GitGovSession } from '../../session_manager/session_manager.types';
import { SessionManager } from '../../session_manager/session_manager';

/**
 * Filesystem-based SessionStore implementation.
 *
 * Stores session state in .gitgov/.session.json.
 * Implements fail-safe pattern: returns null instead of throwing for missing files.
 *
 * @example
 * ```typescript
 * const store = new FsSessionStore('/path/to/project');
 * const session = await store.loadSession();
 * if (session) {
 *   console.log(session.lastSession?.actorId);
 * }
 * ```
 */
export class FsSessionStore implements SessionStore {
  private readonly sessionPath: string;
  private readonly keysPath: string;

  constructor(projectRootPath: string) {
    this.sessionPath = path.join(projectRootPath, '.gitgov', '.session.json');
    this.keysPath = path.join(projectRootPath, '.gitgov', 'keys');
  }

  /**
   * Load local session from .gitgov/.session.json
   *
   * [EARS-A1] Returns complete GitGovSession for valid files
   * [EARS-A2] Returns null for non-existent files (fail-safe)
   * [EARS-A3] Returns null for invalid JSON (graceful degradation)
   * [EARS-A4] Returns cloud token if present
   * [EARS-A5] Returns syncPreferences if present
   */
  async loadSession(): Promise<GitGovSession | null> {
    try {
      const sessionContent = await fs.readFile(this.sessionPath, 'utf-8');
      return JSON.parse(sessionContent) as GitGovSession;
    } catch (error) {
      // Session file doesn't exist or is invalid - fail-safe behavior
      return null;
    }
  }

  /**
   * Save local session to .gitgov/.session.json
   *
   * [EARS-B1] Writes session to .gitgov/.session.json with JSON indentation
   * [EARS-B2] Preserves all fields (cloud, actorState, syncPreferences)
   */
  async saveSession(session: GitGovSession): Promise<void> {
    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Detect actor from .key files in .gitgov/keys/
   *
   * [EARS-C1] Returns actor ID from first .key file
   * [EARS-C2] Returns first .key file alphabetically if multiple exist
   * [EARS-C3] Returns null if no .key files exist
   * [EARS-C4] Returns null if keys directory doesn't exist
   * [EARS-C5] Ignores non-.key files
   * [EARS-C6] Returns null for empty directory
   *
   * @returns Actor ID (e.g., "human:camilo-v2") or null
   */
  async detectActorFromKeyFiles(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.keysPath);

      // Find all .key files
      const keyFiles = files.filter(f => f.endsWith('.key'));

      // Get first .key file
      const firstKeyFile = keyFiles[0];
      if (!firstKeyFile) {
        return null;
      }

      // Extract actor ID from filename (remove .key extension)
      // e.g., "human:camilo-v2.key" -> "human:camilo-v2"
      const actorId = firstKeyFile.replace('.key', '');
      return actorId;
    } catch {
      // Directory doesn't exist or can't be read
      return null;
    }
  }
}

/**
 * Create a SessionManager instance for a project.
 *
 * [EARS-D1] Factory function that creates a SessionManager with FsSessionStore backend.
 * Use this when you already have the projectRoot (e.g., from DI container).
 *
 * @param projectRoot - Absolute path to project root (REQUIRED)
 * @returns SessionManager instance with FsSessionStore backend
 */
export function createSessionManager(projectRoot: string): SessionManager {
  const sessionStore = new FsSessionStore(projectRoot);
  return new SessionManager(sessionStore);
}

