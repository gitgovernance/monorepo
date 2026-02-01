/**
 * Project Discovery Utilities - Unit Tests
 *
 * Tests for filesystem-based project root discovery functions.
 * Extracted from FsConfigStore tests when discovery logic was moved to utils/.
 *
 * EARS Blocks:
 * - A: findProjectRoot (§4.1)
 * - B: findGitgovRoot (§4.2)
 * - C: Utility Methods (§4.3)
 */

import {
  findProjectRoot,
  findGitgovRoot,
  getGitgovPath,
  isGitgovProject,
  resetDiscoveryCache,
} from './project_discovery';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

import { existsSync } from 'fs';

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('Project Discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetDiscoveryCache();
  });

  // ==================== §4.1 findProjectRoot (EARS-A) ====================

  describe('4.1. findProjectRoot (EARS-A1 to A4)', () => {
    it('[EARS-A1] WHEN findProjectRoot is invoked from within Git project, THE SYSTEM SHALL return absolute path', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const result = findProjectRoot('/test/project/src/deep');

      expect(result).toBe('/test/project');
    });

    it('[EARS-A2] WHEN findProjectRoot is invoked outside Git project, THE SYSTEM SHALL return null', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = findProjectRoot('/some/random/path');

      expect(result).toBeNull();
    });

    it('[EARS-A3] WHEN findProjectRoot is invoked multiple times with same path, THE SYSTEM SHALL return cached result', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const startPath = '/test/project/src';
      findProjectRoot(startPath);
      findProjectRoot(startPath);

      // existsSync should only be called multiple times on first search
      // Second call should use cache
      const callsForGit = (mockedExistsSync.mock.calls as string[][]).filter(
        (c) => c[0] === '/test/project/.git'
      );
      expect(callsForGit.length).toBe(1);
    });

    it('[EARS-A4] WHEN findProjectRoot is invoked from different path, THE SYSTEM SHALL invalidate cache', () => {
      resetDiscoveryCache();
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git' || p === '/other/project/.git';
      });

      findProjectRoot('/test/project/src');
      findProjectRoot('/other/project/src');

      // Both paths should trigger searches
      expect(mockedExistsSync).toHaveBeenCalledWith('/test/project/.git');
      expect(mockedExistsSync).toHaveBeenCalledWith('/other/project/.git');
    });
  });

  // ==================== §4.2 findGitgovRoot (EARS-B) ====================

  describe('4.2. findGitgovRoot (EARS-B1 to B3)', () => {
    it('[EARS-B1] WHEN findGitgovRoot finds both .gitgov and .git, THE SYSTEM SHALL prioritize .gitgov', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.gitgov' || p === '/test/project/.git';
      });

      const result = findGitgovRoot('/test/project/src');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B2] WHEN findGitgovRoot does not find .gitgov but finds .git, THE SYSTEM SHALL fallback to .git', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.git';
      });

      const result = findGitgovRoot('/test/project/src');

      expect(result).toBe('/test/project');
    });

    it('[EARS-B3] WHEN findGitgovRoot finds neither .gitgov nor .git, THE SYSTEM SHALL return null', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = findGitgovRoot('/some/path');

      expect(result).toBeNull();
    });
  });

  // ==================== §4.3 Utility Methods (EARS-C) ====================

  describe('4.3. Utility Methods (EARS-C1 to C4)', () => {
    it('[EARS-C1] WHEN getGitgovPath is invoked from GitGovernance project, THE SYSTEM SHALL return absolute path', () => {
      mockedExistsSync.mockImplementation((p) => {
        return p === '/test/project/.gitgov';
      });

      const originalCwd = process.cwd;
      process.cwd = () => '/test/project/src';

      const result = getGitgovPath();

      expect(result).toBe('/test/project/.gitgov');
      process.cwd = originalCwd;
    });

    it('[EARS-C2] WHEN getGitgovPath is invoked outside GitGovernance project, THE SYSTEM SHALL throw Error', () => {
      mockedExistsSync.mockReturnValue(false);

      expect(() => getGitgovPath()).toThrow(
        'Could not find project root'
      );
    });

    it('[EARS-C3] WHEN isGitgovProject is invoked from GitGovernance project, THE SYSTEM SHALL return true', () => {
      mockedExistsSync.mockImplementation((p) => {
        return String(p).includes('.gitgov');
      });

      const originalCwd = process.cwd;
      process.cwd = () => '/test/project/src';

      const result = isGitgovProject();

      expect(result).toBe(true);
      process.cwd = originalCwd;
    });

    it('[EARS-C4] WHEN isGitgovProject is invoked outside GitGovernance project, THE SYSTEM SHALL return false', () => {
      mockedExistsSync.mockReturnValue(false);

      const result = isGitgovProject();

      expect(result).toBe(false);
    });

    it('[EARS-C5] WHEN resetDiscoveryCache is invoked, THE SYSTEM SHALL clear project root cache', () => {
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      // First call - populates cache
      findProjectRoot('/test/project/src');
      mockedExistsSync.mockClear();

      // Second call with same path - uses cache
      findProjectRoot('/test/project/src');
      expect(mockedExistsSync).not.toHaveBeenCalled();

      // Reset cache
      resetDiscoveryCache();
      mockedExistsSync.mockImplementation((p) => p === '/test/project/.git');

      // Third call - should search again
      findProjectRoot('/test/project/src');
      expect(mockedExistsSync).toHaveBeenCalled();
    });
  });
});
