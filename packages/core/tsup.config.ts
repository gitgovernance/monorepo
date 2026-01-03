import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/fs.ts',
    'src/memory.ts',
    // Legacy subpath exports (deprecated, use /fs and /memory instead)
    'src/store/memory/index.ts',
    'src/store/fs/index.ts',
    'src/key_provider/index.ts',
    'src/key_provider/fs/index.ts',
    'src/key_provider/memory/index.ts',
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

