const KV_KEY = "state";
const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function jsonResponse(body, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function handleStateApi(request, env) {
  if (request.method === "GET") {
    const value = await env.STATE_KV.get(KV_KEY);
    return jsonResponse(value || "null");
  }
  if (request.method === "PUT") {
    const body = await request.text();
    if (!body) return jsonResponse({ error: "missing body" }, 400);
    try {
      JSON.parse(body);
    } catch {
      return jsonResponse({ error: "invalid json" }, 400);
    }
    await env.STATE_KV.put(KV_KEY, body);
    return jsonResponse({ ok: true });
  }
  if (request.method === "DELETE") {
    await env.STATE_KV.delete(KV_KEY);
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

    return env.ASSETS.fetch(request);
  },
};
