/**
 * Login Command v2 — connects CLI with SaaS, exchanges private keys via ECDH
 *
 * Spec: cli/specs/login_command.md (v2)
 * EARS: LOGIN-A1..A4, LOGIN-B1..B3, LOGIN-C1..C2, LOGIN-D1..D2,
 *       LOGIN-E1..E4 (E2E), LOGIN-F1..F4, LOGIN-G1..G3, LOGIN-H1..H4
 *
 * v2 changes (Cycle 4, identity_key_sync):
 *   - REST → tRPC wire format (IKS-A27)
 *   - plaintext → ECDH encrypted key exchange (IKS-A24/A25)
 *   - repoId → { providerHost, repoPath } from git remote (IKS-A29, IKS-A33)
 *   - +--force-local / --force-cloud conflict resolution (LOGIN-F1..F4)
 *   - saasUrl required, no default (IKS-A28, LOGIN-H1)
 *   - 5 minute callback timeout (LOGIN-H2)
 */

import { Command } from 'commander';
import { BaseCommand } from '../../base/base-command';
import { Crypto, parseRemoteUrl, SyncState, reconcileActorRecord } from '@gitgov/core';
import type { IKeyProvider } from '@gitgov/core';
import type { GitRemoteRef } from '@gitgov/core';
import type { GitGovActorRecord } from '@gitgov/core';
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
          let timeoutHandle: ReturnType<typeof setTimeout>;
          const server = createServer((req, res) => {
            const url = new URL(req.url ?? '/', `http://localhost:${port}`);
            const token = url.searchParams.get('token');
            const login = url.searchParams.get('login');
            const id = url.searchParams.get('id');

            if (token && login && id) {
              clearTimeout(timeoutHandle);
              // [LOGIN-M1] Connection: close prevents socket hang
              res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
              res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitGovernance</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.card{text-align:center;max-width:400px;padding:2rem}h1{font-size:1.5rem;margin-bottom:.75rem}p{color:#888;font-size:.9rem;line-height:1.5}.check{font-size:2.5rem;margin-bottom:1rem}</style></head><body><div class="card"><div class="check">✓</div><h1>Authentication received</h1><p>Check your terminal for login status.</p></div></body></html>`);
              server.close();
              resolve({ token, user: { login, id: Number(id) } });
            } else {
              res.writeHead(400, { 'Content-Type': 'text/plain', 'Connection': 'close' });
              res.end('Missing token, login, or id');
            }
          });
          server.listen(port, () => {});
          server.on('error', reject);
          // [LOGIN-H2] Timeout after 5 minutes
          timeoutHandle = setTimeout(() => {
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
      // [LOGIN-Q1] Validate git repo BEFORE opening browser
      try {
        const { execSync } = await import('child_process');
        execSync('git rev-parse --git-dir', { cwd: process.cwd(), stdio: 'pipe', timeout: 5000 });
      } catch {
        throw new Error('Not in a git repository. Run gitgov login from inside a git project.');
      }

      // [LOGIN-J1] [LOGIN-P1] Cloud-first bootstrap: fetch remote state branch so DI can discover it
      // Priority: --state-branch flag > existing worktree config > fallback 'gitgov-state'
      const stateBranchForFetch = options.stateBranch || await this.resolveStateBranchPreDI();
      try {
        const { execSync } = await import('child_process');
        execSync(`git fetch origin ${stateBranchForFetch}`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 15000,
        });
      } catch {
        // [LOGIN-J2] Fetch failed — continue, DI will use cached refs or fail with clear message
      }

      // [EARS-C15] Tell DI which branch to use for worktree bootstrap (before any DI call)
      this.dependencyService.setStateBranchOverride(stateBranchForFetch);

      const saasUrl = await this.resolveSaasUrl(options);

      let token: string;
      let user: { login: string; id: number };

      if (options.token && options.login) {
        // [LOGIN-S1] --token mode: bypass OAuth, use pre-minted JWE. Test-only.
        token = options.token;
        user = { login: options.login, id: 0 };
      } else {
        // [LOGIN-S2] Standard OAuth browser flow
        // Start local callback server and open browser in parallel
        const callbackPromise = this.deps.startCallbackServer(CALLBACK_PORT);
        const webUrl = process.env['GITGOV_WEB_URL'] ?? saasUrl.replace(':3001', ':3000');
        const oauthUrl = `${webUrl}/auth/cli?callback=http://localhost:${CALLBACK_PORT}/auth/callback`;

        console.log(`Opening browser for authentication at ${oauthUrl}`);
        // [LOGIN-Q2] BROWSER=none suppresses system browser (E2E tests use Playwright)
        if (process.env['BROWSER'] !== 'none') {
          await this.deps.openBrowser(oauthUrl);
        }

        // Wait for callback with token
        ({ token, user } = await callbackPromise);
      }

      // Store session token via SessionManager public API
      const sessionManager = await this.dependencyService.getSessionManager();
      await sessionManager.setCloudToken(token);

      // [LOGIN-A1] Resolve actorId from local keys matching the OAuth login
      const allKeys = await sessionManager.detectActorFromKeyFiles();
      const matchingKeys = allKeys.filter(id => id.endsWith(`:${user.login}`));

      let actorId: string;
      let actorType: 'human' | 'agent' = 'human';

      if (matchingKeys.length === 1) {
        actorId = matchingKeys[0]!;
        actorType = actorId.startsWith('agent:') ? 'agent' : 'human';
      } else if (matchingKeys.length === 0) {
        // [LOGIN-J3b]
        actorId = `human:${user.login}`;
      } else {
        // [LOGIN-A1b]
        actorId = await this.promptActorSelection(matchingKeys, user.login);
        actorType = actorId.startsWith('agent:') ? 'agent' : 'human';
      }

      await sessionManager.setLastSession(actorId, new Date().toISOString());

      console.log(`Logged in as ${user.login} (${actorId})`);

      // [LOGIN-O1] Materialize actor BEFORE key sync — generates keypair if collaborator is new
      try {
        const projectModule = await this.dependencyService.getProjectModule();
        await projectModule.addActor({
          login: user.login,
          type: actorType,
          repoId: '',
          joinedVia: 'saas-oauth',
        });
      } catch (err) {
        // [LOGIN-O2] Warn and continue to syncKeys — if keypair wasn't generated, syncKeys handles case e
        console.warn('⚠️  Actor materialization failed:', err instanceof Error ? err.message : String(err));
        console.warn('   Key sync may fail if no local key exists.');
      }

      // [LOGIN-B3] Skip key sync if --no-key-sync
      if (options.noKeySync) {
        this.handleSuccess(
          { loggedIn: true, user: user.login, actorId, keySynced: false },
          options,
          `Logged in (key sync skipped)`
        );
        return;
      }

      // [LOGIN-J3] Key sync: use local actorId for FsKeyProvider, GitHub identity for SaaS context
      await this.syncKeys(actorId, saasUrl, token, options);

      // [LOGIN-L1, LOGIN-L2] Push gitgov-state so SaaS can index ActorRecord
      await this.pushGitgovState();

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
        const repo = await this.resolveRepoIdentity();
        keyStatus = await this.getKeyStatus(saasUrl, token, repo);
      } catch {
        // Non-fatal — can't reach SaaS or resolve repo identity
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
      await sessionManager.clearCloudToken();

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
    // [LOGIN-H3, IKS-A33] Resolve repo identity from git remote
    const repo = await this.resolveRepoIdentity();

    const hasLocal = await this.hasLocalKey(actorId);
    const keyStatus = await this.getKeyStatus(saasUrl, token, repo);

    // [LOGIN-K1] Repo not connected — keyStatus returned fallback (empty ecdhPublicKey)
    if (!keyStatus.exists && keyStatus.ecdhPublicKey === '') {
      const webUrl = process.env['GITGOV_WEB_URL'] ?? saasUrl.replace(':3001', ':3000');
      console.error('This repository is not connected to GitGovernance.');
      console.error(`  Connect it at: ${webUrl}`);
      console.error('  After connecting, run `gitgov login` again.');
      process.exit(1);
    }

    // [LOGIN-B1] CLI has key, SaaS does not → upload with ECDH
    if (hasLocal && !keyStatus.exists) {
      await this.uploadKeyToSaas(actorId, saasUrl, token, repo, keyStatus.ecdhPublicKey);
      // [LOGIN-B2] Confirmation after sync
      this.handleSuccess(
        { loggedIn: true, user: actorId, keySynced: true },
        options,
        `Logged in as ${actorId}\nKey synced to SaaS`
      );
      return;
    }

    // [LOGIN-C1] SaaS has key, CLI does not → download with ECDH
    if (!hasLocal && keyStatus.exists && keyStatus.hasPrivateKey) {
      await this.downloadKeyFromSaas(actorId, saasUrl, token, repo);
      this.handleSuccess(
        { loggedIn: true, user: actorId, keySynced: true },
        options,
        `Logged in as ${actorId}\nKey downloaded from SaaS`
      );
      return;
    }

    // [LOGIN-D1] Both have key — compare PUBLIC keys
    if (hasLocal && keyStatus.exists) {
      const keyProvider = await this.getLocalKeyProvider();
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
        // [LOGIN-F1] --force-local: upload local key to SaaS (SaaS overwrites under same actorId,
        // PKP-G2 archives the old key automatically — no succession, no -v2)
        if (options.forceLocal) {
          await this.uploadKeyToSaas(actorId, saasUrl, token, repo, keyStatus.ecdhPublicKey);
          console.log('Previous cloud key archived. Local key is now canonical.');
          this.handleSuccess(
            { loggedIn: true, user: actorId, keySynced: true },
            options,
            `Logged in as ${actorId}\nKey conflict resolved (local key uploaded)`
          );
          return;
        }

        // [LOGIN-F2] --force-cloud: download SaaS key, replace local
        if (options.forceCloud) {
          await this.downloadKeyFromSaas(actorId, saasUrl, token, repo);
          console.log('Previous local key archived. Cloud key is now canonical.');
          // [LOGIN-F4] Post-sync verification
          const postStatus = await this.getKeyStatus(saasUrl, token, repo);
          const newLocalPub = await keyProvider.getPublicKey(actorId);
          if (postStatus.publicKey === newLocalPub) {
            this.handleSuccess(
              { loggedIn: true, user: actorId, keySynced: true },
              options,
              `Logged in as ${actorId}\nKey conflict resolved (cloud key downloaded)`
            );
          }
          return;
        }

        // [LOGIN-F3] No flags → show fingerprints (SHA-256 hex, first 16 chars) and exit
        const { createHash } = await import('crypto');
        const localFp = createHash('sha256').update(Buffer.from(localPublicKey, 'base64')).digest('hex').slice(0, 16);
        const saasFp = createHash('sha256').update(Buffer.from(saasPublicKey, 'base64')).digest('hex').slice(0, 16);
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

    // Neither has key (case e) — exit 1 per spec
    if (!hasLocal && !keyStatus.exists) {
      console.error('No actor key found. Run gitgov init first to generate your identity key.');
      process.exit(1);
    }
  }

  /**
   * [LOGIN-L1] Push state branch to remote after successful key sync.
   * [LOGIN-L2] Skip silently if branch doesn't exist locally (cloud-first flow).
   * Best-effort — logs warning on failure but does not fail the login.
   */
  private async pushGitgovState(): Promise<void> {
    try {
      const configManager = await this.dependencyService.getConfigManager();
      const stateBranch = await configManager.getStateBranch();
      const { execSync } = await import('child_process');
      execSync(`git rev-parse --verify ${stateBranch}`, { cwd: process.cwd(), stdio: 'pipe', timeout: 2000 });
      execSync(`git push origin ${stateBranch}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 5000,
        env: { ...process.env, GIT_SSH_COMMAND: 'ssh -o ConnectTimeout=3 -o BatchMode=yes' },
      });
    } catch (err) {
      // [LOGIN-L1] Warning on push failure — does not fail login
      console.warn('⚠️  Push gitgov-state failed:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * [LOGIN-J1] Best-effort branch name resolution before DI is available.
   * Reads config.json from existing worktree if present. Falls back to 'gitgov-state'.
   */
  private async resolveStateBranchPreDI(): Promise<string> {
    try {
      const { findProjectRoot, getWorktreeBasePath } = await import('@gitgov/core/fs');
      const repoRoot = findProjectRoot(process.cwd());
      if (!repoRoot) return SyncState.DEFAULT_STATE_BRANCH;
      const worktreePath = getWorktreeBasePath(repoRoot);
      const configPath = (await import('path')).join(worktreePath, '.gitgov', 'config.json');
      const { readFileSync } = await import('fs');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return config?.state?.branch || SyncState.DEFAULT_STATE_BRANCH;
    } catch {
      return SyncState.DEFAULT_STATE_BRANCH;
    }
  }

  // ============================================================================
  // tRPC HELPERS (v2 — ECDH encrypted, providerHost+repoPath scoped)
  // ============================================================================

  // [LOGIN-H1] saasUrl must be explicitly configured — no default (IKS-A28)
  private async resolveSaasUrl(options: LoginCommandOptions): Promise<string> {
    if (options.url) return options.url;
    try {
      const configManager = await this.dependencyService.getConfigManager();
      const saasUrl = await configManager.getSaasUrl();
      if (saasUrl) return saasUrl;
    } catch {
      // No config available
    }
    throw new Error('No saasUrl configured. Run gitgov init or set saasUrl in .gitgov/config.json');
  }

  // [LOGIN-H3, IKS-A33] Resolve providerHost + repoPath from git remote origin
  // Uses parseRemoteUrl from @gitgov/core — shared with SaaS
  private async resolveRepoIdentity(): Promise<GitRemoteRef> {
    try {
      const { execSync } = await import('child_process');
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
      const ref = parseRemoteUrl(remoteUrl);
      if (ref) {
        // [LOGIN-H4] Resolve SSH alias to real hostname via ssh -G
        // Handles multi-account SSH configs (e.g. Host github-work → HostName github.com)
        const resolved = execSync(`ssh -G ${ref.providerHost}`, { encoding: 'utf-8' });
        const hostMatch = resolved.match(/^hostname\s+(.+)$/m);
        if (hostMatch?.[1]) ref.providerHost = hostMatch[1];
        return ref;
      }
    } catch {
      // Git not available or no remote
    }
    throw new Error('Could not determine repository. Ensure you are in a git repository with a remote origin.');
  }

  private async promptActorSelection(actorIds: string[], login: string): Promise<string> {
    const { createInterface } = await import('readline');
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log(`\nMultiple actors found for ${login}:`);
    actorIds.forEach((id, i) => console.log(`  ${i + 1}. ${id}`));

    return new Promise<string>((resolve) => {
      rl.question(`Select actor [1-${actorIds.length}]: `, (answer) => {
        rl.close();
        const idx = parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < actorIds.length) {
          resolve(actorIds[idx]!);
        } else {
          console.log(`Invalid selection, using ${actorIds[0]}`);
          resolve(actorIds[0]!);
        }
      });
    });
  }

  private async getLocalKeyProvider(): Promise<IKeyProvider> {
    const { FsKeyProvider, findProjectRoot, getWorktreeBasePath, getKeysDir } = await import('@gitgov/core/fs');
    const repoRoot = findProjectRoot(process.cwd());
    if (!repoRoot) throw new Error('Not in a git repository');
    const worktreePath = getWorktreeBasePath(repoRoot);
    return new FsKeyProvider({ keysDir: getKeysDir(worktreePath) });
  }

  private async hasLocalKey(actorId: string): Promise<boolean> {
    try {
      const kp = await this.getLocalKeyProvider();
      return await kp.hasPrivateKey(actorId);
    } catch {
      return false;
    }
  }

  /** Call identity.keyStatus via tRPC (IKS-A27 wire format) */
  private async getKeyStatus(saasUrl: string, token: string, repo: GitRemoteRef): Promise<KeyStatusResponse> {
    const input = encodeURIComponent(JSON.stringify(repo));
    const url = `${saasUrl}/trpc/identity.keyStatus?input=${input}`;
    const res = await this.deps.fetchSaas(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error(`[keyStatus] ${res.status}`);
      return { exists: false, hasPrivateKey: false, publicKey: null, ecdhPublicKey: '' };
    }
    const body = await res.json() as TrpcResponse<KeyStatusResponse>;
    return body.result.data;
  }

  /**
   * [LOGIN-G1] Upload key to SaaS with ECDH (ECIES pattern).
   * Fetches server's ecdhPublicKey from keyStatus, encrypts with ecdhEncrypt.
   */
  private async uploadKeyToSaas(
    actorId: string,
    saasUrl: string,
    token: string,
    repo: GitRemoteRef,
    serverEcdhPublicKey: string,
  ): Promise<SyncKeyResponse> {
    const keyProvider = await this.getLocalKeyProvider();
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
      body: JSON.stringify({ ...repo, publicKey, privateKeyEnvelope: envelope }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Failed to sync key to SaaS: ${res.status} ${errBody.slice(0, 300)}`);
    }
    const body = await res.json() as TrpcResponse<SyncKeyResponse>;
    return body.result.data;
  }

  /**
   * [LOGIN-G2] Download key from SaaS with ECDH (ephemeral pattern).
   * Generates client ephemeral keypair, sends pubkey, decrypts response.
   */
  private async downloadKeyFromSaas(
    actorId: string,
    saasUrl: string,
    token: string,
    repo: GitRemoteRef,
  ): Promise<void> {
    // [LOGIN-G2] Generate ephemeral keypair for ECDH
    const clientKp = Crypto.generateEphemeralKeypair();

    const input = encodeURIComponent(JSON.stringify({
      ...repo, clientEcdhPublicKey: clientKp.publicKey,
    }));
    const url = `${saasUrl}/trpc/identity.getKey?input=${input}`;
    const res = await this.deps.fetchSaas(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to download key from SaaS: ${res.status}`);

    const body = await res.json() as TrpcResponse<GetKeyResponse>;
    const { privateKeyEnvelope } = body.result.data;

    // [LOGIN-G2] Decrypt ECDH envelope
    let decryptedKey: Buffer;
    try {
      decryptedKey = await Crypto.ecdhDecrypt(privateKeyEnvelope, clientKp.privateKey);
    } catch {
      // [LOGIN-G3] ECDH decryption failure
      throw new Error('Key transfer failed: ECDH decryption error. Try again or contact support.');
    }

    // [LOGIN-C2] Store with FsKeyProvider in {worktree}/.gitgov/keys/ (handles 0600 permissions)
    const keyProvider = await this.getLocalKeyProvider();
    await keyProvider.setPrivateKey(actorId, decryptedKey.toString('base64'));
    console.log('Key downloaded from SaaS');

    // [LOGIN-F5] Reconcile local ActorRecord + session with the downloaded key.
    // The ActorRecord's publicKey may differ from the downloaded key (the whole point of
    // force-cloud). Update it so the repo's committed identity matches the org canonical key.
    await this.reconcileActorRecordAfterDownload(actorId, decryptedKey.toString('base64'));
  }

  /**
   * [LOGIN-F5] After downloading a key from SaaS (force-cloud or case b), reconcile:
   * (a) Update the local ActorRecord's publicKey to match the downloaded key
   * (b) Re-sign the record (self-signed, genesis pattern — NOT succession)
   * (c) Fix .session.json if it references a phantom -v2 actorId
   * (d) Push gitgov-state (best-effort)
   *
   * If the ActorRecord doesn't exist locally (cloud-first flow), skip silently.
   */
  private async reconcileActorRecordAfterDownload(actorId: string, privateKeyBase64: string): Promise<void> {
    try {
      const { findProjectRoot, getWorktreeBasePath } = await import('@gitgov/core/fs');
      const path = await import('path');
      const fs = await import('node:fs/promises');

      const { DEFAULT_ID_ENCODER } = await import('@gitgov/core');
      const repoRoot = findProjectRoot(process.cwd());
      if (!repoRoot) return;
      const worktreePath = getWorktreeBasePath(repoRoot);
      const encodedId = DEFAULT_ID_ENCODER.encode(actorId);
      const actorPath = path.join(worktreePath, '.gitgov', 'actors', `${encodedId}.json`);

      // [LOGIN-F5](b) Check if ActorRecord exists locally
      let rawContent: string;
      try {
        rawContent = await fs.readFile(actorPath, 'utf-8');
      } catch {
        return; // No local ActorRecord — cloud-first flow, skip
      }

      const record = JSON.parse(rawContent) as GitGovActorRecord;

      // [LOGIN-F5](a) Derive public key from downloaded private key
      const newPublicKey = Crypto.derivePublicKey(privateKeyBase64);

      // [LOGIN-F5] Delegate the overwrite (pubkey + heal revoked + re-sign genesis) to the
      // shared core primitive — the SAME mutation the worker's sync_org_keys uses. This
      // replaces the hand-rolled block that diverged from the worker. null → already
      // canonical → nothing to reconcile.
      const reconciled = reconcileActorRecord(record, actorId, {
        publicKey: newPublicKey,
        privateKey: privateKeyBase64,
      });
      if (!reconciled) {
        return;
      }

      // [LOGIN-F5](f) Write the reconciled record
      await fs.writeFile(actorPath, JSON.stringify(reconciled, null, 2), 'utf-8');

      // [LOGIN-F5](g) Fix phantom -v2 in session
      const sessionManager = await this.dependencyService.getSessionManager();
      const session = await sessionManager.loadSession();
      if (session?.lastSession?.actorId && session.lastSession.actorId !== actorId) {
        const currentSessionActor = session.lastSession.actorId;
        if (currentSessionActor.includes('-v') && currentSessionActor.startsWith(actorId.split('-v')[0]!)) {
          await sessionManager.setLastSession(actorId, new Date().toISOString());
        }
      }

      // [LOGIN-F5](f2) Commit the reconciled record in the WORKTREE before pushing.
      // A push without a commit is a no-op: the remote keeps the stale key and
      // "1 command = full recovery" (P0/KS12) breaks — the worktree converges but
      // the committed identity on gitgov-state does not. Best-effort, bot identity.
      try {
        const { execSync } = await import('child_process');
        const relativeActorPath = path.join('.gitgov', 'actors', `${encodedId}.json`);
        execSync(`git add "${relativeActorPath}"`, { cwd: worktreePath, stdio: 'pipe', timeout: 5000 });
        execSync('git -c user.name=gitgov -c user.email=bot@gitgov.dev commit -m "gitgov: reconcile actor key (force-cloud)"', {
          cwd: worktreePath, stdio: 'pipe', timeout: 5000,
        });
      } catch {
        // Nothing to commit (already committed) or git unavailable — push below is best-effort anyway
      }

      // [LOGIN-F5](h) Push gitgov-state (best-effort, reuses LOGIN-L1)
      await this.pushGitgovState();
    } catch (err) {
      console.warn('⚠️  ActorRecord reconciliation failed:', err instanceof Error ? err.message : String(err));
    }
  }
}
