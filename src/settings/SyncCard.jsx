import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Download, RefreshCw } from "lucide-react";

import { APP_VERSION, fetchDeployedVersion, isUpdateAvailable } from "../lib/appVersion.js";
import { applyServiceWorkerUpdate, checkForServiceWorkerUpdate } from "../lib/swUpdate.js";
import { useT } from "../lib/i18n.jsx";

/**
 * This device's relationship with the server: which build it is running and
 * whether its edits have landed. Signing out sits below the card, in
 * `SignOutButton` — it ends a session rather than reporting on one.
 *
 * It is one card rather than a control per wallet because the unit of sync is
 * the whole document — KV holds a single key containing every wallet, category
 * and label (`KV_KEY` in `src/worker.js`). A per-wallet button would be five
 * buttons doing the same global thing, teaching a model that does not exist.
 */
export function SyncCard({ pendingSync, onSyncNow }) {
  const t = useT();
  const [deployed, setDeployed] = useState({ state: "checking", version: null, reason: "ok" });
  const [busy, setBusy] = useState(false);

  const checkVersion = useCallback(async () => {
    const result = await fetchDeployedVersion();
    setDeployed(
      result.ok
        ? { state: "known", version: result.version, reason: "ok" }
        : { state: "unknown", version: null, reason: result.reason }
    );
  }, []);

  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  const outdated = isUpdateAvailable(APP_VERSION, deployed.version);

  async function handleUpdate() {
    setBusy(true);
    // Re-fetching `sw.js` is what actually finds the new build; the version
    // manifest above only says whether it is worth doing.
    await checkForServiceWorkerUpdate();
    await applyServiceWorkerUpdate();
    setBusy(false);
  }

  async function handleSyncNow() {
    setBusy(true);
    try {
      await onSyncNow();
      await checkVersion();
    } finally {
      setBusy(false);
    }
  }

  // Naming the failure is the whole point: "unavailable" covered a missing
  // asset, an expired session and a dead network alike, and each needs
  // something different from the user.
  const deployedLabel =
    deployed.state === "checking"
      ? t("settings.sync.checking")
      : deployed.state === "unknown"
        ? t(`settings.sync.reason.${deployed.reason}`)
        : deployed.version;

  return (
    <Card withBorder radius="card" shadow="soft">
      <Stack gap="xs">
        <Title order={4}>{t("settings.sync")}</Title>

        <Group justify="space-between" wrap="nowrap" align="center">
          <Text size="sm">{t("settings.sync.version")}</Text>
          <Text size="sm" c="dimmed" ff="monospace">{APP_VERSION}</Text>
        </Group>

        <Group justify="space-between" wrap="nowrap" align="center">
          <Text size="sm">{t("settings.sync.deployed")}</Text>
          <Text size="sm" c="dimmed" ff="monospace">{deployedLabel}</Text>
        </Group>

        <Group justify="space-between" wrap="nowrap" align="center">
          <Badge color={pendingSync ? "yellow" : "green"} variant="light">
            {pendingSync ? t("settings.sync.pending") : t("settings.sync.synced")}
          </Badge>
        </Group>

        {outdated ? (
          <Group justify="space-between" wrap="nowrap" align="center">
            <Text size="sm" c="yellow.8">{t("settings.sync.updateAvailable")}</Text>
            <Button
              size="xs"
              variant="filled"
              loading={busy}
              leftSection={<Download size={14} />}
              onClick={handleUpdate}
            >
              {t("settings.sync.update")}
            </Button>
          </Group>
        ) : null}

        <Group gap="xs" wrap="wrap">
          <Button
            size="xs"
            variant="light"
            loading={busy}
            leftSection={<RefreshCw size={14} />}
            onClick={handleSyncNow}
          >
            {t("settings.sync.now")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
