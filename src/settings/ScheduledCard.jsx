import { useState } from "react";
import {
  Badge,
  Card,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "../lib/categoryIcons.jsx";
import { normalizeLabelIds } from "../lib/finance.js";
import { useI18n } from "../lib/i18n.jsx";

function ScheduledModal({ opened, onClose, entries, getCategory, getLabel, onEditEntry }) {
  const { t, formatMoney } = useI18n();
  const isMobile = useMediaQuery("(max-width: 48em)");

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("settings.scheduled.title")}
      centered
      size="lg"
      fullScreen={isMobile}
    >
      {entries.length === 0 ? (
        <Text size="sm" c="dimmed">{t("settings.scheduled.empty")}</Text>
      ) : (
        <ScrollArea.Autosize mah={isMobile ? "calc(100dvh - 110px)" : 520}>
          <Stack gap="xs" pr={4}>
            {entries.map((entry) => {
              const category = getCategory(entry.categoryId);
              const entryLabels = normalizeLabelIds(entry).map((id) => getLabel(id)).filter(Boolean);
              return (
                <Paper
                  key={entry.id}
                  withBorder
                  p="sm"
                  radius="card"
                  className="cursor-pointer"
                  style={{ transition: 'background 150ms ease' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(138, 143, 154, 0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => onEditEntry(entry)}
                >
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Group gap="sm" wrap="nowrap" className="min-w-0 flex-1">
                      {category ? (
                        <span
                          aria-hidden="true"
                          className="grid h-9 w-9 place-items-center rounded-xl"
                          style={{ background: `${category.color}14`, color: category.color }}
                        >
                          <CategoryIcon category={category} size={18} />
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <Group gap="xs">
                          <Text fw={600} className="truncate">{category?.name || t("settings.scheduled.noCategory")}</Text>
                          {entryLabels.map((lbl) => (
                            <Badge key={lbl.id} variant="light" size="xs" color="gray">{lbl.name}</Badge>
                          ))}
                          <Badge variant="filled" size="xs" style={{ backgroundColor: '#FFB454', color: '#FFFFFF' }}>{t(`repeat.${entry.repeat}`)}</Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {t("settings.scheduled.start", { date: entry.date })}
                          {entry.repeatEndDate
                            ? t("settings.scheduled.end", { date: entry.repeatEndDate })
                            : t("settings.scheduled.endless")}
                          {entry.nextDate ? t("settings.scheduled.next", { date: entry.nextDate }) : ""}
                        </Text>
                        {entry.note ? (
                          <Text size="xs" c="dimmed" className="truncate">{entry.note}</Text>
                        ) : null}
                      </div>
                    </Group>
                    <Text fw={700} style={{ color: category?.type === "income" ? "#5BB97A" : "#F08A8A" }}>
                      {formatMoney(category?.type === "income" ? entry.amount : -Math.abs(entry.amount))}
                    </Text>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Modal>
  );
}

export function ScheduledCard({ scheduledEntries, getCategory, getLabel, onEditEntry }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card withBorder radius="card" shadow="soft" className="cursor-pointer" onClick={() => setOpen(true)}>
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>{t("settings.scheduled")}</Title>
          <Group gap="xs">
            <Badge variant="light">{scheduledEntries.length}</Badge>
            <ChevronRight size={18} />
          </Group>
        </Group>
      </Card>

      <ScheduledModal
        opened={open}
        onClose={() => setOpen(false)}
        entries={scheduledEntries}
        getCategory={getCategory}
        getLabel={getLabel}
        onEditEntry={onEditEntry}
      />
    </>
  );
}
