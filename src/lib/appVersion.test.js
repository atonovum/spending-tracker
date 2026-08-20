import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_VERSION, fetchDeployedVersion, isUpdateAvailable } from './appVersion.js';

describe('APP_VERSION', () => {
  // Substituted at transform time, so a missing `define` shows up here rather
  // than as a mystery parse failure in whatever imports it.
  it('is the constant the build substitutes', () => {
    expect(APP_VERSION).toBe('test');
  });
});

describe('isUpdateAvailable', () => {
  it('is true when the server serves a different build', () => {
    expect(isUpdateAvailable('51818e3', '4d17905')).toBe(true);
  });

  it('is false when the versions match', () => {
    expect(isUpdateAvailable('51818e3', '51818e3')).toBe(false);
  });

  it('is false when the server could not be read', () => {
    expect(isUpdateAvailable('51818e3', null)).toBe(false);
  });

  // A working tree is not a deployment; telling a developer it is out of date
  // would be noise on every single run.
  it('is false for a build with no identity of its own', () => {
    expect(isUpdateAvailable('dev', '51818e3')).toBe(false);
    expect(isUpdateAvailable('test', '51818e3')).toBe(false);
    expect(isUpdateAvailable('', '51818e3')).toBe(false);
  });
});

describe('fetchDeployedVersion', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function jsonResponse(body, { status = 200 } = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
    });
  }

  it('reads the version and build time the server reports', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ version: '51818e3', builtAt: '2026-08-20T10:34:54.755Z' }))
    );

    await expect(fetchDeployedVersion()).resolves.toEqual({
      ok: true,
      reason: 'ok',
      status: 200,
      version: '51818e3',
      builtAt: '2026-08-20T10:34:54.755Z',
    });
  });

  it('bypasses the HTTP cache', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ version: '51818e3' })));

    await fetchDeployedVersion();

    expect(globalThis.fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('tolerates a missing build time', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ version: '51818e3' })));

    await expect(fetchDeployedVersion()).resolves.toEqual({
      ok: true,
      reason: 'ok',
      status: 200,
      version: '51818e3',
      builtAt: null,
    });
  });

  // Four ways this fails, four different things the user has to do. Collapsing
  // them into one "unavailable" made a real outage undiagnosable.
  it('names an expired session when the request was redirected to a login page', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        redirected: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      })
    );

    await expect(fetchDeployedVersion()).resolves.toEqual({
      ok: false,
      reason: 'auth',
      status: 200,
      version: null,
      builtAt: null,
    });
  });

  // HTML with no redirect is the Worker's single-page-application fallback
  // answering for an asset that is not in the deployment.
  it('names a missing asset when HTML arrives without a redirect', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response('<!doctype html>', {
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
        })
      )
    );

    await expect(fetchDeployedVersion()).resolves.toEqual({
      ok: false,
      reason: 'missing',
      status: 200,
      version: null,
      builtAt: null,
    });
  });

  it('names an unreachable server on a non-2xx response', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({}, { status: 404 })));

    // The code is what separates a missing asset from a dead network.
    await expect(fetchDeployedVersion()).resolves.toMatchObject({
      ok: false,
      reason: 'unreachable',
      status: 404,
    });
  });

  it('names an unreachable server on a network error', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('offline')));

    // No response at all, so there is no code to report.
    await expect(fetchDeployedVersion()).resolves.toMatchObject({
      ok: false,
      reason: 'unreachable',
      status: 0,
    });
  });

  it('names a malformed payload when the JSON carries no version', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ builtAt: 'x' })));

    await expect(fetchDeployedVersion()).resolves.toMatchObject({ ok: false, reason: 'malformed' });
  });
});
