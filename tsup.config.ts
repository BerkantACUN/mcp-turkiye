import { defineConfig } from 'tsup';

export default defineConfig({
  // Published to npm and run through `npx mcp-turkiye`: node_modules is
  // populated by the installer, so dependencies stay external. `http` is the
  // Streamable HTTP entry the Docker image runs.
  entry: { index: 'src/index.ts', http: 'src/http.ts' },
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
