import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { fetchRemoteState, pushRemoteState } from "./cloudSync.js";

describe("cloudSync (Tier 2 contract, EUN-4)", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response) {
    globalThis.fetch = vi.fn(() => Promise.resolve(response));
  }

  /**
   * What Cloudflare Access actually returns to an unauthenticated request: a
   * 302 to the login page, which `fetch` follows, so the final response is a
   * 200 carrying HTML. `response.ok` is true — the trap this suite guards.
   */
  function accessLoginResponse({ redirected = true } = {}) {
    return {
      ok: true,
      status: 200,
      redirected,
      headers: new Headers({ "content-type": "text/html; charset=UTF-8" }),
      json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
      text: () => Promise.resolve("<html><body>login</body></html>"),
    };
  }

  function jsonResponse({ status = 200, body, etag } = {}) {
    const headers = new Headers({ "content-type": "application/json" });
    if (etag !== undefined) headers.set("etag", etag);
    return new Response(JSON.stringify(body), { status, headers });
  }

  describe("fetchRemoteState", () => {
    it("returns parsed state + updatedAt from ETag header", async () => {
      mockFetch(jsonResponse({ body: { foo: "bar" }, etag: "1717000000000" }));

      const result = await fetchRemoteState();
      expect(result).toEqual({
        ok: true,
        authRequired: false,
        state: { foo: "bar" },
        updatedAt: 1717000000000,
      });
    });

    it("returns updatedAt=null when ETag is absent", async () => {
      mockFetch(jsonResponse({ body: { foo: "bar" } }));

      const result = await fetchRemoteState();
      expect(result.state).toEqual({ foo: "bar" });
      expect(result.updatedAt).toBeNull();
    });

    it("returns ok=false on non-2xx response", async () => {
      mockFetch(jsonResponse({ status: 500, body: { error: "boom" } }));

      const result = await fetchRemoteState();
      expect(result).toEqual({ ok: false, authRequired: false, state: null, updatedAt: null });
    });

    it("returns ok=false on network failure", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline")));

      const result = await fetchRemoteState();
      expect(result).toEqual({ ok: false, authRequired: false, state: null, updatedAt: null });
    });

    // An expired Access session is not a missing document. Falling through on
    // the JSON parse error happened to give the right answer, but only by
    // accident — nothing said so, and the push path made the opposite guess.
    it("reports authRequired when the response is an auth redirect", async () => {
      mockFetch(accessLoginResponse());

      const result = await fetchRemoteState();

      expect(result).toEqual({ ok: false, authRequired: true, state: null, updatedAt: null });
    });

    it("reports authRequired when a 200 carries HTML instead of JSON", async () => {
      mockFetch(new Response("<html></html>", {
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
      }));

      const result = await fetchRemoteState();

      expect(result).toEqual({ ok: false, authRequired: true, state: null, updatedAt: null });
    });

    // The caller has to tell these two apart: an empty server should be seeded
    // with the local document, an unreachable one must be left untouched.
    it("separates an empty server (ok=true, state=null) from an unreachable one", async () => {
      mockFetch(jsonResponse({ body: null }));
      const empty = await fetchRemoteState();

      globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline")));
      const unreachable = await fetchRemoteState();

      expect(empty.state).toBeNull();
      expect(unreachable.state).toBeNull();
      expect(empty.ok).toBe(true);
      expect(unreachable.ok).toBe(false);
    });
  });

  describe("pushRemoteState", () => {
    it("returns { ok: true, newUpdatedAt } on success and reads ETag from response", async () => {
      mockFetch(jsonResponse({ body: { ok: true }, etag: "1717000001000" }));

      const result = await pushRemoteState(
        { foo: 1 },
        { ifMatch: 1717000000000 },
      );

      expect(result).toEqual({ ok: true, newUpdatedAt: 1717000001000 });
      const call = globalThis.fetch.mock.calls[0];
      expect(call[1].headers["if-match"]).toBe("1717000000000");
    });

    it("omits If-Match header when ifMatch is null/undefined", async () => {
      mockFetch(jsonResponse({ body: { ok: true }, etag: "100" }));

      await pushRemoteState({ foo: 1 });

      const call = globalThis.fetch.mock.calls[0];
      expect(call[1].headers["if-match"]).toBeUndefined();
    });

    it("returns conflict signal with current revision on 409", async () => {
      mockFetch(
        jsonResponse({
          status: 409,
          body: { error: "version_mismatch", current: 999 },
        }),
      );

      const result = await pushRemoteState({ foo: 1 }, { ifMatch: 100 });
      expect(result).toEqual({ ok: false, conflict: true, current: 999 });
    });

    it("returns conflict with current=null when 409 body has no current field", async () => {
      mockFetch(jsonResponse({ status: 409, body: { error: "version_mismatch" } }));

      const result = await pushRemoteState({ foo: 1 }, { ifMatch: 100 });
      expect(result).toEqual({ ok: false, conflict: true, current: null });
    });

    it("returns { ok: false } on other non-2xx without conflict flag", async () => {
      mockFetch(jsonResponse({ status: 500, body: { error: "boom" } }));

      const result = await pushRemoteState({ foo: 1 });
      expect(result).toEqual({ ok: false });
    });

    it("returns payloadTooLarge signal on 413", async () => {
      mockFetch(jsonResponse({ status: 413, body: { error: "payload too large" } }));

      const result = await pushRemoteState({ foo: 1 });
      expect(result).toEqual({ ok: false, payloadTooLarge: true });
    });

    // The defect this suite exists for. A login page is a 200, so every status
    // check below passed and the client recorded a write that never happened —
    // the flag cleared, the revision advanced, the edit gone.
    it("does not report success for an Access login page", async () => {
      mockFetch(accessLoginResponse());

      const result = await pushRemoteState({ a: 1 }, { ifMatch: 5 });

      expect(result.ok).toBe(false);
      expect(result.authRequired).toBe(true);
    });

    it("does not report success for a 200 that carries HTML instead of JSON", async () => {
      mockFetch(new Response("<html></html>", {
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
      }));

      const result = await pushRemoteState({ a: 1 });

      expect(result.ok).toBe(false);
      expect(result.authRequired).toBe(true);
    });

    // `keepalive` is what lets a flush on `pagehide` survive the page being
    // frozen on the way out; without it the request dies with the tab.
    it("passes keepalive through to fetch when asked", async () => {
      mockFetch(jsonResponse({ body: { ok: true }, etag: "5" }));

      await pushRemoteState({ a: 1 }, { keepalive: true });

      expect(globalThis.fetch.mock.calls[0][1]).toMatchObject({ keepalive: true });
    });

    it("defaults keepalive to false", async () => {
      mockFetch(jsonResponse({ body: { ok: true }, etag: "5" }));

      await pushRemoteState({ a: 1 });

      expect(globalThis.fetch.mock.calls[0][1]).toMatchObject({ keepalive: false });
    });

    it("returns { ok: false } on network error", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline")));

      const result = await pushRemoteState({ foo: 1 });
      expect(result).toEqual({ ok: false });
    });
  });
});
