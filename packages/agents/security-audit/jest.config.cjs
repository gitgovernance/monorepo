/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 30000,
  moduleNameMapper: {
    '^@gitgov/core$': '<rootDir>/node_modules/@gitgov/core/dist/src/index.js',
    '^@gitgov/core/fs$': '<rootDir>/node_modules/@gitgov/core/dist/src/fs.js',
  },
};
