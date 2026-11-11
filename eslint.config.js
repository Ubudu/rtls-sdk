// @ts-check
// Flat ESLint config. Files are selected by `npm run lint` (scripts/quality.mjs) from `git ls-files` plus
// untracked, not ignored files; findings outside the shared tooling files are baselined per owner
// (scripts/quality-baseline.json), never switched off.
import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import rtlsTest from './scripts/eslint/plugin.mjs';

const TS_FILES = ['**/*.ts', '**/*.mts', '**/*.cts'];
const JS_FILES = ['**/*.js', '**/*.mjs', '**/*.cjs'];

const unusedVars = {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
  ignoreRestSiblings: true,
};

export default [
  {
    ignores: [
      'dist/',
      'coverage/',
      'coverage-live/',
      '.cache/',
      '.npm/',
      '**/node_modules/',
      'src/generated/',
      'test/integration/.state/',
      'test/contract/__fixtures__/',
    ],
  },
  {
    files: JS_FILES,
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', unusedVars] },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  // The core recommended rules (no-unsafe-finally, no-unreachable-loop, …) apply to TS files too, before the
  // typescript-eslint sets, whose eslint-recommended part switches off the core rules the compiler covers.
  { files: TS_FILES, rules: js.configs.recommended.rules },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: TS_FILES })),
  {
    files: TS_FILES,
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-unused-vars': ['error', unusedVars] },
  },
  // Tests that cannot fail are rejected: missing or weak assertions, conditional expects, focused or skipped
  // tests, swallowed errors.
  {
    files: ['test/**/*.test.ts'],
    plugins: { vitest, 'rtls-test': rtlsTest },
    languageOptions: { globals: { ...vitest.environments.env.globals } },
    rules: {
      'vitest/expect-expect': [
        'error',
        {
          assertFunctionNames: [
            'expect',
            'expect*',
            'assert*',
            'expectKnownServerIssue',
            'expectGuardViolation',
          ],
        },
      ],
      'vitest/no-conditional-expect': 'error',
      'vitest/valid-expect': ['error', { alwaysAwait: true }],
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-standalone-expect': 'error',
      'rtls-test/no-swallowed-catch': 'error',
      'rtls-test/no-weak-only-assertions': 'error',
    },
  },
  {
    files: ['**/*.int.test.ts'],
    plugins: { 'rtls-test': rtlsTest },
    rules: { 'rtls-test/require-describe-live': 'error' },
  },
  {
    files: ['test/**'],
    ignores: ['test/integration/harness/{sweep-cli,snapshot-cli,scan-cli}.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    files: ['examples/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['@ubudu/rtls-sdk', '../src', '../../src', '../../../src'],
          patterns: [
            {
              group: ['@ubudu/rtls-sdk/*', '../src/*', '../../src/*', '../../../src/*'],
              message: 'examples import from ubudu-rtls-sdk',
            },
          ],
        },
      ],
    },
  },
];
