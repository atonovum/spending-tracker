/**
 * Whether a response is an access-control wall rather than the thing you asked
 * for.
 *
 * Cloudflare Access answers an unauthenticated request with a 302 to its login
 * page. `fetch` follows redirects by default, so what arrives is a **200
 * carrying HTML** — `response.ok` is true and every status check passes. A
 * write path once reported that login page as a successful write, cleared the
 * "push still owed" flag and advanced the revision, losing the edit silently.
 *
 * Both signals are checked because either can be absent: a same-origin auth
 * wall need not redirect, and a redirect need not change the content type.
 * Every endpoint this app calls answers with JSON, so demanding JSON is free.
 *
 * @param {Response} response
 * @returns {boolean}
 */
export function isAuthWall(response) {
  if (response.redirected) return true;
  const contentType = response.headers.get("content-type") || "";
  return !contentType.includes("json");
}
