/**
 * Login Command — connects CLI with SaaS, exchanges private keys
 *
 * Spec: cli/specs/login_command.md
 * EARS: LOGIN-A1..A3, LOGIN-B1..B3, LOGIN-C1..C2, LOGIN-D1..D2
 */

import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import type { LoginCommandOptions, LoginDeps, KeyStatusResponse, SyncKeyResponse, GetKeyResponse } from './login-command.types';

const DEFAULT_SAAS_URL = 'https://cloud.gitgov.dev';
const CALLBACK_PORT = 9876;

/**
 * Default deps use real implementations (overridable for tests).
 */
function createDefaultDeps(): LoginDeps {
  return {
    openBrowser: async (url: string) => {
      const { exec } = await import('child_process');
      const platform = process.platform;
      const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} "${url}"`);
    },
    startCallbackServer: (port: number) => {
      return new Promise((resolve, reject) => {
        import('http').then(({ createServer }) => {
          const server = createServer((req, res) => {
            const url = new URL(req.url ?? '/', `http://localhost:${port}`);
            const token = url.searchParams.get('token');
            const login = url.searchParams.get('login');
            const id = url.searchParams.get('id');

            if (token && login && id) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Login successful!</h1><p>You can close this window.</p></body></html>');
              server.close();
              resolve({ token, user: { login, id: Number(id) } });
            } else {
              res.writeHead(400, { 'Content-Type': 'text/plain' });
              res.end('Missing token, login, or id');
            }
          });
          server.listen(port, () => {});
          server.on('error', reject);
          // Timeout after 60s
          setTimeout(() => {
            server.close();
            reject(new Error('Login timeout — no callback received within 60 seconds'));
          }, 60_000);
        });
      });
    },
    fetchSaas: async (url: string, init?: RequestInit) => {
      return fetch(url, init);
    },
  };
}

export class LoginCommand extends BaseCommand<LoginCommandOptions> {
  private deps: LoginDeps;

  constructor(deps?: Partial<LoginDeps>) {
    super();
    this.deps = { ...createDefaultDeps(), ...deps };
  }

  register(_program: Command): void {
    // Registration handled by registerLoginCommands() in login.ts
  }

  // [LOGIN-A1] OAuth flow → open browser, start callback server, store session token
  async executeLogin(options: LoginCommandOptions): Promise<void> {
    try {
      const saasUrl = await this.resolveSaasUrl(options);

      console.log(`Opening browser for authentication at ${saasUrl}...`);

      // Start local callback server and open browser in parallel
      const callbackPromise = this.deps.startCallbackServer(CALLBACK_PORT);
      const oauthUrl = `${saasUrl}/api/auth/cli?callback=http://localhost:${CALLBACK_PORT}/auth/callback`;
      await this.deps.openBrowser(oauthUrl);

      // Wait for callback with token
      const { token, user } = await callbackPromise;

      // Store session token via SessionManager
      const sessionManager = await this.dependencyService.getSessionManager();
      const session = await sessionManager.loadSession() ?? {};
      session.cloud = { sessionToken: token };
      session.lastSession = { actorId: `human:${user.login}`, timestamp: new Date().toISOString() };
      await (sessionManager as any).sessionStore.saveSession(session);

      console.log(`Logged in as ${user.login} (human:${user.login})`);

      // [LOGIN-B3] Skip key sync if --no-key-sync
      if (options.noKeySync) {
        this.handleSuccess(
          { loggedIn: true, user: user.login, actorId: `human:${user.login}`, keySynced: false },
          options,
          `Logged in (key sync skipped)`
        );
        return;
      }

      // Key sync detection and execution
      await this.syncKeys(`human:${user.login}`, saasUrl, token, options);

    } catch (error) {
      this.handleError(
        `Login failed: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  // [LOGIN-A2] Display current login status
  async executeStatus(options: LoginCommandOptions): Promise<void> {
    try {
      const sessionManager = await this.dependencyService.getSessionManager();
      const session = await sessionManager.loadSession();
      const token = session?.cloud?.sessionToken;
      const lastSession = session?.lastSession;

      if (!token || !lastSession) {
        this.handleSuccess(
          { loggedIn: false },
          options,
          'Not logged in. Run `gitgov login` to connect to SaaS.'
        );
        return;
      }

      const saasUrl = await this.resolveSaasUrl(options);
      const actorId = lastSession.actorId;

      // Check key sync status
      let keyStatus: KeyStatusResponse = { hasKey: false, actorExists: false };
      try {
        const configManager = await this.dependencyService.getConfigManager();
        const config = await configManager.getConfig();
        const repoId = config?.projectId ?? '';
        keyStatus = await this.getKeyStatus(saasUrl, token, actorId, repoId);
      } catch {
        // Non-fatal — can't reach SaaS
      }

      const hasLocalKey = await this.hasLocalKey(actorId);

      this.handleSuccess(
        {
          loggedIn: true,
          user: actorId,
          saasUrl,
          keySynced: hasLocalKey && keyStatus.hasKey,
          localKey: hasLocalKey,
          saasKey: keyStatus.hasKey,
          lastLogin: lastSession.timestamp,
        },
        options,
        [
          `Logged in as ${actorId}`,
          `  SaaS: ${saasUrl}`,
          `  Local key: ${hasLocalKey ? 'yes' : 'no'}`,
          `  SaaS key: ${keyStatus.hasKey ? 'yes' : 'no'}`,
          `  Synced: ${hasLocalKey && keyStatus.hasKey ? 'yes' : 'no'}`,
          `  Last login: ${lastSession.timestamp}`,
        ].join('\n')
      );
    } catch (error) {
      this.handleError(
        `Failed to check status: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  // [LOGIN-A3] Logout removes session token without deleting keys
  async executeLogout(options: LoginCommandOptions): Promise<void> {
    try {
      const sessionManager = await this.dependencyService.getSessionManager();
      const session = await sessionManager.loadSession() ?? {};

      // Remove cloud token but preserve everything else
      delete session.cloud;

      await (sessionManager as any).sessionStore.saveSession(session);

      this.handleSuccess(
        { loggedOut: true },
        options,
        'Logged out. Session token removed. Keys are preserved.'
      );
    } catch (error) {
      this.handleError(
        `Logout failed: ${error instanceof Error ? error.message : String(error)}`,
        options,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Key sync detection and execution
   * [LOGIN-B1] CLI → SaaS when SaaS has no key
   * [LOGIN-B2] Update session after sync
   * [LOGIN-C1] SaaS → CLI when CLI has no key
   * [LOGIN-C2] Store downloaded key with secure permissions
   * [LOGIN-D1] Keys match → already synced
   * [LOGIN-D2] Keys differ → error
   */
  private async syncKeys(
    actorId: string,
    saasUrl: string,
    token: string,
    options: LoginCommandOptions,
  ): Promise<void> {
    const configManager = await this.dependencyService.getConfigManager();
    const config = await configManager.getConfig();
    const repoId = config?.projectId ?? '';

    const hasLocal = await this.hasLocalKey(actorId);
    const keyStatus = await this.getKeyStatus(saasUrl, token, actorId, repoId);

    // [LOGIN-B1] CLI has key, SaaS does not → sync to SaaS
    if (hasLocal && !keyStatus.hasKey) {
      const keyProvider = this.dependencyService.getKeyProvider();
      const privateKey = await keyProvider.getPrivateKey(actorId);
      if (privateKey) {
        await this.syncKeyToSaas(saasUrl, token, actorId, repoId, privateKey);
        // [LOGIN-B2] Update session
        console.log(`Key synced to SaaS for repo ${repoId}`);
        this.handleSuccess(
          { loggedIn: true, user: actorId, keySynced: true },
          options,
          `Logged in as ${actorId}\nKey synced to SaaS`
        );
        return;
      }
    }

    // [LOGIN-C1] SaaS has key, CLI does not → download to CLI
    if (!hasLocal && keyStatus.hasKey) {
      const keyResponse = await this.getKeyFromSaas(saasUrl, token, actorId, repoId);
      if (keyResponse.privateKey) {
        // [LOGIN-C2] Store with FsKeyProvider (handles 0600 permissions)
        const keyProvider = this.dependencyService.getKeyProvider();
        await keyProvider.setPrivateKey(actorId, keyResponse.privateKey);
        console.log(`Key downloaded from SaaS`);
        this.handleSuccess(
          { loggedIn: true, user: actorId, keySynced: true },
          options,
          `Logged in as ${actorId}\nKey downloaded from SaaS`
        );
        return;
      }
    }

    // [LOGIN-D1] Both have key and they match → already synced
    if (hasLocal && keyStatus.hasKey) {
      const keyProvider = this.dependencyService.getKeyProvider();
      const localKey = await keyProvider.getPrivateKey(actorId);
      const saasKeyResponse = await this.getKeyFromSaas(saasUrl, token, actorId, repoId);

      if (localKey && saasKeyResponse.privateKey && localKey === saasKeyResponse.privateKey) {
        this.handleSuccess(
          { loggedIn: true, user: actorId, keySynced: true },
          options,
          `Logged in as ${actorId}\nAlready synced ✓`
        );
        return;
      }

      // [LOGIN-D2] Keys differ → error
      if (localKey && saasKeyResponse.privateKey && localKey !== saasKeyResponse.privateKey) {
        console.error('Keys differ between CLI and SaaS. Resolve manually: use `gitgov actor rotate-key` to generate a new key, or choose which to keep.');
        this.handleSuccess(
          { loggedIn: true, user: actorId, keySynced: false, keyConflict: true },
          options,
          `Logged in as ${actorId}\nKeys differ — resolve manually`
        );
        return;
      }
    }

    // Neither has key
    if (!hasLocal && !keyStatus.hasKey) {
      this.handleSuccess(
        { loggedIn: true, user: actorId, keySynced: false },
        options,
        `Logged in as ${actorId}\nNo actor key found. Run gitgov init first.`
      );
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async resolveSaasUrl(options: LoginCommandOptions): Promise<string> {
    if (options.url) return options.url;
    try {
      const configManager = await this.dependencyService.getConfigManager();
      const config = await configManager.getConfig();
      if (config?.saasUrl) return config.saasUrl;
    } catch {
      // No config available — use default
    }
    return DEFAULT_SAAS_URL;
  }

  private async hasLocalKey(actorId: string): Promise<boolean> {
    try {
      const keyProvider = this.dependencyService.getKeyProvider();
      return await keyProvider.hasPrivateKey(actorId);
    } catch {
      return false;
    }
  }

  private async getKeyStatus(saasUrl: string, token: string, actorId: string, repoId: string): Promise<KeyStatusResponse> {
    const url = `${saasUrl}/api/identity/status?actorId=${encodeURIComponent(actorId)}&repoId=${encodeURIComponent(repoId)}`;
    const res = await this.deps.fetchSaas(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { hasKey: false, actorExists: false };
    return await res.json() as KeyStatusResponse;
  }

  private async syncKeyToSaas(saasUrl: string, token: string, actorId: string, repoId: string, privateKey: string): Promise<SyncKeyResponse> {
    const url = `${saasUrl}/api/identity/sync-key`;
    const res = await this.deps.fetchSaas(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ actorId, repoId, privateKey }),
    });
    if (!res.ok) throw new Error(`Failed to sync key to SaaS: ${res.status}`);
    return await res.json() as SyncKeyResponse;
  }

  private async getKeyFromSaas(saasUrl: string, token: string, actorId: string, repoId: string): Promise<GetKeyResponse> {
    const url = `${saasUrl}/api/identity/key?actorId=${encodeURIComponent(actorId)}&repoId=${encodeURIComponent(repoId)}`;
    const res = await this.deps.fetchSaas(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { privateKey: null };
    return await res.json() as GetKeyResponse;
  }
}
