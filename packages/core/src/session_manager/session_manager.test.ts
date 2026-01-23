/**
 * SessionManager Unit Tests
 *
 * Tests for SessionManager which handles session state (.session.json).
 * Configuration tests are in config_manager.test.ts.
 *
 * EARS Blocks:
 * - A: loadSession (§4.1)
 * - B: getActorState (§4.2)
 * - C: updateActorState (§4.3)
 * - D: getCloudSessionToken (§4.4)
 * - E: detectActorFromKeyFiles (§4.5)
 * - F: getSyncPreferences (§4.6)
 * - G: getLastSession (§4.7)
 * - H: updateSyncPreferences (§4.8)
 */

import { SessionManager } from './session_manager';
import { MemorySessionStore } from '../session_store/memory';
import type { GitGovSession, ActorState } from './session_manager.types';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let store: MemorySessionStore;

  beforeEach(() => {
    store = new MemorySessionStore();
    sessionManager = new SessionManager(store);
  });

  // ==================== §4.1 loadSession (EARS-A) ====================

  describe('loadSession (EARS-A)', () => {
    it('[EARS-A1] WHEN loadSession is invoked with valid session, THE SYSTEM SHALL return complete GitGovSession object', async () => {
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'jwt-token-123' },
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-09T10:00:00Z' },
        actorState: {
          'human:camilo': { activeTaskId: 'task-123', activeCycleId: 'cycle-456', lastSync: '2025-01-09T09:30:00Z' }
        }
      };

      store.setSession(mockSession);

      const result = await sessionManager.loadSession();

      expect(result).toEqual(mockSession);
    });

    it('[EARS-A2] WHEN loadSession is invoked with no session set, THE SYSTEM SHALL return null without throwing error', async () => {
      // store has no session set (default)
      // Also no key files configured

      const result = await sessionManager.loadSession();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.2 getActorState (EARS-B) ====================

  describe('getActorState (EARS-B)', () => {
    it('[EARS-B1] WHEN getActorState is invoked with actorId existing in session, THE SYSTEM SHALL return actor state', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-09T10:00:00Z' },
        actorState: {
          'human:camilo': { activeTaskId: 'task-789', activeCycleId: 'cycle-101', lastSync: '2025-01-09T10:15:00Z' }
        }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getActorState('human:camilo');

      expect(result).toEqual({
        activeTaskId: 'task-789',
        activeCycleId: 'cycle-101',
        lastSync: '2025-01-09T10:15:00Z'
      });
    });

    it('[EARS-B2] WHEN getActorState is invoked with non-existent actorId, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:alice', timestamp: '2025-01-09T10:00:00Z' },
        actorState: {
          'human:alice': { activeTaskId: 'task-999' }
        }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getActorState('human:bob');

      expect(result).toBeNull();
    });

    it('[EARS-B2] WHEN getActorState is invoked with no session, THE SYSTEM SHALL return null', async () => {
      // No session set

      const result = await sessionManager.getActorState('human:anyone');

      expect(result).toBeNull();
    });
  });

  // ==================== §4.3 updateActorState (EARS-C) ====================

  describe('updateActorState (EARS-C)', () => {
    it('[EARS-C1] WHEN updateActorState is invoked, THE SYSTEM SHALL merge partial state with existing state and persist', async () => {
      const existingSession: GitGovSession = {
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-08T10:00:00Z' },
        actorState: {
          'human:camilo': { activeTaskId: 'task-old', activeCycleId: 'cycle-old', lastSync: '2025-01-08T10:00:00Z' }
        }
      };

      store.setSession(existingSession);

      const partialState: Partial<ActorState> = { activeTaskId: 'task-new' };

      await sessionManager.updateActorState('human:camilo', partialState);

      const updatedSession = store.getSession();
      expect(updatedSession?.actorState?.['human:camilo']?.activeTaskId).toBe('task-new');
      expect(updatedSession?.actorState?.['human:camilo']?.activeCycleId).toBe('cycle-old'); // Preserved
    });

    it('[EARS-C1] WHEN updateActorState is invoked, THE SYSTEM SHALL add lastSync timestamp', async () => {
      const existingSession: GitGovSession = {
        actorState: {}
      };

      store.setSession(existingSession);

      await sessionManager.updateActorState('human:test', { activeTaskId: 'task-1' });

      const updatedSession = store.getSession();
      expect(updatedSession?.actorState?.['human:test']?.lastSync).toBeDefined();
    });

    it('[EARS-C2] WHEN updateActorState is invoked with non-existent session, THE SYSTEM SHALL create new session with provided state', async () => {
      // No session set (default)

      const newState: Partial<ActorState> = { activeTaskId: 'task-first', activeCycleId: 'cycle-first' };

      await sessionManager.updateActorState('human:new-user', newState);

      const createdSession = store.getSession();
      expect(createdSession?.actorState?.['human:new-user']?.activeTaskId).toBe('task-first');
      expect(createdSession?.lastSession?.actorId).toBe('human:new-user');
    });

    it('[EARS-C3] WHEN updateActorState is invoked with human actor, THE SYSTEM SHALL update lastSession automatically', async () => {
      const existingSession: GitGovSession = {
        lastSession: { actorId: 'human:old-user', timestamp: '2025-01-08T10:00:00Z' },
        actorState: {
          'human:camilo': { activeTaskId: 'task-123' }
        }
      };

      store.setSession(existingSession);

      await sessionManager.updateActorState('human:camilo', { activeTaskId: 'task-456' });

      const updatedSession = store.getSession();
      expect(updatedSession?.lastSession?.actorId).toBe('human:camilo');
      expect(new Date(updatedSession?.lastSession?.timestamp || '').getTime()).toBeGreaterThan(
        new Date('2025-01-08T10:00:00Z').getTime()
      );
    });

    it('[EARS-C4] WHEN updateActorState is invoked with agent actor, THE SYSTEM SHALL NOT update lastSession', async () => {
      const existingSession: GitGovSession = {
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-08T10:00:00Z' },
        actorState: {}
      };

      store.setSession(existingSession);

      await sessionManager.updateActorState('agent:camilo:cursor', { activeTaskId: 'task-789' });

      const updatedSession = store.getSession();
      // lastSession should remain unchanged for agent actors
      expect(updatedSession?.lastSession?.actorId).toBe('human:camilo');
      expect(updatedSession?.lastSession?.timestamp).toBe('2025-01-08T10:00:00Z');
    });
  });

  // ==================== §4.4 getCloudSessionToken (EARS-D) ====================

  describe('getCloudSessionToken (EARS-D)', () => {
    it('[EARS-D1] WHEN getCloudSessionToken is invoked with token configured, THE SYSTEM SHALL return the session token', async () => {
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'jwt-token-xyz' }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getCloudSessionToken();

      expect(result).toBe('jwt-token-xyz');
    });

    it('[EARS-D2] WHEN getCloudSessionToken is invoked without token configured, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:test', timestamp: '2025-01-09T10:00:00Z' }
        // No cloud.sessionToken
      };

      store.setSession(mockSession);

      const result = await sessionManager.getCloudSessionToken();

      expect(result).toBeNull();
    });

    it('[EARS-D2] WHEN getCloudSessionToken is invoked with no session, THE SYSTEM SHALL return null', async () => {
      // No session set

      const result = await sessionManager.getCloudSessionToken();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.5 detectActorFromKeyFiles (EARS-E) ====================

  describe('detectActorFromKeyFiles (EARS-E)', () => {
    it('[EARS-E1] WHEN session exists without actorId and .key files exist, loadSession SHALL auto-detect and set actorId', async () => {
      // Session exists but without lastSession.actorId
      const sessionWithoutActor: GitGovSession = {
        actorState: {}
      };

      store.setSession(sessionWithoutActor);
      store.setKeyFiles(['human:camilo-v2.key']);

      const result = await sessionManager.loadSession();

      // Should auto-detect actor from .key file
      expect(result?.lastSession?.actorId).toBe('human:camilo-v2');
    });

    it('[EARS-E1] WHEN session does not exist but .key files exist, loadSession SHALL create session with auto-detected actorId', async () => {
      // No session set
      store.setKeyFiles(['human:developer.key', 'agent:assistant.key']);

      const result = await sessionManager.loadSession();

      // Should create session with first .key file actor
      expect(result?.lastSession?.actorId).toBe('human:developer');
    });

    it('[EARS-E1] WHEN session has valid actorId, loadSession SHALL NOT override with .key file detection', async () => {
      const sessionWithActor: GitGovSession = {
        lastSession: { actorId: 'human:existing-user', timestamp: '2025-01-01T00:00:00Z' },
        actorState: {}
      };

      store.setSession(sessionWithActor);
      store.setKeyFiles(['human:other-user.key']); // Different actor

      const result = await sessionManager.loadSession();

      // Should preserve existing actorId
      expect(result?.lastSession?.actorId).toBe('human:existing-user');
    });

    it('[EARS-E2] WHEN no .key files exist, detectActorFromKeyFiles SHALL return null', async () => {
      // No key files configured (default)

      const result = await sessionManager.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.6 getSyncPreferences (EARS-F) ====================

  describe('getSyncPreferences (EARS-F)', () => {
    it('[EARS-F1] WHEN getSyncPreferences is invoked with preferences set, THE SYSTEM SHALL return preferences', async () => {
      const mockSession: GitGovSession = {
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 60
          },
          fileWatcher: {
            enabled: false
          }
        }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getSyncPreferences();

      expect(result?.pullScheduler?.enabled).toBe(true);
      expect(result?.pullScheduler?.pullIntervalSeconds).toBe(60);
      expect(result?.fileWatcher?.enabled).toBe(false);
    });

    it('[EARS-F2] WHEN getSyncPreferences is invoked without preferences, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:test', timestamp: '2025-01-09T10:00:00Z' }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getSyncPreferences();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.7 getLastSession (EARS-G) ====================

  describe('getLastSession (EARS-G)', () => {
    it('[EARS-G1] WHEN getLastSession is invoked with lastSession set, THE SYSTEM SHALL return lastSession info', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-09T10:00:00Z' }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getLastSession();

      expect(result).toEqual({
        actorId: 'human:camilo',
        timestamp: '2025-01-09T10:00:00Z'
      });
    });

    it('[EARS-G2] WHEN getLastSession is invoked without lastSession, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        actorState: {}
      };

      store.setSession(mockSession);

      const result = await sessionManager.getLastSession();

      expect(result).toBeNull();
    });

    it('[EARS-G2] WHEN getLastSession is invoked with no session, THE SYSTEM SHALL return null', async () => {
      // No session set

      const result = await sessionManager.getLastSession();

      expect(result).toBeNull();
    });
  });

  // ==================== §4.8 updateSyncPreferences (EARS-H) ====================

  describe('updateSyncPreferences (EARS-H)', () => {
    it('[EARS-H3] WHEN updateSyncPreferences is invoked, THE SYSTEM SHALL merge partial preferences with existing and persist', async () => {
      const existingSession: GitGovSession = {
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30
          }
        }
      };

      store.setSession(existingSession);

      await sessionManager.updateSyncPreferences({
        pullScheduler: {
          pullIntervalSeconds: 60 // Update only interval, keep enabled
        },
        fileWatcher: {
          enabled: true,
          debounceMs: 500
        }
      });

      const updatedSession = store.getSession();

      expect(updatedSession?.syncPreferences?.pullScheduler).toEqual({
        enabled: true, // Preserved from existing
        pullIntervalSeconds: 60 // Updated
      });

      expect(updatedSession?.syncPreferences?.fileWatcher).toEqual({
        enabled: true,
        debounceMs: 500
      });
    });

    it('[EARS-H3] WHEN updateSyncPreferences is invoked with non-existent session, THE SYSTEM SHALL create new session with preferences', async () => {
      // No session set

      await sessionManager.updateSyncPreferences({
        pullScheduler: {
          enabled: true,
          pullIntervalSeconds: 45
        }
      });

      const createdSession = store.getSession();

      expect(createdSession?.syncPreferences?.pullScheduler).toEqual({
        enabled: true,
        pullIntervalSeconds: 45
      });
    });
  });
});
