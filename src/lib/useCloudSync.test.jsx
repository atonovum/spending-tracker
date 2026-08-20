/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchRemoteState, pushRemoteState } from './cloudSync.js';
import { PENDING_SYNC_KEY } from './finance.js';
import { useCloudSync } from './useCloudSync.js';
import { PUSH_DEBOUNCE_MS, RETRY_DELAYS_MS } from './syncEngine.js';

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
    useCloudSync({ state, setState, onNotify });
    return { state, setState };
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
  fetchRemoteState.mockResolvedValue({ ok: true, state: null, updatedAt: null });
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
  it('keeps unpushed local edits instead of adopting a stale remote', async () => {
    localStorage.setItem(PENDING_SYNC_KEY, '1');
    fetchRemoteState.mockResolvedValue({ ok: true, state: docWith(['stale-remote'], 9999), updatedAt: 9999 });

    const { result } = setup(docWith(['unpushed-local'], 1000));
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(entryIdsOf(result.current.state)).toEqual(['unpushed-local']);
    expect(pushRemoteState).toHaveBeenCalledTimes(1);
    expect(entryIdsOf(pushRemoteState.mock.calls[0][0])).toEqual(['unpushed-local']);
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
    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    expect(result.current.state.updatedAt).not.toBe(7777);
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

  it('adopts the server document and notifies on a conflict', async () => {
    fetchRemoteState
      .mockResolvedValueOnce({ ok: true, state: docWith(['local-1'], 1000), updatedAt: 1000 })
      .mockResolvedValue({ ok: true, state: docWith(['other-device'], 8000), updatedAt: 8000 });
    pushRemoteState.mockResolvedValue({ ok: false, conflict: true, current: 8000 });

    const { result, onNotify } = setup(docWith(['local-1'], 1000));
    await settle();

    act(() => result.current.setState(docWith(['local-1', 'local-2'], 1000)));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 50);
    });

    await waitFor(() => expect(entryIdsOf(result.current.state)).toEqual(['other-device']));
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict' }));
    expect(localStorage.getItem(PENDING_SYNC_KEY)).not.toBe('1');
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
