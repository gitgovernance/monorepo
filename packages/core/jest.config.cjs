/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.env.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '\\.e2e\\.test\\.ts$'],
  maxWorkers: '50%',

  testTimeout: 30000,
};