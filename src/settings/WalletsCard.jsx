import { useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconDownload,
  IconPencil,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { MAX_WALLETS } from "../lib/finance.js";
import { useI18n } from "../lib/i18n.jsx";

function WalletRow({ wallet, isSelected, total, onSelect, onEdit, onExport }) {
  const { t, formatMoney } = useI18n();
  return (
    <Paper withBorder p="sm" radius="card">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" className="min-w-0 flex-1">
          <ActionIcon
            variant={isSelected ? "filled" : "subtle"}
            color={isSelected ? "yellow" : "gray"}
            onClick={onSelect}
            aria-label={isSelected ? t("settings.wallets.selectedAria") : t("settings.wallets.selectAria")}
          >
            {isSelected ? <IconStarFilled size={16} /> : <IconStar size={16} />}
          </ActionIcon>
          <div className="min-w-0">
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} className="truncate">{wallet.name}</Text>
              <Badge variant="light">{wallet.entries.length}</Badge>
            </Group>
            {typeof total === "number" ? (
              <Text size="xs" c={total > 0 ? "blue" : total < 0 ? "red" : "dimmed"}>
                {t("settings.wallets.totalPrefix", { amount: formatMoney(total) })}
              </Text>
            ) : null}
          </div>
        </Group>
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={onEdit} aria-label={t("settings.wallets.editAria")}>
            <IconPencil size={16} />
          </ActionIcon>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t("settings.wallets.exportAria")}>
                <IconDownload size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onExport("json")}>
                {t("settings.wallets.exportJson")}
              </Menu.Item>
              <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => onExport("csv")}>
                {t("settings.wallets.exportCsv")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Paper>
  );
}

function WalletEditModal({ opened, wallet, isOnly, onClose, onRename, onDelete }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(wallet?.name || "");

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== wallet?.name) onRename(trimmed);
    onClose();
  }

  if (!wallet) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("settings.wallets.editTitle")}
      centered
      size="md"
      onTransitionEnd={() => setDraft(wallet.name)}
    >
      <Stack gap="sm">
        <TextInput
          label={t("settings.wallets.nameLabel")}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          autoFocus
        />
        <Text size="xs" c="dimmed">
          {t("settings.wallets.containsEntries", { count: wallet.entries.length })}
        </Text>
        <Group justify="space-between" pt="sm">
          <Button
            color="red"
            variant="light"
            leftSection={<IconTrash size={16} />}
            onClick={onDelete}
            disabled={isOnly}
            title={isOnly ? t("settings.wallets.minimum") : ""}
          >
            {t("settings.wallets.deleteAction")}
          </Button>
          <Button leftSection={<IconCheck size={16} />} onClick={handleSave} disabled={!draft.trim()}>
            {t("entry.action.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ImportModal({ opened, onClose, parsed, fileName, wallets, onConfirm, error }) {
  const { t } = useI18n();
  const [target, setTarget] = useState("__new__");
  const incoming = parsed?.wallet || (Array.isArray(parsed?.wallets) ? parsed.wallets[0] : null);
  const incomingCount = Array.isArray(incoming?.entries) ? incoming.entries.length : 0;
  const canCreateNew = wallets.length < MAX_WALLETS;
  const data = [
    {
      value: "__new__",
      label: canCreateNew ? t("settings.wallets.importNew") : t("settings.wallets.importNewLimit"),
      disabled: !canCreateNew,
    },
    ...wallets.map((wallet) => ({
      value: wallet.id,
      label: t("settings.wallets.importExisting", { name: wallet.name, count: wallet.entries.length }),
    })),
  ];

  function handleConfirm() {
    onConfirm(target === "__new__" ? null : target);
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t("settings.wallets.importTitle")} centered size="md">
      <Stack gap="sm">
        {error ? (
          <Text size="sm" c="red">{error}</Text>
        ) : (
          <>
            <Text size="sm" c="dimmed">{t("settings.wallets.importFile", { name: fileName })}</Text>
            <Text size="sm">
              {t("settings.wallets.importInfo", {
                name: incoming?.name || t("settings.wallets.importNoName"),
                count: incomingCount,
              })}
            </Text>
            <Select
              label={t("settings.wallets.importTarget")}
              data={data}
              value={target}
              onChange={(value) => setTarget(value || "__new__")}
              allowDeselect={false}
            />
            <Text size="xs" c="dimmed">
              {t("settings.wallets.importHelp")}
            </Text>
          </>
        )}
        <Group justify="flex-end" pt="sm">
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={handleConfirm}
            disabled={!incoming || (target === "__new__" && !canCreateNew)}
          >
            {t("settings.wallets.importBtn")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function WalletsCard({
  state,
  walletTotals,
  onSelectWallet,
  onAddWallet,
  onRenameWallet,
  onDeleteWallet,
  onExportWallet,
  onImportWallet,
  onConfirm,
}) {
  const { t } = useI18n();
  const jsonInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [editModal, setEditModal] = useState({ open: false, wallet: null });
  const [importModal, setImportModal] = useState({ open: false, parsed: null, fileName: "", error: "" });

  const canAddWallet = state.wallets.length < MAX_WALLETS;

  function triggerImport(format) {
    if (format === "json") {
      jsonInputRef.current?.click();
    } else if (format === "csv") {
      csvInputRef.current?.click();
    }
  }

  async function handleImportFile(file, format) {
    if (!file) return;
    try {
      const text = await file.text();

      if (format === "csv") {
        // Import from CSV using parseWalletCsv
        const { parseWalletCsv } = await import("../lib/csv.js");
        const result = parseWalletCsv(text, state.categories, state.labels);

        if (result.error === "invalidHeader") {
          setImportModal({
            open: true,
            parsed: null,
            fileName: file.name,
            error: t("settings.wallets.importCsvError")
          });
          return;
        }

        if (result.rejected.length > 0) {
          // Show error modal with missing categories
          const missingCategories = new Set();
          result.rejected.forEach((rej) => {
            if (rej.reason === "missingCategory") {
              missingCategories.add(`${rej.type}: ${rej.category}`);
            }
          });

          if (missingCategories.size > 0) {
            const categoryList = Array.from(missingCategories).join(", ");
            setImportModal({
              open: true,
              parsed: null,
              fileName: file.name,
              error: `${t("settings.wallets.csvMissingCategories")}\n${categoryList}`
            });
            return;
          }
        }

        // Convert CSV result to wallet format
        const csvWallet = {
          id: "", // Will be generated on import
          name: file.name.replace(/\.csv$/i, ""),
          entries: result.entries,
        };

        const parsed = {
          wallet: csvWallet,
          categories: state.categories,
          labels: state.labels,
        };

        // Show info about unknown labels if any
        let successMessage = "";
        if (result.unknownLabels.size > 0) {
          successMessage = t("settings.wallets.csvUnknownLabels", {
            count: result.unknownLabels.size
          });
        }

        setImportModal({
          open: true,
          parsed,
          fileName: file.name,
          error: successMessage
        });
      } else {
        // Import from JSON
        const parsed = JSON.parse(text);
        setImportModal({ open: true, parsed, fileName: file.name, error: "" });
      }
    } catch (err) {
      setImportModal({
        open: true,
        parsed: null,
        fileName: file.name,
        error: format === "csv" ? t("settings.wallets.importCsvError") : t("settings.wallets.importError")
      });
    }
  }

  function confirmImport(targetWalletId) {
    onImportWallet(importModal.parsed, targetWalletId);
    setImportModal({ open: false, parsed: null, fileName: "", error: "" });
  }

  function requestDelete(wallet) {
    if (state.wallets.length <= 1) {
      onConfirm({
        title: t("settings.wallets.deleteCannot"),
        message: t("settings.wallets.minimum"),
        confirmLabel: t("settings.confirm.confirm"),
        confirmColor: "blue",
        action: null,
      });
      return;
    }
    onConfirm({
      title: t("settings.wallets.deleteTitle"),
      message: t("settings.wallets.deleteConfirm", { name: wallet.name, count: wallet.entries.length }),
      action: () => {
        onDeleteWallet(wallet.id);
        setEditModal({ open: false, wallet: null });
      },
    });
  }

  return (
    <>
      <Card withBorder radius="card" shadow="soft">
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <div>
            <Title order={4}>{t("settings.wallets")}</Title>
            <Text size="xs" c="dimmed">
              {t("settings.wallets.limit", { max: MAX_WALLETS, current: state.wallets.length })}
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button size="xs" variant="default" leftSection={<IconUpload size={14} />}>
                  {t("settings.wallets.import")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconUpload size={14} />} onClick={() => triggerImport("json")}>
                  {t("settings.wallets.importJson")}
                </Menu.Item>
                <Menu.Item leftSection={<IconUpload size={14} />} onClick={() => triggerImport("csv")}>
                  {t("settings.wallets.importCsv")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <input
              ref={jsonInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file, "json");
                e.target.value = "";
              }}
            />
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file, "csv");
                e.target.value = "";
              }}
            />
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAddWallet} disabled={!canAddWallet}>
              {t("settings.wallets.add")}
            </Button>
          </Group>
        </Group>
        <Stack gap="xs">
          {state.wallets.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              isSelected={wallet.id === state.selectedWalletId}
              total={walletTotals?.get(wallet.id)}
              onSelect={() => onSelectWallet(wallet.id)}
              onEdit={() => setEditModal({ open: true, wallet })}
              onExport={(format) => onExportWallet(wallet.id, format)}
            />
          ))}
        </Stack>
      </Card>

      <WalletEditModal
        opened={editModal.open}
        wallet={editModal.wallet}
        isOnly={state.wallets.length <= 1}
        onClose={() => setEditModal({ open: false, wallet: null })}
        onRename={(name) => editModal.wallet && onRenameWallet(editModal.wallet.id, name)}
        onDelete={() => editModal.wallet && requestDelete(editModal.wallet)}
      />

      <ImportModal
        opened={importModal.open}
        onClose={() => setImportModal({ open: false, parsed: null, fileName: "", error: "" })}
        parsed={importModal.parsed}
        fileName={importModal.fileName}
        wallets={state.wallets}
        onConfirm={confirmImport}
        error={importModal.error}
      />
    </>
  );
}
