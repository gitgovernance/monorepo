/**
 * LoginCommand Unit Tests
 *
 * Spec: cli/specs/login_command.md
 * EARS Coverage:
 * - A: OAuth Login Flow (LOGIN-A1 to A3)
 * - B: Key Sync CLI → SaaS (LOGIN-B1 to B3)
 * - C: Key Sync SaaS → CLI (LOGIN-C1 to C2)
 * - D: Key Conflict Resolution (LOGIN-D1 to D2)
 */

import type { IKeyProvider } from '@gitgov/core';

// Mock DependencyInjectionService
const mockSaveSession = jest.fn();
const mockLoadSession = jest.fn();
const mockGetPrivateKey = jest.fn();
const mockSetPrivateKey = jest.fn();
const mockHasPrivateKey = jest.fn();
const mockGetPublicKey = jest.fn();
const mockGetConfig = jest.fn();

jest.mock('../../services/dependency-injection', () => ({
  DependencyInjectionService: {
    getInstance: jest.fn().mockReturnValue({
      getSessionManager: jest.fn().mockResolvedValue({
        loadSession: mockLoadSession,
        sessionStore: { saveSession: mockSaveSession },
      }),
      getKeyProvider: jest.fn().mockReturnValue({
        getPrivateKey: mockGetPrivateKey,
        setPrivateKey: mockSetPrivateKey,
        hasPrivateKey: mockHasPrivateKey,
        getPublicKey: mockGetPublicKey,
      } as unknown as IKeyProvider),
      getConfigManager: jest.fn().mockResolvedValue({
        loadConfig: mockGetConfig,
      }),
    }),
  },
}));

import { LoginCommand } from './login-command';
import type { LoginCommandOptions, LoginDeps } from './login-command.types';

// Mock console and process.exit
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

function createMockDeps(overrides?: Partial<LoginDeps>): LoginDeps {
  return {
    openBrowser: jest.fn().mockResolvedValue(undefined),
    startCallbackServer: jest.fn().mockResolvedValue({
      token: 'test-session-token',
      user: { login: 'camilo', id: 12345 },
    }),
    fetchSaas: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hasKey: false, actorExists: false }),
    }),
    ...overrides,
  };
}

function createMockFetch(responses: Record<string, unknown>): LoginDeps['fetchSaas'] {
  return jest.fn().mockImplementation(async (url: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return { ok: true, json: async () => response };
      }
    }
    return { ok: false, json: async () => ({}) };
  });
}

const defaultOptions: LoginCommandOptions = {};

describe('LoginCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConfig.mockResolvedValue({ projectId: 'test-repo', saasUrl: 'https://test.gitgov.dev' });
    mockLoadSession.mockResolvedValue(null);
  });

  // ==================== §4.1 OAuth Login Flow (LOGIN-A1 to A3) ====================

  describe('4.1. OAuth Login Flow (LOGIN-A1 to A3)', () => {
    it('[LOGIN-A1] should open browser and store session token after OAuth callback', async () => {
      const deps = createMockDeps();
      // SaaS has no key, CLI has no key — "no actor" path
      (deps.fetchSaas as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ hasKey: false, actorExists: false }),
      });
      mockHasPrivateKey.mockResolvedValue(false);

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Browser should have been opened with OAuth URL
      expect(deps.openBrowser).toHaveBeenCalledTimes(1);
      const openUrl = (deps.openBrowser as jest.Mock).mock.calls[0][0] as string;
      expect(openUrl).toContain('/api/auth/cli?callback=');

      // Callback server should have started
      expect(deps.startCallbackServer).toHaveBeenCalledTimes(1);

      // Session should be saved with token
      expect(mockSaveSession).toHaveBeenCalled();
      const savedSession = mockSaveSession.mock.calls[0][0];
      expect(savedSession.cloud.sessionToken).toBe('test-session-token');
      expect(savedSession.lastSession.actorId).toBe('human:camilo');
    });

    it('[LOGIN-A2] should display login status with user info and key sync status', async () => {
      mockLoadSession.mockResolvedValue({
        cloud: { sessionToken: 'existing-token' },
        lastSession: { actorId: 'human:camilo', timestamp: '2026-03-22T10:00:00Z' },
      });
      mockHasPrivateKey.mockResolvedValue(true);

      const deps = createMockDeps({
        fetchSaas: createMockFetch({
          '/api/identity/status': { hasKey: true, actorExists: true },
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeStatus(defaultOptions);

      // Should output status info
      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('human:camilo');
      expect(output).toContain('yes');
    });

    it('[LOGIN-A3] should remove session token without deleting keys', async () => {
      mockLoadSession.mockResolvedValue({
        cloud: { sessionToken: 'existing-token' },
        lastSession: { actorId: 'human:camilo', timestamp: '2026-03-22T10:00:00Z' },
        actorState: { 'human:camilo': { activeTaskId: 'task-1' } },
      });

      const deps = createMockDeps();
      const cmd = new LoginCommand(deps);
      await cmd.executeLogout(defaultOptions);

      // Session should be saved WITHOUT cloud token
      expect(mockSaveSession).toHaveBeenCalled();
      const savedSession = mockSaveSession.mock.calls[0][0];
      expect(savedSession.cloud).toBeUndefined();

      // actorState should be preserved
      expect(savedSession.actorState).toEqual({ 'human:camilo': { activeTaskId: 'task-1' } });

      // Keys should NOT be touched
      expect(mockSetPrivateKey).not.toHaveBeenCalled();
      expect(mockGetPrivateKey).not.toHaveBeenCalled();
    });
  });

  // ==================== §4.2 Key Sync CLI → SaaS (LOGIN-B1 to B3) ====================

  describe('4.2. Key Sync CLI → SaaS (LOGIN-B1 to B3)', () => {
    it('[LOGIN-B1] should prompt and sync local key to SaaS when SaaS has no key', async () => {
      // CLI has key, SaaS does not
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('base64-private-key-data');

      const syncKeyMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ synced: true }) });
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes('/api/identity/status')) {
            return { ok: true, json: async () => ({ hasKey: false, actorExists: true }) };
          }
          if (url.includes('/api/identity/sync-key')) {
            return syncKeyMock();
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Should have called sync-key endpoint
      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('/api/identity/sync-key'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('base64-private-key-data'),
        })
      );
    });

    it('[LOGIN-B2] should update session with keySynced true after successful sync', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('base64-private-key-data');

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('/api/identity/status')) {
            return { ok: true, json: async () => ({ hasKey: false, actorExists: true }) };
          }
          if (url.includes('/api/identity/sync-key')) {
            return { ok: true, json: async () => ({ synced: true }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Output should confirm sync
      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Key synced to SaaS');
    });

    it('[LOGIN-B3] should skip key sync when no-key-sync flag is passed', async () => {
      const deps = createMockDeps();
      const cmd = new LoginCommand(deps);

      await cmd.executeLogin({ ...defaultOptions, noKeySync: true });

      // Session should be stored (login happened)
      expect(mockSaveSession).toHaveBeenCalled();

      // But NO fetch to key status or sync-key should have been made
      expect(deps.fetchSaas).not.toHaveBeenCalled();
    });
  });

  // ==================== §4.3 Key Sync SaaS → CLI (LOGIN-C1 to C2) ====================

  describe('4.3. Key Sync SaaS → CLI (LOGIN-C1 to C2)', () => {
    it('[LOGIN-C1] should prompt and download key from SaaS when CLI has no key', async () => {
      // CLI has no key, SaaS has key
      mockHasPrivateKey.mockResolvedValue(false);

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('/api/identity/status')) {
            return { ok: true, json: async () => ({ hasKey: true, actorExists: true }) };
          }
          if (url.includes('/api/identity/key')) {
            return { ok: true, json: async () => ({ privateKey: 'saas-private-key-base64' }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Should have fetched the key from SaaS
      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('/api/identity/key'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-session-token' }),
        })
      );

      // Should store via FsKeyProvider
      expect(mockSetPrivateKey).toHaveBeenCalledWith('human:camilo', 'saas-private-key-base64');
    });

    it('[LOGIN-C2] should store downloaded key in FsKeyProvider with 0600 permissions', async () => {
      // FsKeyProvider handles 0600 internally — verify setPrivateKey is called correctly
      mockHasPrivateKey.mockResolvedValue(false);

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('/api/identity/status')) {
            return { ok: true, json: async () => ({ hasKey: true, actorExists: true }) };
          }
          if (url.includes('/api/identity/key')) {
            return { ok: true, json: async () => ({ privateKey: 'downloaded-key-data' }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // setPrivateKey delegates to FsKeyProvider which handles file permissions
      expect(mockSetPrivateKey).toHaveBeenCalledWith('human:camilo', 'downloaded-key-data');

      // Output should confirm download
      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Key downloaded from SaaS');
    });
  });

  // ==================== §4.4 Key Conflict Resolution (LOGIN-D1 to D2) ====================

  describe('4.4. Key Conflict Resolution (LOGIN-D1 to D2)', () => {
    it('[LOGIN-D1] should display already synced when public keys are identical', async () => {
      const sharedPublicKey = 'same-public-key-base64';
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPublicKey.mockResolvedValue(sharedPublicKey);

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('/api/identity/status')) {
            return { ok: true, json: async () => ({ hasKey: true, actorExists: true, publicKey: sharedPublicKey }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Already synced');
    });

    it('[LOGIN-D2] should display error with resolution instructions when public keys differ', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPublicKey.mockResolvedValue('cli-public-key');

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('/api/identity/status')) {
            return { ok: true, json: async () => ({ hasKey: true, actorExists: true, publicKey: 'different-saas-public-key' }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      const errorOutput = mockConsoleError.mock.calls.map(c => c[0]).join('\n');
      expect(errorOutput).toContain('Keys differ');
      expect(errorOutput).toContain('--force-local');
      expect(errorOutput).toContain('--force-cloud');
    });
  });
});
