import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // `@recogno/shared` is a source-only workspace package, so bundle it in.
  noExternal: ['@recogno/shared'],
});
