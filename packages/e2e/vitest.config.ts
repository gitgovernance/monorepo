import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config();

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 60_000,
    globalSetup: ['tests/globalSetup.ts'],
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
  },
});
