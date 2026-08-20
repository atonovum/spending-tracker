import { describe, expect, it } from 'vitest';
import {
  decideInitialSync,
  decidePushOutcome,
  nextRetryDelay,
  PUSH_DEBOUNCE_MS,
  RETRY_DELAYS_MS,
} from './syncEngine.js';

/**
 * The sync engine is the seam that `cloudSync.js` (HTTP contract) and
 * `worker.js` (server contract) do not cover: both ends were correct while the
 * orchestration between them lost data. These tests pin the decisions.
 */
describe('decideInitialSync', () => {
  const base = {
    remoteFetchOk: true,
    remoteHasState: true,
    localDirty: false,
    localUpdatedAt: 1000,
    remoteUpdatedAt: 1000,
  };

  it('adopts remote when local is clean and not newer', () => {
    expect(decideInitialSync(base)).toEqual({ type: 'adopt', reason: 'remote-authoritative' });
  });

  it('adopts remote when remote is strictly newer', () => {
    expect(decideInitialSync({ ...base, remoteUpdatedAt: 5000 })).toEqual({
      type: 'adopt',
      reason: 'remote-authoritative',
    });
  });

  // The regression this whole module exists for. A push that failed leaves
  // local content ahead of the server while `updatedAt` still reads the last
  // adopted revision, so a timestamp comparison alone declares remote the
  // winner and the unpushed edit is overwritten on the next launch.
  it('pushes local when a previous push never landed, even though timestamps say remote is newer', () => {
    expect(
      decideInitialSync({ ...base, localDirty: true, localUpdatedAt: 1000, remoteUpdatedAt: 9999 })
    ).toEqual({ type: 'push', reason: 'local-dirty' });
  });

  it('pushes local when local is strictly newer', () => {
    expect(decideInitialSync({ ...base, localUpdatedAt: 5000 })).toEqual({
      type: 'push',
      reason: 'local-newer',
    });
  });

  it('seeds an empty server with the local document', () => {
    expect(decideInitialSync({ ...base, remoteHasState: false })).toEqual({
      type: 'push',
      reason: 'remote-empty',
    });
  });

  // An unreachable server is not an empty server. Pushing here would send
  // `If-Match: null` and clobber a revision we never read.
  it('does nothing when the remote could not be read', () => {
    expect(decideInitialSync({ ...base, remoteFetchOk: false })).toEqual({
      type: 'idle',
      reason: 'remote-unreachable',
    });
  });

  it('keeps unpushed local edits when the remote could not be read', () => {
    expect(decideInitialSync({ ...base, remoteFetchOk: false, localDirty: true })).toEqual({
      type: 'idle',
      reason: 'remote-unreachable',
    });
  });

  it('treats a missing local updatedAt as the oldest possible revision', () => {
    expect(decideInitialSync({ ...base, localUpdatedAt: undefined })).toEqual({
      type: 'adopt',
      reason: 'remote-authoritative',
    });
  });

  it('treats a missing remote updatedAt as the oldest possible revision', () => {
    expect(decideInitialSync({ ...base, remoteUpdatedAt: null })).toEqual({
      type: 'push',
      reason: 'local-newer',
    });
  });
});

describe('decidePushOutcome', () => {
  it('confirms with the server revision from the ETag', () => {
    expect(decidePushOutcome({ ok: true, newUpdatedAt: 4242 })).toEqual({
      type: 'confirmed',
      remoteRev: 4242,
    });
  });

  it('confirms with a null revision when the server sent no ETag', () => {
    expect(decidePushOutcome({ ok: true, newUpdatedAt: null })).toEqual({
      type: 'confirmed',
      remoteRev: null,
    });
  });

  it('reports a conflict for a 409', () => {
    expect(decidePushOutcome({ ok: false, conflict: true, current: 7 })).toEqual({
      type: 'conflict',
      remoteRev: 7,
    });
  });

  it('reports an oversized payload for a 413', () => {
    expect(decidePushOutcome({ ok: false, payloadTooLarge: true })).toEqual({ type: 'tooLarge' });
  });

  // Separate from a plain retry because this one is the user's to fix: the
  // Access session expired and no amount of retrying alone will land the write.
  it('reports an expired session for an auth wall', () => {
    expect(decidePushOutcome({ ok: false, authRequired: true })).toEqual({ type: 'authRequired' });
  });

  it('prefers the conflict verdict over the auth signal', () => {
    expect(decidePushOutcome({ ok: false, conflict: true, current: 3, authRequired: true })).toEqual({
      type: 'conflict',
      remoteRev: 3,
    });
  });

  // Everything else is transient by assumption: a phone loses its connection
  // far more often than a single-user server rejects a well-formed document.
  it('asks for a retry on any other failure', () => {
    expect(decidePushOutcome({ ok: false })).toEqual({ type: 'retry' });
  });
});

describe('nextRetryDelay', () => {
  it('backs off across attempts', () => {
    expect(nextRetryDelay(1)).toBe(RETRY_DELAYS_MS[0]);
    expect(nextRetryDelay(2)).toBe(RETRY_DELAYS_MS[1]);
    expect(nextRetryDelay(RETRY_DELAYS_MS.length)).toBe(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
  });

  it('clamps past the last step instead of growing without bound', () => {
    expect(nextRetryDelay(99)).toBe(RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
  });

  it('clamps a non-positive attempt to the first step', () => {
    expect(nextRetryDelay(0)).toBe(RETRY_DELAYS_MS[0]);
  });
});

describe('timing constants', () => {
  // The old 1500ms window was long enough that switching away from the app on
  // iOS routinely froze the page before the push fired.
  it('debounces pushes for under a second', () => {
    expect(PUSH_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
    expect(PUSH_DEBOUNCE_MS).toBeGreaterThan(0);
  });
});
