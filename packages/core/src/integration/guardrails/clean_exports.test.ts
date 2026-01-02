/**
 * CI Guardrail: Clean Exports
 *
 * Validates that @gitgov/core main entrypoint does NOT import
 * filesystem-dependent modules (fs, path, child_process, chokidar).
 *
 * EARS Requirements:
 * - EARS-CI01: Analyze imports of @gitgov/core entrypoint
 * - EARS-CI02: Fail if fs, path, child_process, chokidar are imported
 * - EARS-CI03: Show prohibited module and import chain on failure
 *
 * STATUS: SKIPPED until cycles 2-5 complete the refactoring.
 * The main entrypoint currently exports modules that use fs.
 */

import * as fs from 'fs';
import * as path from 'path';

const PROHIBITED_MODULES = ['fs', 'path', 'child_process', 'chokidar'];

/**
 * Analyzes a JavaScript file for prohibited imports.
 * Returns array of { module, line } for each prohibited import found.
 */
function findProhibitedImports(
  filePath: string
): { module: string; line: number; snippet: string }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const findings: { module: string; line: number; snippet: string }[] = [];

  lines.forEach((line, index) => {
    for (const mod of PROHIBITED_MODULES) {
      // Match: import ... from 'fs' or require('fs') or from "fs"
      const patterns = [
        new RegExp(`from\\s+['"]${mod}['"]`),
        new RegExp(`from\\s+['"]node:${mod}['"]`),
        new RegExp(`require\\s*\\(\\s*['"]${mod}['"]\\s*\\)`),
        new RegExp(`require\\s*\\(\\s*['"]node:${mod}['"]\\s*\\)`),
      ];

      for (const pattern of patterns) {
        if (pattern.test(line)) {
          findings.push({
            module: mod,
            line: index + 1,
            snippet: line.trim().slice(0, 80),
          });
        }
      }
    }
  });

  return findings;
}

describe('CI Guardrail: Clean Exports', () => {
  const distPath = path.join(__dirname, '../../../dist/src');

  describe('Main Entrypoint (@gitgov/core)', () => {
    // TODO: Enable this test after cycles 2-5 complete refactoring
    it.skip('[EARS-CI01] should analyze imports of main entrypoint', () => {
      const indexPath = path.join(distPath, 'index.js');
      expect(fs.existsSync(indexPath)).toBe(true);
    });

    // TODO: Enable this test after cycles 2-5 complete refactoring
    it.skip('[EARS-CI02] should NOT import fs, path, child_process, or chokidar', () => {
      const indexPath = path.join(distPath, 'index.js');
      const findings = findProhibitedImports(indexPath);

      if (findings.length > 0) {
        // EARS-CI03: Show prohibited module and import chain
        const report = findings
          .map((f) => `  - ${f.module} (line ${f.line}): ${f.snippet}`)
          .join('\n');
        fail(
          `[EARS-CI03] Prohibited imports found in @gitgov/core:\n${report}\n\n` +
            `These modules must be moved to subpaths (@gitgov/core/fs-store, etc.)`
        );
      }

      expect(findings).toHaveLength(0);
    });
  });

  describe('Subpath: @gitgov/core/memory-store', () => {
    it('[EARS-CI04] should NOT import fs, path, child_process, or chokidar', () => {
      const memoryStorePath = path.join(distPath, 'store/memory/index.js');

      if (!fs.existsSync(memoryStorePath)) {
        throw new Error(`Build output not found: ${memoryStorePath}. Run 'npm run build' first.`);
      }

      const findings = findProhibitedImports(memoryStorePath);

      if (findings.length > 0) {
        const report = findings
          .map((f) => `  - ${f.module} (line ${f.line}): ${f.snippet}`)
          .join('\n');
        fail(
          `[EARS-CI03] Prohibited imports found in @gitgov/core/memory-store:\n${report}`
        );
      }

      expect(findings).toHaveLength(0);
    });
  });

  describe('Subpath: @gitgov/core/fs-store', () => {
    it('[EARS-CI05] should import fs and path (expected for filesystem backend)', () => {
      const fsStorePath = path.join(distPath, 'store/fs/index.js');

      if (!fs.existsSync(fsStorePath)) {
        throw new Error(`Build output not found: ${fsStorePath}. Run 'npm run build' first.`);
      }

      // FsStore IS expected to use fs and path - that's its purpose
      const content = fs.readFileSync(fsStorePath, 'utf-8');
      expect(content).toContain('fs');
    });
  });
});
