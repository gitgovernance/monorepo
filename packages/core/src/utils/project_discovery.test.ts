/**
 * Project Discovery Utilities - Unit Tests
 *
 * Tests for filesystem-based project root discovery functions.
 * Extracted from FsConfigStore tests when discovery logic was moved to utils/.
 *
 * EARS Blocks:
 * - A: findProjectRoot (§4.1)
 * - B: getWorktreeBasePath (§4.2)
 * - C: resetDiscoveryCache (§4.3)
 */

import {
  findProjectRoot,
  getWorktreeBasePath,
  resetDiscoveryCache,
} from './project_discovery';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  realpathSync: jest.fn((p: string) => p),
}));

import { existsSync, realpathSync } from 'fs';

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockedRealpathSync = realpathSync as jest.MockedFunction<typeof realpathSync>;

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

  // ==================== §4.2 getWorktreeBasePath (EARS-B) ====================

  describe('4.2. getWorktreeBasePath (EARS-B1 to B3)', () => {
    it('[EARS-B1] WHEN getWorktreeBasePath is called, THE SYSTEM SHALL return path under ~/.gitgov/worktrees/', () => {
      const result = getWorktreeBasePath('/test/project');

      expect(result).toMatch(/\.gitgov\/worktrees\/[a-f0-9]{12}$/);
    });

    it('[EARS-B2] WHEN getWorktreeBasePath is called with same path, THE SYSTEM SHALL return deterministic hash', () => {
      const result1 = getWorktreeBasePath('/test/project');
      const result2 = getWorktreeBasePath('/test/project');

      expect(result1).toBe(result2);
    });

    it('[EARS-B3] WHEN getWorktreeBasePath is called with different paths, THE SYSTEM SHALL return different hashes', () => {
      const result1 = getWorktreeBasePath('/test/project-a');
      const result2 = getWorktreeBasePath('/test/project-b');

      expect(result1).not.toBe(result2);
    });

    it('[EARS-B4] WHEN getWorktreeBasePath is called with a symlinked path and its resolved path, THE SYSTEM SHALL return the same hash', () => {
      mockedRealpathSync.mockImplementation((p) => {
        const s = typeof p === 'string' ? p : p.toString();
        if (s.startsWith('/tmp/')) return s.replace('/tmp/', '/private/tmp/') as never;
        return s as never;
      });

      const viaSymlink = getWorktreeBasePath('/tmp/my-project');
      const viaReal = getWorktreeBasePath('/private/tmp/my-project');

      expect(viaSymlink).toBe(viaReal);

      mockedRealpathSync.mockImplementation((p) => (typeof p === 'string' ? p : p.toString()) as never);
    });
  });

  // ==================== §4.3 resetDiscoveryCache (EARS-C) ====================

  describe('4.3. resetDiscoveryCache (EARS-C1)', () => {
    it('[EARS-C1] WHEN resetDiscoveryCache is invoked, THE SYSTEM SHALL clear project root cache', () => {
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
