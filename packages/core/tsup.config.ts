import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',                      // @gitgov/core - interfaces + types
    'src/shared/fs/fs.ts',               // @gitgov/core/fs - filesystem implementations
    'src/shared/memory/memory.ts',       // @gitgov/core/memory - in-memory implementations
    'src/shared/github/github.ts',       // @gitgov/core/github - GitHub API implementations
    'src/shared/prisma/prisma.ts',       // @gitgov/core/prisma - Prisma DB implementations
    'src/audit/index.ts',                // @gitgov/core/audit - canonical Audit product types
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist/src',
  splitting: false,
  treeshake: true,
  external: ['fast-glob', 'picomatch', '@octokit/rest', '@anthropic-ai/sdk'],
});

