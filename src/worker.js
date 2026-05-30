const KV_KEY = "state";
const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
const MAX_BODY_SIZE = 1024 * 1024; // 1 MiB - typical spending tracker state is < 100 KiB

function jsonResponse(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function handleStateApi(request, env) {
  if (request.method === "GET") {
    try {
      const value = await env.STATE_KV.get(KV_KEY);
      // TL decision: return "null" string + 200 for KV miss (option A).
      // Client already handles JSON.parse('null'). Single-user app, no need to change contract.
      return jsonResponse(value || "null");
    } catch (error) {
      return jsonResponse({ error: "storage failure" }, 500);
    }
  }
  if (request.method === "PUT") {
    // 1. Check Content-Length header first (no body read needed)
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_SIZE) {
      return jsonResponse({ error: "payload too large" }, 413);
    }

    const body = await request.text();

    // 2. Verify body size after read (when Content-Length absent/untrusted)
    if (body.length > MAX_BODY_SIZE) {
      return jsonResponse({ error: "payload too large" }, 413);
    }

    if (!body) return jsonResponse({ error: "missing body" }, 400);

    try {
      JSON.parse(body);
    } catch {
      return jsonResponse({ error: "invalid json" }, 400);
    }

    try {
      await env.STATE_KV.put(KV_KEY, body);
    } catch (error) {
      return jsonResponse({ error: "storage failure" }, 500);
    }

    return jsonResponse({ ok: true });
  }
  if (request.method === "DELETE") {
    try {
      await env.STATE_KV.delete(KV_KEY);
    } catch (error) {
      return jsonResponse({ error: "storage failure" }, 500);
    }
    return jsonResponse({ ok: true });
  }
  return new Response(null, { status: 405 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/state") {
      return handleStateApi(request, env);
    }

    try {
      return env.ASSETS.fetch(request);
    } catch (error) {
      return jsonResponse({ error: "asset fetch failed" }, 500);
    }
  },
};
