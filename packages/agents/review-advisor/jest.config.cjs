/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@gitgov/core$': '<rootDir>/node_modules/@gitgov/core/src/index.ts',
    // The root mapper is anchored with `$`, so it does NOT cover subpaths. Without
    // this second entry, `@gitgov/core/fs` resolves through the package `exports`
    // to core's BUILT `dist/`, while the barrel import above reads core's `src/` —
    // two different targets in the same test run, and nothing keeps that dist fresh
    // (this package's `pnpm build` runs esbuild over its own src, not core's).
    '^@gitgov/core/fs$': '<rootDir>/node_modules/@gitgov/core/src/shared/fs/fs.ts',
    // No mapper for any LLM SDK on purpose: the agent is provider-agnostic (RAV-B2)
    // and imports none. The `@anthropic-ai/claude-agent-sdk` entry that used to live
    // here mapped a module no test ever imported — dead config from before G18.
  },
};
