// Mock all dependencies to avoid import-time execution
jest.mock('../../../core/src/config_manager', () => ({
  ConfigManager: {
    findProjectRoot: jest.fn(),
    getGitgovPath: jest.fn()
  }
}));

// Use jest.doMock for modules that execute code on import
jest.doMock('../../../core/src/adapters/backlog_adapter', () => ({
  BacklogAdapter: jest.fn()
}));

jest.doMock('../../../core/src/adapters/identity_adapter', () => ({
  IdentityAdapter: jest.fn()
}));

jest.doMock('../../../core/src/store', () => ({
  RecordStore: jest.fn()
}));

jest.doMock('../../../core/src/adapters/metrics_adapter', () => ({
  MetricsAdapter: jest.fn()
}));

jest.doMock('../../../core/src/adapters/indexer_adapter', () => ({
  FileIndexerAdapter: jest.fn()
}));

jest.doMock('../../../core/src/modules/event_bus_module', () => ({
  EventBus: jest.fn()
}));

// Mock fs promises
jest.doMock('fs', () => ({
  promises: {
    access: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock ConfigManager
jest.doMock('../../../core/src/config_manager', () => ({
  ConfigManager: {
    findProjectRoot: jest.fn(),
    findGitgovRoot: jest.fn(),
    getGitgovPath: jest.fn(),
    isGitgovProject: jest.fn()
  }
}));

import { DependencyInjectionService } from './dependency-injection';
import { ConfigManager } from '../../../core/src/config_manager';

const mockedConfigManager = ConfigManager as jest.Mocked<typeof ConfigManager>;

describe('DependencyInjectionService', () => {
  let diService: DependencyInjectionService;
  const mockProjectRoot = '/tmp/test-gitgov';

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton for each test
    DependencyInjectionService.reset();

    // Mock ConfigManager
    mockedConfigManager.findProjectRoot.mockReturnValue(mockProjectRoot);
    mockedConfigManager.findGitgovRoot.mockReturnValue(mockProjectRoot);

    // Reset fs.access mock to success by default
    const mockFs = require('fs');
    mockFs.promises.access.mockResolvedValue(undefined);

    // Create fresh instance
    diService = DependencyInjectionService.getInstance();
  });

  afterEach(() => {
    DependencyInjectionService.reset();
  });

  describe('Singleton Pattern', () => {
    it('[EARS-1] should return same instance across multiple calls', () => {
      const instance1 = DependencyInjectionService.getInstance();
      const instance2 = DependencyInjectionService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(diService);
    });

    it('[EARS-2] should reset singleton instance correctly', () => {
      const instance1 = DependencyInjectionService.getInstance();

      DependencyInjectionService.reset();

      const instance2 = DependencyInjectionService.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Error Handling', () => {
    it('[EARS-3] should throw error when project root not found', async () => {
      // Mock ConfigManager to return null
      mockedConfigManager.findGitgovRoot.mockReturnValue(null);

      // Mock fs.access to reject (no .gitgov directory)
      const mockFs = require('fs');
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      await expect(diService.getIndexerAdapter())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });

    it('[EARS-4] should throw error for BacklogAdapter when project root not found', async () => {
      // Mock ConfigManager to return null
      mockedConfigManager.findGitgovRoot.mockReturnValue(null);

      // Mock fs.access to reject (no .gitgov directory)
      const mockFs = require('fs');
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      await expect(diService.getBacklogAdapter())
        .rejects.toThrow("❌ GitGovernance not initialized. Run 'gitgov init' first.");
    });
  });

  describe('Adapter Creation', () => {
    it('[EARS-5] should handle adapter creation when project root exists', async () => {
      mockedConfigManager.findProjectRoot.mockReturnValue(mockProjectRoot);

      // These should not throw for basic functionality
      await expect(diService.getIndexerAdapter()).resolves.toBeDefined();
      await expect(diService.getBacklogAdapter()).resolves.toBeDefined();
    });
  });

  describe('Dependency Validation', () => {
    it('[EARS-6] should return false when project root not found', async () => {
      // Mock fs.access to reject (no .gitgov directory)
      const mockFs = require('fs');
      mockFs.promises.access.mockRejectedValue(new Error('Directory not found'));

      const isValid = await diService.validateDependencies();

      expect(isValid).toBe(false);
    });

    it('[EARS-7] should handle validation errors gracefully', async () => {
      mockedConfigManager.findProjectRoot.mockReturnValue(mockProjectRoot);

      // Should not throw, should return false on errors
      const isValid = await diService.validateDependencies();

      expect(typeof isValid).toBe('boolean');
    });
  });
});
