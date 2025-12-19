import fg from "fast-glob";
import type { ScopeConfig } from "./types";

/**
 * Internal component for selecting files based on glob patterns.
 * Not injectable - instantiated internally by SourceAuditorModule.
 */
export class ScopeSelector {
  /**
   * Selects files matching include patterns, excluding those matching exclude patterns.
   * @param scope - Include and exclude glob patterns
   * @param baseDir - Base directory for file search
   * @returns Array of file paths relative to baseDir
   */
  async selectFiles(scope: ScopeConfig, baseDir: string): Promise<string[]> {
    if (scope.include.length === 0) {
      return [];
    }

    const files = await fg(scope.include, {
      cwd: baseDir,
      ignore: scope.exclude,
      onlyFiles: true,
      absolute: false,
    });

    return files.sort();
  }
}
