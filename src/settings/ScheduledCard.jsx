import { useState } from "react";
import {
  Badge,
  Box,
  Card,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronRight } from "@tabler/icons-react";
import { CategoryIcon } from "../lib/categoryIcons.jsx";
import { REPEAT_OPTIONS, formatMoney } from "../lib/finance.js";

function repeatLabel(value) {
  return REPEAT_OPTIONS.find((option) => option.value === value)?.label || value;
}

function groupByDate(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.occurrenceDate;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function ScheduledModal({ opened, onClose, items, getCategory, getLabel, onEditEntry }) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const grouped = groupByDate(items);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="예정된 반복 거래"
      centered
      size="lg"
      fullScreen={isMobile}
    >
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">예정된 반복 거래가 없습니다.</Text>
      ) : (
        <ScrollArea.Autosize mah={isMobile ? "calc(100dvh - 110px)" : 520}>
          <Stack gap="md" pr={4}>
            {grouped.map(([date, rows]) => (
              <Box key={date}>
                <Text fw={700} size="sm" className="text-slate-700 mb-2">{date}</Text>
                <Stack gap="xs">
                  {rows.map((item) => {
                    const category = getCategory(item.categoryId);
                    const label = getLabel(item.labelId);
                    return (
                      <Paper
                        key={`${item.id}-${item.occurrenceDate}`}
                        withBorder
                        p="sm"
                        radius="sm"
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => onEditEntry(item)}
                      >
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                          <Group gap="sm" wrap="nowrap" className="min-w-0 flex-1">
                            {category ? (
                              <span
                                aria-hidden="true"
                                className="grid h-9 w-9 place-items-center rounded-full"
                                style={{ background: `${category.color}1a`, color: category.color }}
                              >
                                <CategoryIcon category={category} size={18} />
                              </span>
                            ) : null}
                            <div className="min-w-0">
                              <Group gap="xs">
                                <Text fw={600} className="truncate">{category?.name || "카테고리 없음"}</Text>
                                {label ? <Badge variant="light" size="xs" color="gray">{label.name}</Badge> : null}
                                <Badge variant="filled" size="xs" color="indigo">{repeatLabel(item.repeat)}</Badge>
                              </Group>
                              <Text size="xs" c="dimmed">
                                반복 시작 {item.date}
                                {item.repeatEndDate ? ` · 종료 ${item.repeatEndDate}` : " · 무기한"}
                              </Text>
                              {item.note ? (
                                <Text size="xs" c="dimmed" className="truncate">{item.note}</Text>
                              ) : null}
                            </div>
                          </Group>
                          <Text fw={700} c={category?.type === "income" ? "blue" : "red"}>
                            {formatMoney(category?.type === "income" ? item.amount : -Math.abs(item.amount))}
                          </Text>
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
                <Divider mt="sm" />
              </Box>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Modal>
  );
}

export function ScheduledCard({ pendingScheduled, getCategory, getLabel, onEditEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card withBorder radius="sm" shadow="sm" className="cursor-pointer" onClick={() => setOpen(true)}>
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>Scheduled Transactions</Title>
          <Group gap="xs">
            <Badge variant="light">{pendingScheduled.length}</Badge>
            <IconChevronRight size={18} />
          </Group>
        </Group>
      </Card>

      <ScheduledModal
        opened={open}
        onClose={() => setOpen(false)}
        items={pendingScheduled}
        getCategory={getCategory}
        getLabel={getLabel}
        onEditEntry={(item) => {
          setOpen(false);
          onEditEntry(item);
        }}
      />
    </>
  );
}
