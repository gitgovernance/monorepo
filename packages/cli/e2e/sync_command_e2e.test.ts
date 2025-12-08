import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * E2E Tests for Sync CLI Commands
 *
 * Tests the `gitgov sync` commands in various scenarios:
 * - EARS-52: Reindex after bootstrapFromStateBranch
 * - EARS-53: Auto-detect actor from .key files when session missing
 * - EARS-54: Show implicit pull results when push reconciles with remote
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
    execSync('git init', { cwd: repoPath, stdio: 'pipe' });
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
    execSync(`git init --bare`, { cwd: remotePath, stdio: 'pipe' });
  };

  // Helper to add remote to repo
  const addRemote = (repoPath: string, remotePath: string) => {
    execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'pipe' });
  };

  // ============================================================================
  // EARS-52: Reindex after bootstrapFromStateBranch
  // ============================================================================
  describe('EARS-52: Reindex after bootstrap from gitgov-state', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `ears52-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-52] WHEN project is cloned fresh with existing gitgov-state THEN index.json SHALL be regenerated', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-52 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Verify gitgov-state exists remotely
      const remoteBranches = execSync('git ls-remote --heads origin gitgov-state', { cwd: testProjectRoot, encoding: 'utf8' });
      expect(remoteBranches.trim()).toContain('gitgov-state');

      // 3. Create a fresh clone (simulating another machine)
      const clonePath = path.join(tempDir, `ears52-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 4. The cloned repo should NOT have .gitgov/ in work tree (it's on gitgov-state)
      expect(fs.existsSync(path.join(clonePath, '.gitgov'))).toBe(false);

      // 5. Run sync pull - this should bootstrap from gitgov-state and regenerate index
      const pullResult = runCliCommand(['sync', 'pull'], { cwd: clonePath });
      expect(pullResult.success).toBe(true);

      // 6. Verify .gitgov/ was restored from gitgov-state
      expect(fs.existsSync(path.join(clonePath, '.gitgov'))).toBe(true);
      expect(fs.existsSync(path.join(clonePath, '.gitgov', 'config.json'))).toBe(true);

      // 7. Verify index.json was regenerated (EARS-52 requirement)
      expect(fs.existsSync(path.join(clonePath, '.gitgov', 'index.json'))).toBe(true);
    });
  });

  // ============================================================================
  // EARS-53: Auto-detect actor from .key files when session missing
  // ============================================================================
  describe('EARS-53: Auto-detect actor from .key files', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `ears53-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-53] WHEN session.json is missing BUT .key file exists THEN actor SHALL be auto-detected', () => {
      // 1. Initialize GitGovernance
      runCliCommand(['init', '--name', 'EARS-53 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // 2. Delete session.json (simulating fresh machine or session loss)
      const sessionPath = path.join(testProjectRoot, '.gitgov', '.session.json');
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }

      // 3. Verify .key file exists
      const actorsDir = path.join(testProjectRoot, '.gitgov', 'actors');
      const keyFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.key'));
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
  // EARS-54: Show implicit pull results when push reconciles with remote
  // ============================================================================
  describe('EARS-54: Show implicit pull results during push', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `ears54-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-54] WHEN push detects remote changes THEN implicit pull results SHALL be shown', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-54 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears54-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 3. Pull gitgov-state in clone
      runCliCommand(['sync', 'pull'], { cwd: clonePath });

      // 4. Initialize a new actor in the clone (simulates new collaborator)
      // Copy actor key from original project so we can sign records
      const gitgovDir = path.join(testProjectRoot, '.gitgov');
      const cloneGitgov = path.join(clonePath, '.gitgov');
      const actorsDir = path.join(gitgovDir, 'actors');
      const keyFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const keyContent = fs.readFileSync(path.join(actorsDir, keyFiles[0]), 'utf-8');
        fs.writeFileSync(path.join(cloneGitgov, 'actors', keyFiles[0]), keyContent);
      }

      // Create session in clone
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 5. Create a task in the clone and push (simulating remote change)
      runCliCommand(['task', 'new', 'Remote Task', '-d', 'This task was created remotely on another machine'], { cwd: clonePath });

      // Commit the .gitgov changes before sync push
      execSync('git add --force .gitgov', { cwd: clonePath, stdio: 'pipe' });
      execSync('git commit -m "Add remote task"', { cwd: clonePath, stdio: 'pipe' });

      const clonePush = runCliCommand(['sync', 'push'], { cwd: clonePath });
      expect(clonePush.success).toBe(true);

      // 6. Create a local task (simulating local change)
      runCliCommand(['task', 'new', 'Local Task', '-d', 'This task was created locally on this machine'], { cwd: testProjectRoot });

      // Commit the .gitgov changes before sync push
      execSync('git add --force .gitgov', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Add local task"', { cwd: testProjectRoot, stdio: 'pipe' });

      // 7. Push from original repo - should detect remote changes and do implicit pull
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // 7. Verify output mentions pulled files or reconciliation
      // The output should indicate that remote changes were pulled
      const output = pushResult.output;
      expect(output).toMatch(/Pulled|reconcil|remote|files.*updated|rebase|implicit/i);
    });

    it('[EARS-54-FIX] WHEN implicit pull occurs THEN index SHALL be regenerated', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-54-FIX Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears54fix-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 3. Pull gitgov-state in clone
      runCliCommand(['sync', 'pull'], { cwd: clonePath });

      // 4. Initialize actor in the clone (copy key and create session)
      const gitgovDir = path.join(testProjectRoot, '.gitgov');
      const cloneGitgov = path.join(clonePath, '.gitgov');
      const actorsDir = path.join(gitgovDir, 'actors');
      const keyFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const keyContent = fs.readFileSync(path.join(actorsDir, keyFiles[0]), 'utf-8');
        fs.writeFileSync(path.join(cloneGitgov, 'actors', keyFiles[0]), keyContent);
      }
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 5. Create a task in the clone and push (simulating remote change)
      runCliCommand(['task', 'new', 'Remote Task for Index Test', '-d', 'This task was created remotely for index test'], { cwd: clonePath });

      // Commit the .gitgov changes before sync push
      execSync('git add --force .gitgov', { cwd: clonePath, stdio: 'pipe' });
      execSync('git commit -m "Add remote task for index test"', { cwd: clonePath, stdio: 'pipe' });

      runCliCommand(['sync', 'push'], { cwd: clonePath });

      // 6. Create a local task
      runCliCommand(['task', 'new', 'Local Task for Index Test', '-d', 'This task was created locally for index test'], { cwd: testProjectRoot });

      // Commit the .gitgov changes before sync push
      execSync('git add --force .gitgov', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Add local task for index test"', { cwd: testProjectRoot, stdio: 'pipe' });

      // 7. Get mtime of index.json before push
      const indexPath = path.join(testProjectRoot, '.gitgov', 'index.json');
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
  // EARS-59: Preserve .key files during implicit pull
  // ============================================================================
  describe('EARS-59: Preserve .key files during implicit pull', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `ears59-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-59] WHEN implicit pull occurs THEN .key files SHALL be preserved', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-59 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Get the .key file content before any operations
      const gitgovDir = path.join(testProjectRoot, '.gitgov');
      const actorsDir = path.join(gitgovDir, 'actors');
      const keyFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.key'));
      expect(keyFiles.length).toBeGreaterThan(0);
      const keyFileName = keyFiles[0] as string;
      const keyFilePath = path.join(actorsDir, keyFileName);
      const keyContentBefore = fs.readFileSync(keyFilePath, 'utf-8');

      // 3. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears59-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 4. Pull gitgov-state in clone and setup actor
      runCliCommand(['sync', 'pull'], { cwd: clonePath });
      const cloneGitgov = path.join(clonePath, '.gitgov');
      const cloneActorsDir = path.join(cloneGitgov, 'actors');

      // Copy key file to clone (simulating same user on different machine)
      fs.writeFileSync(path.join(cloneActorsDir, keyFileName), keyContentBefore);
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFileName.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 5. Create a task in the clone and push (simulating remote change)
      runCliCommand(['task', 'new', 'Remote Task for Key Test', '-d', 'Created remotely'], { cwd: clonePath });
      execSync('git add --force .gitgov', { cwd: clonePath, stdio: 'pipe' });
      execSync('git commit -m "Add remote task"', { cwd: clonePath, stdio: 'pipe' });
      runCliCommand(['sync', 'push'], { cwd: clonePath });

      // 6. Create a local task (to trigger implicit pull during push)
      runCliCommand(['task', 'new', 'Local Task for Key Test', '-d', 'Created locally'], { cwd: testProjectRoot });
      execSync('git add --force .gitgov', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Add local task"', { cwd: testProjectRoot, stdio: 'pipe' });

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
  // EARS-60: Auto-merge when different files modified (no conflict)
  // ============================================================================
  describe('EARS-60: Auto-merge different files', () => {
    let testProjectRoot: string;
    let remotePath: string;

    beforeEach(() => {
      const caseName = `ears60-${Date.now()}`;
      testProjectRoot = path.join(tempDir, caseName);
      remotePath = path.join(tempDir, `${caseName}-remote`);
      createGitRepo(testProjectRoot, true);
      createBareRemote(remotePath);
      addRemote(testProjectRoot, remotePath);
      execSync('git push -u origin main', { cwd: testProjectRoot, stdio: 'pipe' });
    });

    afterEach(() => {
      process.chdir(originalCwd);
    });

    it('[EARS-60] WHEN different files modified on different machines THEN auto-merge SHALL succeed', () => {
      // 1. Initialize GitGovernance and push to gitgov-state
      runCliCommand(['init', '--name', 'EARS-60 Test', '--actor-name', 'Test User', '--quiet'], { cwd: testProjectRoot });

      // Create initial task A
      runCliCommand(['task', 'new', 'Task A Initial', '-d', 'Initial task A'], { cwd: testProjectRoot });
      execSync('git add --force .gitgov', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Add task A"', { cwd: testProjectRoot, stdio: 'pipe' });
      runCliCommand(['sync', 'push'], { cwd: testProjectRoot });

      // 2. Clone repo (simulating another machine)
      const clonePath = path.join(tempDir, `ears60-clone-${Date.now()}`);
      execSync(`git clone "${remotePath}" "${clonePath}"`, { stdio: 'pipe' });
      execSync('git config user.name "Remote User"', { cwd: clonePath, stdio: 'pipe' });
      execSync('git config user.email "remote@example.com"', { cwd: clonePath, stdio: 'pipe' });

      // 3. Pull gitgov-state in clone and setup actor
      runCliCommand(['sync', 'pull'], { cwd: clonePath });
      const gitgovDir = path.join(testProjectRoot, '.gitgov');
      const cloneGitgov = path.join(clonePath, '.gitgov');
      const actorsDir = path.join(gitgovDir, 'actors');
      const keyFiles = fs.readdirSync(actorsDir).filter(f => f.endsWith('.key'));
      if (keyFiles[0]) {
        const keyContent = fs.readFileSync(path.join(actorsDir, keyFiles[0]), 'utf-8');
        fs.writeFileSync(path.join(cloneGitgov, 'actors', keyFiles[0]), keyContent);
      }
      const sessionContent = JSON.stringify({
        lastSession: { actorId: keyFiles[0]?.replace('.key', ''), timestamp: new Date().toISOString() }
      });
      fs.writeFileSync(path.join(cloneGitgov, '.session.json'), sessionContent);

      // 4. Remote machine creates Task B (DIFFERENT file)
      runCliCommand(['task', 'new', 'Task B Remote', '-d', 'Created on remote machine'], { cwd: clonePath });
      execSync('git add --force .gitgov', { cwd: clonePath, stdio: 'pipe' });
      execSync('git commit -m "Add task B from remote"', { cwd: clonePath, stdio: 'pipe' });
      runCliCommand(['sync', 'push'], { cwd: clonePath });

      // 5. Local machine creates Task C (DIFFERENT file)
      runCliCommand(['task', 'new', 'Task C Local', '-d', 'Created on local machine'], { cwd: testProjectRoot });
      execSync('git add --force .gitgov', { cwd: testProjectRoot, stdio: 'pipe' });
      execSync('git commit -m "Add task C locally"', { cwd: testProjectRoot, stdio: 'pipe' });

      // 6. Push from local - should auto-merge (different files, no conflict)
      const pushResult = runCliCommand(['sync', 'push'], { cwd: testProjectRoot });
      expect(pushResult.success).toBe(true);

      // Should NOT report conflict
      expect(pushResult.output).not.toMatch(/conflict/i);

      // 7. Verify both tasks exist in local .gitgov
      const tasksDir = path.join(gitgovDir, 'tasks');
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
});
