const KV_KEY = "state";
const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
const MAX_BODY_SIZE = 1024 * 1024; // 1 MiB - typical spending tracker state is < 100 KiB

function jsonResponse(body, status = 200, extraHeaders) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...(extraHeaders || {}) },
  });
}

// Extract updatedAt (epoch ms) from a stored state JSON string.
// Returns null when the stored value is null/non-object/missing updatedAt.
function extractUpdatedAt(rawJson) {
  if (!rawJson || rawJson === "null") return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === "object" && typeof parsed.updatedAt === "number") {
      return parsed.updatedAt;
    }
  } catch {
    return null;
  }
  return null;
}

async function handleStateApi(request, env) {
  if (request.method === "GET") {
    try {
      const value = await env.STATE_KV.get(KV_KEY);
      // TL decision: return "null" string + 200 for KV miss (option A).
      // Client already handles JSON.parse('null'). Single-user app, no need to change contract.
      const updatedAt = extractUpdatedAt(value);
      const extra = updatedAt !== null ? { ETag: String(updatedAt) } : undefined;
      return jsonResponse(value || "null", 200, extra);
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

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return jsonResponse({ error: "invalid json" }, 400);
    }

    // 3. Optimistic concurrency: If-Match validation (EUN-16 Tier 2)
    const ifMatchHeader = request.headers.get("if-match");
    if (ifMatchHeader && ifMatchHeader !== "*") {
      let current;
      try {
        current = await env.STATE_KV.get(KV_KEY);
      } catch (error) {
        return jsonResponse({ error: "storage failure" }, 500);
      }
      const currentUpdatedAt = extractUpdatedAt(current);
      if (String(currentUpdatedAt) !== ifMatchHeader) {
        return jsonResponse(
          { error: "version_mismatch", current: currentUpdatedAt },
          409,
        );
      }
    }

    // 4. Stamp updatedAt server-side if the payload is an object that lacks one.
    //    Primitives / arrays pass through unchanged (still last-write-wins).
    let bodyToStore = body;
    let newUpdatedAt = null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (typeof parsed.updatedAt !== "number") {
        const stamped = { ...parsed, updatedAt: Date.now() };
        bodyToStore = JSON.stringify(stamped);
        newUpdatedAt = stamped.updatedAt;
      } else {
        newUpdatedAt = parsed.updatedAt;
      }
    }

    try {
      await env.STATE_KV.put(KV_KEY, bodyToStore);
    } catch (error) {
      return jsonResponse({ error: "storage failure" }, 500);
    }

    const extra = newUpdatedAt !== null ? { ETag: String(newUpdatedAt) } : undefined;
    return jsonResponse({ ok: true }, 200, extra);
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
