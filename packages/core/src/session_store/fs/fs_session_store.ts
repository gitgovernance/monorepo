/**
 * FsSessionStore - Filesystem implementation of SessionStore
 *
 * Handles persistence of .session.json to the local filesystem.
 * Session files are machine-local and NOT versioned in Git.
 *
 * @see packages/blueprints/03_products/protocol/10_appendices/session_state.md
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { SessionStore } from '../session_store';
import type { GitGovSession } from '../../session_manager';

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
  private readonly actorsPath: string;

  constructor(projectRootPath: string) {
    this.sessionPath = path.join(projectRootPath, '.gitgov', '.session.json');
    this.actorsPath = path.join(projectRootPath, '.gitgov', 'actors');
  }

  /**
   * Load local session from .gitgov/.session.json
   *
   * [EARS-B1] Returns complete GitGovSession for valid files
   * [EARS-B2] Returns null for non-existent files (fail-safe)
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
   */
  async saveSession(session: GitGovSession): Promise<void> {
    await fs.writeFile(this.sessionPath, JSON.stringify(session, null, 2), 'utf-8');
  }

  /**
   * Detect actor from .key files in .gitgov/actors/
   *
   * [EARS-B9] Auto-detects actor from private key files.
   * Returns the actor ID if .key files exist, or null otherwise.
   *
   * @returns Actor ID (e.g., "human:camilo-v2") or null
   */
  async detectActorFromKeyFiles(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.actorsPath);

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
