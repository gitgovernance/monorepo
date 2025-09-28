/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.env.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/dist-cjs/', '/releases/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.cjs.json'
    }]
  }
};