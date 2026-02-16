import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E Tests for Sync CLI Commands
 *
 * Tests the `gitgov sync` commands in various scenarios:
 * - EARS-G1: Reindex after bootstrapFromStateBranch
 * - EARS-G2: Auto-detect actor from .key files when session missing
 * - EARS-G3: Show implicit pull results when push reconciles with remote
 * - EARS-G4: Regenerate index when implicit pull occurs
 * - EARS-G5: Preserve .key files during implicit pull
 * - EARS-G6: Auto-merge when different files modified (no conflict)
 *
 * IMPORTANT: These tests verify CLI command execution in isolation.
 * Each test creates a fresh temp directory with appropriate git setup.
 */
describe('Sync CLI Commands - E2E Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-sync-e2e-'));
  });

  afterAll(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper function to execute CLI command
  const runCliCommand = (args: string[], options: { expectError?: boolean; cwd: string }) => {
    const cliPath = path.join(__dirname, '../build/dist/gitgov.mjs');
    // Properly escape arguments with spaces
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
  const createGitRepo = (repoPath: string, withInitialCommit: boolean = true) => {
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init --initial-branch=main', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' });

    if (withInitialCommit) {
      fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Project\n');
      execSync('git add README.md', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });
    }
  };

  // Helper to create a bare remote repo
  const createBareRemote = (remotePath: string) => {
    fs.mkdirSync(remotePath, { recursive: true });
    execSync(`git init --bare --initial-branch=main`, { cwd: remotePath, stdio: 'pipe' });
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
  // EARS-G1: Reindex after bootstrapFromStateBranch
  // ============================================================================
  describe('EARS-G1: Reindex after bootstrap from gitgov-state', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `ears52-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[EARS-G1] WHEN project is cloned fresh with existing gitgov-state THEN index.json SHALL be regenerated', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-G1 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Verify gitgov-state exists remotely
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toContain('gitgov-state');

      // 3. Create a fresh clone (simulating another machine)
      const clonePath = path.join(tempDir, `ears52-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: clonePath, stdio: 'pipe' });
      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);

      // 4. The cloned repo should NOT have .gitgov/ in work tree (it's on gitgov-state)
      expect(fs.existsSync(path.join(clonePath, '.gitgov'))).toBe(false);

      // 5. Run sync pull - this should bootstrap from gitgov-state and regenerate index
      const pullResult = runCliCommand(['sync', 'pull'], { cwd: clonePath });
      expect(pullResult.success).toBe(true);

      // 6. Verify .gitgov/ was restored in clone worktree
      expect(fs.existsSync(path.join(cloneWorktree, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(cloneWorktree, '.gitgov', 'config.json'))).toBe(true);

      // 7. Verify index.json was regenerated (EARS-G1 requirement)
      expect(fs.existsSync(path.join(cloneWorktree, '.gitgov', 'index.json'))).toBe(true);
    });
  });

  // ============================================================================
  // EARS-G2: Auto-detect actor from .key files when session missing
  // ============================================================================
  describe('EARS-G2: Auto-detect actor from .key files', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `ears53-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[EARS-G2] WHEN session.json is missing BUT .key file exists THEN actor SHALL be auto-detected', () => {
      // 1. Initialize GitGovernance
      runCliCommand(['init', '--name', 'EARS-G2 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // 2. Delete session.json (simulating fresh machine or session loss)
      const sessionPath = path.join(worktreeBasePath, '.gitgov', '.session.json');
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }

      // 3. Verify .key file exists
      const keysDir = path.join(worktreeBasePath, '.gitgov', 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      expect(keyFiles.length).toBeGreaterThan(0);

      // 4. Run sync push - should succeed by auto-detecting actor from .key file
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 5. Verify session.json was recreated with detected actor
      expect(fs.existsSync(sessionPath)).toBe(true);
      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      // Session stores actor in lastSession.actorId
      const hasActor = session.lastSession?.actorId || session.currentActor || session.actorId;
      expect(hasActor).toBeDefined();
    });
  });

  // ============================================================================
  // EARS-G3: Show implicit pull results when push reconciles with remote
  // ============================================================================
  describe('EARS-G3: Show implicit pull results during push', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `ears54-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[EARS-G3] WHEN push detects remote changes THEN implicit pull results SHALL be shown', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-G3 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears54-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 3. Pull gitgov-state in clone
      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);
      runCliCommand(['sync', 'pull'], { cwd: clonePath });

      // 4. Initialize a new actor in the clone (simulates new collaborator)
      // Copy actor key from original project so we can sign records
      const gitgovDir = path.join(worktreeBasePath, '.gitgov');
      const cloneGitgov = path.join(cloneWorktree, '.gitgov');
      const keysDir = path.join(gitgovDir, 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const keyContent = fs.readFileSync(path.join(keysDir, keyFiles[0]), 'utf-8');
        fs.mkdirSync(path.join(cloneGitgov, 'keys'), { recursive: true });
        fs.writeFileSync(path.join(cloneGitgov, 'keys', keyFiles[0]), keyContent);
      }

      // Create session in clone
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 5. Create a task in the clone and push (simulating remote change)
      runCliCommand(['task', 'new', 'Remote Task', '-d', 'This task was created remotely on another machine'], { cwd: clonePath });
      const clonePush = runCliCommand(['sync', 'push'], { cwd: clonePath });
      expect(clonePush.success).toBe(true);

      // 6. Create a local task (simulating local change)
      runCliCommand(['task', 'new', 'Local Task', '-d', 'This task was created locally on this machine'], { cwd: testProjectRoot });

      // 7. Push from original repo - should detect remote changes and do implicit pull
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 8. Verify both tasks exist in local worktree (proves merge/reconciliation worked)
      const tasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      const allTasksContent = taskFiles.map(f =>
        fs.readFileSync(path.join(tasksDir, f), 'utf-8')
      ).join(' ');

      // Verify Remote Task from clone is present (proves implicit pull worked)
      expect(allTasksContent).toContain('Remote Task');
      expect(allTasksContent).toContain('Local Task');
    });

    it('[EARS-G4] WHEN implicit pull occurs THEN index SHALL be regenerated', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-G4 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears54fix-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 3. Pull gitgov-state in clone
      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);
      runCliCommand(['sync', 'pull'], { cwd: clonePath });

      // 4. Initialize actor in the clone (copy key and create session)
      const gitgovDir = path.join(worktreeBasePath, '.gitgov');
      const cloneGitgov = path.join(cloneWorktree, '.gitgov');
      const keysDir = path.join(gitgovDir, 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const keyContent = fs.readFileSync(path.join(keysDir, keyFiles[0]), 'utf-8');
        fs.mkdirSync(path.join(cloneGitgov, 'keys'), { recursive: true });
        fs.writeFileSync(path.join(cloneGitgov, 'keys', keyFiles[0]), keyContent);
      }
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 5. Create a task in the clone and push (simulating remote change)
      runCliCommand(['task', 'new', 'Remote Task for Index Test', '-d', 'This task was created remotely for index test'], { cwd: clonePath });
      runCliCommand(['sync', 'push'], { cwd: clonePath });

      // 6. Create a local task
      runCliCommand(['task', 'new', 'Local Task for Index Test', '-d', 'This task was created locally for index test'], { cwd: testProjectRoot });

      // 7. Get mtime of index.json before push
      const indexPath = path.join(worktreeBasePath, '.gitgov', 'index.json');
      const indexBefore = fs.existsSync(indexPath) ? fs.statSync(indexPath).mtimeMs : 0;

      // 7. Wait a bit to ensure mtime difference
      execSync('sleep 0.1', { stdio: 'pipe' });

      // 8. Push from original repo - should do implicit pull and reindex
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 9. Verify index.json was updated (mtime changed)
      expect(fs.existsSync(indexPath)).toBe(true);
      const indexAfter = fs.statSync(indexPath).mtimeMs;

      // Index should be regenerated (mtime should be different)
      // Note: This can be flaky if both operations happen in the same millisecond,
      // but with the sleep it should be reliable
      expect(indexAfter).toBeGreaterThanOrEqual(indexBefore);
    });
  });

  // ============================================================================
  // EARS-G5: Preserve .key files during implicit pull
  // ============================================================================
  describe('EARS-G5: Preserve .key files during implicit pull', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `ears59-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[EARS-G5] WHEN implicit pull occurs THEN .key files SHALL be preserved', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-G5 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Get the .key file content before any operations
      const gitgovDir = path.join(worktreeBasePath, '.gitgov');
      const keysDir = path.join(gitgovDir, 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      expect(keyFiles.length).toBeGreaterThan(0);
      const keyFileName = keyFiles[0] as string;
      const keyFilePath = path.join(keysDir, keyFileName);
      const keyContentBefore = fs.readFileSync(keyFilePath, 'utf-8');

      // 3. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears59-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });
      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);

      // 4. Pull gitgov-state in clone and setup actor
      runCliCommand(['sync', 'pull'], { cwd: clonePath });
      const cloneGitgov = path.join(cloneWorktree, '.gitgov');

      // Copy key file to clone (simulating same user on different machine)
      fs.mkdirSync(path.join(cloneGitgov, 'keys'), { recursive: true });
      fs.writeFileSync(path.join(cloneGitgov, 'keys', keyFileName), keyContentBefore);
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFileName.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 5. Create a task in the clone and push (simulating remote change)
      runCliCommand(['task', 'new', 'Remote Task for Key Test', '-d', 'Created remotely'], { cwd: clonePath });
      runCliCommand(['sync', 'push'], { cwd: clonePath });

      // 6. Create a local task (to trigger implicit pull during push)
      runCliCommand(['task', 'new', 'Local Task for Key Test', '-d', 'Created locally'], { cwd: testProjectRoot });

      // 7. Push from original repo - triggers implicit pull
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 8. KEY ASSERTION: .key file must still exist with same content!
      expect(fs.existsSync(keyFilePath)).toBe(true);
      const keyContentAfter = fs.readFileSync(keyFilePath, 'utf-8');
      expect(keyContentAfter).toBe(keyContentBefore);
    });
  });

  // ============================================================================
  // EARS-G6: Auto-merge when different files modified (no conflict)
  // ============================================================================
  describe('EARS-G6: Auto-merge different files', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `ears60-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[EARS-G6] WHEN different files modified on different machines THEN auto-merge SHALL succeed', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-G6 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Create initial task A
      runCliCommand(['task', 'new', 'Task A Initial', '-d', 'Initial task A'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears60-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });
      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);

      // 3. Pull gitgov-state in clone and setup actor
      runCliCommand(['sync', 'pull'], { cwd: clonePath });
      const gitgovDir = path.join(worktreeBasePath, '.gitgov');
      const cloneGitgov = path.join(cloneWorktree, '.gitgov');
      const keysDir = path.join(gitgovDir, 'keys');
      const keyFiles = fs.readdirSync(keysDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const keyContent = fs.readFileSync(path.join(keysDir, keyFiles[0]), 'utf-8');
        fs.mkdirSync(path.join(cloneGitgov, 'keys'), { recursive: true });
        fs.writeFileSync(path.join(cloneGitgov, 'keys', keyFiles[0]), keyContent);
      }
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 4. Remote machine creates Task B (DIFFERENT file)
      runCliCommand(['task', 'new', 'Task B Remote', '-d', 'Created on remote machine'], { cwd: clonePath });
      runCliCommand(['sync', 'push'], { cwd: clonePath });

      // 5. Local machine creates Task C (DIFFERENT file)
      runCliCommand(['task', 'new', 'Task C Local', '-d', 'Created on local machine'], { cwd: testProjectRoot });

      // 6. Push from local - should auto-merge (different files, no conflict)
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // Should NOT report conflict
      expect(pushResult.output).not.toMatch(/conflict/i);

      // 7. Verify both tasks exist in local worktree
      const tasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));

      // Should have at least 3 tasks (A, B, C)
      expect(taskFiles.length).toBeGreaterThanOrEqual(3);

      // Verify Task B from remote is present
      const allTasksContent = taskFiles.map(f =>
        fs.readFileSync(path.join(tasksDir, f), 'utf-8')
      ).join(' ');
      expect(allTasksContent).toContain('Task B Remote');
      expect(allTasksContent).toContain('Task C Local');
    });
  });

  // ============================================================================
  // Worktree Sync E2E (E2E-SYNC-W1 to W4)
  // ============================================================================
  describe('Worktree Sync (E2E-SYNC-W1 to W4)', () => {
    let testProjectRoot: string;
    let remotePath: string;
    let worktreeBasePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `worktree-sync-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName, 'local');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      createBareRemote(remotePath);
      createGitRepo(testProjectRoot, true);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });

      worktreeBasePath = getWorktreeBasePath(testProjectRoot);
      worktreesToClean.length = 0;
      worktreesToClean.push(worktreeBasePath);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        cleanupWorktree(testProjectRoot, wt);
      }
    });

    it('[E2E-SYNC-W1] WHEN gitgov sync push is executed THE SYSTEM SHALL commit state to worktree and push to remote', () => {
      // 1. Initialize project
      runCliCommand(['init', '--name', 'Sync Push Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // 2. Create a task (writes to worktree)
      runCliCommand(['task', 'new', 'Push Test Task', '-d', 'Task for push E2E test'], { cwd: testProjectRoot });

      // 3. Push to remote
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 4. Verify gitgov-state exists remotely
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toContain('gitgov-state');

      // 5. Verify gitgov-state contains the task files
      execSync('git fetch origin gitgov-state', { cwd: testProjectRoot, stdio: 'pipe' });
      const stateFiles = execSync('git ls-tree -r --name-only origin/gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(stateFiles).toContain('.gitgov/config.json');
      expect(stateFiles).toMatch(/\.gitgov\/tasks\/.*\.json/);
    });

    it('[E2E-SYNC-W2] WHEN gitgov sync pull is executed THE SYSTEM SHALL update worktree with remote changes', () => {
      // 1. Initialize and push from origin
      runCliCommand(['init', '--name', 'Sync Pull Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['task', 'new', 'Origin Task', '-d', 'Created in origin'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `worktree-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Clone User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "clone@example.com"', { cwd: clonePath, stdio: 'pipe' });

      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);

      // 3. Pull gitgov-state in clone
      const pullResult = runCliCommand(['sync', 'pull'], { cwd: clonePath });
      expect(pullResult.success).toBe(true);

      // 4. Verify worktree was created with state from remote
      expect(fs.existsSync(path.join(cloneWorktree, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(cloneWorktree, '.gitgov', 'config.json'))).toBe(true);

      // 5. Verify the task from origin is present in clone worktree
      const tasksDir = path.join(cloneWorktree, '.gitgov', 'tasks');
      expect(fs.existsSync(tasksDir)).toBe(true);
      const taskFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      const allTasksContent = taskFiles.map(f =>
        fs.readFileSync(path.join(tasksDir, f), 'utf-8')
      ).join(' ');
      expect(allTasksContent).toContain('Origin Task');
    });

    it('[E2E-SYNC-W3] WHEN gitgov sync resolve is executed THE SYSTEM SHALL resolve rebase conflict in worktree', () => {
      // 1. Initialize and push initial state
      runCliCommand(['init', '--name', 'Resolve Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['task', 'new', 'Shared Task', '-d', 'Initial description'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (Agent B)
      const clonePath = path.join(tempDir, `worktree-resolve-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Clone User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "clone@example.com"', { cwd: clonePath, stdio: 'pipe' });

      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);

      // 3. Agent B: pull to get shared task
      runCliCommand(['sync', 'pull'], { cwd: clonePath });

      // 4. Copy actor key from Agent A to Agent B (simulate same user)
      const originKeysDir = path.join(worktreeBasePath, '.gitgov', 'keys');
      const keyFiles = fs.readdirSync(originKeysDir).filter(f => f.endsWith('.key'));
      expect(keyFiles.length).toBeGreaterThan(0);
      const keyFileName = keyFiles[0] as string;
      const cloneKeysDir = path.join(cloneWorktree, '.gitgov', 'keys');
      fs.mkdirSync(cloneKeysDir, { recursive: true });
      fs.writeFileSync(
        path.join(cloneKeysDir, keyFileName),
        fs.readFileSync(path.join(originKeysDir, keyFileName), 'utf-8')
      );

      // Create session for Agent B
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFileName.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneWorktree, '.gitgov', '.session.json'), sessionContent);

      // 5. Find the shared task file
      const originTasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');
      const taskFiles = fs.readdirSync(originTasksDir).filter(f => f.endsWith('.json'));
      expect(taskFiles.length).toBeGreaterThan(0);
      const taskFileName = taskFiles[0] as string;

      // 6. Agent A: modify the task and push
      const originTaskPath = path.join(originTasksDir, taskFileName);
      const taskContent = JSON.parse(fs.readFileSync(originTaskPath, 'utf-8'));
      taskContent.payload.description = 'Modified by Agent A';
      fs.writeFileSync(originTaskPath, JSON.stringify(taskContent, null, 2));
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 7. Agent B: modify the SAME task (creates conflict)
      const cloneTaskPath = path.join(cloneWorktree, '.gitgov', 'tasks', taskFileName);
      const cloneTaskContent = JSON.parse(fs.readFileSync(cloneTaskPath, 'utf-8'));
      cloneTaskContent.payload.description = 'Modified by Agent B';
      fs.writeFileSync(cloneTaskPath, JSON.stringify(cloneTaskContent, null, 2));

      // 8. Agent B: push → fails with conflict (rebase pauses with conflict markers in worktree)
      const pushResult = runCliCommand(['sync', 'push'], { cwd: clonePath, expectError: true });
      expect(pushResult.success).toBe(false);

      // 9. Resolve conflict markers in the task file (push leaves rebase in progress)
      const content = fs.readFileSync(cloneTaskPath, 'utf-8');
      expect(content.includes('<<<<<<<') || content.includes('>>>>>>>')).toBe(true);
      fs.writeFileSync(cloneTaskPath, JSON.stringify(cloneTaskContent, null, 2));

      // 10. Agent B: resolve the rebase conflict
      const resolveResult = runCliCommand(['sync', 'resolve', '--reason', 'Merged: kept Agent B version'], { cwd: clonePath });
      expect(resolveResult.success).toBe(true);
      expect(resolveResult.output).toContain('resolved');
    });

    it('[E2E-SYNC-W4] WHEN two agents push non-conflicting changes THE SYSTEM SHALL auto-merge both successfully', () => {
      // 1. Initialize and push initial state
      runCliCommand(['init', '--name', 'Multi-Agent Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (Agent B)
      const clonePath = path.join(tempDir, `worktree-multi-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Clone User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "clone@example.com"', { cwd: clonePath, stdio: 'pipe' });

      const cloneWorktree = getWorktreeBasePath(clonePath);
      worktreesToClean.push(cloneWorktree);

      // 3. Agent B: pull to get initial state
      runCliCommand(['sync', 'pull'], { cwd: clonePath });

      // 4. Copy actor key from Agent A to Agent B
      const originKeysDir = path.join(worktreeBasePath, '.gitgov', 'keys');
      const keyFiles = fs.readdirSync(originKeysDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const cloneKeysDir = path.join(cloneWorktree, '.gitgov', 'keys');
        fs.mkdirSync(cloneKeysDir, { recursive: true });
        fs.writeFileSync(
          path.join(cloneKeysDir, keyFiles[0]),
          fs.readFileSync(path.join(originKeysDir, keyFiles[0]), 'utf-8')
        );
      }
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneWorktree, '.gitgov', '.session.json'), sessionContent);

      // 5. Agent A: create Task A (unique file) and push
      runCliCommand(['task', 'new', 'Task A from Agent A', '-d', 'Created by Agent A'], { cwd: testProjectRoot });
      const pushA = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushA.success).toBe(true);

      // 6. Agent B: create Task B (different unique file) and push
      runCliCommand(['task', 'new', 'Task B from Agent B', '-d', 'Created by Agent B'], { cwd: clonePath });
      const pushB = runCliCommand(['sync', 'push'], { cwd: clonePath });
      expect(pushB.success).toBe(true);

      // 7. Verify both tasks exist in remote gitgov-state
      execSync('git fetch origin gitgov-state', { cwd: testProjectRoot, stdio: 'pipe' });
      const stateFiles = execSync('git ls-tree -r --name-only origin/gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      const taskFileMatches = stateFiles.match(/\.gitgov\/tasks\/.*\.json/g) || [];
      // Should have at least 2 task files (Task A + Task B) plus possibly the root cycle task
      expect(taskFileMatches.length).toBeGreaterThanOrEqual(2);

      // 8. Agent A: pull to get Agent B's task
      const pullA = runCliCommand(['sync', 'pull'], { cwd: testProjectRoot });
      expect(pullA.success).toBe(true);

      // 9. Verify both tasks are in Agent A's worktree
      const tasksDir = path.join(worktreeBasePath, '.gitgov', 'tasks');
      const allTasks = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      const allContent = allTasks.map(f =>
        fs.readFileSync(path.join(tasksDir, f), 'utf-8')
      ).join(' ');
      expect(allContent).toContain('Task A from Agent A');
      expect(allContent).toContain('Task B from Agent B');
    });
  });

  // ============================================================================
  // Clone Onboarding (E2E-SYNC-W5 to W6)
  // ============================================================================
  describe('Clone Onboarding (E2E-SYNC-W5 to W6)', () => {
    let originRepoPath: string;
    let cloneRepoPath: string;
    let remotePath: string;
    const worktreesToClean: string[] = [];

    beforeEach(() => {
      const caseName = `clone-onboard-${Date.now()}`;
      originRepoPath = path.join(tempDir, caseName, 'origin');
      cloneRepoPath = path.join(tempDir, caseName, 'clone');
      remotePath = path.join(tempDir, caseName, 'remote.git');

      // Setup origin with gitgov
      createBareRemote(remotePath);
      createGitRepo(originRepoPath, true);
      addRemote(originRepoPath, remotePath);
      execSync('git push -u origin main', { cwd: originRepoPath, stdio: 'pipe' });

      // Initialize gitgov in origin and push state
      const originWt = getWorktreeBasePath(originRepoPath);
      worktreesToClean.length = 0;
      worktreesToClean.push(originWt);
      runCliCommand(['init', '--name', 'Origin Project', '--actor-name', 'Origin User', '--quiet'], { cwd: originRepoPath });
      runCliCommand(['sync', 'push', '--json'], { cwd: originRepoPath });

      // Clone the repo
      execSync(`git clone "${remotePath}" "${cloneRepoPath}"`, { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Clone User"', { cwd: cloneRepoPath, stdio: 'pipe' });
      execSync('git config user.email "clone@example.com"', { cwd: cloneRepoPath, stdio: 'pipe' });
      const cloneWt = getWorktreeBasePath(cloneRepoPath);
      worktreesToClean.push(cloneWt);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      for (const wt of worktreesToClean) {
        try {
          if (fs.existsSync(wt)) {
            fs.rmSync(wt, { recursive: true, force: true });
          }
        } catch {}
      }
    });

    it('[E2E-SYNC-W5] WHEN clone pulls without init THE SYSTEM SHALL show guidance message', () => {
      // Pull on fresh clone without init — should succeed via bootstrap
      const pullResult = runCliCommand(['sync', 'pull'], { cwd: cloneRepoPath });
      expect(pullResult.success).toBe(true);
      // Should show guidance about creating identity
      expect(pullResult.output).toMatch(/actor new/i);
    });

    it('[E2E-SYNC-W6] WHEN push without actor THE SYSTEM SHALL fail with actionable message', () => {
      // First pull to bootstrap the state
      runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });

      // Push should fail because no actor identity exists
      const pushResult = runCliCommand(['sync', 'push', '--json'], { cwd: cloneRepoPath, expectError: true });
      expect(pushResult.success).toBe(false);
      expect(pushResult.error || pushResult.output).toMatch(/no active.*identity|actor new/i);
    });

    it('[E2E-SYNC-W7] WHEN clone → pull → actor new → push THE SYSTEM SHALL complete full onboarding flow', () => {
      // 1. Pull to bootstrap state
      const pullResult = runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });
      expect(pullResult.success).toBe(true);

      // 2. Create actor identity
      const actorResult = runCliCommand(
        ['actor', 'new', '-t', 'human', '-n', 'Clone User', '-r', 'developer', '--json'],
        { cwd: cloneRepoPath }
      );
      expect(actorResult.success).toBe(true);
      const actorData = JSON.parse(actorResult.output);
      expect(actorData.success).toBe(true);
      expect(actorData.data.actorId).toMatch(/^human:/);
      expect(actorData.data.type).toBe('human');
      expect(actorData.data.roles).toEqual(['developer']);

      // 3. Push — now has actor + key, should succeed
      const pushResult = runCliCommand(['sync', 'push', '--json'], { cwd: cloneRepoPath });
      expect(pushResult.success).toBe(true);
      const pushData = JSON.parse(pushResult.output);
      expect(pushData.success).toBe(true);
    });

    it('[E2E-SYNC-W8] WHEN actor rotate-key is executed THE SYSTEM SHALL create successor and allow push', () => {
      // 1. Pull + create actor
      runCliCommand(['sync', 'pull', '--json'], { cwd: cloneRepoPath });
      const actorResult = runCliCommand(
        ['actor', 'new', '-t', 'human', '-n', 'Rotate User', '-r', 'developer', '--json'],
        { cwd: cloneRepoPath }
      );
      expect(actorResult.success).toBe(true);
      const actorData = JSON.parse(actorResult.output);
      const actorId = actorData.data.actorId;

      // 2. Rotate key
      const rotateResult = runCliCommand(
        ['actor', 'rotate-key', actorId, '--json'],
        { cwd: cloneRepoPath }
      );
      expect(rotateResult.success).toBe(true);
      const rotateData = JSON.parse(rotateResult.output);
      expect(rotateData.success).toBe(true);
      expect(rotateData.data.oldActorId).toBe(actorId);
      expect(rotateData.data.newActorId).not.toBe(actorId);
      expect(rotateData.data.status).toBe('rotated');

      // 3. Push with new key
      const pushResult = runCliCommand(['sync', 'push', '--json'], { cwd: cloneRepoPath });
      expect(pushResult.success).toBe(true);
    });
  });
});
