import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import fg from "fast-glob";
import type { ScopeConfig } from "./types";

/**
 * Internal component for selecting files based on glob patterns.
 * Not injectable - instantiated internally by SourceAuditorModule.
 */
export class ScopeSelector {
  /**
   * Selects files matching include patterns, excluding those matching exclude patterns.
   * Automatically respects .gitignore patterns from the project root.
   * If scope.changedSince is set, only returns files changed since that commit.
   * @param scope - Include and exclude glob patterns, optional changedSince commit
   * @param baseDir - Base directory for file search
   * @returns Array of file paths relative to baseDir
   */
  async selectFiles(scope: ScopeConfig, baseDir: string): Promise<string[]> {
    if (scope.include.length === 0) {
      return [];
    }

    // Load .gitignore patterns from project root
    const gitignorePatterns = await this.loadGitignorePatterns(baseDir);

    // Merge: gitignore patterns + user-provided excludes
    const allExcludes = [...gitignorePatterns, ...scope.exclude];

    // If changedSince is set, use incremental mode
    if (scope.changedSince) {
      return this.selectChangedFiles(scope.changedSince, allExcludes, baseDir);
    }

    // Full mode: use glob patterns
    const files = await fg(scope.include, {
      cwd: baseDir,
      ignore: allExcludes,
      onlyFiles: true,
      absolute: false,
    });

    return files.sort();
  }

  /**
   * Selects files changed since a specific commit (incremental mode).
   * Includes: git diff, modified files, untracked files.
   */
  private async selectChangedFiles(
    sinceCommit: string,
    excludes: string[],
    baseDir: string
  ): Promise<string[]> {
    const changedFiles = new Set<string>();

    try {
      // 1. Files changed between sinceCommit and HEAD
      const diffOutput = execSync(
        `git diff --name-only ${sinceCommit}..HEAD`,
        { cwd: baseDir, encoding: "utf-8" }
      );
      diffOutput.split("\n").filter(Boolean).forEach((f) => changedFiles.add(f));

      // 2. Currently modified files (staged and unstaged)
      const statusOutput = execSync(
        `git status --porcelain`,
        { cwd: baseDir, encoding: "utf-8" }
      );
      statusOutput.split("\n").filter(Boolean).forEach((line) => {
        // Format: "XY filename" where X=staged, Y=unstaged
        const file = line.slice(3).trim();
        if (file) changedFiles.add(file);
      });

      // 3. Untracked files
      const untrackedOutput = execSync(
        `git ls-files --others --exclude-standard`,
        { cwd: baseDir, encoding: "utf-8" }
      );
      untrackedOutput.split("\n").filter(Boolean).forEach((f) => changedFiles.add(f));
    } catch {
      // Git commands failed - fall back to empty (caller should handle)
      return [];
    }

    // Filter out excluded files using micromatch via fast-glob
    const allFiles = Array.from(changedFiles);
    if (allFiles.length === 0) {
      return [];
    }

    // Use fast-glob to filter by excludes
    const filtered = await fg(allFiles, {
      cwd: baseDir,
      ignore: excludes,
      onlyFiles: true,
      absolute: false,
    });

    return filtered.sort();
  }

  /**
   * Reads .gitignore and converts patterns to glob format.
   * Returns empty array if .gitignore doesn't exist.
   */
  private async loadGitignorePatterns(baseDir: string): Promise<string[]> {
    const gitignorePath = path.join(baseDir, ".gitignore");

    try {
      const content = await fs.readFile(gitignorePath, "utf-8");
      return this.parseGitignore(content);
    } catch {
      // No .gitignore found - continue without exclusions
      return [];
    }
  }

  /**
   * Parses .gitignore content into glob patterns.
   * Handles comments, empty lines, and directory patterns.
   */
  private parseGitignore(content: string): string[] {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((pattern) => {
        // Convert gitignore pattern to glob pattern
        // Directory pattern (ends with /) -> match recursively
        if (pattern.endsWith("/")) {
          return `**/${pattern}**`;
        }
        // Pattern without slash -> can match at any level
        if (!pattern.includes("/")) {
          return `**/${pattern}`;
        }
        // Pattern with slash -> relative to root
        return pattern;
      });
  }
}
