/**
 * MemorySessionStore Unit Tests
 *
 * Tests for the in-memory SessionStore implementation.
 *
 * EARS Blocks:
 * - A: SessionStore Contract Methods (§3.1)
 * - B: detectActorFromKeyFiles (§3.2)
 * - C: Test Helpers (§3.3)
 * - D: SessionManager Integration (§3.4)
 */

import { MemorySessionStore } from './memory_session_store';
import type { GitGovSession } from '../../session_manager';

describe('MemorySessionStore', () => {
  // ==================== §3.1 SessionStore Contract Methods (EARS-A) ====================

  describe('SessionStore Contract Methods (EARS-A)', () => {
    it('[EARS-A1] WHEN loadSession is invoked without session set, THE SYSTEM SHALL return null', async () => {
      const store = new MemorySessionStore();

      const result = await store.loadSession();

      expect(result).toBeNull();
    });

    it('[EARS-A2] WHEN loadSession is invoked after setSession, THE SYSTEM SHALL return the session', async () => {
      const store = new MemorySessionStore();
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };
      store.setSession(mockSession);

      const result = await store.loadSession();

      expect(result).toEqual(mockSession);
    });

    it('[EARS-A3] WHEN saveSession is invoked, THE SYSTEM SHALL persist session in memory', async () => {
      const store = new MemorySessionStore();
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };

      await store.saveSession(mockSession);

      const result = await store.loadSession();
      expect(result).toEqual(mockSession);
    });

    it('[EARS-A4] WHEN saveSession is invoked with existing session, THE SYSTEM SHALL overwrite it', async () => {
      const store = new MemorySessionStore();
      const session1: GitGovSession = {
        lastSession: {
          actorId: 'human:alice',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };
      const session2: GitGovSession = {
        lastSession: {
          actorId: 'human:bob',
          timestamp: '2024-01-02T00:00:00Z',
        },
      };

      await store.saveSession(session1);
      await store.saveSession(session2);

      const result = await store.loadSession();
      expect(result?.lastSession?.actorId).toBe('human:bob');
    });
  });

  // ==================== §3.2 detectActorFromKeyFiles (EARS-B) ====================

  describe('detectActorFromKeyFiles (EARS-B)', () => {
    it('[EARS-B1] WHEN detectActorFromKeyFiles is invoked without key files, THE SYSTEM SHALL return null', async () => {
      const store = new MemorySessionStore();

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });

    it('[EARS-B2] WHEN detectActorFromKeyFiles is invoked with key files, THE SYSTEM SHALL return actor ID', async () => {
      const store = new MemorySessionStore();
      store.setKeyFiles(['human:camilo.key']);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBe('human:camilo');
    });

    it('[EARS-B3] WHEN detectActorFromKeyFiles is invoked with multiple key files, THE SYSTEM SHALL return first', async () => {
      const store = new MemorySessionStore();
      store.setKeyFiles(['human:alice.key', 'human:bob.key']);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBe('human:alice');
    });

    it('[EARS-B4] WHEN detectActorFromKeyFiles is invoked with empty array, THE SYSTEM SHALL return null', async () => {
      const store = new MemorySessionStore();
      store.setKeyFiles([]);

      const result = await store.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });
  });

  // ==================== §3.3 Test Helpers (EARS-C) ====================

  describe('Test Helpers (EARS-C)', () => {
    it('[EARS-C1] WHEN setSession is invoked, THE SYSTEM SHALL set session synchronously', () => {
      const store = new MemorySessionStore();
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test',
          timestamp: '2024-01-01T00:00:00Z',
        },
      };

      store.setSession(mockSession);

      expect(store.getSession()).toEqual(mockSession);
    });

    it('[EARS-C2] WHEN setSession is invoked with null, THE SYSTEM SHALL clear the session', () => {
      const store = new MemorySessionStore();
      store.setSession({
        lastSession: { actorId: 'human:test', timestamp: '2024-01-01T00:00:00Z' },
      });

      store.setSession(null);

      expect(store.getSession()).toBeNull();
    });

    it('[EARS-C3] WHEN getSession is invoked, THE SYSTEM SHALL return current session for assertions', () => {
      const store = new MemorySessionStore();
      const mockSession: GitGovSession = {
        lastSession: {
          actorId: 'human:test',
          timestamp: '2024-01-01T00:00:00Z',
        },
        actorState: {
          'human:test': { activeTaskId: 'task-1' },
        },
      };
      store.setSession(mockSession);

      const result = store.getSession();

      expect(result?.actorState?.['human:test']?.activeTaskId).toBe('task-1');
    });

    it('[EARS-C4] WHEN setKeyFiles is invoked, THE SYSTEM SHALL configure simulated key files', async () => {
      const store = new MemorySessionStore();

      store.setKeyFiles(['human:test.key', 'agent:bot.key']);

      const result = await store.detectActorFromKeyFiles();
      expect(result).toBe('human:test');
    });

    it('[EARS-C5] WHEN clear is invoked, THE SYSTEM SHALL reset store to initial state', async () => {
      const store = new MemorySessionStore();
      store.setSession({
        lastSession: { actorId: 'human:test', timestamp: '2024-01-01T00:00:00Z' },
      });
      store.setKeyFiles(['human:test.key']);

      store.clear();

      expect(store.getSession()).toBeNull();
      expect(await store.detectActorFromKeyFiles()).toBeNull();
    });
  });

  // ==================== §3.4 SessionManager Integration (EARS-D) ====================

  describe('SessionManager Integration (EARS-D)', () => {
    it('[EARS-D1] WHEN used with SessionManager for full workflow, THE SYSTEM SHALL support load, update, save', async () => {
      const store = new MemorySessionStore();

      // Initial state - no session
      expect(await store.loadSession()).toBeNull();

      // Save initial session
      const session1: GitGovSession = {
        lastSession: {
          actorId: 'human:alice',
          timestamp: '2024-01-01T00:00:00Z',
        },
        actorState: {},
      };
      await store.saveSession(session1);
      expect(await store.loadSession()).toEqual(session1);

      // Update session with actor state
      const session2: GitGovSession = {
        ...session1,
        actorState: {
          'human:alice': {
            activeTaskId: 'task-123',
            activeCycleId: 'cycle-456',
          },
        },
      };
      await store.saveSession(session2);
      expect((await store.loadSession())?.actorState?.['human:alice']?.activeTaskId).toBe('task-123');
    });

    it('[EARS-D2] WHEN pre-populated for testing, THE SYSTEM SHALL allow data access via SessionManager', async () => {
      const store = new MemorySessionStore();

      // Pre-populate for testing (simulating existing session)
      store.setSession({
        cloud: { sessionToken: 'test-token' },
        lastSession: {
          actorId: 'human:test-user',
          timestamp: '2024-01-01T00:00:00Z',
        },
        actorState: {
          'human:test-user': {
            activeTaskId: 'task-existing',
            syncStatus: { status: 'synced' },
          },
        },
        syncPreferences: {
          pullScheduler: { enabled: true, pullIntervalSeconds: 30 },
        },
      });
      store.setKeyFiles(['human:test-user.key']);

      // Test code can now use the store
      const session = await store.loadSession();
      expect(session?.cloud?.sessionToken).toBe('test-token');
      expect(session?.actorState?.['human:test-user']?.activeTaskId).toBe('task-existing');
      expect(await store.detectActorFromKeyFiles()).toBe('human:test-user');
    });
  });
});
