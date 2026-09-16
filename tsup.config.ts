import { defineConfig } from 'tsup';

export default defineConfig({
  // Published to npm and run through `npx mcp-turkiye`: node_modules is
  // populated by the installer, so dependencies stay external.
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: false,
  banner: { js: '#!/usr/bin/env node' },
});
