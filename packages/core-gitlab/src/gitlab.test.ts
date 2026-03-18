/**
 * Tests for GitLab shared error infrastructure
 *
 * Blueprint: gitlab_shared_module.md
 * EARS: A1-A7 (mapGitbeakerError), B1-B3 (isGitbeakerRequestError), C1-C3 (GitLabApiError)
 */

import {
  GitLabApiError,
  mapGitbeakerError,
  isGitbeakerRequestError,
} from './gitlab';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Creates a Gitbeaker-style error with cause.response.status */
function gitbeakerError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`);
  (err as unknown as Record<string, unknown>)['cause'] = { response: { status } };
  return err;
}

/** Creates a Gitbeaker-style error with statusCode property */
function gitbeakerErrorV2(statusCode: number): Error {
  const err = new Error(`Request failed`);
  (err as unknown as Record<string, unknown>)['statusCode'] = statusCode;
  return err;
}

describe('gitlab shared', () => {
  describe('4.1. mapGitbeakerError — HTTP Translation (EARS-A1 to A7)', () => {
    it('[EARS-A1] should map 401/403 to PERMISSION_DENIED', () => {
      const e401 = mapGitbeakerError(gitbeakerError(401), 'test');
      expect(e401.code).toBe('PERMISSION_DENIED');
      expect(e401.statusCode).toBe(401);

      const e403 = mapGitbeakerError(gitbeakerError(403), 'test');
      expect(e403.code).toBe('PERMISSION_DENIED');
      expect(e403.statusCode).toBe(403);
    });

    it('[EARS-A2] should map 404 to NOT_FOUND', () => {
      const err = mapGitbeakerError(gitbeakerError(404), 'test');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.statusCode).toBe(404);
    });

    it('[EARS-A3] should map 409 to CONFLICT', () => {
      const err = mapGitbeakerError(gitbeakerError(409), 'test');
      expect(err.code).toBe('CONFLICT');
      expect(err.statusCode).toBe(409);
    });

    it('[EARS-A4] should map 400 to SERVER_ERROR', () => {
      const err = mapGitbeakerError(gitbeakerError(400), 'test');
      expect(err.code).toBe('SERVER_ERROR');
      expect(err.statusCode).toBe(400);
    });

    it('[EARS-A5] should map 5xx to SERVER_ERROR', () => {
      const e500 = mapGitbeakerError(gitbeakerError(500), 'test');
      expect(e500.code).toBe('SERVER_ERROR');
      expect(e500.statusCode).toBe(500);

      const e502 = mapGitbeakerError(gitbeakerError(502), 'test');
      expect(e502.code).toBe('SERVER_ERROR');
      expect(e502.statusCode).toBe(502);
    });

    it('[EARS-A6] should map unknown status to SERVER_ERROR', () => {
      const err = mapGitbeakerError(gitbeakerError(418), 'test');
      expect(err.code).toBe('SERVER_ERROR');
      expect(err.statusCode).toBe(418);
    });

    it('[EARS-A7] should map non-Gitbeaker errors to NETWORK_ERROR', () => {
      const err = mapGitbeakerError(new TypeError('fetch failed'), 'test');
      expect(err.code).toBe('NETWORK_ERROR');
      expect(err.statusCode).toBeUndefined();
      expect(err.cause).toBeInstanceOf(TypeError);
    });
  });

  describe('4.2. isGitbeakerRequestError — Type Guard (EARS-B1 to B3)', () => {
    it('[EARS-B1] should return true for errors with cause.response.status', () => {
      expect(isGitbeakerRequestError(gitbeakerError(404))).toBe(true);
    });

    it('[EARS-B2] should return true for errors with statusCode property', () => {
      expect(isGitbeakerRequestError(gitbeakerErrorV2(500))).toBe(true);
    });

    it('[EARS-B3] should return false for errors without Gitbeaker structure', () => {
      expect(isGitbeakerRequestError(new Error('plain error'))).toBe(false);
      expect(isGitbeakerRequestError('not an error')).toBe(false);
      expect(isGitbeakerRequestError(null)).toBe(false);
      expect(isGitbeakerRequestError(undefined)).toBe(false);
    });
  });

  describe('4.3. GitLabApiError — Error Class (EARS-C1 to C3)', () => {
    it('[EARS-C1] should preserve code, message, statusCode, and name', () => {
      const err = new GitLabApiError('test msg', 'NOT_FOUND', 404);
      expect(err.message).toBe('test msg');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.statusCode).toBe(404);
      expect(err.name).toBe('GitLabApiError');
    });

    it('[EARS-C2] should pass instanceof check', () => {
      const err = new GitLabApiError('test', 'SERVER_ERROR');
      expect(err).toBeInstanceOf(GitLabApiError);
      expect(err).toBeInstanceOf(Error);
    });

    it('[EARS-C3] should preserve original error as cause', () => {
      const original = new Error('original');
      const err = new GitLabApiError('wrapped', 'NETWORK_ERROR', undefined, { cause: original });
      expect(err.cause).toBe(original);
    });
  });
});
