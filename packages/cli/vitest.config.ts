import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-cjs', 'releases'],
    testTimeout: 30000,
    // The e2e `beforeAll` hooks run a full `gitgov init` — git init, CLI bootstrap, worktree — the
    // same class of work the tests themselves do. Without this they inherit vitest's 10s default
    // while the tests get 30s, so under parallel load the setup times out before the test it was
    // preparing ever runs: `governance_passive_e2e` failed with `Hook timed out in 10000ms` in the
    // full suite while passing 11/11 on its own. Setup deserves the same budget as what it sets up.
    hookTimeout: 30000,
  },
});
