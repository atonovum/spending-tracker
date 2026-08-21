/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchRemoteState, pushRemoteState } from './cloudSync.js';
import { LAST_SYNCED_STATE_KEY, PENDING_SYNC_KEY } from './finance.js';
import { useCloudSync } from './useCloudSync.js';
import { PULL_MIN_INTERVAL_MS, PUSH_DEBOUNCE_MS, RETRY_DELAYS_MS } from './syncEngine.js';

vi.mock('./cloudSync.js', () => ({
  fetchRemoteState: vi.fn(),
  pushRemoteState: vi.fn(),
}));

/** Minimal document `normalizeState` keeps intact, tagged by its entry ids. */
function docWith(entryIds, updatedAt) {
  return {
    version: 5,
    selectedWalletId: 'w1',
    language: 'ko',
    updatedAt,
    categories: [{ id: 'c1', name: '식비', type: 'expense', color: '#000000', icon: 'food' }],
    labels: [],
    wallets: [
      {
        id: 'w1',
        name: '지갑',
        currency: 'KRW',
        scheduled: [],
        entries: entryIds.map((id) => ({
          id,
          date: '2026-08-01',
          amount: 1000,
          categoryId: 'c1',
          labelIds: [],
          note: '',
        })),
      },
    ],
  };
}

function entryIdsOf(state) {
  return state.wallets[0].entries.map((entry) => entry.id);
}

function setup(initial, onNotify = vi.fn()) {
  const view = renderHook(() => {
    const [state, setState] = useState(initial);
    const sync = useCloudSync({ state, setState, onNotify });
    return { state, setState, sync };
  });
  return { ...view, onNotify };
}

/** Let the mocked fetch promise settle and any resulting effect run. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: null, updatedAt: null });
  pushRemoteState.mockResolvedValue({ ok: true, newUpdatedAt: 2000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('adoption on load', () => {
  it('adopts the remote document when local is clean and older', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['remote-1'], 5000), updatedAt: 5000 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    await waitFor(() => expect(entryIdsOf(result.current.state)).toEqual(['remote-1']));
    expect(pushRemoteState).not.toHaveBeenCalled();
  });

  // The data-loss regression. A push that never landed leaves local content
  // ahead of the server while `updatedAt` still reads the last adopted
  // revision — so the timestamp comparison alone hands the win to a stale
  // server and the edit is silently overwritten on the next launch.
  it('keeps unpushed local edits when the remote changed and no merge base exists', async () => {
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['stale-remote'], 9999), updatedAt: 9999 });

    const { result, onNotify } = setup(docWith(['unpushed-local'], 1000));
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(entryIdsOf(result.current.state)).toEqual(['unpushed-local']);
    expect(pushRemoteState).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict', adopted: false }));
  });

  // An unreachable server is not an empty one: pushing here would send no
  // `If-Match` and overwrite a revision that was never read.
  it('neither adopts nor pushes when the remote could not be read', async () => {
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: false, state: null, updatedAt: null });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(entryIdsOf(result.current.state)).toEqual(['local-1']);
    expect(pushRemoteState).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');
  });

  it('seeds an empty server with the local document', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: null, updatedAt: null });

    setup(docWith(['local-1'], 1000));
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(pushRemoteState).toHaveBeenCalledTimes(1);
  });
});

describe('push confirmation', () => {
  it('writes the confirmed server revision back into local state', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: true, newUpdatedAt: 7777 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    // Without this the next launch compares a stale local `updatedAt` against
    // the revision this very push created, and remote always wins.
    await waitFor(() => expect(result.current.state.updatedAt).toBe(7777));
    expect(localStorage.getItem(PENDING_SYNC_KEY)).not.toBe('1');
  });

  it('does not re-push the state it just stamped', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(pushRemoteState).toHaveBeenCalledTimes(1);
  });

  it('sends the last known revision as If-Match', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(pushRemoteState.mock.calls[0][1]).toMatchObject({ ifMatch: 1000 });
  });
});

  // A confirmation only vouches for the snapshot that was sent. Stamping its
  // revision onto a document that changed meanwhile would mark unsent edits as
  // synced — the same silent loss, one step later.
  it('does not mark the document synced when it changed mid-flight', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    let release;
    pushRemoteState.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, newUpdatedAt: 7777 }); })
    );

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(1);

    // Edit lands while the first request is still open, then it completes.
    act(() => result.current.setState(docWith(['local-1', 'local-2', 'local-3'], 1000)));
    fetchRemoteState.mockResolvedValue({
      ok: true,
      state: docWith(['local-1', 'local-2'], 7777),
      updatedAt: 7777,
    });
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(result.current.state.updatedAt).toBe(7777);
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');
    expect(entryIdsOf(pushRemoteState.mock.calls[1][0])).toEqual(['local-1', 'local-2', 'local-3']);
  });

  it('never runs two pushes at once', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    let release;
    pushRemoteState.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve({ ok: true, newUpdatedAt: 7777 }); })
    );

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    // A second request here would carry a stale If-Match and invent a conflict.
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await Promise.resolve();
    });
  });

describe('failure handling', () => {
  it('marks the document unsynced and retries after a failed push', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(pushRemoteState).toHaveBeenCalledTimes(1);
    // The flag is what survives a reload and stops the stale server from
    // winning the next comparison.
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + 50);
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(2);
  });

  it('retries immediately when the device comes back online', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(2);
  });

  it('merges the latest server document and retries after a write conflict', async () => {
    fetchRemoteState
      .mockResolvedValueOnce({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 })
      .mockResolvedValue({ ok: true, state: docWith(['other-device'], 8000), updatedAt: 8000 });
    pushRemoteState
      .mockResolvedValueOnce({ ok: false, conflict: true, current: 8000 })
      .mockResolvedValueOnce({ ok: true, newUpdatedAt: 9000 });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    await waitFor(() => expect(entryIdsOf(result.current.state)).toEqual(['local-2', 'other-device']));
    expect(onNotify).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict' }));
    expect(localStorage.getItem(PENDING_SYNC_KEY)).not.toBe('1');
  });

  // The rejection landed but the document behind it did not. Reporting "reloaded
  // the latest state" here would be a lie, and stopping there strands the
  // device: still dirty, still losing every push, every retry replaying the
  // same conflict.
  it('says so and retries when the server document could not be read after a conflict', async () => {
    fetchRemoteState
      .mockResolvedValueOnce({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 })
      .mockResolvedValueOnce({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 })
      .mockResolvedValue({ ok: false, authRequired: false, state: null, updatedAt: null });
    pushRemoteState.mockResolvedValue({ ok: false, conflict: true, current: 8000 });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict', adopted: false }));
    expect(entryIdsOf(result.current.state)).toEqual(['local-1', 'local-2']);
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');

    const before = fetchRemoteState.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + 50);
    });
    expect(fetchRemoteState.mock.calls.length).toBeGreaterThan(before);
  });

  it('notifies and stops retrying when the payload is too large', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false, payloadTooLarge: true });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'tooLarge' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] + 50);
    });
    // A payload that exceeds the limit will not shrink on its own; retrying it
    // forever would just burn the phone's battery.
    expect(pushRemoteState).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');
  });
});

describe('manual sync', () => {
  it('takes a server-only change when the local document is clean', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    const view = setup(docWith(['local-1'], 1000));
    await settle();
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['from-server', 'local-1'], 9000), updatedAt: 9000 });

    await act(async () => {
      await view.result.current.sync.syncNow();
    });

    expect(entryIdsOf(view.result.current.state)).toEqual(['from-server', 'local-1']);
    expect(localStorage.getItem(PENDING_SYNC_KEY)).not.toBe('1');
    expect(pushRemoteState).not.toHaveBeenCalled();
  });

  it('changes nothing when the server cannot be read', async () => {
    fetchRemoteState.mockResolvedValue({ ok: false, authRequired: false, state: null, updatedAt: null });

    const view = renderHook(() => {
      const [state, setState] = useState(docWith(['local-1'], 1000));
      const sync = useCloudSync({ state, setState, onNotify: vi.fn() });
      return { state, sync };
    });
    await settle();

    let adopted;
    await act(async () => {
      adopted = await view.result.current.sync.syncNow();
    });

    expect(adopted).toBe(false);
    expect(entryIdsOf(view.result.current.state)).toEqual(['local-1']);
  });

  it('warns when the read hits the login page', async () => {
    const onNotify = vi.fn();
    fetchRemoteState.mockResolvedValue({ ok: false, authRequired: true, state: null, updatedAt: null });

    const view = renderHook(() => {
      const [state, setState] = useState(docWith(['local-1'], 1000));
      const sync = useCloudSync({ state, setState, onNotify });
      return { state, sync };
    });
    await settle();
    onNotify.mockClear();

    await act(async () => {
      await view.result.current.sync.syncNow();
    });

    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'authRequired' }));
  });
});

describe('re-reading on resume', () => {
  /** Wake the app the way iOS does when a home-screen web app is reopened. */
  async function resume(hidden = false) {
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(hidden ? 'hidden' : 'visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });
    spy.mockRestore();
  }

  // A home-screen web app on iOS is resumed, not reloaded: the page is thawed
  // with its React tree intact, so a mount-only read never runs again and the
  // app shows whatever it had when it was frozen — for days.
  it('picks up a change another device made while the app was in the background', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();
    expect(entryIdsOf(result.current.state)).toEqual(['local-1']);

    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['from-desktop'], 9000), updatedAt: 9000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULL_MIN_INTERVAL_MS + 50);
    });
    await resume();

    await waitFor(() => expect(entryIdsOf(result.current.state)).toEqual(['from-desktop']));
  });

  it('also re-reads when Safari restores the page from bfcache', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    setup(docWith(['local-1'], 1000));
    await settle();
    expect(fetchRemoteState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULL_MIN_INTERVAL_MS + 50);
    });
    await act(async () => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    expect(fetchRemoteState).toHaveBeenCalledTimes(2);
  });

  // Resuming must never cost the user an edit that has not landed yet.
  it('pushes instead of adopting when local edits are still unpushed', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');

    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['stale-remote'], 9000), updatedAt: 9000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULL_MIN_INTERVAL_MS + 50);
    });
    await resume();

    expect(entryIdsOf(result.current.state)).toEqual(['local-1', 'local-2']);
  });

  it('ignores the event when the app is going away rather than arriving', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    setup(docWith(['local-1'], 1000));
    await settle();
    expect(fetchRemoteState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULL_MIN_INTERVAL_MS + 50);
    });
    await resume(true);

    expect(fetchRemoteState).toHaveBeenCalledTimes(1);
  });

  // Tab switching on a desktop fires this constantly; one read per switch would
  // be a request every few seconds for no new information.
  it('does not re-read on every flip back to the foreground', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    setup(docWith(['local-1'], 1000));
    await settle();
    expect(fetchRemoteState).toHaveBeenCalledTimes(1);

    await resume();
    await resume();
    expect(fetchRemoteState).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PULL_MIN_INTERVAL_MS + 50);
    });
    await resume();
    expect(fetchRemoteState).toHaveBeenCalledTimes(2);
  });
});

describe('expired access session', () => {
  // Cloudflare Access answers an unauthenticated request with a login page that
  // arrives as a 200, so the old code recorded a successful write for it: flag
  // cleared, revision advanced, edit gone. On a phone whose app shell still
  // loads from the service worker cache, this is invisible — the app works and
  // nothing ever syncs.
  it('keeps the document unsynced and warns when a push hits the login page', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false, authRequired: true });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');
    expect(result.current.state.updatedAt).toBe(1000);
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'authRequired' }));
  });

  // Signing in again fixes it without reopening the app, so the retry stands.
  it('keeps retrying so a fresh sign-in lands the write', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false, authRequired: true });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(1);

    pushRemoteState.mockResolvedValue({ ok: true, newUpdatedAt: 3000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + 50);
    });

    expect(pushRemoteState).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.state.updatedAt).toBe(3000));
    expect(localStorage.getItem(PENDING_SYNC_KEY)).not.toBe('1');
  });

  it('warns only once while the session stays expired', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: false, authRequired: true });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + 50);
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1] + 50);
    });

    expect(pushRemoteState.mock.calls.length).toBeGreaterThan(2);
    const authWarnings = onNotify.mock.calls.filter(([event]) => event.kind === 'authRequired');
    expect(authWarnings).toHaveLength(1);
  });

  it('warns when the startup read hits the login page', async () => {
    fetchRemoteState.mockResolvedValue({ ok: false, authRequired: true, state: null, updatedAt: null });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'authRequired' }));
    // Nothing is adopted and nothing is pushed: the server was never reached.
    expect(entryIdsOf(result.current.state)).toEqual(['local-1']);
    expect(pushRemoteState).not.toHaveBeenCalled();
  });
});

describe('page lifecycle', () => {
  // iOS freezes a standalone web app the moment it is backgrounded, so a
  // debounce timer that has not fired yet never will. `pagehide` is the last
  // point at which the edit can still be sent.
  it('flushes a pending push on pagehide before the debounce elapses', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    expect(pushRemoteState).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });

    expect(pushRemoteState).toHaveBeenCalledTimes(1);
    expect(entryIdsOf(pushRemoteState.mock.calls[0][0])).toEqual(['local-1', 'local-2']);
    expect(pushRemoteState.mock.calls[0][1]).toMatchObject({ keepalive: true });
  });

  it('flushes a pending push when the tab is hidden', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    const { result } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));

    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    spy.mockRestore();

    expect(pushRemoteState).toHaveBeenCalledTimes(1);
  });

  it('does not push on pagehide when nothing is pending', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 });

    setup(docWith(['local-1'], 1000));
    await settle();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });

    expect(pushRemoteState).not.toHaveBeenCalled();
  });
});

describe('three-way device reconciliation', () => {
  function saveBase(state) {
    localStorage.setItem(LAST_SYNCED_STATE_KEY, JSON.stringify(state));
  }

  it('combines different transactions added on the phone and laptop', async () => {
    const base = docWith(['base'], 1000);
    saveBase(base);
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: docWith(['laptop', 'base'], 2000), updatedAt: 2000 });

    setup(docWith(['phone', 'base'], 1000));
    await settle();

    await waitFor(() => expect(pushRemoteState).toHaveBeenCalledTimes(1));
    expect(entryIdsOf(pushRemoteState.mock.calls[0][0])).toEqual(['phone', 'base', 'laptop']);
    expect(pushRemoteState.mock.calls[0][1]).toMatchObject({ ifMatch: 2000 });
  });

  it('keeps a same-field conflict on the phone instead of discarding it', async () => {
    const base = docWith(['base'], 1000);
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.wallets[0].entries[0].amount = 1200;
    remote.wallets[0].entries[0].amount = 1500;
    remote.updatedAt = 2000;
    saveBase(base);
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: remote, updatedAt: 2000 });

    const { result, onNotify } = setup(local);
    await settle();

    expect(result.current.state.wallets[0].entries[0].amount).toBe(1200);
    expect(pushRemoteState).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict', adopted: false }));
  });

  it('re-fetches and merges after If-Match reports a newer server revision', async () => {
    const base = docWith(['base'], 1000);
    saveBase(base);
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState
      .mockResolvedValueOnce({ ok: true, authRequired: false, state: base, updatedAt: 1000 })
      .mockResolvedValueOnce({ ok: true, authRequired: false, state: docWith(['laptop', 'base'], 2000), updatedAt: 2000 });
    pushRemoteState
      .mockResolvedValueOnce({ ok: false, conflict: true, current: 2000 })
      .mockResolvedValueOnce({ ok: true, newUpdatedAt: 3000 });

    setup(docWith(['phone', 'base'], 1000));
    await settle();

    await waitFor(() => expect(pushRemoteState).toHaveBeenCalledTimes(2));
    expect(entryIdsOf(pushRemoteState.mock.calls[1][0])).toEqual(['phone', 'base', 'laptop']);
    expect(pushRemoteState.mock.calls[1][1]).toMatchObject({ ifMatch: 2000 });
  });

  it('waits for the latest remote revision before uploading after reconnect', async () => {
    const base = docWith(['base'], 1000);
    saveBase(base);
    fetchRemoteState.mockResolvedValueOnce({ ok: true, authRequired: false, state: base, updatedAt: 1000 });
    const { result } = setup(base);
    await settle();

    pushRemoteState.mockClear();
    act(() => result.current.setState(docWith(['phone', 'base'], 1000)));
    let releaseFetch;
    fetchRemoteState.mockImplementationOnce(() => new Promise((resolve) => {
      releaseFetch = () => resolve({ ok: true, authRequired: false, state: docWith(['laptop', 'base'], 2000), updatedAt: 2000 });
    }));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(pushRemoteState).not.toHaveBeenCalled();

    await act(async () => {
      releaseFetch();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(pushRemoteState).toHaveBeenCalledTimes(1));
    expect(pushRemoteState.mock.calls[0][1]).toMatchObject({ ifMatch: 2000 });
  });

  it('makes manual Sync Now upload pending local additions', async () => {
    const base = docWith(['base'], 1000);
    saveBase(base);
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: base, updatedAt: 1000 });
    const { result } = setup(base);
    await settle();

    act(() => result.current.setState(docWith(['phone', 'base'], 1000)));
    pushRemoteState.mockClear();
    let synced;
    await act(async () => {
      synced = await result.current.sync.syncNow();
    });

    expect(synced).toBe(true);
    expect(pushRemoteState).toHaveBeenCalledTimes(1);
    expect(entryIdsOf(pushRemoteState.mock.calls[0][0])).toEqual(['phone', 'base']);
  });

  it('stores the confirmed snapshot and avoids a duplicate write on the next sync', async () => {
    const base = docWith(['base'], 1000);
    saveBase(base);
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: base, updatedAt: 1000 });
    pushRemoteState.mockResolvedValue({ ok: true, newUpdatedAt: 3000 });
    const { result } = setup(docWith(['phone', 'base'], 1000));
    await settle();

    await waitFor(() => expect(pushRemoteState).toHaveBeenCalledTimes(1));
    const confirmed = JSON.parse(localStorage.getItem(LAST_SYNCED_STATE_KEY));
    expect(entryIdsOf(confirmed)).toEqual(['phone', 'base']);
    expect(confirmed.updatedAt).toBe(3000);

    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: confirmed, updatedAt: 3000 });
    await act(async () => {
      await result.current.sync.syncNow();
    });
    expect(pushRemoteState).toHaveBeenCalledTimes(1);
  });

  it('recovers an untracked legacy phone edit when its revision still matches the server', async () => {
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: docWith(['base'], 1000), updatedAt: 1000 });

    setup(docWith(['phone', 'base'], 1000));
    await settle();

    await waitFor(() => expect(pushRemoteState).toHaveBeenCalledTimes(1));
    expect(entryIdsOf(pushRemoteState.mock.calls[0][0])).toEqual(['phone', 'base']);
    expect(pushRemoteState.mock.calls[0][1]).toMatchObject({ ifMatch: 1000 });
  });

  it('uploads a phone deletion when the laptop copy is unchanged', async () => {
    const base = docWith(['remove-me', 'keep'], 1000);
    saveBase(base);
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: base, updatedAt: 1000 });

    setup(docWith(['keep'], 1000));
    await settle();

    await waitFor(() => expect(pushRemoteState).toHaveBeenCalledTimes(1));
    expect(entryIdsOf(pushRemoteState.mock.calls[0][0])).toEqual(['keep']);
  });

  it('downloads a laptop deletion when the phone copy is unchanged', async () => {
    const base = docWith(['remove-me', 'keep'], 1000);
    saveBase(base);
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: docWith(['keep'], 2000), updatedAt: 2000 });

    const { result } = setup(base);
    await settle();

    await waitFor(() => expect(entryIdsOf(result.current.state)).toEqual(['keep']));
    expect(pushRemoteState).not.toHaveBeenCalled();
  });

  it('keeps a phone deletion pending when the laptop edited the same transaction', async () => {
    const base = docWith(['same'], 1000);
    const remote = docWith(['same'], 2000);
    remote.wallets[0].entries[0].note = '노트북 수정';
    saveBase(base);
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, authRequired: false, state: remote, updatedAt: 2000 });

    const { result, onNotify } = setup(docWith([], 1000));
    await settle();

    expect(entryIdsOf(result.current.state)).toEqual([]);
    expect(pushRemoteState).not.toHaveBeenCalled();
    expect(localStorage.getItem(PENDING_SYNC_KEY)).toBe('1');
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict' }));
  });
});
