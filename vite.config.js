import { execSync } from "node:child_process";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * The build's identity is the commit it was built from — there is no release
 * cadence here to hang a semver on, and a commit hash is the one label that
 * points straight back at the code that is running.
 *
 * The CI variable is tried before `git` because a build container may clone
 * without leaving `.git` behind. `dev` is what a working tree with neither
 * looks like, and it is the honest answer: that build is not a released one.
 */
function resolveAppVersion() {
  const fromCI =
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    "";
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

/**
 * Where "sign out" sends the browser.
 *
 * The per-application endpoint (`/cdn-cgi/access/logout`, the default) clears
 * only this app's cookie. Cloudflare Access keeps a second, team-wide session
 * on `<team>.cloudflareaccess.com`, so the next visit bounces there, finds that
 * session still valid and signs the user straight back in — which reads as
 * "logout did nothing". Ending the session for real means the team endpoint:
 *
 *   ACCESS_LOGOUT_URL=https://<team>.cloudflareaccess.com/logout
 *
 * It lives in an environment variable rather than in source because it is
 * deployment configuration, not application logic.
 */
const ACCESS_LOGOUT_URL = process.env.ACCESS_LOGOUT_URL || "/cdn-cgi/access/logout";

const APP_VERSION = resolveAppVersion();
const BUILD_TIME = new Date().toISOString();
const VERSION_PATH = "/version.json";
const versionPayload = JSON.stringify({ version: APP_VERSION, builtAt: BUILD_TIME });

/**
 * Publish the build's identity as a plain asset.
 *
 * This is what a running client compares itself against, and it has to come
 * from the server rather than from KV: KV records the version of whichever
 * *device* wrote last, which is not the deployed version and answers the wrong
 * question entirely.
 *
 * `.json` is outside VitePWA's default `globPatterns`, so this file is not
 * precached and the fetch reaches the network — which is the whole point.
 */
function versionManifest() {
  return {
    name: "app-version-manifest",
    apply() {
      return true;
    },
    configureServer(server) {
      // `vite dev` never runs `generateBundle`, so serve it from memory.
      server.middlewares.use(VERSION_PATH, (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        res.end(versionPayload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: VERSION_PATH.slice(1),
        source: versionPayload,
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __ACCESS_LOGOUT_URL__: JSON.stringify(ACCESS_LOGOUT_URL),
  },
  plugins: [react(), versionManifest(), VitePWA({
    registerType: "autoUpdate",
    includeAssets: ["icon-192.png", "icon-512.png"],
    workbox: {
      /**
       * The SPA fallback answers *every* same-origin navigation with the cached
       * `index.html`, which means paths the app does not own get swallowed
       * before they reach the network. Signing out went nowhere for exactly
       * this reason: `/cdn-cgi/access/logout` never left the device, so the app
       * re-rendered itself and looked like a dead button.
       *
       * `/cdn-cgi/` is Cloudflare's edge (Access login and logout live there)
       * and `/api/` is the Worker. Neither is ever an app route.
       */
      navigateFallbackDenylist: [/^\/cdn-cgi\//, /^\/api\//],
    },
    manifest: {
      name: "Spending Tracker",
      short_name: "Spending",
      start_url: "/",
      display: "standalone",
      background_color: "#f8fafc",
      theme_color: "#ffffff",
      lang: "ko-KR",
    },
  }), cloudflare()],
});
