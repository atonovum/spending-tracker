import { Card, Group, Select, Stack, Text, Title } from "@mantine/core";
import { CURRENCIES, LANGUAGES, useT } from "../lib/i18n.jsx";

export function PreferencesCard({ language, currency = "KRW", onLanguageChange, onCurrencyChange = () => {} }) {
  const t = useT();
  return (
    <Card withBorder radius="card" shadow="soft">
      <Stack gap="xs">
        <Title order={4}>{t("settings.preferences")}</Title>
        <Group justify="space-between" wrap="nowrap" align="center">
          <Text size="sm">{t("settings.language")}</Text>
          <Select
            aria-label={t("settings.language")}
            data={LANGUAGES}
            value={language}
            onChange={(value) => onLanguageChange(value || "ko")}
            allowDeselect={false}
            w={160}
          />
        </Group>
        <Group justify="space-between" wrap="nowrap" align="center">
          <Text size="sm">{t("settings.currency")}</Text>
          <Select
            aria-label={t("settings.currency")}
            data={CURRENCIES}
            value={currency}
            onChange={(value) => onCurrencyChange(value || "KRW")}
            allowDeselect={false}
            w={160}
          />
        </Group>
      </Stack>
    </Card>
  );
}
