/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@gitgov/core$': '<rootDir>/node_modules/@gitgov/core/src/index.ts',
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/node_modules/@anthropic-ai/claude-agent-sdk',
  },
};
