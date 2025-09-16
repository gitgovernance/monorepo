import { promises as fs } from 'fs';
import * as path from 'path';
import { ConfigManager } from './index';
import type { GitGovConfig, GitGovSession, ActorState } from './index';

// Mock filesystem operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
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
    configManager = new ConfigManager(tempDir);
    // Reset project root cache
    (global as any).projectRoot = null;
  });

  // --- Configuration Methods (EARS-1 to EARS-6) ---

  describe('loadConfig', () => {
    it('[EARS-1] WHEN loadConfig is invoked with valid config.json file, THE SYSTEM SHALL return complete GitGovConfig object', async () => {
      const mockConfig: GitGovConfig = {
        protocolVersion: '1.0',
        projectId: 'test-project-123',
        projectName: 'Test Project',
        rootCycle: 'root-cycle-456',
        blueprints: { root: './blueprints' },
        state: { branch: 'gitgov-state' },
        cloud: { projectId: 'cloud-123', providerMappings: { github: 'repo-456' } }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.loadConfig();

      expect(result).toEqual(mockConfig);
      expect(mockedFs.readFile).toHaveBeenCalledWith(
        path.join(tempDir, '.gitgov', 'config.json'),
        'utf-8'
      );
    });

    it('[EARS-2] WHEN loadConfig is invoked with non-existent config.json file, THE SYSTEM SHALL return null without throwing error', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await configManager.loadConfig();

      expect(result).toBeNull();
    });

    it('[EARS-3] WHEN loadConfig is invoked with invalid JSON in config.json, THE SYSTEM SHALL return null without throwing error', async () => {
      mockedFs.readFile.mockResolvedValue('{ invalid json }');

      const result = await configManager.loadConfig();

      expect(result).toBeNull();
    });
  });

  describe('getRootCycle', () => {
    it('[EARS-4] WHEN getRootCycle is invoked with configuration that has rootCycle defined, THE SYSTEM SHALL return the root cycle ID', async () => {
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

    it('[EARS-5] WHEN getRootCycle is invoked with configuration without rootCycle defined, THE SYSTEM SHALL return null', async () => {
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
    it('[EARS-6] WHEN getProjectInfo is invoked with valid configuration, THE SYSTEM SHALL return object with projectId and projectName', async () => {
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

  // --- Session Methods (EARS-7 to EARS-14) ---

  describe('loadSession', () => {
    it('[EARS-7] WHEN loadSession is invoked with valid .session.json file, THE SYSTEM SHALL return complete GitGovSession object', async () => {
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

    it('[EARS-8] WHEN loadSession is invoked with non-existent .session.json file, THE SYSTEM SHALL return null without throwing error', async () => {
      mockedFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await configManager.loadSession();

      expect(result).toBeNull();
    });
  });

  describe('getActorState', () => {
    it('[EARS-9] WHEN getActorState is invoked with actorId existing in session, THE SYSTEM SHALL return actor state', async () => {
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

    it('[EARS-10] WHEN getActorState is invoked with non-existent actorId, THE SYSTEM SHALL return null', async () => {
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
    it('[EARS-11] WHEN updateActorState is invoked, THE SYSTEM SHALL merge partial state with existing state and persist', async () => {
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

    it('[EARS-12] WHEN updateActorState is invoked with non-existent session, THE SYSTEM SHALL create new session with provided state', async () => {
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
    });
  });

  describe('getCloudSessionToken', () => {
    it('[EARS-13] WHEN getCloudSessionToken is invoked with token configured, THE SYSTEM SHALL return the session token', async () => {
      const mockSession: GitGovSession = {
        cloud: { sessionToken: 'jwt-token-xyz' }
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.getCloudSessionToken();

      expect(result).toBe('jwt-token-xyz');
    });

    it('[EARS-14] WHEN getCloudSessionToken is invoked without token configured, THE SYSTEM SHALL return null', async () => {
      const mockSession: GitGovSession = {
        lastSession: { actorId: 'human:test', timestamp: '2025-01-09T10:00:00Z' }
        // No cloud.sessionToken
      };

      mockedFs.readFile.mockResolvedValue(JSON.stringify(mockSession));

      const result = await configManager.getCloudSessionToken();

      expect(result).toBeNull();
    });
  });

  // --- Static Utility Methods (EARS-15 to EARS-20) ---

  describe('findProjectRoot', () => {
    beforeEach(() => {
      // Reset project root cache before each test
      (global as any).projectRoot = null;
    });

    it('[EARS-15] WHEN findProjectRoot is invoked from directory within Git project, THE SYSTEM SHALL return absolute path to root directory', () => {
      const startPath = '/test/project/src/components';
      const rootPath = '/test/project';

      mockedExistsSync.mockImplementation((checkPath: string) => {
        return checkPath === path.join(rootPath, '.git');
      });

      const result = ConfigManager.findProjectRoot(startPath);

      expect(result).toBe(rootPath);
    });

    it('[EARS-16] WHEN findProjectRoot is invoked from directory outside Git project, THE SYSTEM SHALL return null', () => {
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
      const parentPath = '/Users/camilo/solo-hub';

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

    it('[EARS-17] WHEN getGitgovPath is invoked from GitGovernance project, THE SYSTEM SHALL return absolute path to .gitgov directory', () => {
      const rootPath = '/test/project';

      // Mock findGitgovRoot to return a specific path
      jest.spyOn(ConfigManager, 'findGitgovRoot').mockReturnValue(rootPath);

      const result = ConfigManager.getGitgovPath();

      expect(result).toBe(path.join(rootPath, '.gitgov'));
    });

    it('[EARS-18] WHEN getGitgovPath is invoked outside GitGovernance project, THE SYSTEM SHALL throw descriptive Error', () => {
      // Mock findGitgovRoot to return null
      jest.spyOn(ConfigManager, 'findGitgovRoot').mockReturnValue(null);

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

    it('[EARS-19] WHEN isGitgovProject is invoked from GitGovernance project, THE SYSTEM SHALL return true', () => {
      const rootPath = '/test/project';

      // Mock getGitgovPath to return a valid path and existsSync to return true
      jest.spyOn(ConfigManager, 'getGitgovPath').mockReturnValue(path.join(rootPath, '.gitgov'));
      mockedExistsSync.mockReturnValue(true);

      const result = ConfigManager.isGitgovProject();

      expect(result).toBe(true);
    });

    it('[EARS-20] WHEN isGitgovProject is invoked outside GitGovernance project, THE SYSTEM SHALL return false', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = ConfigManager.isGitgovProject();

      expect(result).toBe(false);
    });
  });
});
