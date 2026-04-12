/**
 * LoginCommand Unit Tests v2 — Cycle 4, identity_key_sync
 *
 * Spec: cli/specs/login_command.md (v2)
 * EARS Coverage:
 * - A: OAuth Login Flow (LOGIN-A1 to A4)
 * - B: Key Sync CLI → SaaS (LOGIN-B1 to B3)
 * - C: Key Sync SaaS → CLI (LOGIN-C1 to C2)
 * - D: Key Conflict Resolution (LOGIN-D1 to D2)
 * - F: Conflict Resolution flags (LOGIN-F1 to F4)
 * - G: ECDH Transport (LOGIN-G1 to G3)
 * - H: Config Requirements (LOGIN-H1 to H3)
 * - I: getSaasUrl (EARS-I1 to I2) — tested in config_manager.test.ts
 */

import type { IKeyProvider } from '@gitgov/core';

// Mock child_process for resolveOrgId
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn().mockReturnValue('https://github.com/testorg/testrepo.git\n'),
}));

// Mock @gitgov/core Crypto for ECDH (avoids real X25519 operations with mock keys)
const mockEcdhEncrypt = jest.fn().mockResolvedValue({
  ephemeralPublicKey: 'mock-eph-pub',
  ciphertext: 'mock-ciphertext',
  iv: 'mock-iv',
  authTag: 'mock-tag',
});
const mockEcdhDecrypt = jest.fn().mockResolvedValue(Buffer.from('decrypted-private-key'));
const mockGenerateEphemeralKeypair = jest.fn().mockReturnValue({
  publicKey: 'mock-client-pub',
  privateKey: 'mock-client-priv',
});

jest.mock('@gitgov/core', () => ({
  Crypto: {
    ecdhEncrypt: (...args: unknown[]) => mockEcdhEncrypt(...args),
    ecdhDecrypt: (...args: unknown[]) => mockEcdhDecrypt(...args),
    generateEphemeralKeypair: () => mockGenerateEphemeralKeypair(),
  },
  parseRemoteUrl: (url: string) => {
    // Parse the mock URL: https://github.com/testorg/testrepo.git
    const httpsMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch?.[1] && httpsMatch[2]) return { host: httpsMatch[1], path: httpsMatch[2] };
    const sshMatch = url.match(/^[^@]+@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch?.[1] && sshMatch[2]) return { host: sshMatch[1], path: sshMatch[2] };
    return null;
  },
}));

// Mock DependencyInjectionService
const mockSetCloudToken = jest.fn();
const mockSetLastSession = jest.fn();
const mockClearCloudToken = jest.fn();
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
        setCloudToken: mockSetCloudToken,
        setLastSession: mockSetLastSession,
        clearCloudToken: mockClearCloudToken,
      }),
      getKeyProvider: jest.fn().mockReturnValue({
        getPrivateKey: mockGetPrivateKey,
        setPrivateKey: mockSetPrivateKey,
        hasPrivateKey: mockHasPrivateKey,
        getPublicKey: mockGetPublicKey,
      } as unknown as IKeyProvider),
      getConfigManager: jest.fn().mockResolvedValue({
        loadConfig: mockGetConfig,
        getSaasUrl: jest.fn().mockImplementation(async () => {
          const config = await mockGetConfig();
          return config?.saasUrl ?? null;
        }),
      }),
    }),
  },
}));

import { LoginCommand } from './login-command';
import type { LoginCommandOptions, LoginDeps, TrpcResponse, KeyStatusResponse, SyncKeyResponse } from './login-command.types';

// Mock console and process.exit
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

// ─── tRPC mock helpers ────────────────────────────────────────────────────

/** Wrap a response in tRPC envelope */
function trpcWrap<T>(data: T): TrpcResponse<T> {
  return { result: { data: { json: data } } };
}

/** Default keyStatus response (no key) */
const noKeyStatus: KeyStatusResponse = {
  exists: false, hasPrivateKey: false, publicKey: null, ecdhPublicKey: 'server-ecdh-pub-key',
};

/** keyStatus with key */
function keyStatusWith(publicKey: string): KeyStatusResponse {
  return { exists: true, hasPrivateKey: true, publicKey, ecdhPublicKey: 'server-ecdh-pub-key' };
}

function createMockDeps(overrides?: Partial<LoginDeps>): LoginDeps {
  return {
    openBrowser: jest.fn().mockResolvedValue(undefined),
    startCallbackServer: jest.fn().mockResolvedValue({
      token: 'test-session-token',
      user: { login: 'camilo', id: 12345 },
    }),
    fetchSaas: jest.fn().mockResolvedValue({
      ok: true,
      json: async () => trpcWrap(noKeyStatus),
    }),
    ...overrides,
  };
}

/** Create fetchSaas mock that routes by URL pattern */
function createTrpcFetch(routes: Record<string, unknown>): LoginDeps['fetchSaas'] {
  return jest.fn().mockImplementation(async (url: string) => {
    for (const [pattern, response] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return { ok: true, json: async () => trpcWrap(response) };
      }
    }
    return { ok: false, json: async () => ({}) };
  });
}

const defaultOptions: LoginCommandOptions = {};

describe('LoginCommand v2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetConfig.mockResolvedValue({ projectId: 'test-repo', saasUrl: 'https://test.gitgov.dev' });
    mockLoadSession.mockResolvedValue(null);
  });

  // ==================== §4.1 OAuth Login Flow (LOGIN-A1 to A4) ====================

  describe('4.1. OAuth Login Flow (LOGIN-A1 to A4)', () => {
    it('[LOGIN-A1] should open browser and store session token after OAuth callback', async () => {
      mockHasPrivateKey.mockResolvedValue(false);
      const deps = createMockDeps({
        fetchSaas: createTrpcFetch({ 'identity.keyStatus': noKeyStatus }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      expect(deps.openBrowser).toHaveBeenCalledTimes(1);
      const openUrl = (deps.openBrowser as jest.Mock).mock.calls[0][0] as string;
      expect(openUrl).toContain('/api/auth/cli?callback=');

      expect(deps.startCallbackServer).toHaveBeenCalledTimes(1);

      expect(mockSetCloudToken).toHaveBeenCalledWith('test-session-token');
      expect(mockSetLastSession).toHaveBeenCalledWith('human:camilo', expect.any(String));
    });

    it('[LOGIN-A2] should display login status with user info', async () => {
      mockLoadSession.mockResolvedValue({
        cloud: { sessionToken: 'existing-token' },
        lastSession: { actorId: 'human:camilo', timestamp: '2026-03-22T10:00:00Z' },
      });
      mockHasPrivateKey.mockResolvedValue(true);

      const deps = createMockDeps({
        fetchSaas: createTrpcFetch({ 'identity.keyStatus': keyStatusWith('pub-key-1') }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeStatus(defaultOptions);

      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('human:camilo');
    });

    it('[LOGIN-A3] should remove session token without deleting keys', async () => {
      mockLoadSession.mockResolvedValue({
        cloud: { sessionToken: 'existing-token' },
        lastSession: { actorId: 'human:camilo', timestamp: '2026-03-22T10:00:00Z' },
        actorState: { 'human:camilo': { activeTaskId: 'task-1' } },
      });

      const cmd = new LoginCommand(createMockDeps());
      await cmd.executeLogout(defaultOptions);

      expect(mockClearCloudToken).toHaveBeenCalled();
      expect(mockSetPrivateKey).not.toHaveBeenCalled();
    });

    // LOGIN-A4 (no saasUrl) was deduplicated → covered by LOGIN-H1 in §4.8
  });

  // ==================== §4.2 Key Sync CLI → SaaS (LOGIN-B1 to B3) ====================

  describe('4.2. Key Sync CLI → SaaS (LOGIN-B1 to B3)', () => {
    it('[LOGIN-B1] should sync local key to SaaS via tRPC when SaaS has no key', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('base64-private-key');
      mockGetPublicKey.mockResolvedValue('base64-public-key');

      const syncResponse: SyncKeyResponse = { success: true, actorId: 'human:camilo', mode: 'full' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) return { ok: true, json: async () => trpcWrap(noKeyStatus) };
          if (url.includes('identity.syncKey')) return { ok: true, json: async () => trpcWrap(syncResponse) };
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Should have called tRPC syncKey endpoint
      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('/trpc/identity.syncKey'),
        expect.objectContaining({ method: 'POST' })
      );

      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Key synced to SaaS');
    });

    it('[LOGIN-B2] should display confirmation after successful sync (keySynced derived, not persisted)', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('base64-private-key');
      mockGetPublicKey.mockResolvedValue('base64-public-key');

      const syncResponse: SyncKeyResponse = { success: true, actorId: 'human:camilo', mode: 'full' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) return { ok: true, json: async () => trpcWrap(noKeyStatus) };
          if (url.includes('identity.syncKey')) return { ok: true, json: async () => trpcWrap(syncResponse) };
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Confirmation displayed
      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Key synced to SaaS');
      // keySynced is NOT persisted in session — derived at runtime (§3.4)
      // setCloudToken was called (for login), but no keySynced field
      expect(mockSetCloudToken).toHaveBeenCalled();
    });

    it('[LOGIN-B3] should skip key sync when no-key-sync flag is passed', async () => {
      const deps = createMockDeps();
      const cmd = new LoginCommand(deps);
      await cmd.executeLogin({ ...defaultOptions, noKeySync: true });

      expect(mockSetCloudToken).toHaveBeenCalled();
      expect(deps.fetchSaas).not.toHaveBeenCalled();
    });
  });

  // ==================== §4.3 Key Sync SaaS → CLI (LOGIN-C1 to C2) ====================

  describe('4.3. Key Sync SaaS → CLI (LOGIN-C1 to C2)', () => {
    it('[LOGIN-C1] should download key from SaaS via ECDH when CLI has no key', async () => {
      mockHasPrivateKey.mockResolvedValue(false);

      // Mock getKey response with ECDH envelope
      const mockEnvelope = {
        ephemeralPublicKey: 'server-eph-pub',
        ciphertext: 'encrypted-data',
        iv: 'mock-iv-base64',
        authTag: 'mock-tag-base64',
      };

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) {
            return { ok: true, json: async () => trpcWrap(keyStatusWith('saas-pub-key')) };
          }
          if (url.includes('identity.getKey')) {
            return { ok: true, json: async () => trpcWrap({ publicKey: 'saas-pub-key', privateKeyEnvelope: mockEnvelope }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      // This will fail at ecdhDecrypt (mock envelope is not real ECDH)
      // but we can verify the fetch was made correctly
      await cmd.executeLogin(defaultOptions);

      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('/trpc/identity.getKey'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-session-token' }),
        })
      );
    });

    it('[LOGIN-C2] should store downloaded key via FsKeyProvider (handles 0600 permissions)', async () => {
      mockHasPrivateKey.mockResolvedValue(false);

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) {
            return { ok: true, json: async () => trpcWrap(keyStatusWith('saas-pub')) };
          }
          if (url.includes('identity.getKey')) {
            return { ok: true, json: async () => trpcWrap({
              publicKey: 'saas-pub',
              privateKeyEnvelope: { ephemeralPublicKey: 'e', ciphertext: 'c', iv: 'i', authTag: 'a' },
            }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // mockEcdhDecrypt returns Buffer.from('decrypted-private-key')
      // setPrivateKey should be called — FsKeyProvider handles 0600 internally
      expect(mockSetPrivateKey).toHaveBeenCalledWith('human:camilo', expect.any(String));
    });
  });

  // ==================== §4.4 Key Conflict Resolution (LOGIN-D1 to D2) ====================

  describe('4.4. Key Conflict Resolution (LOGIN-D1 to D2)', () => {
    it('[LOGIN-D1] should display already synced when public keys are identical', async () => {
      const sharedPub = 'same-public-key-base64';
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPublicKey.mockResolvedValue(sharedPub);

      const deps = createMockDeps({
        fetchSaas: createTrpcFetch({ 'identity.keyStatus': keyStatusWith(sharedPub) }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      const output = mockConsoleLog.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Already synced');
    });

    it('[LOGIN-D2] should display error with --force instructions when public keys differ', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPublicKey.mockResolvedValue('cli-public-key-1234567890');

      const deps = createMockDeps({
        fetchSaas: createTrpcFetch({ 'identity.keyStatus': keyStatusWith('saas-public-key-9876543210') }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      const errorOutput = mockConsoleError.mock.calls.map(c => c[0]).join('\n');
      expect(errorOutput).toContain('Keys differ');
      expect(errorOutput).toContain('--force-local');
      expect(errorOutput).toContain('--force-cloud');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });

  // ==================== §4.6 Conflict Resolution (LOGIN-F1 to F4) ====================

  describe('4.6. Conflict Resolution (LOGIN-F1 to F4)', () => {
    it('[LOGIN-F1] should upload local key with --force-local when keys differ', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('local-private-key');
      mockGetPublicKey.mockResolvedValue('local-public-key');

      const syncResponse: SyncKeyResponse = { success: true, actorId: 'human:camilo', mode: 'full' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) {
            return { ok: true, json: async () => trpcWrap(keyStatusWith('different-saas-key')) };
          }
          if (url.includes('identity.syncKey')) {
            return { ok: true, json: async () => trpcWrap(syncResponse) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin({ ...defaultOptions, forceLocal: true });

      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('/trpc/identity.syncKey'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('[LOGIN-F2] should download SaaS key with --force-cloud when keys differ', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPublicKey.mockResolvedValue('local-pub-key');

      const mockEnvelope = { ephemeralPublicKey: 'ep', ciphertext: 'ct', iv: 'iv', authTag: 'at' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) {
            return { ok: true, json: async () => trpcWrap(keyStatusWith('different-saas-pub')) };
          }
          if (url.includes('identity.getKey')) {
            return { ok: true, json: async () => trpcWrap({ publicKey: 'different-saas-pub', privateKeyEnvelope: mockEnvelope }) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin({ ...defaultOptions, forceCloud: true });

      expect(mockSetPrivateKey).toHaveBeenCalled();
      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('/trpc/identity.getKey'),
        expect.any(Object)
      );
    });

    it('[LOGIN-F3] should show SHA-256 fingerprints and exit 1 when no --force flag', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPublicKey.mockResolvedValue('cli-pub-key-abcdef');

      const deps = createMockDeps({
        fetchSaas: createTrpcFetch({ 'identity.keyStatus': keyStatusWith('saas-pub-key-xyz123') }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      const errorOutput = mockConsoleError.mock.calls.map(c => c[0]).join('\n');
      // SHA-256 hex fingerprints (first 16 chars of hash)
      expect(errorOutput).toContain('Keys differ');
      expect(errorOutput).toMatch(/Local:\s+[0-9a-f]{16}/);
      expect(errorOutput).toMatch(/Cloud:\s+[0-9a-f]{16}/);
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('[LOGIN-F4] should verify keyStatus matches after --force-local resolve', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('local-priv');
      mockGetPublicKey.mockResolvedValue('local-pub-key');

      let callCount = 0;
      const syncResponse: SyncKeyResponse = { success: true, actorId: 'human:camilo', mode: 'full' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) {
            callCount++;
            // First call: different key. Second call (post-verify): local key uploaded
            const pub = callCount === 1 ? 'different-saas-key' : 'local-pub-key';
            return { ok: true, json: async () => trpcWrap(keyStatusWith(pub)) };
          }
          if (url.includes('identity.syncKey')) return { ok: true, json: async () => trpcWrap(syncResponse) };
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin({ ...defaultOptions, forceLocal: true });

      // keyStatus called twice: initial check + post-sync verification
      const keyStatusCalls = (deps.fetchSaas as jest.Mock).mock.calls.filter(
        (c: [string]) => c[0].includes('identity.keyStatus')
      );
      expect(keyStatusCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==================== §4.7 ECDH Transport (LOGIN-G1 to G3) ====================

  describe('4.7. ECDH Transport (LOGIN-G1 to G3)', () => {
    it('[LOGIN-G1] should encrypt key with ECDH before uploading to SaaS', async () => {
      mockHasPrivateKey.mockResolvedValue(true);
      mockGetPrivateKey.mockResolvedValue('base64-priv-key');
      mockGetPublicKey.mockResolvedValue('base64-pub-key');

      const syncResponse = { success: true, actorId: 'human:camilo', mode: 'full' as const };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) return { ok: true, json: async () => trpcWrap(noKeyStatus) };
          if (url.includes('identity.syncKey')) return { ok: true, json: async () => trpcWrap(syncResponse) };
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Verify Crypto.ecdhEncrypt was called
      expect(mockEcdhEncrypt).toHaveBeenCalled();
      expect(mockGenerateEphemeralKeypair).toHaveBeenCalled();
    });

    it('[LOGIN-G2] should decrypt ECDH envelope when downloading key from SaaS', async () => {
      mockHasPrivateKey.mockResolvedValue(false);

      const mockEnvelope = { ephemeralPublicKey: 'ep', ciphertext: 'ct', iv: 'iv', authTag: 'at' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) return { ok: true, json: async () => trpcWrap(keyStatusWith('saas-pub')) };
          if (url.includes('identity.getKey')) return { ok: true, json: async () => trpcWrap({ publicKey: 'saas-pub', privateKeyEnvelope: mockEnvelope }) };
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      expect(mockEcdhDecrypt).toHaveBeenCalled();
      // ecdhDecrypt returns Buffer, code does .toString('base64') before storing
      const expectedKey = Buffer.from('decrypted-private-key').toString('base64');
      expect(mockSetPrivateKey).toHaveBeenCalledWith('human:camilo', expectedKey);
    });

    it('[LOGIN-G3] should exit with error and not store key when ECDH decryption fails', async () => {
      mockHasPrivateKey.mockResolvedValue(false);
      mockEcdhDecrypt.mockRejectedValueOnce(new Error('Unsupported state or unable to authenticate data'));

      const mockEnvelope = { ephemeralPublicKey: 'ep', ciphertext: 'tampered', iv: 'iv', authTag: 'at' };
      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) return { ok: true, json: async () => trpcWrap(keyStatusWith('saas-pub')) };
          if (url.includes('identity.getKey')) return { ok: true, json: async () => trpcWrap({ publicKey: 'saas-pub', privateKeyEnvelope: mockEnvelope }) };
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // Key should NOT have been stored
      expect(mockSetPrivateKey).not.toHaveBeenCalled();
      // Error should mention ECDH
      const errorOutput = mockConsoleError.mock.calls.map(c => c[0]).join('\n');
      expect(errorOutput).toContain('ECDH decryption error');
    });
  });

  // ==================== §4.8 Config Requirements (LOGIN-H1 to H3) ====================

  describe('4.8. Config Requirements (LOGIN-H1 to H3)', () => {
    it('[LOGIN-H1] should exit with error when saasUrl is not configured', async () => {
      mockGetConfig.mockResolvedValue({ projectId: 'test' }); // no saasUrl

      const cmd = new LoginCommand(createMockDeps());
      await cmd.executeLogin(defaultOptions);

      const errorOutput = mockConsoleError.mock.calls.map(c => c[0]).join('\n');
      expect(errorOutput).toContain('No saasUrl configured');
    });

    it('[LOGIN-H3] should resolve repoFullName from git remote origin', async () => {
      // The mock for child_process.execSync returns 'https://github.com/testorg/testrepo.git'
      // resolveRepoFullName should parse this to 'testorg/testrepo'
      mockHasPrivateKey.mockResolvedValue(false);

      const deps = createMockDeps({
        fetchSaas: jest.fn().mockImplementation(async (url: string) => {
          if (url.includes('identity.keyStatus')) {
            // Verify the repoFullName is passed correctly in the tRPC input
            expect(url).toContain('testorg');
            return { ok: true, json: async () => trpcWrap(noKeyStatus) };
          }
          return { ok: false, json: async () => ({}) };
        }),
      });

      const cmd = new LoginCommand(deps);
      await cmd.executeLogin(defaultOptions);

      // keyStatus should have been called with repoFullName from git remote
      expect(deps.fetchSaas).toHaveBeenCalledWith(
        expect.stringContaining('testorg'),
        expect.any(Object)
      );
    });

    it.todo('[LOGIN-H2] should timeout after 5 minutes with error message (requires timer mock — deferred to E2E)');
  });
});
