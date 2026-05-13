/**
 * FsSessionStore - Filesystem implementation of SessionStore
 *
 * Handles persistence of .session.json to the local filesystem.
 * Session files are machine-local and NOT versioned in Git.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionStore } from '../session_store';
import type { GitGovSession } from '../../session_manager/session_manager.types';
import { SessionManager } from '../../session_manager/session_manager';
import { DEFAULT_ID_ENCODER } from '../../record_store/record_store';

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
    // [G29] Keys are global per-machine, not per-project
    this.keysPath = path.join(os.homedir(), '.gitgov', 'keys');
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
    // [EARS-B3] Ensure directory exists (session.json is volatile — may be deleted)
    await fs.mkdir(path.dirname(this.sessionPath), { recursive: true });
    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Detect actors from .key files in ~/.gitgov/keys/ (G29)
   *
   * [EARS-C1] Returns array of decoded actor IDs from all .key files
   * [EARS-C2] Returns all actor IDs ordered alphabetically by filename
   * [EARS-C3] Returns [] if no .key files exist
   * [EARS-C4] Returns [] if keys directory doesn't exist
   * [EARS-C5] Ignores non-.key files
   * [EARS-C6] Returns [] for empty directory
   */
  async detectActorFromKeyFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.keysPath);

      // [EARS-C5] Filter to .key files only
      const keyFiles = files.filter(f => f.endsWith('.key'));

      // [EARS-C1] Decode all filenames: "human_camilo-v2.key" → "human:camilo-v2"
      return keyFiles.map(f => DEFAULT_ID_ENCODER.decode(f.replace('.key', '')));
    } catch {
      // [EARS-C4] Directory doesn't exist or can't be read
      return [];
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

