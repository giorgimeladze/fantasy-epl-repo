// ESLint is both the linter and the formatter (`npm run lint` / `npm run lint:fix`).
// typescript-eslint doesn't support TypeScript 7 yet, so ESLint parses with the root `typescript`
// devDependency (6.x); the workspaces keep their own TypeScript 7 for `tsc`.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ESM_EXTENSION = { regex: '^\\.{1,2}/(?!.*\\.(js|json)$).*$', message: 'Relative imports end in .js (ESM).' };
const SERVER_FEATURE_BOUNDARY = {
  regex: '^(\\.\\./)+(auth|team|headToHead|projections|nextGameweek|transfers|planner)/'
    + '(?!models\\.js$|[a-zA-Z]+Service\\.js$|requireAuth\\.js$)',
  message: 'Use another feature only via its models.ts or <feature>Service.ts; move shared code to shared/.',
};

export default tseslint.config(
  { ignores: ['**/dist/', '**/node_modules/', 'app/server/data/'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Formatting: matches the existing style (2 spaces, single quotes, semicolons, trailing commas, 120 columns).
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    jsx: true,
    arrowParens: true,
    braceStyle: '1tbs',
    commaDangle: 'always-multiline',
    quoteProps: 'as-needed',
  }),
  {
    rules: {
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/max-len': ['error', {
        code: 120,
        ignoreUrls: true,
        ignoreComments: true,
        ignoreRegExpLiterals: true,
      }],
      '@stylistic/operator-linebreak': ['error', 'before', { overrides: { '=': 'after' } }],
      '@stylistic/multiline-ternary': 'off',
      '@stylistic/jsx-one-expression-per-line': 'off',
      '@stylistic/jsx-wrap-multilines': 'off',
      '@stylistic/indent-binary-ops': 'off',
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'semi' },
        singleline: { delimiter: 'semi' },
      }],
    },
  },

  // Project rules.
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // Server: Node globals; relative imports end in `.js` (ESM, module: nodenext). A feature uses another
  // feature only through its `models.ts` (types) or its public `<feature>Service.ts`; code that two
  // features share goes in `shared/`. Entry points (routes.ts, scripts/) may import anything.
  {
    files: ['app/server/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-imports': ['error', { patterns: [ESM_EXTENSION, SERVER_FEATURE_BOUNDARY] }] },
  },
  {
    files: ['app/server/src/scripts/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [ESM_EXTENSION] }] },
  },
  {
    files: ['app/server/test/**/*.ts'],
    languageOptions: { globals: globals.mocha },
  },
  // The mock season is written as one row per player / fixture.
  {
    files: ['app/server/test/mockServer.ts'],
    rules: { '@stylistic/max-len': 'off' },
  },
  // Skill helper scripts (.claude/skills/*/*.mjs) are Node CLIs.
  {
    files: ['.claude/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  // Only scripts, the server entry and the importer's progress log may print.
  {
    files: [
      'app/server/src/scripts/**/*.ts',
      'app/server/src/server.ts',
      'app/server/src/history/historyImporter.ts',
    ],
    rules: { 'no-console': 'off' },
  },

  // Client: browser globals, hooks rules, no fetch outside api.ts. A feature folder never imports
  // another feature, and components/ (shared) never imports a feature; shared UI goes in components/.
  {
    files: ['app/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Call the API through src/api.ts.' }],
    },
  },
  {
    files: ['app/client/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^\\.\\./[A-Za-z]',
          message: 'Features never import each other; shared UI goes in components/.',
        }],
      }],
    },
  },
  {
    files: ['app/client/src/{components,hooks,lib}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ regex: '/features/', message: 'Shared code never imports a feature.' }],
      }],
    },
  },
  {
    files: ['app/client/src/api.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
