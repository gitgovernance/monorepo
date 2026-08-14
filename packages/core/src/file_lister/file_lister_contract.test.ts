/**
 * Contract tests for the `FileLister` interface — [EARS-FL05]
 *
 * These verify what EVERY implementation must honour, not what any one of them does.
 * They exist because two implementations of this interface shipped with OPPOSITE freshness
 * guarantees and the interface said nothing: `FsFileLister` and `MemoryFileLister` re-read
 * the source on every call, while `GitHubFileLister` caches the tree and never invalidated
 * it, so one instance observed a single instant forever. A poll written against the
 * interface could not know which of the two it had — and the one that had the cache spun
 * for 60s over a frozen array (measured 2026-08-14).
 */
import * as fs from 'fs';
import * as path from 'path';
import { FsFileLister } from './fs';
import { MemoryFileLister } from './memory';
import { MockFileLister } from './memory/mock_file_lister';
import { GitHubFileLister } from './github/github_file_lister';

describe('FileLister contract (EARS-FL05)', () => {
  /**
   * Every implementation, with a factory that builds it with the cheapest valid input.
   * Adding a backend here is NOT optional: the directory scan below fails the suite if a
   * new implementation directory appears without a row in this table.
   */
  /**
   * Every class that implements the interface, checked on its PROTOTYPE rather than on an
   * instance. Two reasons: constructing a `GitHubFileLister` would need an Octokit, and
   * faking one meant an `as never` — the very idiom 1.2f (e) is removing. And the contract
   * is a property of the class, not of any particular instance.
   */
  const IMPLEMENTATIONS: Array<{ name: string; ctor: { prototype: object } }> = [
    { name: 'FsFileLister', ctor: FsFileLister },
    { name: 'MemoryFileLister', ctor: MemoryFileLister },
    { name: 'MockFileLister', ctor: MockFileLister },
    { name: 'GitHubFileLister', ctor: GitHubFileLister },
  ];

  it('[EARS-FL05] should expose invalidateCache on every FileLister implementation', () => {
    // A backend that caches without a way to discard it makes correct polling impossible
    // through the interface; one that does not cache still owes the consumer the no-op
    // that says so. Both cases are the same obligation.
    const missing = IMPLEMENTATIONS
      .filter(impl => typeof (impl.ctor.prototype as { invalidateCache?: unknown }).invalidateCache !== 'function')
      .map(impl => impl.name);
    expect(missing).toEqual([]);
  });

  it('[EARS-FL05] should be a safe no-op on implementations without cache', async () => {
    // Fs, Memory and Mock hold no cache. The call must be harmless and must not disturb
    // reads — a consumer invalidates defensively at the top of a loop without knowing
    // which backend it was given.
    const fsLister = new FsFileLister({ cwd: process.cwd() });
    expect(() => fsLister.invalidateCache()).not.toThrow();
    expect(() => fsLister.invalidateCache()).not.toThrow();

    const memLister = new MemoryFileLister({ files: { 'a.json': '{}' } });
    expect(() => memLister.invalidateCache()).not.toThrow();
    await expect(memLister.list(['**/*.json'])).resolves.toContain('a.json');

    const mockLister = new MockFileLister({ files: { 'b.json': '{}' } });
    expect(() => mockLister.invalidateCache()).not.toThrow();
    await expect(mockLister.list(['**/*.json'])).resolves.toContain('b.json');
  });

  it('[EARS-FL05] should have no implementation missing from the contract table', () => {
    // The table above is only as good as its coverage. A new backend — GitlabFileLister is
    // already planned — must not be able to appear without being held to this contract.
    //
    // Scanned BY CLASS (`implements FileLister`), not by directory. The first version of
    // this guard scanned directories and was blind to a second implementation inside an
    // already-covered one: `MockFileLister` lives in memory/ next to `MemoryFileLister`,
    // so the guard reported full coverage while missing a whole implementation — and the
    // spec row claiming "no implementation escapes the table" was false. A guard that
    // cannot see what it claims to check is worse than no guard.
    const root = __dirname;
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
      });

    const RE_IMPLEMENTS = /class\s+(\w+)\s+implements\s+FileLister\b/g;
    const declared = walk(root).flatMap(file =>
      [...fs.readFileSync(file, 'utf-8').matchAll(RE_IMPLEMENTS)].map(m => m[1] as string));

    // ANTI-VACUITY: if the scan finds nothing it is broken, not the codebase clean. Four is
    // what exists today (Fs, Memory, Mock, GitHub) — a lower count means the regex stopped
    // matching, and the zero would read as "everything is covered".
    expect(declared.length).toBeGreaterThanOrEqual(4);

    const covered = new Set(IMPLEMENTATIONS.map(i => i.name));
    const uncovered = declared.filter(name => !covered.has(name));
    expect(uncovered).toEqual([]);
  });
});
