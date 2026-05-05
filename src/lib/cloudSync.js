const API_URL = "/api/state";

export async function fetchRemoteState() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export async function pushRemoteState(state) {
  try {
    const response = await fetch(API_URL, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state),
    });
    return response.ok;
  } catch {
    return false;
  }
}
