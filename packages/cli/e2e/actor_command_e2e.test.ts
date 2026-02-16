import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E Tests for Actor CLI Command
 *
 * Blueprint: actor_command.md §4.2 (E2E-ACTOR-1 to E2E-ACTOR-4)
 *
 * Tests the `gitgov actor` commands executing the compiled binary against
 * a real repository with bare remote. Unlike unit tests (§4.1) that mock
 * IdentityAdapter, these exercise the full stack:
 * CLI → DependencyInjection → IdentityAdapter → KeyProvider → filesystem.
 *
 * Setup per test:
 * - Bare repository as remote (git init --bare)
 * - Local repo with `gitgov init` (creates initial actor + worktree)
 * - Each test uses its own isolated temp directory
 */
describe('Actor CLI Command - E2E Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-actor-e2e-'));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper function to execute CLI command
  const runCliCommand = (args: string[], options: { expectError?: boolean; cwd: string }) => {
    const cliPath = path.join(__dirname, '../build/dist/gitgov.mjs');
    const escapedArgs = args.map(arg => {
      if (arg.includes(' ') && !arg.startsWith('"') && !arg.startsWith("'")) {
        return `"${arg}"`;
      }
      return arg;
    });
    const command = `node "${cliPath}" ${escapedArgs.join(' ')}`;

    try {
      const result = execSync(command, {
        cwd: options.cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      if (options.expectError) {
        return { success: false, output: result, error: 'Expected error but command succeeded' };
      }

      return { success: true, output: result, error: null };
    } catch (error: any) {
      const stderr = error.stderr || '';
      const stdout = error.stdout || '';
      const message = error.message || '';

      const combinedOutput = `${stdout}\n${stderr}\n${message}`.trim();

      if (options.expectError) {
        return { success: false, output: stdout || combinedOutput, error: stderr || combinedOutput };
      }

      throw new Error(`CLI command failed unexpectedly: ${stderr || message}\nStdout: ${stdout}`);
    }
  };

  // Helper to create a fresh git repo
  const createGitRepo = (repoPath: string) => {
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init --initial-branch=main', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' });
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Project\n');
    execSync('git add README.md', { cwd: repoPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });
  };

  // Helper to create a bare remote repo
  const createBareRemote = (remotePath: string) => {
    fs.mkdirSync(remotePath, { recursive: true });
    execSync('git init --bare --initial-branch=main', { cwd: remotePath, stdio: 'pipe' });
  };

  // Helper to add remote to repo
  const addRemote = (repoPath: string, remotePath: string) => {
    execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' });
  };

  // Helper to compute worktree base path (matches DI.getWorktreeBasePath)
  const getWorktreeBasePath = (repoPath: string): string => {
    const resolvedPath = fs.realpathSync(repoPath);
    const hash = createHash('sha256').update(resolvedPath).digest('hex').slice(0, 12);
    return path.join(os.homedir(), '.gitgov', 'worktrees', hash);
  };

  // Helper to clean up worktree
  const cleanupWorktree = (repoPath: string, wtPath: string) => {
    if (fs.existsSync(wtPath)) {
      try { execSync(`git worktree remove "${wtPath}" --force`, { cwd: repoPath, stdio: 'pipe' }); } catch {}
      if (fs.existsSync(wtPath)) {
        fs.rmSync(wtPath, { recursive: true, force: true });
      }
    }
  };

  // ============================================================================
  // 4.2. Actor E2E Tests (E2E-ACTOR-1 to E2E-ACTOR-4)
  // ============================================================================
  describe('4.2. Actor Commands (E2E-ACTOR-1 to E2E-ACTOR-4)', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `actor-e2e-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      createGitRepo(testProjectRoot);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });

      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);

      // Initialize gitgov (creates initial actor + worktree)
      runCliCommand(['init', '--name', 'Actor E2E Test', '--actor-name', 'Init User', '--quiet'], { cwd: testProjectRoot });
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[E2E-ACTOR-1] WHEN actor new is executed with valid flags THE SYSTEM SHALL create ActorRecord and key on disk', () => {
      // 1. Create a new actor
      const result = runCliCommand(
        ['actor', 'new', '-t', 'human', '-n', 'E2E Test Actor', '-r', 'developer', '--json'],
        { cwd: testProjectRoot }
      );
      expect(result.success).toBe(true);

      // 2. Verify JSON output
      const data = JSON.parse(result.output);
      expect(data.success).toBe(true);
      expect(data.data.actorId).toMatch(/^human:/);
      expect(data.data.type).toBe('human');
      expect(data.data.displayName).toBe('E2E Test Actor');
      expect(data.data.roles).toEqual(['developer']);

      // 3. Verify ActorRecord .json exists on disk
      const actorsDir = path.join(worktreeBasePath, '.gitgov', 'actors');
      const actorId = data.data.actorId;
      const actorFileName = actorId.replace(/:/g, '_') + '.json';
      const actorFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.json'));
      // Should have at least 2 actors: the init actor + the new one
      expect(actorFiles.length).toBeGreaterThanOrEqual(2);

      // 4. Verify .key file exists on disk for the new actor
      const keysDir = path.join(worktreeBasePath, '.gitgov', 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      // Should have at least 2 keys: the init actor + the new one
      expect(keyFiles.length).toBeGreaterThanOrEqual(2);

      // 5. Verify the new actor's .json contains valid ActorRecord structure
      // Find the actor file by matching the actorId in content
      let foundActor = false;
      for (const file of actorFiles) {
        const content = fs.readFileSync(path.join(actorsDir, file), 'utf-8');
        if (content.includes(actorId)) {
          const record = JSON.parse(content);
          expect(record.payload.type).toBe('human');
          expect(record.payload.displayName).toBe('E2E Test Actor');
          expect(record.payload.roles).toContain('developer');
          expect(record.payload.status).toBe('active');
          expect(record.payload.publicKey).toBeDefined();
          foundActor = true;
          break;
        }
      }
      expect(foundActor).toBe(true);
    });

    it('[E2E-ACTOR-2] WHEN actor new is executed without required flags THE SYSTEM SHALL fail with clear error', () => {
      // 1. Missing --type
      const noType = runCliCommand(
        ['actor', 'new', '-n', 'No Type', '-r', 'developer'],
        { cwd: testProjectRoot, expectError: true }
      );
      expect(noType.success).toBe(false);
      expect(noType.error).toMatch(/required|--type|-t/i);

      // 2. Missing --name
      const noName = runCliCommand(
        ['actor', 'new', '-t', 'human', '-r', 'developer'],
        { cwd: testProjectRoot, expectError: true }
      );
      expect(noName.success).toBe(false);
      expect(noName.error).toMatch(/required|--name|-n/i);

      // 3. Missing --role
      const noRole = runCliCommand(
        ['actor', 'new', '-t', 'human', '-n', 'No Role'],
        { cwd: testProjectRoot, expectError: true }
      );
      expect(noRole.success).toBe(false);
      expect(noRole.error).toMatch(/required|--role|-r/i);
    });

    it('[E2E-ACTOR-3] WHEN actor rotate-key is executed THE SYSTEM SHALL create successor and revoke old on disk', () => {
      // 1. Create an actor to rotate
      const createResult = runCliCommand(
        ['actor', 'new', '-t', 'human', '-n', 'Rotate Target', '-r', 'developer', '--json'],
        { cwd: testProjectRoot }
      );
      expect(createResult.success).toBe(true);
      const createData = JSON.parse(createResult.output);
      const originalActorId = createData.data.actorId;

      // 2. Rotate the key
      const rotateResult = runCliCommand(
        ['actor', 'rotate-key', originalActorId, '--json'],
        { cwd: testProjectRoot }
      );
      expect(rotateResult.success).toBe(true);

      // 3. Verify JSON output
      const rotateData = JSON.parse(rotateResult.output);
      expect(rotateData.success).toBe(true);
      expect(rotateData.data.oldActorId).toBe(originalActorId);
      expect(rotateData.data.newActorId).not.toBe(originalActorId);
      expect(rotateData.data.status).toBe('rotated');

      // 4. Verify old actor is revoked on disk
      const actorsDir = path.join(worktreeBasePath, '.gitgov', 'actors');
      const actorFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.json'));

      let oldActorRevoked = false;
      let newActorActive = false;
      const newActorId = rotateData.data.newActorId;

      for (const file of actorFiles) {
        const content = fs.readFileSync(path.join(actorsDir, file), 'utf-8');
        const record = JSON.parse(content);

        if (content.includes(originalActorId) && record.payload.id === originalActorId) {
          expect(record.payload.status).toBe('revoked');
          expect(record.payload.supersededBy).toBe(newActorId);
          oldActorRevoked = true;
        }

        if (content.includes(newActorId) && record.payload.id === newActorId) {
          expect(record.payload.status).toBe('active');
          expect(record.payload.publicKey).toBeDefined();
          newActorActive = true;
        }
      }

      expect(oldActorRevoked).toBe(true);
      expect(newActorActive).toBe(true);

      // 5. Verify new actor has a .key file
      // FsKeyProvider uses actorId directly (colons preserved) as filename
      const keysDir = path.join(worktreeBasePath, '.gitgov', 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      const hasNewKey = keyFiles.some(f => f.includes(newActorId));
      expect(hasNewKey).toBe(true);
    });

    it('[E2E-ACTOR-4] WHEN actor rotate-key is executed with non-existent actor THE SYSTEM SHALL fail with error', () => {
      const result = runCliCommand(
        ['actor', 'rotate-key', 'human:non-existent-actor-12345', '--json'],
        { cwd: testProjectRoot, expectError: true }
      );
      expect(result.success).toBe(false);
      expect(result.error || result.output).toMatch(/not found|error|fail/i);
    });
  });
});
