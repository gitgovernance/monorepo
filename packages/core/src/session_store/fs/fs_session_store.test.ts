/**
 * FsSessionStore Unit Tests
 *
 * Tests FsSessionStore with mocked filesystem.
 * All EARS prefixes map to fs_session_store_module.md blueprint.
 *
 * EARS Blocks:
 * - A: loadSession (§4.1)
 * - B: saveSession (§4.2)
 * - C: detectActorFromKeyFiles (§4.3)
 * - D: Factory Function (§4.4)
 */

import { FsSessionStore, createSessionManager } from './fs_session_store';
import type { GitGovSession } from '../../session_manager';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
  },
}));

import { promises as fs } from 'fs';

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('FsSessionStore', () => {
  const projectRoot = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== §4.1 loadSession (EARS-A1 to A5) ====================

  describe('4.1. loadSession (EARS-A1 to A5)', () => {
    it('[EARS-A1] WHEN loadSession is invoked with valid session, THE SYSTEM SHALL return complete GitGovSession', async () => {
      const store = new FsSessionStore(projectRoot);
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
        actorState: {},
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await store.loadSession();

      expect(result).toEqual(mockSession);
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        '/test/project/.gitgov/.session.json',
        'utf-8'
      );
    });

    it('[EARS-A2] WHEN loadSession is invoked with non-existent file, THE SYSTEM SHALL return null (fail-safe)', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await store.loadSession();

      expect(result).toBeNull();
    });

    it('[EARS-A3] WHEN loadSession is invoked with invalid JSON, THE SYSTEM SHALL return null (graceful degradation)', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readFile.mockResolvedValue('{ invalid json }');

      const result = await store.loadSession();

      expect(result).toBeNull();
    });

    it('[EARS-A4] WHEN loadSession is invoked with cloud token, THE SYSTEM SHALL return the token', async () => {
      const store = new FsSessionStore(projectRoot);
      const mockSession: GitGovSession = {
        cloud: {
          sessionToken: 'test-token-123',
        },
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await store.loadSession();

      expect(result?.cloud?.sessionToken).toBe('test-token-123');
    });

    it('[EARS-A5] WHEN loadSession is invoked with syncPreferences, THE SYSTEM SHALL return preferences', async () => {
      const store = new FsSessionStore(projectRoot);
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 60,
          },
          fileWatcher: {
            enabled: false,
          },
        },
      };
      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await store.loadSession();

      expect(result?.syncPreferences?.pullScheduler?.enabled).toBe(true);
      expect(result?.syncPreferences?.pullScheduler?.pullIntervalSeconds).toBe(60);
    });
  });

  // ==================== §4.2 saveSession (EARS-B1 to B2) ====================

  describe('4.2. saveSession (EARS-B1 to B2)', () => {
    it('[EARS-B1] WHEN saveSession is invoked, THE SYSTEM SHALL write to .gitgov/.session.json', async () => {
      const store = new FsSessionStore(projectRoot);
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };
      mockedFs.writeFile.mockResolvedValue();

      await store.saveSession(mockSession);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        '/test/project/.gitgov/.session.json',
        JSON.stringify(mockSession, null, 2),
        'utf-8'
      );
    });

    it('[EARS-B2] WHEN saveSession is invoked with complete session, THE SYSTEM SHALL preserve all fields', async () => {
      const store = new FsSessionStore(projectRoot);
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'token' },
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
        actorState: {
          'human:test-user': {
            activeTaskId: 'task-1',
          },
        },
        syncPreferences: {
          pullScheduler: { enabled: true },
        },
      };
      mockedFs.writeFile.mockResolvedValue();

      await store.saveSession(mockSession);

      const writtenContent = mockedFs.writeFile.mock.calls[0]?.[1] as string;
      const parsedSession = JSON.parse(writtenContent);
      expect(parsedSession.cloud.sessionToken).toBe('token');
      expect(parsedSession.actorState['human:test-user'].activeTaskId).toBe('task-1');
      expect(parsedSession.syncPreferences.pullScheduler.enabled).toBe(true);
    });
  });

  // ==================== §4.3 detectActorFromKeyFiles (EARS-C1 to C6) ====================

  describe('4.3. detectActorFromKeyFiles (EARS-C1 to C6)', () => {
    it('[EARS-C1] WHEN detectActorFromKeyFiles is invoked with .key files, THE SYSTEM SHALL return actor ID', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readdir.mockResolvedValue(['human:camilo-v2.key'] as any);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBe('human:camilo-v2');
      expect(mockedFs.readdir).toHaveBeenCalledWith('/test/project/.gitgov/actors');
    });

    it('[EARS-C2] WHEN detectActorFromKeyFiles is invoked with multiple .key files, THE SYSTEM SHALL return first', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readdir.mockResolvedValue([
        'human:alice.key',
        'human:bob.key',
      ] as any);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBe('human:alice');
    });

    it('[EARS-C3] WHEN detectActorFromKeyFiles is invoked without .key files, THE SYSTEM SHALL return null', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readdir.mockResolvedValue(['other.txt', 'readme.md'] as any);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });

    it('[EARS-C4] WHEN detectActorFromKeyFiles is invoked without actors directory, THE SYSTEM SHALL return null', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });

    it('[EARS-C5] WHEN detectActorFromKeyFiles is invoked with non-.key files, THE SYSTEM SHALL ignore them', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readdir.mockResolvedValue([
        'human:alice.pub',
        'human:bob.json',
        'human:charlie.key',
        'readme.md',
      ] as any);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBe('human:charlie');
    });

    it('[EARS-C6] WHEN detectActorFromKeyFiles is invoked with empty directory, THE SYSTEM SHALL return null', async () => {
      const store = new FsSessionStore(projectRoot);
      mockedFs.readdir.mockResolvedValue([] as any);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.4 Factory Function (EARS-D1) ====================

  describe('4.4. Factory Function (EARS-D1)', () => {
    it('[EARS-D1] WHEN createSessionManager is invoked with explicit path, THE SYSTEM SHALL create SessionManager', () => {
      const manager = createSessionManager('/test/project');

      expect(manager).toBeDefined();
      expect(manager.loadSession).toBeDefined();
      expect(manager.getActorState).toBeDefined();
    });
  });
});
