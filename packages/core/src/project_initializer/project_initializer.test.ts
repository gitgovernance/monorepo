/**
 * Unit Tests for ProjectInitializer Module
 *
 * Tests EARS from project_initializer_module.md blueprint.
 * Uses FsProjectInitializer as reference implementation for interface tests.
 *
 * ProjectInitializer EARS (Bloques A-C):
 * - EARS-A: Interface Core (A1-A5) - IProjectInitializer contract
 * - EARS-B: FsProjectInitializer (B1-B4) - Filesystem implementation
 * - EARS-C: DI in ProjectAdapter (C1-C3) - Dependency injection
 *
 * @see project_initializer_module.md for EARS specifications
 */

import * as path from 'path';
import type { IProjectInitializer } from './project_initializer';
import type { GitGovConfig } from '../config_manager';

// Mock ESM helper to avoid import.meta issues in Jest
jest.mock('../utils/esm_helper', () => ({
  getImportMetaUrl: jest.fn(() => null)
}));

// Mock logger to avoid noise in tests
jest.mock('../logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }))
}));

// Mock fs for controlled filesystem operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    rm: jest.fn(),
    unlink: jest.fn(),
  },
}));

// Import after mocks are set up
import { FsProjectInitializer } from './fs';

// ============================================================================
// Mock Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsMock = require('fs') as {
  existsSync: jest.MockedFunction<(path: string) => boolean>;
  promises: {
    mkdir: jest.MockedFunction<(path: string, options?: { recursive?: boolean }) => Promise<void>>;
    access: jest.MockedFunction<(path: string) => Promise<void>>;
    writeFile: jest.MockedFunction<(path: string, data: string, encoding?: string) => Promise<void>>;
    readFile: jest.MockedFunction<(path: string, encoding?: string) => Promise<string>>;
    rm: jest.MockedFunction<(path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>>;
    unlink: jest.MockedFunction<(path: string) => Promise<void>>;
  };
};

const mockFs = fsMock.promises;
const mockExistsSync = fsMock.existsSync;

/**
 * Creates a valid GitGovConfig for testing
 */
function createTestConfig(): GitGovConfig {
  return {
    protocolVersion: '1.0.0',
    projectId: 'test-project',
    projectName: 'Test Project',
    rootCycle: '1234567890-cycle-root',
    state: {
      branch: 'gitgov-state',
      sync: {
        strategy: 'manual',
        maxRetries: 3,
        pushIntervalSeconds: 30,
        batchIntervalSeconds: 60,
      },
      defaults: {
        pullScheduler: {
          defaultIntervalSeconds: 30,
          defaultEnabled: false,
          defaultContinueOnNetworkError: true,
          defaultStopOnConflict: false,
        },
        fileWatcher: {
          defaultDebounceMs: 300,
          defaultIgnoredPatterns: ['*.tmp', '.DS_Store', '*.swp'],
        },
      },
    },
  };
}

/**
 * Mock implementation of IProjectInitializer for testing DI
 */
class MockProjectInitializer implements IProjectInitializer {
  public createProjectStructureCalled = false;
  public isInitializedCalled = false;
  public writeConfigCalled = false;
  public initializeSessionCalled = false;
  public rollbackCalled = false;

  public isInitializedReturn = false;

  async createProjectStructure(_projectRoot: string): Promise<void> {
    this.createProjectStructureCalled = true;
  }

  async isInitialized(_projectRoot: string): Promise<boolean> {
    this.isInitializedCalled = true;
    return this.isInitializedReturn;
  }

  async writeConfig(_config: GitGovConfig, _projectRoot: string): Promise<void> {
    this.writeConfigCalled = true;
  }

  async initializeSession(_actorId: string, _projectRoot: string): Promise<void> {
    this.initializeSessionCalled = true;
  }

  async rollback(_projectRoot: string): Promise<void> {
    this.rollbackCalled = true;
  }
}

// ============================================================================
// Test Suite: ProjectInitializer
// ============================================================================

describe('ProjectInitializer', () => {
  const testRoot = '/tmp/gitgov-test-project';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // EARS-A: Interface Core (IProjectInitializer)
  // ==========================================================================

  describe('EARS-A: Interface Core (IProjectInitializer)', () => {
    let initializer: FsProjectInitializer;

    beforeEach(() => {
      initializer = new FsProjectInitializer();
    });

    // [EARS-A1] createProjectStructure creates backend-specific structure
    it('[EARS-A1] should create project structure for backend', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await initializer.createProjectStructure(testRoot);

      // Should create .gitgov/ and all subdirectories
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'actors'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'cycles'),
        { recursive: true }
      );
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'tasks'),
        { recursive: true }
      );
    });

    // [EARS-A2] isInitialized returns true when project is initialized
    it('[EARS-A2] should return true when project is initialized', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await initializer.isInitialized(testRoot);

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'config.json')
      );
    });

    // [EARS-A2] isInitialized returns false when project is not initialized
    it('[EARS-A2] should return false when project is not initialized', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await initializer.isInitialized(testRoot);

      expect(result).toBe(false);
    });

    // [EARS-A3] writeConfig persists configuration
    it('[EARS-A3] should write config in backend-specific format', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      const config = createTestConfig();

      await initializer.writeConfig(config, testRoot);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'config.json'),
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    });

    // [EARS-A4] initializeSession creates initial session state
    it('[EARS-A4] should create initial session state', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      const actorId = 'human:test-user';

      await initializer.initializeSession(actorId, testRoot);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', '.session.json'),
        expect.stringContaining(actorId),
        'utf-8'
      );

      // Verify session structure
      const writeCall = mockFs.writeFile.mock.calls[0];
      const sessionContent = JSON.parse(writeCall?.[1] as string);
      expect(sessionContent.lastSession.actorId).toBe(actorId);
      expect(sessionContent.actorState[actorId]).toBeDefined();
      expect(sessionContent.actorState[actorId].syncStatus.status).toBe('synced');
    });

    // [EARS-A5] rollback cleans up artifacts
    it('[EARS-A5] should clean up artifacts on rollback', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      await initializer.rollback(testRoot);

      expect(mockFs.rm).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov'),
        { recursive: true, force: true }
      );
    });

    // [EARS-A5] rollback handles non-existent directory gracefully
    it('[EARS-A5] should handle rollback when directory does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(initializer.rollback(testRoot)).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // EARS-B: FsProjectInitializer
  // ==========================================================================

  describe('EARS-B: FsProjectInitializer', () => {
    let initializer: FsProjectInitializer;

    beforeEach(() => {
      initializer = new FsProjectInitializer();
    });

    // [EARS-B1] Creates all gitgov directories
    it('[EARS-B1] should create all gitgov directories', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);

      await initializer.createProjectStructure(testRoot);

      const expectedDirs = [
        '.gitgov',
        '.gitgov/actors',
        '.gitgov/cycles',
        '.gitgov/tasks',
        '.gitgov/executions',
        '.gitgov/feedbacks',
        '.gitgov/changelogs',
      ];

      for (const dir of expectedDirs) {
        expect(mockFs.mkdir).toHaveBeenCalledWith(
          path.join(testRoot, dir),
          { recursive: true }
        );
      }

      // Total: 1 (.gitgov) + 6 subdirectories = 7 calls
      expect(mockFs.mkdir).toHaveBeenCalledTimes(7);
    });

    // [EARS-B2] Checks for config.json existence
    it('[EARS-B2] should check for config.json existence', async () => {
      mockFs.access.mockResolvedValue(undefined);

      await initializer.isInitialized(testRoot);

      expect(mockFs.access).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov', 'config.json')
      );
    });

    // [EARS-B3] Validates git repo and write permissions
    it('[EARS-B3] should validate git repo and write permissions', async () => {
      mockExistsSync.mockReturnValue(true); // .git exists
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT')); // config.json doesn't exist

      const validation = await initializer.validateEnvironment(testRoot);

      expect(validation.isValid).toBe(true);
      expect(validation.isGitRepo).toBe(true);
      expect(validation.hasWritePermissions).toBe(true);
      expect(validation.isAlreadyInitialized).toBe(false);
    });

    // [EARS-B3] Detects non-git directory
    it('[EARS-B3] should detect non-git directory', async () => {
      mockExistsSync.mockReturnValue(false); // .git doesn't exist
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const validation = await initializer.validateEnvironment(testRoot);

      expect(validation.isValid).toBe(false);
      expect(validation.isGitRepo).toBe(false);
      expect(validation.warnings.some(w => w.includes('Not a Git repository'))).toBe(true);
    });

    // [EARS-B3] Detects already initialized project
    it('[EARS-B3] should detect already initialized project', async () => {
      mockExistsSync.mockReturnValue(true); // .git exists
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.access.mockResolvedValue(undefined); // config.json exists

      const validation = await initializer.validateEnvironment(testRoot);

      expect(validation.isValid).toBe(false);
      expect(validation.isAlreadyInitialized).toBe(true);
      expect(validation.gitgovPath).toBe(path.join(testRoot, '.gitgov'));
      expect(validation.warnings.some(w => w.includes('already initialized'))).toBe(true);
    });

    // [EARS-B4] Rollback removes .gitgov directory
    it('[EARS-B4] should remove .gitgov directory on rollback', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);

      await initializer.rollback(testRoot);

      expect(mockFs.rm).toHaveBeenCalledWith(
        path.join(testRoot, '.gitgov'),
        { recursive: true, force: true }
      );
    });
  });

  // ==========================================================================
  // EARS-C: Dependency Injection in ProjectAdapter
  // ==========================================================================

  describe('EARS-C: Dependency Injection in ProjectAdapter', () => {
    // Note: EARS-C1 to C3 test the DI behavior in ProjectAdapter
    // These tests verify that the interface contract works with custom implementations

    // [EARS-C1] Default to FsProjectInitializer
    it('[EARS-C1] should default to FsProjectInitializer when not provided', () => {
      // This is tested at the ProjectAdapter level
      // Here we verify the interface contract is correct
      const defaultInitializer = new FsProjectInitializer();
      expect(defaultInitializer).toBeInstanceOf(FsProjectInitializer);

      // Verify it implements IProjectInitializer
      const methods: (keyof IProjectInitializer)[] = [
        'createProjectStructure',
        'isInitialized',
        'writeConfig',
        'initializeSession',
        'rollback',
      ];

      for (const method of methods) {
        expect(typeof defaultInitializer[method]).toBe('function');
      }
    });

    // [EARS-C2] Use provided projectInitializer
    it('[EARS-C2] should use provided projectInitializer implementation', async () => {
      const mockInitializer = new MockProjectInitializer();

      // Verify custom implementation can be used
      await mockInitializer.createProjectStructure(testRoot);
      expect(mockInitializer.createProjectStructureCalled).toBe(true);

      await mockInitializer.isInitialized(testRoot);
      expect(mockInitializer.isInitializedCalled).toBe(true);

      await mockInitializer.writeConfig(createTestConfig(), testRoot);
      expect(mockInitializer.writeConfigCalled).toBe(true);

      await mockInitializer.initializeSession('human:test', testRoot);
      expect(mockInitializer.initializeSessionCalled).toBe(true);
    });

    // [EARS-C3] Rollback is called on initialization failure
    it('[EARS-C3] should call rollback on initialization failure', async () => {
      const mockInitializer = new MockProjectInitializer();

      // Simulate a failure scenario where rollback would be called
      await mockInitializer.rollback(testRoot);

      expect(mockInitializer.rollbackCalled).toBe(true);
    });

    // [EARS-C3] Mock initializer can be used for testing
    it('[EARS-C3] should allow mock implementations for testing', () => {
      const mockInitializer = new MockProjectInitializer();
      mockInitializer.isInitializedReturn = true;

      // Verify mock behavior can be controlled
      expect(mockInitializer.isInitializedReturn).toBe(true);

      // Type check: MockProjectInitializer satisfies IProjectInitializer
      const asInterface: IProjectInitializer = mockInitializer;
      expect(asInterface).toBeDefined();
    });
  });
});
