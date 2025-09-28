#!/usr/bin/env node
// esbuild configuration for SEA bundling
// Resolves monorepo dependencies (../../../../core/src/...) into single bundle

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

console.log('🔨 Building CLI bundle for SEA...');

const config = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bundle.cjs',
  format: 'cjs', // SEA requires CommonJS
  external: [
    // External Node.js built-ins and optional dependencies
    'react-devtools-core',
    'yoga-wasm-web',
    'ink',
    'react',
    'chokidar' // Also external for file watching
  ],
  minify: false, // Disable minify for debugging
  sourcemap: false,
  treeShaking: true,

  // Resolve monorepo dependencies
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  loader: {
    '.yaml': 'text',
    '.yml': 'text'
  },

  // Handle Node.js built-ins
  define: {
    'process.env.NODE_ENV': '"production"'
  },

  // No banner for ESM - will add shebang after build

  // JSX configuration for React components
  jsx: 'automatic',
  jsxImportSource: 'react'
};

try {
  // Ensure dist directory exists
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  // Build the bundle
  const result = await build(config);

  // Add shebang to the beginning of the file if not present
  const bundleContent = fs.readFileSync('dist/bundle.cjs', 'utf8');
  if (!bundleContent.startsWith('#!/usr/bin/env node')) {
    const bundleWithShebang = '#!/usr/bin/env node\n' + bundleContent;
    fs.writeFileSync('dist/bundle.cjs', bundleWithShebang);
  }

  // Make bundle executable
  fs.chmodSync('dist/bundle.cjs', 0o755);

  console.log('✅ Bundle created successfully!');
  console.log(`📦 Output: dist/bundle.cjs`);

  // Show bundle size
  const stats = fs.statSync('dist/bundle.cjs');
  const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`📊 Bundle size: ${sizeInMB} MB`);

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    result.warnings.forEach(warning => console.log(`  - ${warning.text}`));
  }

} catch (error) {
  console.error('❌ Bundle failed:', error);
  process.exit(1);
}
