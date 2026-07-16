/**
 * E2E Tests for Audit CLI Command
 *
 * Blueprint: audit_command.md §4.11 (AORCH-P5), §4.12 (AORCH-P6)
 *
 * Tests the `gitgov audit` command in edge cases:
 * - AORCH-P5: Repo without .gitgov → clear error message
 * - AORCH-P6: Repo without commits → clear error message
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCliCommand, createGitRepo, getWorktreeBasePath, cleanupWorktree, setupGitgovProject } from './helpers';

describe('Audit CLI Command E2E', () => {
  describe('4.11. Project Guard (AORCH-P5)', () => {
    it('[AORCH-P5] should exit with error when project not initialized', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-audit-e2e-'));
      const repoPath = path.join(tempDir, 'repo');
      fs.mkdirSync(repoPath, { recursive: true });

      // Create repo WITH commits but WITHOUT gitgov init
      createGitRepo(repoPath, true);

      // Audit should fail — no .gitgov/
      const auditResult = runCliCommand(
        ['audit', '--scope', 'full'],
        { cwd: repoPath, expectError: true },
      );
      expect(auditResult.success).toBe(false);
      const output = `${auditResult.output} ${auditResult.error ?? ''}`;
      expect(output).toContain('not initialized');

      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('4.12. Working Repo Guard (AORCH-P6)', () => {
    it('[AORCH-P6] should exit with error when repo has no commits', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-audit-e2e-'));
      const repoPath = path.join(tempDir, 'repo');
      fs.mkdirSync(repoPath, { recursive: true });

      // Create repo WITHOUT commits
      createGitRepo(repoPath, false);

      // Init succeeds without commits
      const initResult = runCliCommand(
        ['init', '--name', 'NoCommit', '--actor-name', 'Test', '--quiet'],
        { cwd: repoPath },
      );
      expect(initResult.success).toBe(true);

      // Audit should fail with clear message
      const auditResult = runCliCommand(
        ['audit', '--scope', 'full'],
        { cwd: repoPath, expectError: true },
      );
      expect(auditResult.success).toBe(false);
      const output = `${auditResult.output} ${auditResult.error ?? ''}`;
      expect(output).toContain('No commits found');

      // Cleanup
      const wtPath = getWorktreeBasePath(repoPath);
      cleanupWorktree(repoPath, wtPath);
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('4.5. Waiver Management — Partial Fingerprint (AORCH-E1)', () => {
    it('[AORCH-E1] should resolve partial fingerprint to full and suppress finding on re-audit', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgov-waive-e2e-'));
      const { testProjectRoot, worktreeBasePath, cleanup } = setupGitgovProject(tempDir, 'waive');

      try {
        // Create a file with a secret
        const srcDir = path.join(testProjectRoot, 'src');
        fs.mkdirSync(srcDir, { recursive: true });
        fs.writeFileSync(
          path.join(srcDir, 'config.ts'),
          'export const STRIPE_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";\n',
        );

        // Register security-audit agent with local path
        const agentPath = path.resolve(__dirname, '..', '..', 'agents', 'security-audit');
        runCliCommand(['agent', 'new', agentPath], { cwd: testProjectRoot });

        // Commit so audit has something to scan
        const { execSync } = require('child_process');
        execSync('git add -A && git commit -m "add secret"', { cwd: testProjectRoot, stdio: 'pipe' });

        // First audit — should find the secret
        const audit1 = runCliCommand(['audit', '--scope', 'full', '--output', 'json'], { cwd: testProjectRoot, expectError: true });
        const result1 = JSON.parse(audit1.output);
        expect(result1.findings.length).toBeGreaterThanOrEqual(1);

        const fullFingerprint = result1.findings[0].fingerprint;
        const partialFingerprint = fullFingerprint.slice(0, 12);
        expect(partialFingerprint.length).toBe(12);
        expect(fullFingerprint.length).toBeGreaterThan(12);

        // Waive with partial fingerprint (12 chars, as shown in terminal output)
        const waiveResult = runCliCommand(
          ['audit', 'waive', partialFingerprint, '-j', 'Test fixture'],
          { cwd: testProjectRoot },
        );
        expect(waiveResult.success).toBe(true);
        expect(waiveResult.output).toContain('Waiver created');

        // Verify the waiver was stored with the FULL fingerprint
        const waiveList = runCliCommand(['audit', 'waive', '--list'], { cwd: testProjectRoot });
        expect(waiveList.output).toContain(fullFingerprint);

        // Re-audit — the waived finding should be suppressed
        const audit2 = runCliCommand(['audit', '--scope', 'full', '--output', 'json'], { cwd: testProjectRoot, expectError: true });
        const result2 = JSON.parse(audit2.output);
        expect(result2.summary.suppressed).toBeGreaterThanOrEqual(1);
      } finally {
        cleanup();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, 60000);
  });
});
