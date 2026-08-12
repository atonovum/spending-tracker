import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Frontend tests
  {
    extends: './vitest.config.js',
    test: {
      name: 'frontend',
      include: ['src/**/*.test.{js,jsx}'],
      exclude: ['src/worker.test.js'],
      environment: 'jsdom',
      globals: true,
    },
  },
  // Worker tests
  {
    test: {
      name: 'worker',
      include: ['src/worker.test.js'],
      pool: '@cloudflare/vitest-pool-workers',
    },
    workers: {
      miniflare: {
        compatibilityDate: '2026-05-05',
        compatibilityFlags: ['nodejs_compat'],
        kvNamespaces: ['STATE_KV'],
        serviceBindings: {
          ASSETS: () => new Response('Mock ASSETS', { status: 200 }),
        },
      },
      main: './src/worker.js',
    },
  },
]);
