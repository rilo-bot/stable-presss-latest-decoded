import { defineConfig } from 'vitest/config';

// ---------------------------------------------------------------------------
// Vitest — new magazine-builder code only.
//
// The existing server suite (apps/server/tests/**) is written against Node's
// built-in test runner and is run by `npm run test:server`. It is deliberately
// NOT included here: this project does not take ownership of the old tests, and
// mixing the two runners in one command makes Lane 0's gate depend on code the
// rebuild never touches.
//
// Vitest resolves the mb-* packages with Vite's resolver, which is why those
// packages need no build step and no dual CJS/ESM output — the browser and the
// test runner see the same TypeScript source.
// ---------------------------------------------------------------------------

export default defineConfig({
  test: {
    include: [
      'packages/**/*.{test,spec}.{ts,tsx}',
      'apps/web/src/magazine-builder/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Lane 0 lands the tooling before the first test exists. Without this the
    // gate fails on an empty repository, which teaches everyone to skip it.
    passWithNoTests: true,
    environment: 'node',
  },
});
