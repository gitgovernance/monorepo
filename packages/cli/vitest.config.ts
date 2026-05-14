import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dist-cjs', 'releases'],
    testTimeout: 30000,
  },
});
