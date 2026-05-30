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

    it("returns state=null on non-2xx response", async () => {
      mockFetch(jsonResponse({ status: 500, body: { error: "boom" } }));

      const result = await fetchRemoteState();
      expect(result).toEqual({ state: null, updatedAt: null });
    });

    it("returns state=null on network failure", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline")));

      const result = await fetchRemoteState();
      expect(result).toEqual({ state: null, updatedAt: null });
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

    it("returns { ok: false } on network error", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline")));

      const result = await pushRemoteState({ foo: 1 });
      expect(result).toEqual({ ok: false });
    });
  });
});
