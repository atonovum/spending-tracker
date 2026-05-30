import { describe, it, expect, beforeEach, vi } from "vitest";
import worker from "./worker.js";

/**
 * Contract tests for src/worker.js /api/state endpoint
 *
 * NOTE: Using manual KV mocking as fallback due to vitest-pool-workers
 * configuration issues with Vitest 4.1.7 + vitest-pool-workers 0.16.10.
 * The poolMatchGlobs configuration isn't activating the workers pool.
 *
 * TODO: Revisit vitest-pool-workers integration when compatibility improves.
 * See vitest.workspace.js for attempted configuration.
 */

// Mock KV namespace with in-memory storage
class MockKVNamespace {
  constructor() {
    this.storage = new Map();
  }

  async get(key) {
    return this.storage.get(key) || null;
  }

  async put(key, value) {
    this.storage.set(key, value);
  }

  async delete(key) {
    this.storage.delete(key);
  }

  async list() {
    return {
      keys: Array.from(this.storage.keys()).map(name => ({ name })),
    };
  }
}

// Mock ASSETS binding
const mockAssets = {
  fetch: vi.fn(() => new Response('Mock ASSETS Response', { status: 200 })),
};

describe("Worker /api/state contract tests", () => {
  let env;

  beforeEach(() => {
    // Create fresh KV mock for each test
    env = {
      STATE_KV: new MockKVNamespace(),
      ASSETS: mockAssets,
    };
    mockAssets.fetch.mockClear();
  });

  describe("GET /api/state", () => {
    it("returns null string when KV is empty", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe('null');
    });

    it("returns exact stored bytes after PUT (round-trip)", async () => {
      const testData = { foo: "bar", nested: { value: 42 } };

      // PUT data
      const putRequest = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify(testData),
      });
      await worker.fetch(putRequest, env);

      // GET data
      const getRequest = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const response = await worker.fetch(getRequest, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");

      const retrieved = JSON.parse(await response.text());
      expect(retrieved).toEqual(testData);
    });

    it("returns 500 when KV get fails", async () => {
      // Make KV.get throw
      env.STATE_KV.get = vi.fn(() => {
        throw new Error("KV unavailable");
      });

      const request = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "storage failure" });
    });
  });

  describe("PUT /api/state", () => {
    it("accepts valid JSON and returns success", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify({ test: "data" }),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");

      const body = await response.json();
      expect(body).toEqual({ ok: true });
    });

    it("rejects empty body with 400", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: "",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "missing body" });
    });

    it("rejects non-JSON body with 400", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: "not json",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "invalid json" });
    });

    it("accepts JSON array", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify([1, 2, 3]),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ ok: true });

      // Verify stored
      const getRequest = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const getResponse = await worker.fetch(getRequest, env);
      const retrieved = await getResponse.json();
      expect(retrieved).toEqual([1, 2, 3]);
    });

    it("accepts JSON primitive", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify(42),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ ok: true });

      // Verify stored
      const getRequest = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const getResponse = await worker.fetch(getRequest, env);
      const retrieved = await getResponse.json();
      expect(retrieved).toBe(42);
    });

    it("accepts deeply nested JSON object", async () => {
      const complexData = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: true }],
              value: "deep",
            },
          },
        },
      };

      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify(complexData),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);

      // Verify stored
      const getRequest = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const getResponse = await worker.fetch(getRequest, env);
      const retrieved = await getResponse.json();
      expect(retrieved).toEqual(complexData);
    });

    it("rejects body > 1 MiB with 413", async () => {
      // 1.1 MiB body
      const largeBody = "x".repeat(1.1 * 1024 * 1024);

      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: largeBody,
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(413);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "payload too large" });
    });

    it("rejects oversized Content-Length header without reading body", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        headers: {
          "content-length": "9999999999",
        },
        body: '{"test": "small"}',
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(413);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "payload too large" });
    });

    it("returns 500 when KV put fails", async () => {
      // Make KV.put throw
      env.STATE_KV.put = vi.fn(() => {
        throw new Error("KV unavailable");
      });

      const request = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify({ test: "data" }),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "storage failure" });
    });
  });

  describe("DELETE /api/state", () => {
    it("returns success", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "DELETE",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");

      const body = await response.json();
      expect(body).toEqual({ ok: true });
    });

    it("after DELETE, GET returns null string", async () => {
      // PUT some data first
      const putRequest = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify({ test: "data" }),
      });
      await worker.fetch(putRequest, env);

      // DELETE
      const deleteRequest = new Request("http://localhost/api/state", {
        method: "DELETE",
      });
      await worker.fetch(deleteRequest, env);

      // GET should return null
      const getRequest = new Request("http://localhost/api/state", {
        method: "GET",
      });
      const response = await worker.fetch(getRequest, env);

      expect(await response.text()).toBe('null');
    });

    it("returns 500 when KV delete fails", async () => {
      // Make KV.delete throw
      env.STATE_KV.delete = vi.fn(() => {
        throw new Error("KV unavailable");
      });

      const request = new Request("http://localhost/api/state", {
        method: "DELETE",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "storage failure" });
    });
  });

  describe("Method matrix", () => {
    it("POST returns 405", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "POST",
        body: JSON.stringify({ test: "data" }),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe("");
    });

    it("PATCH returns 405", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "PATCH",
        body: JSON.stringify({ test: "data" }),
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe("");
    });

    it("OPTIONS returns 405", async () => {
      const request = new Request("http://localhost/api/state", {
        method: "OPTIONS",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(405);
      expect(await response.text()).toBe("");
    });
  });

  describe("Non /api/state routes", () => {
    it("GET / delegates to ASSETS", async () => {
      const request = new Request("http://localhost/", {
        method: "GET",
      });

      const response = await worker.fetch(request, env);

      expect(response).toBeDefined();
      expect(response instanceof Response).toBe(true);
      expect(mockAssets.fetch).toHaveBeenCalledWith(request);
    });

    it("GET /index.html delegates to ASSETS", async () => {
      const request = new Request("http://localhost/index.html", {
        method: "GET",
      });

      const response = await worker.fetch(request, env);

      expect(response).toBeDefined();
      expect(response instanceof Response).toBe(true);
      expect(mockAssets.fetch).toHaveBeenCalledWith(request);
    });

    it("returns 500 when ASSETS.fetch throws", async () => {
      // Make ASSETS.fetch throw
      mockAssets.fetch.mockImplementationOnce(() => {
        throw new Error("Asset not found");
      });

      const request = new Request("http://localhost/missing.html", {
        method: "GET",
      });
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "asset fetch failed" });
    });
  });

  describe("Regression guards", () => {
    it("uses 'state' as KV key", async () => {
      // PUT data
      const putRequest = new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify({ test: "value" }),
      });
      await worker.fetch(putRequest, env);

      // Check KV directly
      const keys = await env.STATE_KV.list();
      expect(keys.keys.length).toBe(1);
      expect(keys.keys[0].name).toBe("state");
    });

    it("JSON_HEADERS applied consistently to all JSON responses", async () => {
      const testCases = [
        { method: "GET", body: null },
        { method: "PUT", body: JSON.stringify({ test: "data" }) },
        { method: "DELETE", body: null },
        { method: "PUT", body: "" }, // 400 error case
        { method: "PUT", body: "invalid" }, // 400 error case
      ];

      for (const testCase of testCases) {
        const request = new Request("http://localhost/api/state", {
          method: testCase.method,
          body: testCase.body,
        });
        const response = await worker.fetch(request, env);

        expect(response.headers.get("content-type")).toBe("application/json");
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
    });
  });
});
