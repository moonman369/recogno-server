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
  // Bundling `@recogno/shared` pulls in CJS deps (pino, ...) that call plain
  // `require(...)` internally. esbuild's ESM output otherwise replaces that
  // with a shim that throws "Dynamic require of ... is not supported" at
  // runtime; a real `require` in scope makes it fall through to that instead.
  esbuildOptions(options) {
    options.banner = {
      js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
    };
  },
});
