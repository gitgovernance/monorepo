/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.env.js'],
  testMatch: ['**/*.e2e.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 120_000,
  maxWorkers: 1,
  forceExit: true,

  // @octokit/* is ESM-only — match pnpm nested node_modules paths
  transformIgnorePatterns: [
    'node_modules/(?!.*(@octokit|before-after-hook|universal-user-agent))',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
};
