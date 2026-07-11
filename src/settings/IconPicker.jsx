import { useState, useMemo } from "react";
import {
  Box,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { Search } from "lucide-react";
import { CATEGORY_ICON_KEYS, getCategoryIconComponent } from "../lib/categoryIcons.jsx";
import { useT } from "../lib/i18n.jsx";

export function IconPicker({ value, onChange, label }) {
  const t = useT();
  const [search, setSearch] = useState("");

  const iconOptions = useMemo(() => {
    return CATEGORY_ICON_KEYS.map((key) => ({
      value: key,
      labelKo: t(`iconKey.${key}`, "ko"),
      labelEn: t(`iconKey.${key}`, "en"),
    }));
  }, [t]);

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return iconOptions;

    const searchLower = search.toLowerCase().trim();
    return iconOptions.filter((option) => {
      const koMatch = option.labelKo.toLowerCase().includes(searchLower);
      const enMatch = option.labelEn.toLowerCase().includes(searchLower);
      const keyMatch = option.value.toLowerCase().includes(searchLower);
      return koMatch || enMatch || keyMatch;
    });
  }, [search, iconOptions]);

  const selectedOption = iconOptions.find((opt) => opt.value === value);
  const SelectedIconCmp = getCategoryIconComponent(value);

  return (
    <Stack gap="xs">
      <Group gap={8} justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>{label}</Text>
        {selectedOption && (
          <Group gap={6} wrap="nowrap">
            <SelectedIconCmp size={14} strokeWidth={1.8} />
            <Text size="xs" c="dimmed">
              {selectedOption.labelKo} ({selectedOption.labelEn})
            </Text>
          </Group>
        )}
      </Group>

      <Paper withBorder radius="card" p="xs">
        <Stack gap="xs">
          <TextInput
            placeholder={t("search.placeholder")}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<Search size={14} />}
            size="xs"
          />

          <ScrollArea h={200}>
            <SimpleGrid cols={3} spacing={6} p={4}>
              {filteredIcons.map((option) => {
                const IconCmp = getCategoryIconComponent(option.value);
                const active = option.value === value;

                return (
                  <UnstyledButton
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    aria-label={`${option.labelKo} (${option.labelEn})`}
                    style={{
                      padding: "10px 6px",
                      borderRadius: 12,
                      background: active ? "var(--st-primary-soft)" : "transparent",
                      boxShadow: active ? "inset 0 0 0 1.5px var(--st-primary)" : "inset 0 0 0 1px var(--st-line)",
                      transition: "all 150ms ease",
                    }}
                    className="hover:bg-surface-soft"
                  >
                    <Stack gap={6} align="center">
                      <Box style={{ color: active ? "var(--st-primary)" : "var(--st-muted)" }}>
                        <IconCmp size={20} strokeWidth={active ? 2 : 1.8} />
                      </Box>
                      <Text
                        size="10px"
                        ta="center"
                        lh={1.2}
                        style={{
                          color: active ? "var(--st-primary)" : "var(--st-muted)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {option.labelKo}
                        <br />
                        <span style={{ fontSize: "9px", opacity: 0.7 }}>
                          ({option.labelEn})
                        </span>
                      </Text>
                    </Stack>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>

            {filteredIcons.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                {t("chart.noData")}
              </Text>
            )}
          </ScrollArea>
        </Stack>
      </Paper>
    </Stack>
  );
}
