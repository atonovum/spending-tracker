/**
 * Decisions for the KV sync loop, kept as pure functions.
 *
 * `cloudSync.js` covers the HTTP contract and `worker.js` covers the server
 * contract, and both were correct while data was still being lost — the defect
 * lived in the orchestration between them, inside a `useEffect` that nothing
 * could test. This module is that orchestration's judgement, extracted so it
 * can be pinned by tests; `useCloudSync.js` supplies the I/O around it.
 */

/**
 * How long to wait after an edit before pushing.
 *
 * The previous 1500ms was long enough to lose routinely: switching away from a
 * standalone web app on iOS freezes the page immediately, so a timer that has
 * not fired yet never does. Shorter is safer, and `pagehide` catches whatever
 * is still in the window.
 */
export const PUSH_DEBOUNCE_MS = 800;

/** Backoff schedule for a push that failed for a transient-looking reason. */
export const RETRY_DELAYS_MS = [2000, 5000, 15000, 60000];

/**
 * @param {number} attempt 1-based retry number.
 * @returns {number} delay in ms, clamped to the last step.
 */
export function nextRetryDelay(attempt) {
  const index = Math.min(Math.max(Math.floor(attempt) - 1, 0), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

function revisionOf(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * What to do with the local document once the server has been read at startup.
 *
 * The rule that matters is `localDirty`, and it is checked before any timestamp
 * comparison. `state.updatedAt` only moves forward when a push is *confirmed*,
 * so a device holding an edit that never reached the server carries the
 * server's own old revision — comparing revisions alone declares the stale
 * server the winner and overwrites the edit. The flag is the only honest
 * record that local is ahead.
 *
 * @param {object} input
 * @param {boolean} input.remoteFetchOk did the server answer at all.
 * @param {boolean} input.remoteHasState does the server hold a document.
 * @param {boolean} input.localDirty is a push still owed from this device.
 * @param {number|null|undefined} input.localUpdatedAt local revision.
 * @param {number|null|undefined} input.remoteUpdatedAt server revision.
 * @returns {{ type: "idle"|"adopt"|"push", reason: string }}
 */
export function decideInitialSync({
  remoteFetchOk,
  remoteHasState,
  localDirty,
  localUpdatedAt,
  remoteUpdatedAt,
}) {
  // An unreachable server is not an empty one. Touching either side here would
  // be guessing: adopting would discard local, pushing would send no `If-Match`
  // and clobber a revision that was never read.
  if (!remoteFetchOk) return { type: "idle", reason: "remote-unreachable" };
  if (localDirty) return { type: "push", reason: "local-dirty" };
  // Nothing on the server to lose, so seeding it is free.
  if (!remoteHasState) return { type: "push", reason: "remote-empty" };
  if (revisionOf(localUpdatedAt) > revisionOf(remoteUpdatedAt)) {
    return { type: "push", reason: "local-newer" };
  }
  return { type: "adopt", reason: "remote-authoritative" };
}

/**
 * Map a `pushRemoteState` result onto the action the caller must take.
 *
 * Anything that is not a recognised server verdict is treated as transient: a
 * phone loses its connection far more often than a single-user server rejects
 * a well-formed document, and the cost of a wrong guess is one wasted retry
 * against the cost of a silently dropped edit.
 *
 * @param {object} result as returned by `pushRemoteState`.
 * @returns {{ type: "confirmed"|"conflict"|"tooLarge"|"retry", remoteRev?: number|null }}
 */
export function decidePushOutcome(result) {
  if (result && result.ok) {
    const rev = result.newUpdatedAt;
    return { type: "confirmed", remoteRev: typeof rev === "number" ? rev : null };
  }
  if (result && result.conflict) {
    const current = result.current;
    return { type: "conflict", remoteRev: typeof current === "number" ? current : null };
  }
  if (result && result.payloadTooLarge) return { type: "tooLarge" };
  // Kept apart from "retry" because this failure has an owner: the Access
  // session expired, so the request never reached the Worker at all. Retrying
  // still makes sense (signing in fixes it without reopening the app), but the
  // user has to be told, and the document must stay marked unsynced.
  if (result && result.authRequired) return { type: "authRequired" };
  return { type: "retry" };
}
