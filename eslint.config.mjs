// ---------------------------------------------------------------------------
// ESLint — flat config.
//
// SCOPE: new magazine-builder code ONLY (RULES-AMENDMENT-1 §A). Every `files`
// glob below is restricted to a new-code path. Existing app source is never
// linted: applying these rules repo-wide produces thousands of findings in code
// this project does not touch, and a red CI on day one gets switched off.
//
// The `lint` script also targets those directories explicitly, so the scope is
// enforced twice — once by the script's arguments and once by these globs.
// ---------------------------------------------------------------------------

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

/** Every path the rules apply to. Keep in step with CLAUDE.md and RULES §A. */
const NEW_CODE = [
  'packages/**/*.{ts,tsx}',
  'apps/web/src/magazine-builder/**/*.{ts,tsx}',
  'apps/server/src/routes/magazineBuilder/**/*.ts',
  'apps/server/src/lib/magazineBuilder/**/*.ts',
  'apps/worker/src/jobs/publishMagazine.ts',
];

/**
 * Import bans every new-code file carries.
 *
 * Held in a constant because ESLint flat config REPLACES a rule entry rather
 * than merging it: any per-package block that sets `no-restricted-imports` drops
 * these unless it spreads them back in. That is silent — nothing reports the
 * guards going missing.
 */
const SHARED_IMPORT_BANS = [
  {
    group: ['**/magazine-builder/features/*/**', '../features/*/**', '../../features/*'],
    message:
      'Lanes must not import from each other. Ask Lane 0 to move shared code into packages/.',
  },
  {
    group: ['**/editor-v2/**', '**/magazineV2/**', '**/magazinesV2/**'],
    message:
      'The existing builder is off limits. See CLAUDE.md — build alongside, never against it.',
  },
];

/** Test files relax the rules that only make sense in shipped code. */
const TEST_FILES = [
  'packages/**/*.test.{ts,tsx}',
  'packages/**/test/**/*.{ts,tsx}',
  'apps/web/src/magazine-builder/**/*.test.{ts,tsx}',
];

export default tseslint.config(
  {
    // Never walked, whatever anyone passes on the command line.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.vite/**',
      '**/coverage/**',
      // The existing builder — off limits (CLAUDE.md).
      'apps/web/src/editor-v2/**',
      'apps/server/src/routes/magazinesV2/**',
      'apps/server/src/lib/magazineV2/**',
      'apps/server/tests/magazineV2/**',
    ],
  },

  {
    files: NEW_CODE,
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Type-aware linting. Required by no-floating-promises and
        // no-misused-promises; without it both rules silently do nothing.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: ['packages/*/tsconfig.json'] },
      },
    },
    rules: {
      // — RULES §1.3, no type escape hatches ————————————————————————
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',

      // — RULES §3.4 and §3.5, module boundaries are explicit ——————————
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',

      // — RULES §1.4 and §4.4, errors are never swallowed ————————————
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],

      // — RULES §1.5, no leftovers —————————————————————————————————
      // pino is the logger (RULES-AMENDMENT-1 §F). console is never shipped.
      'no-console': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack', 'xxx'], location: 'anywhere' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // — RULES §2.1, file length. New files only; generated data exempt ——
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],

      // — RULES §2.4, no circular imports ————————————————————————————
      'import/no-cycle': ['error', { maxDepth: Infinity }],

      // — FOUNDATION §4, a package may import only what it declares ————
      // This is what actually enforces the dependency contract: mb-schema's
      // package.json lists no dependencies, so every npm import in it is an
      // error, and mb-commands can reach immer and fractional-indexing because
      // it declares them and nothing else. The contract lives in package.json
      // where it belongs, rather than in a hand-maintained denylist that lets
      // through whatever nobody thought to name.
      'import/no-extraneous-dependencies': 'error',

      // — RULES §5, no magic numbers ————————————————————————————————
      // RULES sets this to 'warn'; the lint script runs --max-warnings=0, so in
      // practice it fails the build either way. Left as 'warn' to match RULES.
      //
      // The typescript-eslint version, not the base rule: the base one flags
      // numeric literal TYPES — `fontWeight: 400 | 500 | ... | 900` is six
      // findings — which are declarations, not magic values. Turning the rule
      // off to silence that would lose the checking it exists for.
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'warn',
        {
          ignore: [0, 1, -1],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
          detectObjects: false,
        },
      ],

      // — FOUNDATION §4, lane boundaries ————————————————————————————
      // A lane never imports another lane. Shared code moves into packages/.
      'no-restricted-imports': ['error', { patterns: SHARED_IMPORT_BANS }],
    },
  },

  // packages/mb-schema imports NOTHING (FOUNDATION §4).
  //
  // An allowlist, not a denylist. A denylist naming a few packages lets
  // `nanoid`, `lodash` and every `node:` builtin straight through while the
  // message claims the package imports nothing — a rule reading stronger than
  // it enforces, which is the specific failure RULES §10 is about. The
  // zero-dependency contract is load-bearing: everything depends on this one.
  //
  // NOTE flat config REPLACES a rule entry rather than merging it, so the shared
  // bans have to be repeated here. Leaving them out would silently drop the
  // lane-boundary and existing-builder guards for this package.
  {
    files: ['packages/mb-schema/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...SHARED_IMPORT_BANS,
            {
              group: ['node:*', 'fs', 'path', 'crypto', 'os', 'util'],
              message:
                'mb-schema imports nothing — not npm packages, not node: builtins. It runs in the browser too. Inject anything environmental.',
            },
          ],
        },
      ],
    },
  },

  {
    files: TEST_FILES,
    rules: {
      // A literal is the assertion in a test — "A4 is 210 x 297mm" is the point.
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      // The dependency contract governs what SHIPS. Test runners come from the
      // root workspace and are deliberately not declared per package.
      'import/no-extraneous-dependencies': 'off',
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
);
