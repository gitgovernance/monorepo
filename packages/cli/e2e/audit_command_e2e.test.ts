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
import { runCliCommand, createGitRepo, getWorktreeBasePath, cleanupWorktree } from './helpers';

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
});
