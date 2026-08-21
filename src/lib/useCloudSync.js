import { useCallback, useEffect, useRef, useState } from "react";

import { fetchRemoteState, pushRemoteState } from "./cloudSync.js";
import { materializeState } from "./schedules.js";
import {
  applySampleSeed,
  loadLastSyncedState,
  loadPendingSync,
  normalizeState,
  saveLastSyncedState,
  savePendingSync,
  SAMPLE_SEED_ENABLED,
} from "./storage.js";
import { reconcileDocuments, sameDocumentContent, threeWayMerge } from "./syncMerge.js";
import {
  decidePushOutcome,
  nextRetryDelay,
  PULL_MIN_INTERVAL_MS,
  PUSH_DEBOUNCE_MS,
} from "./syncEngine.js";

export function useCloudSync({ state, setState, onNotify }) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const [bookkeeping] = useState(() => {
    const storedBase = loadLastSyncedState();
    return {
      base: storedBase ? normalizeState(applySampleSeed(storedBase)) : null,
      pending: loadPendingSync(),
    };
  });
  const baseRef = useRef(bookkeeping.base);
  const remoteRevRef = useRef(revisionOf(bookkeeping.base));
  const dirtyRef = useRef(bookkeeping.pending);
  const internalStateRef = useRef(state);
  const authNotifiedRef = useRef(false);
  const attemptRef = useRef(0);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const lastPullRef = useRef(0);
  const syncPromiseRef = useRef(null);
  const syncRef = useRef(null);
  const flushRef = useRef(null);
  const [pendingSync, setPendingSync] = useState(bookkeeping.pending);

  const markDirty = useCallback((value) => {
    dirtyRef.current = value;
    savePendingSync(value);
    setPendingSync(value);
  }, []);

  const rememberBase = useCallback((next) => {
    baseRef.current = next;
    remoteRevRef.current = revisionOf(next);
    saveLastSyncedState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleSync = useCallback((delay) => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (syncRef.current) syncRef.current({ force: true });
    }, delay);
  }, [clearTimer]);

  const notify = useCallback((event) => {
    if (onNotifyRef.current) onNotifyRef.current(event);
  }, []);

  const scheduleRetry = useCallback(() => {
    attemptRef.current += 1;
    markDirty(true);
    scheduleSync(nextRetryDelay(attemptRef.current));
  }, [markDirty, scheduleSync]);

  const handleFetchFailure = useCallback((remote) => {
    if (remote.authRequired && !authNotifiedRef.current) {
      authNotifiedRef.current = true;
      notify({ kind: "authRequired" });
    }
    if (dirtyRef.current) scheduleRetry();
    return false;
  }, [notify, scheduleRetry]);

  const handlePushFailure = useCallback((result) => {
    const outcome = decidePushOutcome(result);
    if (outcome.type === "tooLarge") {
      attemptRef.current = 0;
      markDirty(true);
      notify({ kind: "tooLarge" });
      return false;
    }
    if (outcome.type === "authRequired") {
      if (!authNotifiedRef.current) {
        authNotifiedRef.current = true;
        notify({ kind: "authRequired" });
      }
      scheduleRetry();
      return false;
    }
    scheduleRetry();
    return false;
  }, [markDirty, notify, scheduleRetry]);

  const applyAdopted = useCallback((serverState, nextState, observedLocal) => {
    attemptRef.current = 0;
    authNotifiedRef.current = false;
    if (stateRef.current !== observedLocal) {
      const rebased = threeWayMerge(
        normalizeState(applySampleSeed(observedLocal)),
        normalizeState(applySampleSeed(stateRef.current)),
        nextState,
      );
      if (!rebased.ok) {
        markDirty(true);
        notify({ kind: "conflict", adopted: false, conflicts: rebased.conflicts });
        return false;
      }
      rememberBase(serverState);
      internalStateRef.current = rebased.state;
      setState(rebased.state);
      markDirty(true);
      scheduleSync(PUSH_DEBOUNCE_MS);
      return true;
    }
    rememberBase(serverState);
    if (sameDocumentContent(nextState, observedLocal) && revisionOf(nextState) === revisionOf(observedLocal)) {
      markDirty(false);
      return true;
    }
    const materialized = materializeState(nextState);
    const needsPush = !sameDocumentContent(materialized, serverState);
    internalStateRef.current = materialized;
    setState(materialized);
    markDirty(needsPush);
    if (needsPush) scheduleSync(PUSH_DEBOUNCE_MS);
    return true;
  }, [markDirty, notify, rememberBase, scheduleSync, setState]);

  const applyConfirmed = useCallback((snapshot, observedLocal, normalizedLocal, result) => {
    const revision = typeof result.newUpdatedAt === "number" ? result.newUpdatedAt : snapshot.updatedAt;
    const confirmed = { ...snapshot, updatedAt: revision };
    rememberBase(confirmed);
    attemptRef.current = 0;
    authNotifiedRef.current = false;

    const current = stateRef.current;
    if (current !== observedLocal) {
      const rebased = threeWayMerge(
        normalizedLocal,
        normalizeState(applySampleSeed(current)),
        confirmed,
      );
      if (!rebased.ok) {
        markDirty(true);
        notify({ kind: "conflict", adopted: false, conflicts: rebased.conflicts });
        return false;
      }
      internalStateRef.current = rebased.state;
      setState(rebased.state);
      markDirty(true);
      scheduleSync(PUSH_DEBOUNCE_MS);
      return true;
    }

    internalStateRef.current = confirmed;
    setState(confirmed);
    markDirty(false);
    return true;
  }, [markDirty, notify, rememberBase, scheduleSync, setState]);

  const performSync = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastPullRef.current < PULL_MIN_INTERVAL_MS) return true;
    if (syncPromiseRef.current) return syncPromiseRef.current;

    const operation = (async () => {
      lastPullRef.current = now;
      let remote = await fetchRemoteState();
      if (!mountedRef.current) return false;
      if (!remote.ok) return handleFetchFailure(remote);

      for (let round = 0; round < 2; round += 1) {
        const observedLocal = stateRef.current;
        const normalizedLocal = normalizeState(applySampleSeed(observedLocal));
        const serverState = remote.state
          ? { ...normalizeState(applySampleSeed(remote.state)), updatedAt: remote.updatedAt ?? remote.state.updatedAt ?? 0 }
          : null;
        remoteRevRef.current = remote.updatedAt;
        const decision = reconcileDocuments({
          base: baseRef.current,
          local: normalizedLocal,
          remote: serverState,
          localDirty: dirtyRef.current,
        });

        if (decision.type === "conflict") {
          markDirty(true);
          notify({ kind: "conflict", adopted: false, conflicts: decision.conflicts });
          return false;
        }
        if (decision.type === "adopt") {
          return applyAdopted(serverState, decision.state, observedLocal);
        }

        markDirty(true);
        const snapshot = { ...decision.state, updatedAt: Date.now() };
        const result = await pushRemoteState(snapshot, { ifMatch: remote.updatedAt, keepalive: false });
        if (result.ok) return applyConfirmed(snapshot, observedLocal, normalizedLocal, result);
        if (result.conflict && round === 0) {
          remote = await fetchRemoteState();
          if (!remote.ok) {
            notify({ kind: "conflict", adopted: false, conflicts: ["document"] });
            return handleFetchFailure(remote);
          }
          continue;
        }
        if (result.conflict) {
          markDirty(true);
          notify({ kind: "conflict", adopted: false, conflicts: ["document"] });
          return false;
        }
        return handlePushFailure(result);
      }
      return false;
    })();

    syncPromiseRef.current = operation;
    try {
      return await operation;
    } finally {
      if (syncPromiseRef.current === operation) syncPromiseRef.current = null;
    }
  }, [applyAdopted, applyConfirmed, handleFetchFailure, handlePushFailure, markDirty, notify]);

  const flushPending = useCallback(async () => {
    if (!dirtyRef.current || syncPromiseRef.current) return false;
    const revision = remoteRevRef.current;
    if (revision === null) return false;
    const observedLocal = stateRef.current;
    const normalizedLocal = normalizeState(applySampleSeed(observedLocal));
    const snapshot = { ...normalizedLocal, updatedAt: Date.now() };
    const result = await pushRemoteState(snapshot, { ifMatch: revision, keepalive: true });
    if (result.ok) return applyConfirmed(snapshot, observedLocal, normalizedLocal, result);
    if (result.conflict) {
      markDirty(true);
      return false;
    }
    return handlePushFailure(result);
  }, [applyConfirmed, handlePushFailure, markDirty]);

  syncRef.current = performSync;
  flushRef.current = flushPending;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (SAMPLE_SEED_ENABLED && !revisionIsSet(stateRef.current?.updatedAt) && !dirtyRef.current) return;
    performSync({ force: true });
  }, [performSync]);

  useEffect(() => {
    if (internalStateRef.current === state) {
      internalStateRef.current = null;
      return undefined;
    }
    markDirty(true);
    attemptRef.current = 0;
    scheduleSync(PUSH_DEBOUNCE_MS);
    return clearTimer;
  }, [state, clearTimer, markDirty, scheduleSync]);

  useEffect(() => {
    const flushNow = () => {
      if (!dirtyRef.current) return;
      clearTimer();
      if (flushRef.current) flushRef.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
      else if (syncRef.current) syncRef.current();
    };
    const onPageShow = (event) => {
      if (event.persisted && syncRef.current) syncRef.current();
    };
    const onOnline = () => {
      attemptRef.current = 0;
      if (syncRef.current) syncRef.current({ force: true });
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
  }, [clearTimer]);

  const syncNow = useCallback(() => {
    authNotifiedRef.current = false;
    return performSync({ force: true });
  }, [performSync]);
  return { pendingSync, syncNow };
}

function revisionOf(state) {
  return typeof state?.updatedAt === "number" && Number.isFinite(state.updatedAt) ? state.updatedAt : null;
}

function revisionIsSet(value) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}
