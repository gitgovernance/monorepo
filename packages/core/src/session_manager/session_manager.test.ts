/**
 * SessionManager Unit Tests
 *
 * Tests for SessionManager which handles session state (.session.json).
 * Configuration tests are in config_manager.test.ts.
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

  // --- Session Methods (EARS-B1 to EARS-B9) ---

  describe('loadSession', () => {
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

  // --- Auto-detect Actor from .key Files (EARS-B9) ---

  describe('detectActorFromKeyFiles and loadSession auto-detection (EARS-A9)', () => {
    it('[EARS-A9] WHEN session exists without actorId and .key files exist, loadSession SHALL auto-detect and set actorId', async () => {
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

    it('[EARS-A9] WHEN session does not exist but .key files exist, loadSession SHALL create session with auto-detected actorId', async () => {
      // No session set
      store.setKeyFiles(['human:developer.key', 'agent:assistant.key']);

      const result = await sessionManager.loadSession();

      // Should create session with first .key file actor
      expect(result?.lastSession?.actorId).toBe('human:developer');
    });

    it('[EARS-A9] WHEN session has valid actorId, loadSession SHALL NOT override with .key file detection', async () => {
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

    it('[EARS-A9] WHEN no .key files exist, detectActorFromKeyFiles SHALL return null', async () => {
      // No key files configured (default)

      const result = await sessionManager.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });
  });

  describe('getActorState', () => {
    it('[EARS-A3] WHEN getActorState is invoked with actorId existing in session, THE SYSTEM SHALL return actor state', async () => {
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

    it('[EARS-A4] WHEN getActorState is invoked with non-existent actorId, THE SYSTEM SHALL return null', async () => {
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

    it('[EARS-A4] WHEN getActorState is invoked with no session, THE SYSTEM SHALL return null', async () => {
      // No session set

      const result = await sessionManager.getActorState('human:anyone');

      expect(result).toBeNull();
    });
  });

  describe('updateActorState', () => {
    it('[EARS-A5] WHEN updateActorState is invoked, THE SYSTEM SHALL merge partial state with existing state and persist', async () => {
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

    it('[EARS-A5] WHEN updateActorState is invoked with human actor, THE SYSTEM SHALL update lastSession automatically', async () => {
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

    it('[EARS-A5] WHEN updateActorState is invoked with agent actor, THE SYSTEM SHALL NOT update lastSession', async () => {
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

    it('[EARS-A6] WHEN updateActorState is invoked with non-existent session, THE SYSTEM SHALL create new session with provided state', async () => {
      // No session set (default)

      const newState: Partial<ActorState> = { activeTaskId: 'task-first', activeCycleId: 'cycle-first' };

      await sessionManager.updateActorState('human:new-user', newState);

      const createdSession = store.getSession();
      expect(createdSession?.actorState?.['human:new-user']?.activeTaskId).toBe('task-first');
      expect(createdSession?.lastSession?.actorId).toBe('human:new-user');
    });

    it('[EARS-A5] WHEN updateActorState is invoked, THE SYSTEM SHALL add lastSync timestamp', async () => {
      const existingSession: GitGovSession = {
        actorState: {}
      };

      store.setSession(existingSession);

      await sessionManager.updateActorState('human:test', { activeTaskId: 'task-1' });

      const updatedSession = store.getSession();
      expect(updatedSession?.actorState?.['human:test']?.lastSync).toBeDefined();
    });
  });

  describe('getCloudSessionToken', () => {
    it('[EARS-A7] WHEN getCloudSessionToken is invoked with token configured, THE SYSTEM SHALL return the session token', async () => {
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'jwt-token-xyz' }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getCloudSessionToken();

      expect(result).toBe('jwt-token-xyz');
    });

    it('[EARS-A8] WHEN getCloudSessionToken is invoked without token configured, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:test', timestamp: '2025-01-09T10:00:00Z' }
        // No cloud.sessionToken
      };

      store.setSession(mockSession);

      const result = await sessionManager.getCloudSessionToken();

      expect(result).toBeNull();
    });

    it('[EARS-A8] WHEN getCloudSessionToken is invoked with no session, THE SYSTEM SHALL return null', async () => {
      // No session set

      const result = await sessionManager.getCloudSessionToken();

      expect(result).toBeNull();
    });
  });

  describe('getSyncPreferences', () => {
    it('[EARS-A10] WHEN getSyncPreferences is invoked with preferences set, THE SYSTEM SHALL return preferences', async () => {
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

    it('[EARS-A11] WHEN getSyncPreferences is invoked without preferences, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:test', timestamp: '2025-01-09T10:00:00Z' }
      };

      store.setSession(mockSession);

      const result = await sessionManager.getSyncPreferences();

      expect(result).toBeNull();
    });
  });

  describe('updateSyncPreferences', () => {
    it('[EARS-B3] WHEN updateSyncPreferences is invoked, THE SYSTEM SHALL merge partial preferences with existing and persist', async () => {
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

    it('[EARS-B3] WHEN updateSyncPreferences is invoked with non-existent session, THE SYSTEM SHALL create new session with preferences', async () => {
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

  describe('getLastSession', () => {
    it('[EARS-A12] WHEN getLastSession is invoked with lastSession set, THE SYSTEM SHALL return lastSession info', async () => {
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

    it('[EARS-A13] WHEN getLastSession is invoked without lastSession, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        actorState: {}
      };

      store.setSession(mockSession);

      const result = await sessionManager.getLastSession();

      expect(result).toBeNull();
    });

    it('[EARS-A13] WHEN getLastSession is invoked with no session, THE SYSTEM SHALL return null', async () => {
      // No session set

      const result = await sessionManager.getLastSession();

      expect(result).toBeNull();
    });
  });
});
