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
        'src/lib/finance.js': {
          lines: 90,
        },
        'src/worker.js': {
          lines: 90,
        },
        'src/lib/storage.js': {
          lines: 85,
        },
        'src/lib/i18n.jsx': {
          lines: 73,
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
