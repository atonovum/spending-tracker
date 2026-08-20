import { isAuthWall } from "./authWall.js";

const VERSION_URL = "/version.json";

/**
 * The commit this bundle was built from, substituted at transform time by the
 * `define` block in `vite.config.js`. There is no release cadence to hang a
 * semver on, and a commit hash points straight back at the running code.
 *
 * `dev` means a working tree with no CI variable and no reachable `git`;
 * `test` is what `vitest.config.js` substitutes. Neither is a deployed build,
 * so neither should ever be reported as out of date.
 */
export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

const UNRELEASED = new Set(["dev", "test", ""]);

/**
 * Read the version the server is currently serving.
 *
 * Deliberately a static asset rather than KV: KV records the version of
 * whichever *device* wrote last, which is not the deployed version and answers
 * a different question. `.json` sits outside VitePWA's `globPatterns`, so this
 * is not precached and the request actually reaches the network.
 *
 * `reason` exists because the four ways this fails need four different things
 * from the user, and collapsing them into one "unavailable" made the failure
 * undiagnosable:
 *   - `auth` — the request was redirected to a login page. Sign in again.
 *   - `missing` — HTML came back without a redirect, which is the Worker's
 *     single-page-application fallback answering for an asset that is not
 *     there. The deploy is missing `/version.json`.
 *   - `unreachable` — no answer, or a non-2xx one. `status` carries the code
 *     when there was a response at all (0 when the request never completed),
 *     because "no answer" covers a 404 and a dead network alike and the two
 *     point at completely different places.
 *   - `malformed` — JSON, but nothing that names a version.
 *
 * @returns {Promise<{ ok: boolean, reason: string, status: number, version: string|null, builtAt: string|null }>}
 */
export async function fetchDeployedVersion() {
  let response;
  try {
    response = await fetch(VERSION_URL, { cache: "no-store" });
  } catch {
    return failure("unreachable", 0);
  }

  if (!response.ok) return failure("unreachable", response.status);
  if (isAuthWall(response)) {
    return failure(response.redirected ? "auth" : "missing", response.status);
  }

  try {
    const data = await response.json();
    const version = data && typeof data.version === "string" ? data.version : null;
    if (!version) return failure("malformed", response.status);
    return {
      ok: true,
      reason: "ok",
      status: response.status,
      version,
      builtAt: data && typeof data.builtAt === "string" ? data.builtAt : null,
    };
  } catch {
    return failure("malformed", response.status);
  }
}

function failure(reason, status) {
  return { ok: false, reason, status: status || 0, version: null, builtAt: null };
}

/**
 * Whether the running bundle is behind what the server serves.
 *
 * A build with no identity of its own (`dev`, `test`) is never "behind": it is
 * not a deployment, and telling a developer their working tree is out of date
 * would be noise.
 *
 * @param {string} local running bundle's version.
 * @param {string|null} deployed version the server reports.
 */
export function isUpdateAvailable(local, deployed) {
  if (!deployed) return false;
  if (UNRELEASED.has(local)) return false;
  return local !== deployed;
}
