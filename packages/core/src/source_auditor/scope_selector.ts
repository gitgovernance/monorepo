import * as fs from "fs/promises";
import * as path from "path";
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
   * @param scope - Include and exclude glob patterns
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

    const files = await fg(scope.include, {
      cwd: baseDir,
      ignore: allExcludes,
      onlyFiles: true,
      absolute: false,
    });

    return files.sort();
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
