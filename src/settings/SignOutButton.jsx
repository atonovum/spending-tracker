import { Button, Group } from "@mantine/core";
import { LogOut } from "lucide-react";

import { useT } from "../lib/i18n.jsx";

/**
 * Where Cloudflare Access ends a session. Same origin, so a plain navigation —
 * but the service worker's SPA fallback used to answer every same-origin
 * navigation with the cached `index.html`, which swallowed this request before
 * it reached the edge and made the button look dead. `/cdn-cgi/` is on the
 * `navigateFallbackDenylist` in `vite.config.js` for that reason.
 */
const LOGOUT_URL = "/cdn-cgi/access/logout";

/**
 * Ends this device's Access session.
 *
 * Sits below the sync card rather than inside it: the card reports on the
 * connection, this ends it. It is a security control — until now there was no
 * way to sign a lost phone out — not a way to pick up a new build.
 */
export function SignOutButton({ pendingSync, onConfirm }) {
  const t = useT();

  function handleLogout() {
    onConfirm({
      title: t("settings.sync.logoutTitle"),
      // Signing out with unsent edits risks the only copy of them, so that
      // fact leads instead of the routine wording.
      message: pendingSync ? t("settings.sync.logoutBlocked") : t("settings.sync.logoutMessage"),
      confirmLabel: t("settings.sync.logout"),
      confirmColor: "red",
      action: () => {
        window.location.href = LOGOUT_URL;
      },
    });
  }

  return (
    <Group justify="flex-end">
      <Button
        size="xs"
        variant="subtle"
        color="red"
        leftSection={<LogOut size={14} />}
        onClick={handleLogout}
      >
        {t("settings.sync.logout")}
      </Button>
    </Group>
  );
}
