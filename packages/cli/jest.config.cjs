/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.env.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/dist-cjs/', '/releases/'],
  moduleNameMapper: {
    '^@gitgov/core$': '<rootDir>/../core/src/index.ts',
    '^@gitgov/core/fs$': '<rootDir>/../core/src/shared/fs/fs.ts',
    '^@gitgov/core/memory$': '<rootDir>/../core/src/shared/memory/memory.ts',
    '^@gitgov/core/audit$': '<rootDir>/../core/src/audit/index.ts',
    '^@gitgov/core/github$': '<rootDir>/../core/src/shared/github/github.ts',
    '^@gitgov/core/prisma$': '<rootDir>/../core/src/shared/prisma/prisma.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.cjs.json'
    }],
    '^.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true } }]
  }
};