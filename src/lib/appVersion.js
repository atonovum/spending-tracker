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
 * @returns {Promise<{ ok: boolean, version: string|null, builtAt: string|null }>}
 */
export async function fetchDeployedVersion() {
  try {
    const response = await fetch(VERSION_URL, { cache: "no-store" });
    if (!response.ok || isAuthWall(response)) {
      return { ok: false, version: null, builtAt: null };
    }
    const data = await response.json();
    const version = data && typeof data.version === "string" ? data.version : null;
    if (!version) return { ok: false, version: null, builtAt: null };
    return {
      ok: true,
      version,
      builtAt: data && typeof data.builtAt === "string" ? data.builtAt : null,
    };
  } catch {
    return { ok: false, version: null, builtAt: null };
  }
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
