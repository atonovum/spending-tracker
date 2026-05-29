import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCheck, IconChevronRight, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useT } from "../lib/i18n.jsx";
import { buildLabelStats, usageText } from "./shared.jsx";

function LabelEditModal({ opened, initial, onClose, onSubmit }) {
  const t = useT();
  const [name, setName] = useState(initial?.name || "");

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ id: initial?.id, name: trimmed });
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t("settings.labels.editTitle")} centered size="md">
      <Stack gap="sm">
        <TextInput
          label={t("settings.labels.field.name")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          required
        />
        <Group justify="flex-end" pt="sm">
          <Button leftSection={<IconCheck size={16} />} onClick={handleSave} disabled={!name.trim()}>
            {t("entry.action.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function LabelRow({ label, stat, onEdit, onDelete }) {
  const t = useT();
  return (
    <Paper withBorder p="sm" radius="card">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <div className="min-w-0 flex-1">
          <Text fw={600} className="truncate">{label.name}</Text>
          <Text size="xs" c="dimmed">{usageText(stat, t)}</Text>
        </div>
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={onEdit} aria-label={t("settings.editAria")}>
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label={t("settings.deleteAria")}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

function LabelsManager({ opened, onClose, labels, stats, onSave, onDelete, onConfirm }) {
  const t = useT();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [draftName, setDraftName] = useState("");
  const [editModal, setEditModal] = useState({ open: false, initial: null });

  function commitNew() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onSave({ name: trimmed });
    setDraftName("");
  }

  function requestDelete(label) {
    const stat = stats.get(label.id);
    const count = stat?.count || 0;
    if (labels.length <= 1) {
      onConfirm({
        title: t("settings.labels.deleteCannot"),
        message: t("settings.labels.minimum"),
        confirmLabel: t("settings.confirm.confirm"),
        confirmColor: "blue",
        action: null,
      });
      return;
    }
    const message = count
      ? t("settings.labels.deleteWithEntries", { name: label.name, count })
      : t("settings.labels.deleteSimple", { name: label.name });
    onConfirm({
      title: t("settings.labels.deleteTitle"),
      message,
      action: () => onDelete(label.id),
    });
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={t("settings.labels.title")}
        centered
        size={isMobile ? "lg" : "80%"}
        fullScreen={isMobile}
      >
        <Stack gap="sm" h={isMobile ? "calc(100dvh - 110px)" : 700}>
          <ScrollArea.Autosize mah={isMobile ? "100%" : 560} style={{ flex: 1, minHeight: 0 }}>
            <Stack gap="xs" pr={4}>
              {labels.length === 0 ? (
                <Text size="sm" c="dimmed">{t("settings.labels.empty")}</Text>
              ) : (
                labels.map((label) => (
                  <LabelRow
                    key={label.id}
                    label={label}
                    stat={stats.get(label.id)}
                    onEdit={() => setEditModal({ open: true, initial: label })}
                    onDelete={() => requestDelete(label)}
                  />
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
          <Box>
            <Text size="xs" fw={600} c="dimmed" mb={4}>{t("settings.labels.add")}</Text>
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                value={draftName}
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onKeyDown={(event) => { if (event.key === "Enter") commitNew(); }}
                placeholder={t("settings.labels.namePlaceholder")}
                className="flex-1"
              />
              <Button leftSection={<IconPlus size={14} />} onClick={commitNew} disabled={!draftName.trim()}>
                {t("settings.labels.addBtn")}
              </Button>
            </Group>
          </Box>
        </Stack>
      </Modal>

      <LabelEditModal
        opened={editModal.open}
        initial={editModal.initial}
        onClose={() => setEditModal({ open: false, initial: null })}
        onSubmit={(payload) => {
          onSave(payload);
          setEditModal({ open: false, initial: null });
        }}
      />
    </>
  );
}

export function LabelsCard({ state, onSaveLabel, onDeleteLabel, onConfirm }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => buildLabelStats(state.wallets), [state.wallets]);

  return (
    <>
      <Card withBorder radius="card" shadow="soft" className="cursor-pointer" onClick={() => setOpen(true)}>
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>{t("settings.labels")}</Title>
          <Group gap="xs">
            <Badge variant="light">{state.labels.length}</Badge>
            <IconChevronRight size={18} />
          </Group>
        </Group>
      </Card>

      <LabelsManager
        opened={open}
        onClose={() => setOpen(false)}
        labels={state.labels}
        stats={stats}
        onSave={onSaveLabel}
        onDelete={onDeleteLabel}
        onConfirm={onConfirm}
      />
    </>
  );
}
