/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyServiceWorkerUpdate,
  checkForServiceWorkerUpdate,
  getServiceWorkerControls,
  setServiceWorkerControls,
} from './swUpdate.js';

afterEach(() => {
  setServiceWorkerControls(null);
});

describe('setServiceWorkerControls', () => {
  it('keeps what registration handed over', () => {
    const registration = { update: vi.fn() };
    const updateSW = vi.fn();

    setServiceWorkerControls({ registration, updateSW });

    expect(getServiceWorkerControls()).toEqual({ registration, updateSW });
  });

  it('normalises a missing registration to null rather than undefined', () => {
    setServiceWorkerControls(undefined);

    expect(getServiceWorkerControls()).toEqual({ registration: null, updateSW: null });
  });

  it('ignores a non-callable updateSW', () => {
    setServiceWorkerControls({ registration: null, updateSW: 'nope' });

    expect(getServiceWorkerControls().updateSW).toBeNull();
  });
});

describe('checkForServiceWorkerUpdate', () => {
  // This call is the update check. Without it a resumed home-screen app never
  // re-fetches sw.js, so a deploy stays invisible however often it is reopened.
  it('asks the browser to re-fetch the worker script', async () => {
    const update = vi.fn(() => Promise.resolve());
    setServiceWorkerControls({ registration: { update } });

    await expect(checkForServiceWorkerUpdate()).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('reports that no check was possible when nothing is registered', async () => {
    await expect(checkForServiceWorkerUpdate()).resolves.toBe(false);
  });

  // Offline, or a browser that declines. The next resume tries again, so this
  // must not throw into whatever called it.
  it('swallows a failing check', async () => {
    setServiceWorkerControls({ registration: { update: () => Promise.reject(new Error('offline')) } });

    await expect(checkForServiceWorkerUpdate()).resolves.toBe(false);
  });
});

describe('applyServiceWorkerUpdate', () => {
  it('hands over to the waiting worker', async () => {
    const updateSW = vi.fn(() => Promise.resolve());
    const reload = vi.fn();
    setServiceWorkerControls({ registration: {}, updateSW });

    await applyServiceWorkerUpdate({ reload });

    expect(updateSW).toHaveBeenCalledWith(true);
    expect(reload).not.toHaveBeenCalled();
  });

  // A dev server or a browser that refused registration: there is no worker to
  // swap, and reloading is the whole of the job.
  it('falls back to a plain reload with no worker registered', async () => {
    const reload = vi.fn();

    await applyServiceWorkerUpdate({ reload });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
