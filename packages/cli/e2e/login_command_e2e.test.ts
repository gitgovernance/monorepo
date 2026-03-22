/**
 * Login Command E2E — CLI integration tests for login/status/logout (LOGIN-E1 to E4)
 *
 * Tests the login command against the real compiled CLI binary.
 * OAuth flow and SaaS sync cannot be tested E2E without a real server,
 * but status and logout flows are fully testable by writing .session.json
 * directly and verifying the CLI reads/modifies it correctly.
 *
 * Spec: cli/specs/login_command.md §4.5
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCliCommand, setupGitgovProject, getWorktreeBasePath } from './helpers';

describe('Login Command E2E (LOGIN-E1 to E4)', () => {
  let tempDir: string;
  let testProjectRoot: string;
  let worktreeBasePath: string;
  let cleanupFn: () => void;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-login-e2e-'));
    const setup = setupGitgovProject(tempDir, 'login-e2e');
    testProjectRoot = setup.testProjectRoot;
    worktreeBasePath = setup.worktreeBasePath;
    cleanupFn = setup.cleanup;
  });

  afterAll(() => {
    cleanupFn();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Write a session directly to the worktree .session.json */
  function writeSession(session: Record<string, unknown>): void {
    const sessionPath = path.join(worktreeBasePath, '.gitgov', '.session.json');
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }

  /** Read session from worktree .session.json */
  function readSession(): Record<string, unknown> | null {
    const sessionPath = path.join(worktreeBasePath, '.gitgov', '.session.json');
    try {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  // ── LOGIN-E1: Status when not logged in ──────────────────────────

  it('[LOGIN-E1] should show not logged in when no session token exists', () => {
    // Ensure no cloud token in session
    const session = readSession();
    if (session?.cloud) {
      delete session.cloud;
      writeSession(session);
    }

    const result = runCliCommand(
      ['login', '--status', '--json'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    const output = JSON.parse(result.output);
    expect(output.success).toBe(true);
    expect(output.data.loggedIn).toBe(false);
  });

  // ── LOGIN-E2: Logout when not logged in ──────────────────────────

  it('[LOGIN-E2] should succeed gracefully when logging out without active session', () => {
    // Ensure no cloud token
    const session = readSession();
    if (session?.cloud) {
      delete session.cloud;
      writeSession(session);
    }

    const result = runCliCommand(
      ['login', '--logout', '--json'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    const output = JSON.parse(result.output);
    expect(output.success).toBe(true);
    expect(output.data.loggedOut).toBe(true);
  });

  // ── LOGIN-E3: Status with manually set session ───────────────────

  it('[LOGIN-E3] should display user info when session token exists', () => {
    // Manually write a session with cloud token
    const session = readSession() ?? {};
    writeSession({
      ...session,
      cloud: { sessionToken: 'test-e2e-token-12345' },
      lastSession: { actorId: 'human:e2e-user', timestamp: '2026-03-22T12:00:00Z' },
    });

    const result = runCliCommand(
      ['login', '--status', '--json'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    const output = JSON.parse(result.output);
    expect(output.success).toBe(true);
    expect(output.data.loggedIn).toBe(true);
    expect(output.data.user).toBe('human:e2e-user');
    expect(output.data.lastLogin).toBe('2026-03-22T12:00:00Z');
  });

  // ── LOGIN-E4: Logout removes token, preserves other data ────────

  it('[LOGIN-E4] should remove cloud token but preserve actorState on logout', () => {
    // Write session with token AND actorState
    const session = readSession() ?? {};
    writeSession({
      ...session,
      cloud: { sessionToken: 'token-to-be-removed' },
      lastSession: { actorId: 'human:e2e-user', timestamp: '2026-03-22T12:00:00Z' },
      actorState: { 'human:e2e-user': { activeTaskId: 'task-123' } },
    });

    const result = runCliCommand(
      ['login', '--logout', '--json'],
      { cwd: testProjectRoot },
    );
    expect(result.success).toBe(true);

    // Verify session file: cloud should be gone, actorState should remain
    const updatedSession = readSession();
    expect(updatedSession).not.toBeNull();
    expect(updatedSession!.cloud).toBeUndefined();
    expect(updatedSession!.actorState).toEqual({ 'human:e2e-user': { activeTaskId: 'task-123' } });
  });
});
