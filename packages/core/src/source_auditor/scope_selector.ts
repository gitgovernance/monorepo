import type { ScopeConfig, ScopeSelectorDependencies } from "./types";

/**
 * Internal component for selecting files based on glob patterns.
 * Instantiated internally by SourceAuditorModule with injected dependencies.
 *
 * Store Backends Epic: Uses FileLister abstraction instead of direct fs access.
 */
export class ScopeSelector {
  private fileLister: ScopeSelectorDependencies['fileLister'];
  private gitModule: ScopeSelectorDependencies['gitModule'];

  constructor(deps: ScopeSelectorDependencies) {
    this.fileLister = deps.fileLister;
    this.gitModule = deps.gitModule;
  }

  /**
   * Selects files matching include patterns, excluding those matching exclude patterns.
   * Automatically respects .gitignore patterns from the project root.
   * If scope.changedSince is set and gitModule is available, only returns files changed since that commit.
   * @param scope - Include and exclude glob patterns, optional changedSince commit
   * @param _baseDir - Base directory (unused - FileLister has its own cwd)
   * @returns Array of file paths relative to FileLister's cwd
   */
  async selectFiles(scope: ScopeConfig, _baseDir: string): Promise<string[]> {
    if (scope.include.length === 0) {
      return [];
    }

    // Load .gitignore patterns from project root
    const gitignorePatterns = await this.loadGitignorePatterns();

    // Merge: gitignore patterns + user-provided excludes
    const allExcludes = [...gitignorePatterns, ...scope.exclude];

    // If changedSince is set and gitModule is available, use incremental mode
    if (scope.changedSince && this.gitModule) {
      return this.selectChangedFiles(scope.changedSince, scope.include, allExcludes);
    }

    // Full mode: use glob patterns via FileLister
    const files = await this.fileLister.list(scope.include, {
      ignore: allExcludes,
      onlyFiles: true,
      absolute: false,
    });

    return files.sort();
  }

  /**
   * Selects files changed since a specific commit (incremental mode).
   * Requires gitModule to be available.
   * Includes: git diff, modified files, untracked files.
   */
  private async selectChangedFiles(
    sinceCommit: string,
    includePatterns: string[],
    excludes: string[]
  ): Promise<string[]> {
    if (!this.gitModule) {
      // GitModule not available - fall back to empty
      return [];
    }

    const changedFiles = new Set<string>();

    try {
      // 1. Files changed between sinceCommit and HEAD
      const diffResult = await this.gitModule.exec('git', ['diff', '--name-only', `${sinceCommit}..HEAD`]);
      if (diffResult.exitCode === 0) {
        diffResult.stdout.split("\n").filter(Boolean).forEach((f) => changedFiles.add(f));
      }

      // 2. Currently modified files (staged and unstaged)
      const statusResult = await this.gitModule.exec('git', ['status', '--porcelain']);
      if (statusResult.exitCode === 0) {
        statusResult.stdout.split("\n").filter(Boolean).forEach((line) => {
          // Format: "XY filename" where X=staged, Y=unstaged
          const file = line.slice(3).trim();
          if (file) changedFiles.add(file);
        });
      }

      // 3. Untracked files
      const untrackedResult = await this.gitModule.exec('git', ['ls-files', '--others', '--exclude-standard']);
      if (untrackedResult.exitCode === 0) {
        untrackedResult.stdout.split("\n").filter(Boolean).forEach((f) => changedFiles.add(f));
      }
    } catch {
      // Git commands failed - fall back to empty
      return [];
    }

    // Filter changed files by include patterns and excludes using FileLister
    const allChangedFiles = Array.from(changedFiles);
    if (allChangedFiles.length === 0) {
      return [];
    }

    // Use FileLister to filter by patterns - list matching include patterns then intersect
    const matchingFiles = await this.fileLister.list(includePatterns, {
      ignore: excludes,
      onlyFiles: true,
      absolute: false,
    });

    // Intersect: only files that are both changed AND match patterns
    const matchingSet = new Set(matchingFiles);
    const filtered = allChangedFiles.filter(f => matchingSet.has(f));

    return filtered.sort();
  }

  /**
   * Reads .gitignore and converts patterns to glob format.
   * Returns empty array if .gitignore doesn't exist.
   */
  private async loadGitignorePatterns(): Promise<string[]> {
    try {
      const exists = await this.fileLister.exists(".gitignore");
      if (!exists) {
        return [];
      }
      const content = await this.fileLister.read(".gitignore");
      return this.parseGitignore(content);
    } catch {
      // No .gitignore found or read error - continue without exclusions
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
