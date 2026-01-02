import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/store/memory/index.ts',
    'src/store/fs/index.ts',
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

