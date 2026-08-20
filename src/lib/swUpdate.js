/**
 * Control surface for the service worker that serves this app.
 *
 * `main.jsx` registers the worker at startup and hands the pieces here, so the
 * rest of the app can ask "is there a newer build?" without importing the
 * virtual PWA module (which does not exist under test).
 *
 * The reason any of this is needed: a home-screen web app on iOS is *resumed*,
 * not reloaded. No navigation happens, so the browser never re-fetches
 * `sw.js`, never compares its bytes against the installed one, and never
 * notices a deploy. The app has to ask.
 */
let controls = { registration: null, updateSW: null };

/** Called once from `main.jsx`, with whatever `registerSW` handed back. */
export function setServiceWorkerControls(next) {
  controls = {
    registration: next?.registration || null,
    updateSW: typeof next?.updateSW === "function" ? next.updateSW : null,
  };
}

export function getServiceWorkerControls() {
  return controls;
}

/**
 * Ask the browser to re-fetch `sw.js` and compare it byte for byte with the
 * installed one. That comparison is the actual update check — nothing in this
 * app tracks a version number for it.
 *
 * @returns {Promise<boolean>} whether the check could be made at all.
 */
export async function checkForServiceWorkerUpdate() {
  const { registration } = controls;
  if (!registration || typeof registration.update !== "function") return false;
  try {
    await registration.update();
    return true;
  } catch {
    // An offline device, or a browser that declines the check. Neither is
    // worth surfacing: the next resume tries again.
    return false;
  }
}

/**
 * Swap in the waiting build and reload.
 *
 * `updateSW(true)` is the PWA plugin's path — it calls `skipWaiting` and
 * reloads once the new worker takes control. The plain reload is the fallback
 * for a page with no worker registered (a dev server, a browser that refused
 * registration), where reloading is the whole of the job anyway.
 */
export async function applyServiceWorkerUpdate({ reload } = {}) {
  const doReload = reload || (() => window.location.reload());
  const { updateSW } = controls;
  if (updateSW) {
    await updateSW(true);
    return;
  }
  doReload();
}
