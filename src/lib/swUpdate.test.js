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
  /** A worker that is still installing when the update check resolves. */
  function installingWorker() {
    const listeners = [];
    return {
      state: 'installing',
      addEventListener: (_type, fn) => listeners.push(fn),
      removeEventListener: () => {},
      settle(state) {
        this.state = state;
        listeners.forEach((fn) => fn());
      },
    };
  }

  it('hands over to a worker that is already waiting', async () => {
    const updateSW = vi.fn(() => Promise.resolve());
    const reload = vi.fn();
    setServiceWorkerControls({ registration: { waiting: {} }, updateSW });

    await applyServiceWorkerUpdate({ reload });

    expect(updateSW).toHaveBeenCalledWith(true);
  });

  // The defect the button had: `registration.update()` resolves when the check
  // is done, not when the new worker is ready, so SKIP_WAITING was posted to
  // nobody and the user had to refresh by hand afterwards.
  it('waits for a still-installing worker before handing over', async () => {
    const installing = installingWorker();
    const order = [];
    const updateSW = vi.fn(() => {
      order.push(`updateSW:${installing.state}`);
      return Promise.resolve();
    });
    setServiceWorkerControls({ registration: { waiting: null, installing }, updateSW });

    const done = applyServiceWorkerUpdate({ reload: vi.fn() });
    expect(updateSW).not.toHaveBeenCalled();

    installing.settle('installed');
    await done;

    expect(order).toEqual(['updateSW:installed']);
  });

  it('gives up waiting rather than hanging when the worker goes redundant', async () => {
    const installing = installingWorker();
    const reload = vi.fn();
    setServiceWorkerControls({ registration: { waiting: null, installing } });

    const done = applyServiceWorkerUpdate({ reload });
    installing.settle('redundant');
    await done;

    expect(reload).toHaveBeenCalledTimes(1);
  });

  // One tap has to be enough. The plugin's own reload takes this timer with it
  // when it fires; when it does not fire, this is what finishes the job.
  it('reloads even when the plugin did not', async () => {
    const reload = vi.fn();
    setServiceWorkerControls({ registration: { waiting: {} }, updateSW: () => Promise.resolve() });

    await applyServiceWorkerUpdate({ reload });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  // A dev server or a browser that refused registration: there is no worker to
  // swap, and reloading is the whole of the job.
  it('falls back to a plain reload with no worker registered', async () => {
    const reload = vi.fn();

    await applyServiceWorkerUpdate({ reload });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
