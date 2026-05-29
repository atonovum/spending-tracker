import { Card, Group, Select, Stack, Text, Title } from "@mantine/core";
import { LANGUAGES, useT } from "../lib/i18n.jsx";

export function PreferencesCard({ language, onLanguageChange }) {
  const t = useT();
  return (
    <Card withBorder radius="card" shadow="soft">
      <Stack gap="xs">
        <Title order={4}>{t("settings.preferences")}</Title>
        <Group justify="space-between" wrap="nowrap" align="center">
          <Text size="sm">{t("settings.language")}</Text>
          <Select
            data={LANGUAGES}
            value={language}
            onChange={(value) => onLanguageChange(value || "ko")}
            allowDeselect={false}
            w={160}
          />
        </Group>
      </Stack>
    </Card>
  );
}
