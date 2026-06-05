import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  Merge,
  Check,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { CategoryIcon } from "../lib/categoryIcons.jsx";
import { useT } from "../lib/i18n.jsx";
import { buildCategoryStats, usageText } from "./shared.jsx";
import { IconPicker } from "./IconPicker.jsx";

const DEFAULT_CATEGORY_COLORS = {
  expense: "#F08A8A",
  income: "#5BB97A",
};

function InlineCategoryForm({ initial, defaultType, onCancel, onSubmit }) {
  const t = useT();
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name || "");
  const [icon, setIcon] = useState(initial?.icon || "spark");
  const [color, setColor] = useState(initial?.color || DEFAULT_CATEGORY_COLORS[initial?.type || defaultType] || "#1565c0");

  useEffect(() => {
    setName(initial?.name || "");
    setIcon(initial?.icon || "spark");
    setColor(initial?.color || DEFAULT_CATEGORY_COLORS[initial?.type || defaultType] || "#1565c0");
  }, [initial, defaultType]);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const type = initial?.type || defaultType;
    onSubmit({
      id: initial?.id,
      name: trimmed,
      type,
      color: color || DEFAULT_CATEGORY_COLORS[type],
      icon,
    });
  }

  return (
    <Paper withBorder radius="card" p="sm" className="bg-slate-50">
      <Stack gap="xs">
        <Text size="sm" fw={700}>{isEdit ? t("settings.categories.editTitle") : t("settings.categories.newTitle")}</Text>
        <TextInput label={t("settings.categories.field.name")} value={name} onChange={(event) => setName(event.currentTarget.value)} required size="sm" />
        <IconPicker
          label={t("settings.categories.field.icon")}
          value={icon}
          onChange={(value) => setIcon(value || "spark")}
        />
        <ColorInput
          label={t("settings.categories.field.color")}
          value={color}
          onChange={setColor}
          format="hex"
          swatches={["#5BB97A", "#F08A8A", "#FFB454", "#5C8DEF", "#ef6c00", "#6a1b9a", "#4a148c", "#00897b", "#5d4037"]}
          size="sm"
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="subtle" leftSection={<X size={14} />} size="xs" onClick={onCancel}>{t("entry.action.cancel")}</Button>
          <Button leftSection={<Check size={14} />} size="xs" onClick={handleSubmit} disabled={!name.trim()}>{t("entry.action.save")}</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function MergeModal({ opened, sources, candidates, onClose, onConfirm }) {
  const t = useT();
  const [target, setTarget] = useState("");
  useEffect(() => { if (!opened) setTarget(""); }, [opened]);
  const data = candidates.map((category) => ({ value: category.id, label: category.name }));

  return (
    <Modal opened={opened} onClose={onClose} title={t("settings.categories.mergeTitle")} centered size="md">
      <Stack gap="sm">
        <Text size="sm">
          {t("settings.categories.mergeIntro", { count: sources.length })}
        </Text>
        <Stack gap={4}>
          {sources.map((source) => (
            <Group key={source.id} gap="xs">
              <span style={{ color: source.color }} className="inline-flex items-center">
                <CategoryIcon category={source} size={14} />
              </span>
              <Text size="sm">{source.name}</Text>
            </Group>
          ))}
        </Stack>
        <Select
          label={t("settings.categories.mergeTarget")}
          placeholder={t("settings.categories.mergeTargetPlaceholder")}
          data={data}
          value={target}
          onChange={(value) => setTarget(value || "")}
          allowDeselect={false}
        />
        <Group justify="flex-end" pt="sm">
          <Button color="indigo" leftSection={<Check size={16} />} onClick={() => onConfirm(target)} disabled={!target}>
            {t("settings.categories.mergeBtn")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function CategoryRow({ category, stat, checked, onToggle, onEdit, onDelete }) {
  const t = useT();
  return (
    <Paper withBorder p="sm" radius="card">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" className="min-w-0 flex-1">
          <Checkbox
            checked={checked}
            onChange={(event) => onToggle(event.currentTarget.checked)}
            onClick={(event) => event.stopPropagation()}
          />
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: `${category.color}1a`, color: category.color }}
          >
            <CategoryIcon category={category} size={18} />
          </span>
          <div className="min-w-0">
            <Text fw={600} className="truncate" style={{ color: category.color }}>{category.name}</Text>
            <Text size="xs" c="dimmed">{usageText(stat, t)}</Text>
          </div>
        </Group>
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={onEdit} aria-label={t("settings.editAria")}>
            <Pencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={onDelete} aria-label={t("settings.deleteAria")}>
            <Trash2 size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

function CategoriesManager({
  opened,
  onClose,
  categories,
  stats,
  onSave,
  onDelete,
  onMerge,
  onConfirm,
}) {
  const t = useT();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [tab, setTab] = useState("expense");
  const [checked, setChecked] = useState({ expense: new Set(), income: new Set() });
  const [form, setForm] = useState({ open: false, initial: null });
  const [mergeModal, setMergeModal] = useState({ open: false });

  useEffect(() => { if (!opened) setForm({ open: false, initial: null }); }, [opened]);

  const grouped = useMemo(() => ({
    expense: categories.filter((category) => category.type === "expense"),
    income: categories.filter((category) => category.type === "income"),
  }), [categories]);

  const checkedSet = checked[tab];
  const checkedCategories = grouped[tab].filter((category) => checkedSet.has(category.id));
  const mergeCandidates = grouped[tab];
  const canMerge = checkedCategories.length >= 1 && grouped[tab].length >= 2;

  function toggleChecked(id, value) {
    setChecked((prev) => {
      const nextSet = new Set(prev[tab]);
      if (value) nextSet.add(id); else nextSet.delete(id);
      return { ...prev, [tab]: nextSet };
    });
  }

  function clearChecked(typeToClear = tab) {
    setChecked((prev) => ({ ...prev, [typeToClear]: new Set() }));
  }

  function requestDelete(category) {
    const stat = stats.get(category.id);
    const count = stat?.count || 0;
    if (categories.length <= 1) {
      onConfirm({
        title: t("settings.categories.deleteCannot"),
        message: t("settings.categories.minimum"),
        confirmLabel: t("settings.confirm.confirm"),
        confirmColor: "blue",
        action: null,
      });
      return;
    }
    const message = count
      ? t("settings.categories.deleteWithEntries", { name: category.name, count })
      : t("settings.categories.deleteSimple", { name: category.name });
    onConfirm({
      title: t("settings.categories.deleteTitle"),
      message,
      action: () => {
        onDelete(category.id);
        clearChecked();
      },
    });
  }

  function startMerge() {
    if (!canMerge) return;
    setMergeModal({ open: true });
  }

  function confirmMerge(targetId) {
    const sourceIds = checkedCategories
      .map((category) => category.id)
      .filter((id) => id !== targetId);
    if (!sourceIds.length || !targetId) return;
    onConfirm({
      title: t("settings.categories.mergeTitle"),
      message: t("settings.categories.mergeConfirm", { count: sourceIds.length }),
      confirmLabel: t("settings.categories.mergeBtn"),
      confirmColor: "indigo",
      action: () => {
        onMerge(sourceIds, targetId);
        setMergeModal({ open: false });
        clearChecked();
      },
    });
  }

  function handleFormSubmit(payload) {
    onSave(payload);
    setForm({ open: false, initial: null });
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={t("settings.categories.title")}
        centered
        size={isMobile ? "lg" : "80%"}
        fullScreen={isMobile}
      >
        <Stack gap="sm" h={isMobile ? "calc(100dvh - 110px)" : 700}>
          <Tabs value={tab} onChange={(value) => setTab(value || "expense")}>
            <Tabs.List grow>
              <Tabs.Tab value="expense">{t("settings.categories.tab.expense", { count: grouped.expense.length })}</Tabs.Tab>
              <Tabs.Tab value="income">{t("settings.categories.tab.income", { count: grouped.income.length })}</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <ScrollArea.Autosize mah={isMobile ? "100%" : 560} style={{ flex: 1, minHeight: 0 }}>
            <Stack gap="xs" pr={4}>
              {grouped[tab].length === 0 ? (
                <Text size="sm" c="dimmed">{t("settings.categories.empty")}</Text>
              ) : (
                grouped[tab].map((category) => (
                  <CategoryRow
                    key={category.id}
                    category={category}
                    stat={stats.get(category.id)}
                    checked={checkedSet.has(category.id)}
                    onToggle={(value) => toggleChecked(category.id, value)}
                    onEdit={() => setForm({ open: true, initial: category })}
                    onDelete={() => requestDelete(category)}
                  />
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
          {form.open ? (
            <>
              <Divider />
              <InlineCategoryForm
                initial={form.initial}
                defaultType={tab}
                onCancel={() => setForm({ open: false, initial: null })}
                onSubmit={handleFormSubmit}
              />
            </>
          ) : (
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {t("settings.categories.selected", { count: checkedCategories.length })}
              </Text>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  color="indigo"
                  leftSection={<Merge size={14} />}
                  onClick={startMerge}
                  disabled={!canMerge}
                >
                  {t("settings.categories.merge")}
                </Button>
                <Button
                  size="xs"
                  leftSection={<Plus size={14} />}
                  onClick={() => setForm({ open: true, initial: null })}
                >
                  {t("settings.categories.add")}
                </Button>
              </Group>
            </Group>
          )}
        </Stack>
      </Modal>

      <MergeModal
        opened={mergeModal.open}
        sources={checkedCategories}
        candidates={mergeCandidates}
        onClose={() => setMergeModal({ open: false })}
        onConfirm={confirmMerge}
      />
    </>
  );
}

export function CategoriesCard({ state, onSaveCategory, onDeleteCategory, onMergeCategories, onConfirm }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => buildCategoryStats(state.wallets), [state.wallets]);

  return (
    <>
      <Card withBorder radius="card" shadow="soft" className="cursor-pointer" onClick={() => setOpen(true)}>
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>{t("settings.categories")}</Title>
          <Group gap="xs">
            <Badge variant="light">{state.categories.length}</Badge>
            <ChevronRight size={18} />
          </Group>
        </Group>
      </Card>

      <CategoriesManager
        opened={open}
        onClose={() => setOpen(false)}
        categories={state.categories}
        stats={stats}
        onSave={onSaveCategory}
        onDelete={onDeleteCategory}
        onMerge={onMergeCategories}
        onConfirm={onConfirm}
      />
    </>
  );
}
