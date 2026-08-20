const API_URL = "/api/state";

/**
 * Fetch remote state with its server-side version.
 *
 * @returns {Promise<{ ok: boolean, state: unknown, updatedAt: number | null }>}
 *   - `ok` is whether the server actually answered. It exists because the two
 *     situations that used to collapse into `state: null` need opposite
 *     handling: an *empty* server should be seeded with the local document,
 *     while an *unreachable* one must be left alone — pushing to it would send
 *     no `If-Match` and overwrite a revision the client never read.
 *   - `state` is the parsed JSON payload, or `null` if KV is empty / fetch failed.
 *   - `updatedAt` is the server's current revision (parsed from the `ETag`
 *     response header). `null` when the server has no state yet.
 */
export async function fetchRemoteState() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) return { ok: false, state: null, updatedAt: null };
    const data = await response.json();
    const etag = response.headers.get("etag");
    const updatedAt = etag !== null && etag !== "" ? Number(etag) : null;
    return {
      ok: true,
      state: data && typeof data === "object" ? data : null,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    };
  } catch {
    return { ok: false, state: null, updatedAt: null };
  }
}

/**
 * Push local state with optimistic-concurrency control (EUN-16 Tier 2).
 *
 * @param {object} state - State payload to PUT.
 * @param {{ ifMatch?: number | null, keepalive?: boolean }} [options]
 *   - When `ifMatch` is a number, the server enforces `If-Match` and rejects
 *     the write with 409 if the stored revision does not match.
 *   - Omit (or pass `null`) for the first write against an empty KV.
 *   - `keepalive` lets the request outlive the page. It is what makes a flush
 *     on `pagehide` reach the server at all: iOS freezes a backgrounded web
 *     app, and an ordinary fetch started on the way out is dropped with it.
 *     `sendBeacon` is not an option here — it cannot set `If-Match`.
 *
 * @returns {Promise<
 *   | { ok: true, newUpdatedAt: number | null }
 *   | { ok: false, conflict: true, current: number | null }
 *   | { ok: false, payloadTooLarge: true }
 *   | { ok: false }
 * >}
 */
export async function pushRemoteState(state, options) {
  const ifMatch = options && options.ifMatch;
  const keepalive = Boolean(options && options.keepalive);
  const headers = { "content-type": "application/json" };
  if (typeof ifMatch === "number" && Number.isFinite(ifMatch)) {
    headers["if-match"] = String(ifMatch);
  }
  try {
    const response = await fetch(API_URL, {
      method: "PUT",
      headers,
      body: JSON.stringify(state),
      keepalive,
    });
    if (response.status === 409) {
      let current = null;
      try {
        const body = await response.json();
        if (body && typeof body.current === "number") current = body.current;
      } catch {
        // ignore parse failure; conflict is still signalled
      }
      return { ok: false, conflict: true, current };
    }
    if (response.status === 413) return { ok: false, payloadTooLarge: true };
    if (!response.ok) return { ok: false };
    const etag = response.headers.get("etag");
    const newUpdatedAt = etag !== null && etag !== "" ? Number(etag) : null;
    return {
      ok: true,
      newUpdatedAt: Number.isFinite(newUpdatedAt) ? newUpdatedAt : null,
    };
  } catch {
    return { ok: false };
  }
}
