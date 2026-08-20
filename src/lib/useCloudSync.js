import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRemoteState, pushRemoteState } from "./cloudSync.js";
import { materializeState } from "./schedules.js";
import {
  applySampleSeed,
  loadPendingSync,
  normalizeState,
  savePendingSync,
  SAMPLE_SEED_ENABLED,
} from "./storage.js";
import {
  decideInitialSync,
  decidePushOutcome,
  nextRetryDelay,
  PULL_MIN_INTERVAL_MS,
  PUSH_DEBOUNCE_MS,
} from "./syncEngine.js";

/**
 * Keep the local document and the Worker's KV copy in step.
 *
 * Lives outside `App.jsx` on purpose. It used to be two `useEffect` blocks in a
 * 2500-line component that coverage excludes, which is exactly where the data
 * loss hid: every push failure — a frozen tab, a dropped connection — left the
 * edit on the device only, and the next launch adopted the stale server copy
 * over it. Here the same loop can be driven directly by tests.
 *
 * Three things keep an edit alive now:
 *   1. a persisted "push still owed" flag, which outranks any revision
 *      comparison on the next load (see `decideInitialSync`);
 *   2. a `pagehide` / `visibilitychange` flush, because iOS freezes a
 *      backgrounded web app before a debounce timer can fire;
 *   3. backoff retries plus an `online` retry, so a failure is temporary
 *      rather than final.
 *
 * and one thing keeps the screen honest: the server is re-read every time the
 * app returns to the foreground, not only when it mounts. A home-screen web
 * app on iOS is *resumed*, not reloaded — the frozen page thaws with its React
 * tree intact — so a mount-only read would show whatever the document held
 * days ago, however many times the user reopened it.
 *
 * @param {object} input
 * @param {object} input.state the live document.
 * @param {(next: object) => void} input.setState React setter for it.
 * @param {(event: { kind: "conflict"|"tooLarge"|"authRequired" }) => void} [input.onNotify]
 *   called for the two outcomes the user has to be told about. Message text is
 *   the caller's job — this module holds no translations.
 * @returns {{ pendingSync: boolean, syncNow: () => Promise<void> }}
 *   `pendingSync` is whether a push is still owed; `syncNow` re-reads the
 *   server on demand, for the case where the user does not want to background
 *   the app to find out what another device wrote.
 */
export function useCloudSync({ state, setState, onNotify }) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  // Last server revision this client knows about; sent as `If-Match`.
  // null = the server has no state yet, so no precondition applies.
  const remoteRevRef = useRef(null);
  // Set when the next `state` change was caused by this module adopting a
  // server document (or stamping a confirmed revision), so it must not bounce
  // straight back as a push.
  const skipNextPushRef = useRef(true);
  const dirtyRef = useRef(false);
  const attemptRef = useRef(0);
  // One warning per expired session, not one per retry. Cleared on the next
  // push that actually reaches the Worker.
  const authNotifiedRef = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastPullRef = useRef(0);
  const [pendingSync, setPendingSync] = useState(false);

  // Read once, on the client only: `loadPendingSync` touches localStorage.
  const [initialised] = useState(() => {
    const pending = loadPendingSync();
    dirtyRef.current = pending;
    return pending;
  });
  useEffect(() => {
    setPendingSync(initialised);
  }, [initialised]);

  const markDirty = useCallback((value) => {
    dirtyRef.current = value;
    savePendingSync(value);
    setPendingSync(value);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runPushRef = useRef(null);

  const schedulePush = useCallback(
    (delay) => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (runPushRef.current) runPushRef.current({});
      }, delay);
    },
    [clearTimer]
  );

  const runPush = useCallback(
    async ({ keepalive = false } = {}) => {
      // One request at a time: a second push racing the first would send a
      // stale `If-Match` and manufacture a conflict out of nothing.
      if (inFlightRef.current) return;
      const snapshot = stateRef.current;
      const stamped = { ...snapshot, updatedAt: Date.now() };
      inFlightRef.current = true;
      let result;
      try {
        result = await pushRemoteState(stamped, {
          ifMatch: remoteRevRef.current,
          keepalive,
        });
      } finally {
        inFlightRef.current = false;
      }

      const outcome = decidePushOutcome(result);

      if (outcome.type === "confirmed") {
        remoteRevRef.current = outcome.remoteRev ?? stamped.updatedAt;
        attemptRef.current = 0;
        authNotifiedRef.current = false;
        if (stateRef.current !== snapshot) {
          // The document moved while the request was in flight, so what the
          // server now holds is already behind. Stay dirty and send again.
          schedulePush(PUSH_DEBOUNCE_MS);
          return;
        }
        markDirty(false);
        // Writing the confirmed revision back is what makes the next launch
        // compare like with like. Without it the local copy keeps whichever
        // revision it last adopted and loses every subsequent comparison.
        skipNextPushRef.current = true;
        setState({ ...snapshot, updatedAt: remoteRevRef.current });
        return;
      }

      if (outcome.type === "conflict") {
        // Another device holds a newer revision. Documented as a visible loss:
        // the local unpushed edit goes, but the user is told.
        const refetched = await fetchRemoteState();
        remoteRevRef.current = refetched.ok ? refetched.updatedAt : outcome.remoteRev;
        attemptRef.current = 0;
        if (refetched.ok && refetched.state) {
          markDirty(false);
          skipNextPushRef.current = true;
          setState(materializeState(normalizeState(applySampleSeed(refetched.state))));
        }
        if (onNotifyRef.current) onNotifyRef.current({ kind: "conflict" });
        return;
      }

      if (outcome.type === "tooLarge") {
        // The payload will not shrink by itself, so retrying it forever would
        // only drain the battery. The document stays flagged as unsynced.
        attemptRef.current = 0;
        markDirty(true);
        if (onNotifyRef.current) onNotifyRef.current({ kind: "tooLarge" });
        return;
      }

      if (outcome.type === "authRequired") {
        // The login page comes back as a 200, so this used to read as a
        // successful write. The document stays flagged, and the retry stands:
        // signing in again lands it without reopening the app.
        if (!authNotifiedRef.current && onNotifyRef.current) {
          authNotifiedRef.current = true;
          onNotifyRef.current({ kind: "authRequired" });
        }
        attemptRef.current += 1;
        markDirty(true);
        schedulePush(nextRetryDelay(attemptRef.current));
        return;
      }

      attemptRef.current += 1;
      markDirty(true);
      schedulePush(nextRetryDelay(attemptRef.current));
    },
    [markDirty, schedulePush, setState]
  );

  runPushRef.current = runPush;

  /**
   * Read the server and decide who wins.
   *
   * Runs on mount and again on every return to the foreground. `force` is for
   * the mount call, which must not be swallowed by the interval floor.
   */
  const pullFromRemote = useCallback(
    async ({ force = false } = {}) => {
      // A push in flight owns the conversation: reading now would race its
      // `If-Match` and could adopt a document that is about to be superseded.
      if (inFlightRef.current) return;
      const now = Date.now();
      if (!force && now - lastPullRef.current < PULL_MIN_INTERVAL_MS) return;
      lastPullRef.current = now;

      const localUpdatedAt = stateRef.current?.updatedAt;
      const remote = await fetchRemoteState();
      if (!mountedRef.current) return;

      if (remote.ok) remoteRevRef.current = remote.updatedAt;
      if (remote.authRequired && !authNotifiedRef.current && onNotifyRef.current) {
        authNotifiedRef.current = true;
        onNotifyRef.current({ kind: "authRequired" });
      }

      const decision = decideInitialSync({
        remoteFetchOk: remote.ok,
        remoteHasState: Boolean(remote.state),
        localDirty: dirtyRef.current,
        localUpdatedAt,
        remoteUpdatedAt: remote.updatedAt,
      });

      if (decision.type === "adopt") {
        markDirty(false);
        skipNextPushRef.current = true;
        // Dev: re-seed samples on top of the adopted document too, or a KV
        // round-trip brings the sample wallets back at their old dates.
        setState(materializeState(normalizeState(applySampleSeed(remote.state))));
        return;
      }
      if (decision.type === "push") {
        // Resuming with unpushed edits is the same situation as launching with
        // them: local wins, and this is the moment to try sending it again.
        markDirty(true);
        schedulePush(0);
      }
    },
    [markDirty, schedulePush, setState]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Startup: the app takes ownership of a document here.
  useEffect(() => {
    // Dev seed guard: a freshly seeded sample document (updatedAt 0) must not
    // be replaced by whatever an old KV happens to hold.
    if (SAMPLE_SEED_ENABLED && !revisionIsSet(stateRef.current?.updatedAt) && !dirtyRef.current) {
      return;
    }
    pullFromRemote({ force: true });
    // Runs once; later reads come from the foreground handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every local edit owes a push.
  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return undefined;
    }
    markDirty(true);
    attemptRef.current = 0;
    schedulePush(PUSH_DEBOUNCE_MS);
    return () => {
      clearTimer();
    };
  }, [state, clearTimer, markDirty, schedulePush]);

  // Last chance to send. iOS freezes a backgrounded standalone app, so a timer
  // still counting down at that point never fires — and the effect cleanup
  // above would have cancelled it anyway.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const flushNow = () => {
      if (!dirtyRef.current) return;
      clearTimer();
      runPush({ keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushNow();
        return;
      }
      // Coming back: whatever another device wrote while this one slept is the
      // reason the screen may be stale.
      pullFromRemote();
    };
    const onPageShow = (event) => {
      // Safari restores a page from bfcache without remounting anything.
      if (event.persisted) pullFromRemote();
    };
    const onOnline = () => {
      pullFromRemote();
      if (!dirtyRef.current) return;
      attemptRef.current = 0;
      schedulePush(0);
    };

    window.addEventListener("pagehide", flushNow);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clearTimer, pullFromRemote, runPush, schedulePush]);

  const syncNow = useCallback(() => pullFromRemote({ force: true }), [pullFromRemote]);

  return { pendingSync, syncNow };
}

function revisionIsSet(value) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}
