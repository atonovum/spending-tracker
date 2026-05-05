const KV_KEY = "state";
const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

function jsonResponse(body, init = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: JSON_HEADERS,
    ...init,
  });
}

export async function onRequestGet({ env }) {
  const value = await env.STATE_KV.get(KV_KEY);
  return jsonResponse(value || "null");
}

export async function onRequestPut({ request, env }) {
  const body = await request.text();
  if (!body) return jsonResponse({ error: "missing body" }, { status: 400 });
  try {
    JSON.parse(body);
  } catch {
    return jsonResponse({ error: "invalid json" }, { status: 400 });
  }
  await env.STATE_KV.put(KV_KEY, body);
  return jsonResponse({ ok: true });
}

export async function onRequestDelete({ env }) {
  await env.STATE_KV.delete(KV_KEY);
  return jsonResponse({ ok: true });
}
