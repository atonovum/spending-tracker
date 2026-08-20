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
 * Wait for a newly-found worker to finish installing.
 *
 * `registration.update()` resolves when the *check* is done, which is well
 * before the new worker is ready to take over. Skipping this wait was why the
 * update button needed a manual refresh after it: `updateSW(true)` posts
 * SKIP_WAITING to `registration.waiting`, and with nothing waiting yet it had
 * nobody to talk to and returned having done nothing at all.
 *
 * Resolves either way — the caller reloads regardless, and a reload with no new
 * worker just costs one page load.
 */
function waitForWaitingWorker(registration, timeoutMs) {
  if (registration.waiting) return Promise.resolve(true);
  const pending = registration.installing;
  if (!pending || typeof pending.addEventListener !== "function") {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      pending.removeEventListener("statechange", onStateChange);
      resolve(value);
    };
    function onStateChange() {
      // `installed` is the point at which it becomes `registration.waiting`;
      // `activated` means it already took over and there is nothing to wait for.
      if (pending.state === "installed" || pending.state === "activated") finish(true);
      if (pending.state === "redundant") finish(false);
    }
    pending.addEventListener("statechange", onStateChange);
    setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Swap in the waiting build and reload.
 *
 * `updateSW(true)` is the PWA plugin's path — it calls `skipWaiting` and
 * reloads once the new worker takes control. The reload here is the backstop:
 * it fires only if the page is still around afterwards (the plugin's own
 * reload takes the timer with it), and it is the whole of the job on a page
 * with no worker registered at all.
 */
export async function applyServiceWorkerUpdate({ reload, timeoutMs = 8000 } = {}) {
  const doReload = reload || (() => window.location.reload());
  const { registration, updateSW } = controls;

  if (registration) await waitForWaitingWorker(registration, timeoutMs);

  if (updateSW) {
    await updateSW(true);
  }
  doReload();
}
