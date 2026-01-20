import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',   // @gitgov/core - interfaces + types
    'src/fs.ts',      // @gitgov/core/fs - all fs implementations
    'src/memory.ts',  // @gitgov/core/memory - all memory implementations
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist/src',
  splitting: false,
  treeshake: true,
  external: ['fast-glob'],
});

