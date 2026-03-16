/**
 * Tabla de Trazabilidad EARS - readme.test.ts
 * All EARS prefixes map to security_audit_agent.md
 *
 * | EARS ID  | Requisito                                                      | Test Case                                                              | Estado       |
 * |----------|----------------------------------------------------------------|------------------------------------------------------------------------|--------------|
 * | AAV2-F1  | README documenta delegation model (GitGov wrapper pattern)     | [AAV2-F1] should document delegation model in README                   | Implementado |
 * | AAV2-F2  | README documenta los 3 scopes (diff, full, baseline)           | [AAV2-F2] should document all three scope examples in README           | Implementado |
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const README_PATH = path.resolve(__dirname, 'README.md');

describe('security-audit README', () => {
  describe('4.6. Documentacion (AAV2-F1, AAV2-F2)', () => {
    let readmeContent: string;

    beforeAll(() => {
      readmeContent = fs.readFileSync(README_PATH, 'utf-8');
    });

    it('[AAV2-F1] should document delegation model in README', () => {
      // README must explain the GitGov wrapper pattern: the agent wraps
      // scanner modules with protocol identity (Ed25519 signature).
      expect(readmeContent).toContain('Delegation Model');
      expect(readmeContent).toMatch(/GitGov|delegation model/i);

      // Must describe the wrapper relationship
      expect(readmeContent).toContain('wrapper');
      expect(readmeContent).toContain('agent:gitgov:security-audit');
    });

    it('[AAV2-F2] should document all three scope examples in README', () => {
      // The three scopes: diff, full, baseline — all must appear in README
      expect(readmeContent).toContain('`full`');
      expect(readmeContent).toContain('`diff`');
      expect(readmeContent).toContain('`baseline`');

      // Verify scope table or description provides use-case context
      expect(readmeContent).toMatch(/full.*scan|scan.*full/i);
      expect(readmeContent).toMatch(/diff.*changed|changed.*diff/i);
      expect(readmeContent).toMatch(/baseline.*snapshot|snapshot.*baseline/i);
    });
  });
});
