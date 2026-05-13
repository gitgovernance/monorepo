/**
 * Init Join Path E2E — INIT-J1, INIT-J2
 *
 * Spec: cli/specs/init_command.md §4.8
 *
 * Validates that a second user can join an existing GitGovernance project
 * via `gitgov init --login`. Runs real CLI commands against real filesystem,
 * no mocks. Does NOT require SaaS services (CLI-only, FsProjectInitializer).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCliCommand, setupGitgovProject } from './helpers';

let tempDir: string;
let testProjectRoot: string;
let worktreeBasePath: string;
let cleanup: () => void;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-join-e2e-'));

  const setup = setupGitgovProject(tempDir, 'join');
  testProjectRoot = setup.testProjectRoot;
  worktreeBasePath = setup.worktreeBasePath;
  cleanup = setup.cleanup;

  // Verify owner init succeeded
  expect(fs.existsSync(path.join(worktreeBasePath, '.gitgov', 'config.json'))).toBe(true);
}, 30000);

afterAll(() => {
  cleanup();
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('4.8. Init Join Path (INIT-J1 to J2)', () => {
  it('[INIT-J1] should join existing project and create actor with correct metadata', () => {
    const result = runCliCommand(
      ['init', '--login', 'collab-user', '--actor-name', 'Collaborator', '--quiet', '--skip-validation'],
      { cwd: testProjectRoot },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Joined existing project as human:collab-user');

    // Verify actor file exists in worktree
    const actorPath = path.join(worktreeBasePath, '.gitgov', 'actors', 'human_collab-user.json');
    expect(fs.existsSync(actorPath)).toBe(true);

    // Verify actor metadata
    const actorRecord = JSON.parse(fs.readFileSync(actorPath, 'utf-8'));
    const payload = actorRecord.payload ?? actorRecord;
    expect(payload.type).toBe('human');
    expect(payload.displayName).toBe('Collaborator');
    expect(payload.metadata?.joinedVia).toBe('cli');
    expect(payload.metadata?.joinedAt).toBeDefined();
    expect(new Date(payload.metadata.joinedAt).getTime()).toBeGreaterThan(0);
  }, 15000);

  it('[INIT-J2] should report already a member on second join attempt', () => {
    const result = runCliCommand(
      ['init', '--login', 'collab-user', '--quiet', '--skip-validation'],
      { cwd: testProjectRoot },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('Already a member of this project as human:collab-user');

    // Verify no duplicate actor file — still exactly one
    const actorsDir = path.join(worktreeBasePath, '.gitgov', 'actors');
    const actorFiles = fs.readdirSync(actorsDir).filter(f => f.includes('collab-user'));
    expect(actorFiles).toHaveLength(1);
  }, 15000);
});
