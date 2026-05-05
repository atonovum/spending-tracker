import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export function ConfirmModal({ opened, title, message, onConfirm, onClose, confirmColor = "red", confirmLabel = "삭제" }) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered size="sm">
      <Stack gap="md">
        <Text size="sm" style={{ whiteSpace: "pre-line" }}>{message}</Text>
        <Group justify="flex-end">
          <Button color={confirmColor} onClick={onConfirm}>{confirmLabel}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function buildCategoryStats(wallets) {
  const map = new Map();
  for (const wallet of wallets) {
    for (const entry of wallet.entries) {
      const cur = map.get(entry.categoryId) || { count: 0, walletIds: new Set() };
      cur.count += 1;
      cur.walletIds.add(wallet.id);
      map.set(entry.categoryId, cur);
    }
  }
  return map;
}

export function buildLabelStats(wallets) {
  const map = new Map();
  for (const wallet of wallets) {
    for (const entry of wallet.entries) {
      const cur = map.get(entry.labelId) || { count: 0, walletIds: new Set() };
      cur.count += 1;
      cur.walletIds.add(wallet.id);
      map.set(entry.labelId, cur);
    }
  }
  return map;
}

export function usageText(stat, t) {
  if (!stat || !stat.count) return t ? t("settings.usage.zero") : "사용 0건";
  if (t) return t("settings.usage.text", { wallets: stat.walletIds.size, count: stat.count });
  return `${stat.walletIds.size}개 지갑의 ${stat.count}개 거래`;
}
