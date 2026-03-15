// All EARS prefixes map to sarif_module.md
import {
  normalizeLineContent,
  computePrimaryLocationLineHash,
  buildPartialFingerprints,
  createOccurrenceContext,
} from './sarif_hash';

describe('SarifHash', () => {
  describe('4.2. Centralized hash (SARIF-B1 to B8)', () => {

    it('[SARIF-B1] normalizeLineContent: should trim leading and trailing whitespace', () => {
      expect(normalizeLineContent('  const x = 1;  ')).toBe('const x = 1;');
      // Tabs are also whitespace
      expect(normalizeLineContent('\tconst x = 1;\t')).toBe('const x = 1;');
    });

    it('[SARIF-B2] normalizeLineContent: should collapse multiple spaces to single space', () => {
      expect(normalizeLineContent('const  x =   1;')).toBe('const x = 1;');
      // Mixed whitespace (tabs + spaces) collapsed
      expect(normalizeLineContent('const\t\tx =\t  1;')).toBe('const x = 1;');
    });

    it('[SARIF-B3] computePrimaryLocationLineHash: should return string matching format hexHash:N', () => {
      const result = computePrimaryLocationLineHash('const x = 1;', 1);
      expect(result).toMatch(/^[0-9a-f]{16}:1$/);
      // Verify deterministic SHA256: different input must produce different hash
      const other = computePrimaryLocationLineHash('const y = 2;', 1);
      expect(other).toMatch(/^[0-9a-f]{16}:1$/);
      expect(other.split(':')[0]).not.toBe(result.split(':')[0]);
      // Verify occurrence is embedded correctly
      const withOcc3 = computePrimaryLocationLineHash('const x = 1;', 3);
      expect(withOcc3).toMatch(/^[0-9a-f]{16}:3$/);
      expect(withOcc3.split(':')[0]).toBe(result.split(':')[0]);
    });

    it('[SARIF-B4] buildPartialFingerprints: should return empty object when getLineContent returns null', async () => {
      const context = createOccurrenceContext();
      const result = await buildPartialFingerprints('src/file.ts', 10, async () => null, context);
      expect(result).toEqual({});
      // Empty string is NOT null — produces a real fingerprint (empty line is still a line)
      const ctxEmpty = createOccurrenceContext();
      const emptyResult = await buildPartialFingerprints('src/file.ts', 10, async () => '', ctxEmpty);
      expect(emptyResult['primaryLocationLineHash/v1']).toMatch(/^[0-9a-f]{16}:1$/);
    });

    it('[SARIF-B5] buildPartialFingerprints: should return empty object when getLineContent is undefined', async () => {
      const context = createOccurrenceContext();
      const result = await buildPartialFingerprints('src/file.ts', 10, undefined, context);
      expect(result).toEqual({});
    });

    it('[SARIF-B6] buildPartialFingerprints: second finding with same line content should have occurrence=2', async () => {
      const context = createOccurrenceContext();
      const getLineContent = async (_file: string, _line: number) => 'const email = user.email;';

      const first = await buildPartialFingerprints('src/file.ts', 5, getLineContent, context);
      const second = await buildPartialFingerprints('src/file.ts', 10, getLineContent, context);

      expect(first['primaryLocationLineHash/v1']).toMatch(/:1$/);
      expect(second['primaryLocationLineHash/v1']).toMatch(/:2$/);
    });

    it('[SARIF-B7] buildPartialFingerprints: separate contexts for different files should each start at occurrence=1', async () => {
      const getLineContent = async () => 'const email = user.email;';
      const ctxFileA = createOccurrenceContext();
      const ctxFileB = createOccurrenceContext();

      const resultA = await buildPartialFingerprints('src/a.ts', 5, getLineContent, ctxFileA);
      const resultB = await buildPartialFingerprints('src/b.ts', 5, getLineContent, ctxFileB);

      expect(resultA['primaryLocationLineHash/v1']).toMatch(/:1$/);
      expect(resultB['primaryLocationLineHash/v1']).toMatch(/:1$/);
      expect(resultA['primaryLocationLineHash/v1']).toBe(resultB['primaryLocationLineHash/v1']);
    });

    it('[SARIF-B8] buildPartialFingerprints: same input should produce same hash (determinism)', async () => {
      const getLine = async () => 'const email = user.email;';

      const ctx1 = createOccurrenceContext();
      const ctx2 = createOccurrenceContext();

      const r1 = await buildPartialFingerprints('src/file.ts', 5, getLine, ctx1);
      const r2 = await buildPartialFingerprints('src/file.ts', 5, getLine, ctx2);

      expect(r1['primaryLocationLineHash/v1']).toBe(r2['primaryLocationLineHash/v1']);
    });
  });
});
