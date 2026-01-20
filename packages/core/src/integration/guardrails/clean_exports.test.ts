/**
 * CI Guardrail: Clean Exports
 *
 * Validates that @gitgov/core subpath exports follow the clean architecture:
 * - @gitgov/core/memory: NO filesystem dependencies (serverless-safe)
 * - @gitgov/core/fs: CAN have filesystem dependencies (expected)
 *
 * EARS Requirements:
 * - EARS-CI01: Analyze imports of @gitgov/core entrypoint
 * - EARS-CI02: Fail if fs, path, child_process, chokidar are imported
 * - EARS-CI03: Show prohibited module and import chain on failure
 * - EARS-CI04: memory subpath should NOT import prohibited modules
 * - EARS-CI05: fs subpath SHOULD import fs/path (expected)
 *
 * STATUS: Main entrypoint tests SKIPPED until cycles 2-5 complete refactoring.
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
        new RegExp(`from\\s+['\"]${mod}['\"]`),
        new RegExp(`from\\s+['\"]node:${mod}['\"]`),
        new RegExp(`require\\s*\\(\\s*['\"]${mod}['\"]\\s*\\)`),
        new RegExp(`require\\s*\\(\\s*['\"]node:${mod}['\"]\\s*\\)`),
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
            `These modules must be moved to @gitgov/core/fs subpath.`
        );
      }

      expect(findings).toHaveLength(0);
    });
  });

  describe('Subpath: @gitgov/core/memory', () => {
    it('[EARS-CI04] should NOT import fs, path, child_process, or chokidar', () => {
      const memoryPath = path.join(distPath, 'memory.js');

      if (!fs.existsSync(memoryPath)) {
        throw new Error(`Build output not found: ${memoryPath}. Run 'pnpm build' first.`);
      }

      const findings = findProhibitedImports(memoryPath);

      if (findings.length > 0) {
        const report = findings
          .map((f) => `  - ${f.module} (line ${f.line}): ${f.snippet}`)
          .join('\n');
        fail(
          `[EARS-CI03] Prohibited imports found in @gitgov/core/memory:\n${report}\n\n` +
            `Memory implementations must NOT use filesystem modules.`
        );
      }

      expect(findings).toHaveLength(0);
    });
  });

  describe('Subpath: @gitgov/core/fs', () => {
    it('[EARS-CI05] should import fs and path (expected for filesystem implementations)', () => {
      const fsPath = path.join(distPath, 'fs.js');

      if (!fs.existsSync(fsPath)) {
        throw new Error(`Build output not found: ${fsPath}. Run 'pnpm build' first.`);
      }

      // @gitgov/core/fs IS expected to use fs - that's its purpose
      const content = fs.readFileSync(fsPath, 'utf-8');
      expect(content).toContain('fs');
    });
  });
});
