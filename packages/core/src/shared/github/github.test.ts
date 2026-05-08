/**
 * Unit tests for shared GitHub utilities.
 *
 * Covers:
 * - isOctokitRequestError    (EARS-B1, B2) — type guard (duck-typing).
 * - getOctokitRateLimitReset (EARS-D1 to D3) — rate limit header extractor.
 * - isOctokitRateLimitError  (EARS-D4)        — rate limit error detector.
 *
 * EARS A1-A7 (mapOctokitError) and C1-C2 (GitHubApiError) remain verified
 * indirectly via consumer tests (ConfigStore, RecordStore, PolicyConfigLoader)
 * — see github_shared_module §4.
 */

import {
  getOctokitRateLimitReset,
  isOctokitRateLimitError,
  isOctokitRequestError,
} from './github';

describe('shared/github', () => {
  describe('4.2. isOctokitRequestError (EARS-B1 to B2)', () => {
    it('[EARS-B1] should return true for errors with numeric status', () => {
      const err = Object.assign(new Error('http error'), { status: 404 });
      expect(isOctokitRequestError(err)).toBe(true);

      const err500 = Object.assign(new Error('server'), { status: 500 });
      expect(isOctokitRequestError(err500)).toBe(true);

      // Status 0 is still numeric (rare but valid)
      const err0 = Object.assign(new Error('abort'), { status: 0 });
      expect(isOctokitRequestError(err0)).toBe(true);
    });

    it('[EARS-B2] should return false for plain Error or non-Error inputs', () => {
      // Plain Error (no status)
      expect(isOctokitRequestError(new Error('plain'))).toBe(false);

      // Non-numeric status
      expect(isOctokitRequestError(Object.assign(new Error(), { status: '404' }))).toBe(false);
      expect(isOctokitRequestError(Object.assign(new Error(), { status: null }))).toBe(false);

      // Plain object with status (not Error instance)
      expect(isOctokitRequestError({ status: 404, message: 'fake' })).toBe(false);

      // Primitive inputs
      expect(isOctokitRequestError(undefined)).toBe(false);
      expect(isOctokitRequestError(null)).toBe(false);
      expect(isOctokitRequestError('error string')).toBe(false);
      expect(isOctokitRequestError(404)).toBe(false);
    });
  });

  describe('4.4. getOctokitRateLimitReset (EARS-D1 to D3)', () => {
    it('[EARS-D1] should parse numeric string x-ratelimit-reset header', () => {
      const error = Object.assign(new Error('Rate limited'), {
        status: 403,
        response: { headers: { 'x-ratelimit-reset': '1700000000' } },
      });

      expect(getOctokitRateLimitReset(error)).toBe(1700000000);
    });

    it('[EARS-D2] should pass through numeric x-ratelimit-reset header', () => {
      const error = Object.assign(new Error('Rate limited'), {
        status: 403,
        response: { headers: { 'x-ratelimit-reset': 1700000000 } },
      });

      expect(getOctokitRateLimitReset(error)).toBe(1700000000);
    });

    it('[EARS-D4] should detect rate limit errors via status (403 or 429) and x-ratelimit-remaining=0', () => {
      // Positive: 403 + remaining=0 (string)
      expect(isOctokitRateLimitError(Object.assign(new Error('Rate limited'), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '0' } },
      }))).toBe(true);

      // Positive: 429 + remaining=0 (string)
      expect(isOctokitRateLimitError(Object.assign(new Error('Too many requests'), {
        status: 429,
        response: { headers: { 'x-ratelimit-remaining': '0' } },
      }))).toBe(true);

      // Positive: remaining as number 0
      expect(isOctokitRateLimitError(Object.assign(new Error(), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': 0 } },
      }))).toBe(true);

      // Negative: 403 with remaining > 0 (permission denial, not rate limit)
      expect(isOctokitRateLimitError(Object.assign(new Error('Resource not accessible'), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '4999' } },
      }))).toBe(false);

      // Negative: 401 (unauthorized — not rate limit)
      expect(isOctokitRateLimitError(Object.assign(new Error('Unauthorized'), {
        status: 401,
        response: { headers: { 'x-ratelimit-remaining': '0' } },
      }))).toBe(false);

      // Negative: 500 (server error — not rate limit)
      expect(isOctokitRateLimitError(Object.assign(new Error('Server error'), {
        status: 500,
      }))).toBe(false);

      // Negative: missing response.headers
      expect(isOctokitRateLimitError(Object.assign(new Error(), {
        status: 403,
        response: {},
      }))).toBe(false);

      // Negative: missing x-ratelimit-remaining header
      expect(isOctokitRateLimitError(Object.assign(new Error(), {
        status: 403,
        response: { headers: {} },
      }))).toBe(false);

      // Negative: not an Error
      expect(isOctokitRateLimitError(undefined)).toBe(false);
      expect(isOctokitRateLimitError(null)).toBe(false);
      expect(isOctokitRateLimitError({ status: 403 })).toBe(false);

      // Negative: plain Error without status
      expect(isOctokitRateLimitError(new Error('plain'))).toBe(false);

      // Negative: header is non-numeric string
      expect(isOctokitRateLimitError(Object.assign(new Error(), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': 'unknown' } },
      }))).toBe(false);
    });

    it('[EARS-D3] should return undefined when header is missing or invalid', () => {
      // Not an Error
      expect(getOctokitRateLimitReset(undefined)).toBeUndefined();
      expect(getOctokitRateLimitReset(null)).toBeUndefined();
      expect(getOctokitRateLimitReset('string')).toBeUndefined();
      expect(getOctokitRateLimitReset(403)).toBeUndefined();

      // Error without response
      expect(getOctokitRateLimitReset(new Error('plain'))).toBeUndefined();

      // Error with non-object response
      expect(getOctokitRateLimitReset(Object.assign(new Error(), { response: null }))).toBeUndefined();
      expect(getOctokitRateLimitReset(Object.assign(new Error(), { response: 'oops' }))).toBeUndefined();

      // Error with response but no headers
      expect(getOctokitRateLimitReset(Object.assign(new Error(), { response: {} }))).toBeUndefined();

      // Error with headers but no x-ratelimit-reset
      expect(getOctokitRateLimitReset(Object.assign(new Error(), {
        response: { headers: { 'x-ratelimit-limit': '5000' } },
      }))).toBeUndefined();

      // Header is a non-numeric string
      expect(getOctokitRateLimitReset(Object.assign(new Error(), {
        response: { headers: { 'x-ratelimit-reset': 'not-a-number' } },
      }))).toBeUndefined();

      // Header is null
      expect(getOctokitRateLimitReset(Object.assign(new Error(), {
        response: { headers: { 'x-ratelimit-reset': null } },
      }))).toBeUndefined();

      // Header is an object (not string or number)
      expect(getOctokitRateLimitReset(Object.assign(new Error(), {
        response: { headers: { 'x-ratelimit-reset': { nested: true } } },
      }))).toBeUndefined();
    });
  });
});
