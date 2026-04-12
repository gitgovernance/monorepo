/**
 * Login Command v2 — connects CLI with SaaS, exchanges private keys via ECDH
 *
 * Spec: cli/specs/login_command.md (v2)
 * EARS: LOGIN-A1..A4, LOGIN-B1..B3, LOGIN-C1..C2, LOGIN-D1..D2,
 *       LOGIN-E1..E4 (E2E), LOGIN-F1..F4, LOGIN-G1..G3, LOGIN-H1..H3
 *
 * v2 changes (Cycle 4, identity_key_sync):
 *   - REST → tRPC wire format (IKS-A27)
 *   - plaintext → ECDH encrypted key exchange (IKS-A24/A25)
 *   - repoId → orgId via owner/repo from git remote (IKS-A29)
 *   - +--force-local / --force-cloud conflict resolution (LOGIN-F1..F4)
 *   - saasUrl required, no default (IKS-A28, LOGIN-H1)
 *   - 5 minute callback timeout (LOGIN-H2)
 */

import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import { Crypto } from '@gitgov/core';
import type {
  LoginCommandOptions,
  LoginDeps,
  KeyStatusResponse,
  SyncKeyResponse,
  GetKeyResponse,
  TrpcResponse,
} from './login-command.types';

const CALLBACK_PORT = 9876;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (IKS-A28, LOGIN-H2)

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
          // [LOGIN-H2] Timeout after 5 minutes
          setTimeout(() => {
            server.close();
            reject(new Error('Login timeout — no callback received within 5 minutes'));
          }, CALLBACK_TIMEOUT_MS);
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

      // Check key sync status via tRPC
      let keyStatus: KeyStatusResponse | null = null;
      try {
        const orgId = await this.resolveOrgId();
        keyStatus = await this.getKeyStatus(saasUrl, token, orgId);
      } catch {
        // Non-fatal — can't reach SaaS or resolve orgId
      }

      const hasLocalKey = await this.hasLocalKey(actorId);

      this.handleSuccess(
        {
          loggedIn: true,
          user: actorId,
          saasUrl,
          keySynced: hasLocalKey && (keyStatus?.hasPrivateKey ?? false),
          localKey: hasLocalKey,
          saasKey: keyStatus?.hasPrivateKey ?? false,
          lastLogin: lastSession.timestamp,
        },
        options,
        [
          `Logged in as ${actorId}`,
          `  SaaS: ${saasUrl}`,
          `  Local key: ${hasLocalKey ? 'yes' : 'no'}`,
          `  SaaS key: ${keyStatus?.hasPrivateKey ? 'yes' : 'no'}`,
          `  Synced: ${hasLocalKey && keyStatus?.hasPrivateKey ? 'yes' : 'no'}`,
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
   * Key sync detection and execution (5 cases + --force conflict resolution)
   * [LOGIN-B1] CLI → SaaS when SaaS has no key (ECDH upload)
   * [LOGIN-C1] SaaS → CLI when CLI has no key (ECDH download)
   * [LOGIN-D1] Public keys match → already synced
   * [LOGIN-D2] Public keys differ → conflict
   * [LOGIN-F1..F4] --force-local / --force-cloud
   */
  private async syncKeys(
    actorId: string,
    saasUrl: string,
    token: string,
    options: LoginCommandOptions,
  ): Promise<void> {
    // [LOGIN-H3] Resolve orgId from git remote
    const orgId = await this.resolveOrgId();

    const hasLocal = await this.hasLocalKey(actorId);
    const keyStatus = await this.getKeyStatus(saasUrl, token, orgId);

    // [LOGIN-B1] CLI has key, SaaS does not → upload with ECDH
    if (hasLocal && !keyStatus.exists) {
      await this.uploadKeyToSaas(actorId, saasUrl, token, orgId, keyStatus.ecdhPublicKey);
      this.handleSuccess(
        { loggedIn: true, user: actorId, keySynced: true },
        options,
        `Logged in as ${actorId}\nKey synced to SaaS`
      );
      return;
    }

    // [LOGIN-C1] SaaS has key, CLI does not → download with ECDH
    if (!hasLocal && keyStatus.exists && keyStatus.hasPrivateKey) {
      await this.downloadKeyFromSaas(actorId, saasUrl, token, orgId);
      this.handleSuccess(
        { loggedIn: true, user: actorId, keySynced: true },
        options,
        `Logged in as ${actorId}\nKey downloaded from SaaS`
      );
      return;
    }

    // [LOGIN-D1] Both have key — compare PUBLIC keys
    if (hasLocal && keyStatus.exists) {
      const keyProvider = this.dependencyService.getKeyProvider();
      const localPublicKey = await keyProvider.getPublicKey(actorId);
      const saasPublicKey = keyStatus.publicKey;

      if (localPublicKey && saasPublicKey && localPublicKey === saasPublicKey) {
        this.handleSuccess(
          { loggedIn: true, user: actorId, keySynced: true },
          options,
          `Logged in as ${actorId}\nAlready synced ✓`
        );
        return;
      }

      // [LOGIN-D2 / LOGIN-F1..F4] Keys differ → conflict resolution
      if (localPublicKey && saasPublicKey && localPublicKey !== saasPublicKey) {
        // [LOGIN-F1] --force-local: upload local key, archive SaaS key
        if (options.forceLocal) {
          await this.uploadKeyToSaas(actorId, saasUrl, token, orgId, keyStatus.ecdhPublicKey);
          console.log('Previous cloud key archived. Local key is now canonical.');
          // [LOGIN-F4] Post-sync verification
          const postStatus = await this.getKeyStatus(saasUrl, token, orgId);
          const newLocalPub = await keyProvider.getPublicKey(actorId);
          if (postStatus.publicKey === newLocalPub) {
            this.handleSuccess(
              { loggedIn: true, user: actorId, keySynced: true },
              options,
              `Logged in as ${actorId}\nKey conflict resolved (local key uploaded)`
            );
          }
          return;
        }

        // [LOGIN-F2] --force-cloud: download SaaS key, replace local
        if (options.forceCloud) {
          await this.downloadKeyFromSaas(actorId, saasUrl, token, orgId);
          console.log('Previous local key archived. Cloud key is now canonical.');
          this.handleSuccess(
            { loggedIn: true, user: actorId, keySynced: true },
            options,
            `Logged in as ${actorId}\nKey conflict resolved (cloud key downloaded)`
          );
          return;
        }

        // [LOGIN-F3] No flags → show fingerprints and exit
        const localFp = localPublicKey.slice(0, 16);
        const saasFp = saasPublicKey.slice(0, 16);
        if (options.json) {
          console.log(JSON.stringify({
            success: false,
            error: 'Key conflict',
            data: { loggedIn: true, user: actorId, keySynced: false, keyConflict: true,
              localFingerprint: localFp, saasFingerprint: saasFp },
          }, null, 2));
        } else {
          console.error('Keys differ between CLI and SaaS.');
          console.error(`  Local:  ${localFp}...`);
          console.error(`  Cloud:  ${saasFp}...`);
          console.error('Use --force-local to keep local key (uploads to cloud)');
          console.error('Use --force-cloud to keep cloud key (downloads to local)');
        }
        process.exit(1);
        return;
      }
    }

    // Neither has key (case e)
    if (!hasLocal && !keyStatus.exists) {
      this.handleSuccess(
        { loggedIn: true, user: actorId, keySynced: false },
        options,
        `Logged in as ${actorId}\nNo actor key found. Run gitgov init first.`
      );
    }
  }

  // ============================================================================
  // tRPC HELPERS (v2 — ECDH encrypted, orgId-scoped)
  // ============================================================================

  // [LOGIN-H1] saasUrl must be explicitly configured — no default (IKS-A28)
  private async resolveSaasUrl(options: LoginCommandOptions): Promise<string> {
    if (options.url) return options.url;
    try {
      const configManager = await this.dependencyService.getConfigManager();
      const config = await configManager.loadConfig();
      if (config?.saasUrl) return config.saasUrl;
    } catch {
      // No config available
    }
    throw new Error('No saasUrl configured. Run gitgov init or set saasUrl in .gitgov/config.json');
  }

  // [LOGIN-H3] Resolve orgId from git remote origin → owner/repo (IKS-A29)
  private async resolveOrgId(): Promise<string> {
    try {
      const { execSync } = await import('child_process');
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
      // Parse owner/repo from https://github.com/owner/repo.git or git@github.com:owner/repo.git
      const match = remoteUrl.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
      if (match) return `${match[1]}/${match[2]}`;
    } catch {
      // Git not available or no remote
    }
    throw new Error('Could not determine repository. Ensure you are in a git repository with a remote origin.');
  }

  private async hasLocalKey(actorId: string): Promise<boolean> {
    try {
      const keyProvider = this.dependencyService.getKeyProvider();
      return await keyProvider.hasPrivateKey(actorId);
    } catch {
      return false;
    }
  }

  /** Call identity.keyStatus via tRPC (IKS-A27 wire format) */
  private async getKeyStatus(saasUrl: string, token: string, orgId: string): Promise<KeyStatusResponse> {
    const input = encodeURIComponent(JSON.stringify({ json: { orgId } }));
    const url = `${saasUrl}/trpc/identity.keyStatus?input=${input}`;
    const res = await this.deps.fetchSaas(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { exists: false, hasPrivateKey: false, publicKey: null, ecdhPublicKey: '' };
    const body = await res.json() as TrpcResponse<KeyStatusResponse>;
    return body.result.data.json;
  }

  /**
   * [LOGIN-G1] Upload key to SaaS with ECDH (ECIES pattern).
   * Fetches server's ecdhPublicKey from keyStatus, encrypts with ecdhEncrypt.
   */
  private async uploadKeyToSaas(
    actorId: string,
    saasUrl: string,
    token: string,
    orgId: string,
    serverEcdhPublicKey: string,
  ): Promise<SyncKeyResponse> {
    const keyProvider = this.dependencyService.getKeyProvider();
    const privateKey = await keyProvider.getPrivateKey(actorId);
    const publicKey = await keyProvider.getPublicKey(actorId);
    if (!privateKey || !publicKey) throw new Error('Local key not found');

    // [LOGIN-G1] ECDH encrypt: client generates ephemeral keypair, encrypts for server
    const clientKp = Crypto.generateEphemeralKeypair();
    const envelope = await Crypto.ecdhEncrypt(
      Buffer.from(privateKey, 'base64'),
      clientKp,
      serverEcdhPublicKey,
    );

    const url = `${saasUrl}/trpc/identity.syncKey`;
    const res = await this.deps.fetchSaas(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ json: { orgId, publicKey, privateKeyEnvelope: envelope } }),
    });
    if (!res.ok) throw new Error(`Failed to sync key to SaaS: ${res.status}`);
    const body = await res.json() as TrpcResponse<SyncKeyResponse>;
    return body.result.data.json;
  }

  /**
   * [LOGIN-G2] Download key from SaaS with ECDH (ephemeral pattern).
   * Generates client ephemeral keypair, sends pubkey, decrypts response.
   */
  private async downloadKeyFromSaas(
    actorId: string,
    saasUrl: string,
    token: string,
    orgId: string,
  ): Promise<void> {
    // [LOGIN-G2] Generate ephemeral keypair for ECDH
    const clientKp = Crypto.generateEphemeralKeypair();

    const input = encodeURIComponent(JSON.stringify({
      json: { orgId, clientEcdhPublicKey: clientKp.publicKey },
    }));
    const url = `${saasUrl}/trpc/identity.getKey?input=${input}`;
    const res = await this.deps.fetchSaas(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to download key from SaaS: ${res.status}`);

    const body = await res.json() as TrpcResponse<GetKeyResponse>;
    const { privateKeyEnvelope } = body.result.data.json;

    // [LOGIN-G2] Decrypt ECDH envelope
    let decryptedKey: Buffer;
    try {
      decryptedKey = await Crypto.ecdhDecrypt(privateKeyEnvelope, clientKp.privateKey);
    } catch {
      // [LOGIN-G3] ECDH decryption failure
      throw new Error('Key transfer failed: ECDH decryption error. Try again or contact support.');
    }

    // [LOGIN-C2] Store with FsKeyProvider (handles 0600 permissions)
    const keyProvider = this.dependencyService.getKeyProvider();
    await keyProvider.setPrivateKey(actorId, decryptedKey.toString('base64'));
    console.log('Key downloaded from SaaS');
  }
}
