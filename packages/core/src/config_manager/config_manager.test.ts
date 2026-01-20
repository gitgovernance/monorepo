import { promises as fs } from 'fs';
import * as path from 'path';
import { ConfigManager, createConfigManager } from './index';
import { FsConfigStore } from '../store/fs/config_store';
import type { GitGovConfig, GitGovSession, ActorState } from './index';

// Mock filesystem operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
  },
  existsSync: jest.fn(),
}));

const mockedFs = jest.mocked(fs);
const mockedExistsSync = jest.mocked(require('fs').existsSync);

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = '/test/project';
    configManager = createConfigManager(tempDir);
    // Reset project root cache
    (global as any).projectRoot = null;
  });

  // --- Configuration Methods (EARS-A1 to EARS-A9) ---

  describe('loadConfig', () => {
    it('[EARS-A1] WHEN loadConfig is invoked with valid config.json file, THE SYSTEM SHALL return complete GitGovConfig object', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project-123',
        projectName: 'Test Project',
        rootCycle: 'root-cycle-456',
        state: { branch: 'gitgov-state' }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.loadConfig();

      expect(result).toEqual(mockConfig);
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', 'config.json'),
        'utf-8'
      );
    });

    it('[EARS-A2] WHEN loadConfig is invoked with non-existent config.json file, THE SYSTEM SHALL return null without throwing error', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await configManager.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-A3] WHEN loadConfig is invoked with invalid JSON in config.json, THE SYSTEM SHALL return null without throwing error', async () => {
      mockedFs.readFile.mockResolvedValue('{ invalid json }');

      const result = await configManager.loadConfig();

      expect(result).toBeNull();
    });
  });

  describe('getRootCycle', () => {
    it('[EARS-A4] WHEN getRootCycle is invoked with configuration that has rootCycle defined, THE SYSTEM SHALL return the root cycle ID', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.getRootCycle();

      expect(result).toBe('root-cycle-123');
    });

    it('[EARS-A5] WHEN getRootCycle is invoked with configuration without rootCycle defined, THE SYSTEM SHALL return null', async () => {
      // Note: This test simulates an invalid/incomplete config.json file
      // In practice, rootCycle is obligatory and created during 'gitgov init'
      const incompleteConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test'
        // Missing rootCycle - invalid config
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(incompleteConfig));

      const result = await configManager.getRootCycle();

      expect(result).toBeNull();
    });
  });

  describe('getProjectInfo', () => {
    it('[EARS-A6] WHEN getProjectInfo is invoked with valid configuration, THE SYSTEM SHALL return object with projectId and projectName', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'project-456',
        projectName: 'My Project',
        rootCycle: 'root-cycle-789'
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.getProjectInfo();

      expect(result).toEqual({
        id: 'project-456',
        name: 'My Project'
      });
    });
  });

  // --- Session Methods (EARS-B1 to EARS-B9) ---

  describe('loadSession', () => {
    it('[EARS-B1] WHEN loadSession is invoked with valid .session.json file, THE SYSTEM SHALL return complete GitGovSession object', async () => {
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'jwt-token-123' },
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-09T10:00:00Z' },
        actorState: {
          'human:camilo': { activeTaskId: 'task-123', activeCycleId: 'cycle-456', lastSync: '2025-01-09T09:30:00Z' }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.loadSession();

      expect(result).toEqual(mockSession);
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', '.session.json'),
        'utf-8'
      );
    });

    it('[EARS-B2] WHEN loadSession is invoked with non-existent .session.json file, THE SYSTEM SHALL return null without throwing error', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      // Mock readdir to return no .key files
      (mockedFs.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const result = await configManager.loadSession();

      expect(result).toBeNull();
    });
  });

  // --- Auto-detect Actor from .key Files (EARS-B9) ---

  describe('detectActorFromKeyFiles and loadSession auto-detection (EARS-B9)', () => {
    it('[EARS-B9] WHEN .session.json exists without actorId and .key files exist, loadSession SHALL auto-detect and set actorId', async () => {
      // Session exists but without lastSession.actorId
      const sessionWithoutActor: GitGovSession = {
        actorState: {}
      };

      // Mock readFile to return session without actorId
      mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(sessionWithoutActor));
      mockedFs.writeFile.mockResolvedValue();

      // Mock readdir to return .key files
      (mockedFs.readdir as jest.Mock).mockResolvedValue(['human:camilo-v2.key']);

      const result = await configManager.loadSession();

      // Should auto-detect actor from .key file
      expect(result?.lastSession?.actorId).toBe('human:camilo-v2');
      // Should persist the auto-detected session
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('[EARS-B9] WHEN .session.json does not exist but .key files exist, loadSession SHALL create session with auto-detected actorId', async () => {
      // Session file doesn't exist
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockedFs.writeFile.mockResolvedValue();

      // Mock readdir to return .key files
      (mockedFs.readdir as jest.Mock).mockResolvedValue(['human:developer.key', 'agent:assistant.key']);

      const result = await configManager.loadSession();

      // Should create session with first .key file actor
      expect(result?.lastSession?.actorId).toBe('human:developer');
      // Should persist the new session
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });

    it('[EARS-B9] WHEN .session.json has valid actorId, loadSession SHALL NOT override with .key file detection', async () => {
      const sessionWithActor: GitGovSession = {
        lastSession: { actorId: 'human:existing-user', timestamp: '2025-01-01T00:00:00Z' },
        actorState: {}
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(sessionWithActor));

      const result = await configManager.loadSession();

      // Should preserve existing actorId
      expect(result?.lastSession?.actorId).toBe('human:existing-user');
      // Should NOT write file (no changes needed)
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });

    it('[EARS-B9] WHEN no .key files exist, detectActorFromKeyFiles SHALL return null', async () => {
      // Mock readdir to return no .key files
      (mockedFs.readdir as jest.Mock).mockResolvedValue(['actor.json', 'README.md']);

      // @ts-ignore - accessing private method for testing
      const result = await configManager.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });

    it('[EARS-B9] WHEN actors directory does not exist, detectActorFromKeyFiles SHALL return null', async () => {
      // Mock readdir to throw (directory doesn't exist)
      (mockedFs.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      // @ts-ignore - accessing private method for testing
      const result = await configManager.detectActorFromKeyFiles();

      expect(result).toBeNull();
    });
  });

  describe('getActorState', () => {
    it('[EARS-B3] WHEN getActorState is invoked with actorId existing in session, THE SYSTEM SHALL return actor state', async () => {
      const mockSession: GitGovSession = {
        actorState: {
          'human:camilo': { activeTaskId: 'task-789', activeCycleId: 'cycle-101', lastSync: '2025-01-09T10:15:00Z' }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.getActorState('human:camilo');

      expect(result).toEqual({
        activeTaskId: 'task-789',
        activeCycleId: 'cycle-101',
        lastSync: '2025-01-09T10:15:00Z'
      });
    });

    it('[EARS-B4] WHEN getActorState is invoked with non-existent actorId, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        actorState: {
          'human:alice': { activeTaskId: 'task-999' }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.getActorState('human:bob');

      expect(result).toBeNull();
    });
  });

  describe('updateActorState', () => {
    it('[EARS-B5] WHEN updateActorState is invoked, THE SYSTEM SHALL merge partial state with existing state and persist', async () => {
      const existingSession: GitGovSession = {
        actorState: {
          'human:camilo': { activeTaskId: 'task-old', activeCycleId: 'cycle-old', lastSync: '2025-01-08T10:00:00Z' }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingSession));
      mockedFs.writeFile.mockResolvedValue();

      const partialState: Partial<ActorState> = { activeTaskId: 'task-new' };

      await configManager.updateActorState('human:camilo', partialState);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', '.session.json'),
        expect.stringContaining('task-new'),
        'utf-8'
      );
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', '.session.json'),
        expect.stringContaining('cycle-old'),
        'utf-8'
      );
    });

    it('WHEN updateActorState is invoked with human actor, THE SYSTEM SHALL update lastSession automatically', async () => {
      const existingSession: GitGovSession = {
        lastSession: { actorId: 'human:old-user', timestamp: '2025-01-08T10:00:00Z' },
        actorState: {
          'human:camilo': { activeTaskId: 'task-123' }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingSession));
      mockedFs.writeFile.mockResolvedValue();

      await configManager.updateActorState('human:camilo', { activeTaskId: 'task-456' });

      const writeCall = mockedFs.writeFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenSession = JSON.parse(writeCall![1] as string) as GitGovSession;

      expect(writtenSession.lastSession).toBeDefined();
      expect(writtenSession.lastSession?.actorId).toBe('human:camilo');
      expect(writtenSession.lastSession?.timestamp).toBeDefined();
      expect(new Date(writtenSession.lastSession!.timestamp).getTime()).toBeGreaterThan(
        new Date('2025-01-08T10:00:00Z').getTime()
      );
    });

    it('WHEN updateActorState is invoked with agent actor, THE SYSTEM SHALL NOT update lastSession', async () => {
      const existingSession: GitGovSession = {
        lastSession: { actorId: 'human:camilo', timestamp: '2025-01-08T10:00:00Z' },
        actorState: {}
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingSession));
      mockedFs.writeFile.mockResolvedValue();

      await configManager.updateActorState('agent:camilo:cursor', { activeTaskId: 'task-789' });

      const writeCall = mockedFs.writeFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenSession = JSON.parse(writeCall![1] as string) as GitGovSession;

      // lastSession should remain unchanged for agent actors
      expect(writtenSession.lastSession?.actorId).toBe('human:camilo');
      expect(writtenSession.lastSession?.timestamp).toBe('2025-01-08T10:00:00Z');
    });

    it('[EARS-B6] WHEN updateActorState is invoked with non-existent session, THE SYSTEM SHALL create new session with provided state', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockedFs.writeFile.mockResolvedValue();

      const newState: Partial<ActorState> = { activeTaskId: 'task-first', activeCycleId: 'cycle-first' };

      await configManager.updateActorState('human:new-user', newState);

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', '.session.json'),
        expect.stringContaining('human:new-user'),
        'utf-8'
      );
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', '.session.json'),
        expect.stringContaining('task-first'),
        'utf-8'
      );

      // Verify lastSession is created for human actors
      const writeCall = mockedFs.writeFile.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenSession = JSON.parse(writeCall![1] as string) as GitGovSession;
      expect(writtenSession.lastSession).toBeDefined();
      expect(writtenSession.lastSession?.actorId).toBe('human:new-user');
    });
  });

  describe('getCloudSessionToken', () => {
    it('[EARS-B7] WHEN getCloudSessionToken is invoked with token configured, THE SYSTEM SHALL return the session token', async () => {
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'jwt-token-xyz' }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.getCloudSessionToken();

      expect(result).toBe('jwt-token-xyz');
    });

    it('[EARS-B8] WHEN getCloudSessionToken is invoked without token configured, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:test', timestamp: '2025-01-09T10:00:00Z' }
        // No cloud.sessionToken
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.getCloudSessionToken();

      expect(result).toBeNull();
    });
  });

  // --- Sync Configuration Methods (EARS-A7 to EARS-A9) ---

  describe('getSyncConfig', () => {
    it('[EARS-A7] WHEN getSyncConfig is invoked with state.sync defined in config.json, THE SYSTEM SHALL return object with strategy, maxRetries, and intervals', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          sync: {
            strategy: 'immediate',
            maxRetries: 5,
            pushIntervalSeconds: 60,
            batchIntervalSeconds: 120
          }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.getSyncConfig();

      expect(result).toEqual({
        strategy: 'immediate',
        maxRetries: 5,
        pushIntervalSeconds: 60,
        batchIntervalSeconds: 120
      });
    });

    it('[EARS-A8] WHEN getSyncConfig is invoked without state.sync in config.json, THE SYSTEM SHALL return null', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
        // No state.sync
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.getSyncConfig();

      expect(result).toBeNull();
    });
  });

  describe('getSyncDefaults', () => {
    it('[EARS-A9] WHEN getSyncDefaults is invoked, THE SYSTEM SHALL return defaults from config.json or hardcoded fallbacks', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          defaults: {
            pullScheduler: {
              defaultIntervalSeconds: 45,
              defaultEnabled: true,
              defaultContinueOnNetworkError: false,
              defaultStopOnConflict: true
            },
            fileWatcher: {
              defaultDebounceMs: 500,
              defaultIgnoredPatterns: ['*.log', '*.bak']
            }
          }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.getSyncDefaults();

      expect(result).toEqual({
        pullScheduler: {
          defaultIntervalSeconds: 45,
          defaultEnabled: true,
          defaultContinueOnNetworkError: false,
          defaultStopOnConflict: true
        },
        fileWatcher: {
          defaultDebounceMs: 500,
          defaultIgnoredPatterns: ['*.log', '*.bak']
        }
      });
    });

    it('WHEN getSyncDefaults is invoked without state.defaults, THE SYSTEM SHALL return hardcoded fallbacks', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123'
        // No state.defaults
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.getSyncDefaults();

      expect(result).toEqual({
        pullScheduler: {
          defaultIntervalSeconds: 30,
          defaultEnabled: false,
          defaultContinueOnNetworkError: true,
          defaultStopOnConflict: false
        },
        fileWatcher: {
          defaultDebounceMs: 300,
          defaultIgnoredPatterns: ["*.tmp", ".DS_Store", "*.swp"]
        }
      });
    });
  });

  // --- Sync Preferences Resolution (EARS-D1 to EARS-D3) ---

  describe('resolvePullSchedulerConfig', () => {
    it('[EARS-D1] WHEN resolvePullSchedulerConfig is invoked, THE SYSTEM SHALL apply priority: local > project > hardcoded', async () => {
      // Setup: config with project defaults
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          defaults: {
            pullScheduler: {
              defaultIntervalSeconds: 45,
              defaultEnabled: true,
              defaultContinueOnNetworkError: false,
              defaultStopOnConflict: true
            }
          }
        }
      };

      // Setup: session with local preferences (overrides project)
      const mockSession: GitGovSession = {
        syncPreferences: {
          pullScheduler: {
            enabled: false, // Override project default (true)
            pullIntervalSeconds: 60 // Override project default (45)
            // continueOnNetworkError not set, should use project default
            // stopOnConflict not set, should use project default
          }
        }
      };

      // Mock both reads
      mockedFs.readFile.mockImplementation(async (path: any) => {
        if (path.includes('config.json')) {
          return JSON.stringify(mockConfig);
        }
        if (path.includes('.session.json')) {
          return JSON.stringify(mockSession);
        }
        throw new Error('File not found');
      });

      const result = await configManager.resolvePullSchedulerConfig();

      expect(result).toEqual({
        enabled: false, // Local preference
        pullIntervalSeconds: 60, // Local preference
        continueOnNetworkError: false, // Project default (no local override)
        stopOnConflict: true // Project default (no local override)
      });
    });

    it('WHEN resolvePullSchedulerConfig is invoked without local preferences, THE SYSTEM SHALL use project defaults', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          defaults: {
            pullScheduler: {
              defaultIntervalSeconds: 45,
              defaultEnabled: true,
              defaultContinueOnNetworkError: false,
              defaultStopOnConflict: true
            }
          }
        }
      };

      const mockSession: GitGovSession = {
        // No syncPreferences
      };

      mockedFs.readFile.mockImplementation(async (path: any) => {
        if (path.includes('config.json')) {
          return JSON.stringify(mockConfig);
        }
        if (path.includes('.session.json')) {
          return JSON.stringify(mockSession);
        }
        throw new Error('File not found');
      });

      const result = await configManager.resolvePullSchedulerConfig();

      expect(result).toEqual({
        enabled: true,
        pullIntervalSeconds: 45,
        continueOnNetworkError: false,
        stopOnConflict: true
      });
    });

    it('WHEN resolvePullSchedulerConfig is invoked without config or session, THE SYSTEM SHALL use hardcoded defaults', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const result = await configManager.resolvePullSchedulerConfig();

      expect(result).toEqual({
        enabled: false,
        pullIntervalSeconds: 30,
        continueOnNetworkError: true,
        stopOnConflict: false
      });
    });
  });

  describe('resolveFileWatcherConfig', () => {
    it('[EARS-D2] WHEN resolveFileWatcherConfig is invoked, THE SYSTEM SHALL apply priority: local > project > hardcoded', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          defaults: {
            fileWatcher: {
              defaultDebounceMs: 500,
              defaultIgnoredPatterns: ['*.log', '*.bak']
            }
          }
        }
      };

      const mockSession: GitGovSession = {
        syncPreferences: {
          fileWatcher: {
            enabled: true,
            debounceMs: 1000, // Override project default
            // ignoredPatterns not set, should use project default
          }
        }
      };

      mockedFs.readFile.mockImplementation(async (path: any) => {
        if (path.includes('config.json')) {
          return JSON.stringify(mockConfig);
        }
        if (path.includes('.session.json')) {
          return JSON.stringify(mockSession);
        }
        throw new Error('File not found');
      });

      const result = await configManager.resolveFileWatcherConfig();

      expect(result).toEqual({
        enabled: true, // Local preference
        debounceMs: 1000, // Local preference
        ignoredPatterns: ['*.log', '*.bak'] // Project default
      });
    });

    it('WHEN resolveFileWatcherConfig is invoked without local preferences, THE SYSTEM SHALL use project defaults', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project',
        projectName: 'Test',
        rootCycle: 'root-cycle-123',
        state: {
          defaults: {
            fileWatcher: {
              defaultDebounceMs: 500,
              defaultIgnoredPatterns: ['*.log']
            }
          }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.resolveFileWatcherConfig();

      expect(result).toEqual({
        enabled: false, // Hardcoded default (file watchers disabled by default)
        debounceMs: 500,
        ignoredPatterns: ['*.log']
      });
    });
  });

  describe('updateSyncPreferences', () => {
    it('[EARS-D3] WHEN updateSyncPreferences is invoked, THE SYSTEM SHALL merge partial preferences with existing and persist to session', async () => {
      const existingSession: GitGovSession = {
        syncPreferences: {
          pullScheduler: {
            enabled: true,
            pullIntervalSeconds: 30
          }
        }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(existingSession));
      mockedFs.writeFile.mockResolvedValue();

      await configManager.updateSyncPreferences({
        pullScheduler: {
          pullIntervalSeconds: 60 // Update only interval, keep enabled
        },
        fileWatcher: {
          enabled: true,
          debounceMs: 500
        }
      });

      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', '.session.json'),
        expect.stringContaining('"pullIntervalSeconds": 60'),
        'utf-8'
      );

      // Verify merge happened
      const writeCall = mockedFs.writeFile.mock.calls[0];
      const writtenSession = JSON.parse(writeCall![1] as string) as GitGovSession;

      expect(writtenSession.syncPreferences?.pullScheduler).toEqual({
        enabled: true, // Preserved from existing
        pullIntervalSeconds: 60 // Updated
      });

      expect(writtenSession.syncPreferences?.fileWatcher).toEqual({
        enabled: true,
        debounceMs: 500
      });
    });

    it('WHEN updateSyncPreferences is invoked with non-existent session, THE SYSTEM SHALL create new session with preferences', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockedFs.writeFile.mockResolvedValue();

      await configManager.updateSyncPreferences({
        pullScheduler: {
          enabled: true,
          pullIntervalSeconds: 45
        }
      });

      const writeCall = mockedFs.writeFile.mock.calls[0];
      const writtenSession = JSON.parse(writeCall![1] as string) as GitGovSession;

      expect(writtenSession.syncPreferences?.pullScheduler).toEqual({
        enabled: true,
        pullIntervalSeconds: 45
      });
    });
  });

  // --- Static Utility Methods (EARS-C1 to EARS-C6) ---

  describe('findProjectRoot', () => {
    beforeEach(() => {
      // Reset project root cache before each test
      (global as any).projectRoot = null;
    });

    it('[EARS-C1] WHEN findProjectRoot is invoked from directory within Git project, THE SYSTEM SHALL return absolute path to root directory', () => {
      const startPath = '/test/project/src/components';
      const rootPath = '/test/project';

      mockedExistsSync.mockImplementation((checkPath: string) => {
        return checkPath === path.join(rootPath, '.git');
      });

      const result = ConfigManager.findProjectRoot(startPath);

      expect(result).toBe(rootPath);
    });

    it('[EARS-C2] WHEN findProjectRoot is invoked from directory outside Git project, THE SYSTEM SHALL return null', () => {
      mockedExistsSync.mockReturnValue(false);
      // Reset cache for this specific test
      (global as any).projectRoot = null;

      const result = ConfigManager.findProjectRoot('/some/random/path');

      expect(result).toBeNull();
    });
  });

  describe('findGitgovRoot - Critical for CLI Directory Search', () => {
    it('[CRITICAL-BUG-PREVENTION] should find .gitgov when executing from subdirectory', () => {
      // This test ensures CLI commands work from any subdirectory
      const rootPath = '/Users/camilo/solo-hub';
      const subPath = '/Users/camilo/solo-hub/packages/cli';

      // Mock existsSync to return true for .gitgov at root
      mockedExistsSync.mockImplementation((path: string) => {
        return path === '/Users/camilo/solo-hub/.gitgov';
      });

      const result = ConfigManager.findGitgovRoot(subPath);

      expect(result).toBe(rootPath);
    });

    it('[CRITICAL-BUG-PREVENTION] should NOT find parent .gitgov when doing init', () => {
      // This test ensures init doesn't accidentally find parent .gitgov
      // When user wants to create NEW project in subdirectory

      const currentPath = '/Users/camilo/new-project';

      // Mock: parent has .gitgov but current doesn't
      mockedExistsSync.mockImplementation((path: string) => {
        if (path === '/Users/camilo/solo-hub/.gitgov') {
          return true; // Parent has .gitgov
        }
        if (path === '/Users/camilo/new-project/.gitgov') {
          return false; // Current doesn't have .gitgov
        }
        if (path === '/Users/camilo/new-project/.git') {
          return true; // Current has .git (valid for init)
        }
        return false;
      });

      const result = ConfigManager.findGitgovRoot(currentPath);

      // Should find .git in current directory, NOT .gitgov in parent
      expect(result).toBe(currentPath);
    });
  });

  describe('findGitgovRoot', () => {
    beforeEach(() => {
      // Reset project root cache before each test
      (global as any).projectRoot = null;
    });

    it('should find .gitgov directory when searching upward', () => {
      const rootPath = '/test/project';
      const subPath = '/test/project/packages/cli';

      // Mock existsSync to return true for .gitgov at root
      mockedExistsSync.mockImplementation((path: string) => {
        return path === '/test/project/.gitgov';
      });

      const result = ConfigManager.findGitgovRoot(subPath);

      expect(result).toBe(rootPath);
    });

    it('should find .git directory when no .gitgov exists (for init)', () => {
      const rootPath = '/test/project';
      const subPath = '/test/project/packages/cli';

      // Mock existsSync to return true for .git at root
      mockedExistsSync.mockImplementation((path: string) => {
        return path === '/test/project/.git';
      });

      const result = ConfigManager.findGitgovRoot(subPath);

      expect(result).toBe(rootPath);
    });

    it('should prefer .gitgov over .git when both exist', () => {
      const rootPath = '/test/project';
      const subPath = '/test/project/packages/cli';

      // Mock existsSync to return true for both
      mockedExistsSync.mockImplementation((path: string) => {
        return path === '/test/project/.gitgov' || path === '/test/project/.git';
      });

      const result = ConfigManager.findGitgovRoot(subPath);

      expect(result).toBe(rootPath);
    });

    it('should return null when neither .gitgov nor .git found', () => {
      const subPath = '/test/project/packages/cli';

      // Mock existsSync to always return false
      mockedExistsSync.mockReturnValue(false);

      const result = ConfigManager.findGitgovRoot(subPath);

      expect(result).toBeNull();
    });
  });

  describe('getGitgovPath', () => {
    beforeEach(() => {
      // Reset project root cache before each test
      (global as any).projectRoot = null;
    });

    it('[EARS-C3] WHEN getGitgovPath is invoked from GitGovernance project, THE SYSTEM SHALL return absolute path to .gitgov directory', () => {
      const rootPath = '/test/project';

      // Mock FsConfigStore.findGitgovRoot (ConfigManager delegates to it)
      jest.spyOn(FsConfigStore, 'findGitgovRoot').mockReturnValue(rootPath);

      const result = ConfigManager.getGitgovPath();

      expect(result).toBe(path.join(rootPath, '.gitgov'));
    });

    it('[EARS-C4] WHEN getGitgovPath is invoked outside GitGovernance project, THE SYSTEM SHALL throw descriptive Error', () => {
      // Mock FsConfigStore.findGitgovRoot to return null (ConfigManager delegates to it)
      jest.spyOn(FsConfigStore, 'findGitgovRoot').mockReturnValue(null);

      expect(() => ConfigManager.getGitgovPath()).toThrow(
        'Could not find project root. Make sure you are inside a GitGovernance repository.'
      );
    });
  });

  describe('isGitgovProject', () => {
    beforeEach(() => {
      // Reset project root cache before each test
      (global as any).projectRoot = null;
    });

    it('[EARS-C5] WHEN isGitgovProject is invoked from GitGovernance project, THE SYSTEM SHALL return true', () => {
      const rootPath = '/test/project';

      // Mock FsConfigStore.getGitgovPath (ConfigManager.isGitgovProject delegates to FsConfigStore)
      jest.spyOn(FsConfigStore, 'getGitgovPath').mockReturnValue(path.join(rootPath, '.gitgov'));
      mockedExistsSync.mockReturnValue(true);

      const result = ConfigManager.isGitgovProject();

      expect(result).toBe(true);
    });

    it('[EARS-C6] WHEN isGitgovProject is invoked outside GitGovernance project, THE SYSTEM SHALL return false', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = ConfigManager.isGitgovProject();

      expect(result).toBe(false);
    });
  });
});
