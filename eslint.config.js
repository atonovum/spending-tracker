import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Flat ESLint config (ESM).
 *
 * Layout notes:
 * - `src/worker.js` runs in the Cloudflare Workers runtime, so it deliberately
 *   sits OUTSIDE the browser-globals block (no `window`/`document` leakage) and
 *   gets service-worker + Workers-specific globals instead.
 * - Test files rely on vitest `globals: true`, so `describe`/`it`/`expect`/`vi`
 *   come from the vitest globals set rather than explicit imports.
 */
export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.wrangler/**',
    ],
  },

  js.configs.recommended,

  // Shared language options for every linted file.
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Unused *variables and imports* are real dead code and stay an error.
      //
      // `args: 'none'` — unused parameters are deliberately not enforced:
      //   * `catch (error) {}` with an unused binding is an intentional style
      //     throughout `src/worker.js` (hence `caughtErrors: 'none'` too);
      //   * some exported helpers keep a parameter purely to hold a stable
      //     signature across call sites (e.g. `normalizeWallet(w, cats, labels)`).
      // Enforcing it would force either behaviour changes or disable comments,
      // both of which are worse than leaving parameters unchecked.
      'no-unused-vars': [
        'error',
        {
          args: 'none',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Frontend application code (browser runtime + React).
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/worker.js', 'src/worker.test.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Substituted at transform time by the `define` block in
        // `vite.config.js` (and mirrored in `vitest.config.js`).
        __APP_VERSION__: 'readonly',
        __BUILD_TIME__: 'readonly',
        __ACCESS_LOGOUT_URL__: 'readonly',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Highest-value rules here: they catch stale-closure / conditional-hook
      // bugs that the test suite cannot.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },

  // Cloudflare Worker runtime: not browser, not Node.
  {
    files: ['src/worker.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.worker,
        // Workers runtime extras not covered by the service-worker set.
        WebSocketPair: 'readonly',
        HTMLRewriter: 'readonly',
        crypto: 'readonly',
        caches: 'readonly',
        scheduler: 'readonly',
      },
    },
  },

  // Worker tests: Workers runtime + vitest globals + `cloudflare:test` helpers.
  {
    files: ['src/worker.test.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.worker,
        ...globals.vitest,
      },
    },
  },

  // Frontend tests and test helpers.
  {
    files: [
      'src/**/*.test.{js,jsx}',
      'src/**/testUtils.{js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
        // Test setup helpers patch Node-side globals (`global.ResizeObserver`).
        ...globals.node,
      },
    },
  },

  // Claude Code verification hooks: Node scripts, never bundled into the app.
  {
    files: ['.claude/hooks/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // Build/tooling config files and one-off scripts run under Node.
  {
    files: [
      '*.config.{js,jsx}',
      'vitest.workspace.js',
      'scripts/**/*.js',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
