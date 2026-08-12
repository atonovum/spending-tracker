import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    pool: 'forks',
    poolMatchGlobs: [
      ['src/worker.test.js', '@cloudflare/vitest-pool-workers'],
      ['src/**/*.test.{js,jsx}', 'forks'],
    ],
    environmentMatchGlobs: [
      ['src/worker.test.js', 'worker'],
      ['src/**/*.test.{js,jsx}', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/App.jsx',
        'src/lib/categoryIcons.jsx',
        'src/lib/cloudSync.js',
        '**/*.test.{js,jsx}',
        '**/*.config.{js,jsx}',
      ],
      thresholds: {
        // Ratchet, not aspiration: these sit a few points under the measured
        // baseline (2026-08 — statements 90.78 / branches 83.35 /
        // functions 88.70 / lines 92.54) so that untested new code fails CI
        // while normal noise does not. Raise them as coverage improves.
        statements: 87,
        branches: 79,
        functions: 85,
        lines: 89,
        'src/worker.js': {
          lines: 90,
        },
      },
    },
  },
  workers: {
    miniflare: {
      compatibilityDate: '2026-05-05',
      compatibilityFlags: ['nodejs_compat'],
      kvNamespaces: ['STATE_KV'],
      bindings: {
        ASSETS: {
          fetch: () => new Response('Mock ASSETS', { status: 200 }),
        },
      },
    },
    main: './src/worker.js',
  },
});
