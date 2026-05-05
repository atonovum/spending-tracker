import { useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
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
  IconDownload,
  IconPencil,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { MAX_WALLETS } from "../lib/finance.js";

function WalletRow({ wallet, isSelected, onSelect, onEdit, onExport }) {
  return (
    <Paper withBorder p="sm" radius="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" className="min-w-0 flex-1">
          <ActionIcon
            variant={isSelected ? "filled" : "subtle"}
            color={isSelected ? "yellow" : "gray"}
            onClick={onSelect}
            aria-label={isSelected ? "현재 선택된 지갑" : "이 지갑 선택"}
          >
            {isSelected ? <IconStarFilled size={16} /> : <IconStar size={16} />}
          </ActionIcon>
          <Text fw={600} className="truncate">{wallet.name}</Text>
          <Badge variant="light">{wallet.entries.length}</Badge>
        </Group>
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" onClick={onEdit} aria-label="수정">
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" onClick={onExport} aria-label="내보내기">
            <IconDownload size={16} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

function WalletEditModal({ opened, wallet, isOnly, onClose, onRename, onDelete }) {
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
      title="지갑 수정"
      centered
      size="md"
      onTransitionEnd={() => setDraft(wallet.name)}
    >
      <Stack gap="sm">
        <TextInput
          label="이름"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          autoFocus
        />
        <Text size="xs" c="dimmed">
          거래 {wallet.entries.length}건이 이 지갑에 포함되어 있습니다.
        </Text>
        <Group justify="space-between" pt="sm">
          <Button
            color="red"
            variant="light"
            leftSection={<IconTrash size={16} />}
            onClick={onDelete}
            disabled={isOnly}
            title={isOnly ? "최소 1개의 지갑은 남겨두어야 합니다." : ""}
          >
            지갑 삭제
          </Button>
          <Button leftSection={<IconCheck size={16} />} onClick={handleSave} disabled={!draft.trim()}>
            저장
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ImportModal({ opened, onClose, parsed, fileName, wallets, onConfirm, error }) {
  const [target, setTarget] = useState("__new__");
  const incoming = parsed?.wallet || (Array.isArray(parsed?.wallets) ? parsed.wallets[0] : null);
  const incomingCount = Array.isArray(incoming?.entries) ? incoming.entries.length : 0;
  const canCreateNew = wallets.length < MAX_WALLETS;
  const data = [
    { value: "__new__", label: canCreateNew ? "새 지갑으로 가져오기" : "새 지갑 (한도 초과)", disabled: !canCreateNew },
    ...wallets.map((wallet) => ({ value: wallet.id, label: `${wallet.name} (${wallet.entries.length}건에 추가)` })),
  ];

  function handleConfirm() {
    onConfirm(target === "__new__" ? null : target);
  }

  return (
    <Modal opened={opened} onClose={onClose} title="지갑 가져오기" centered size="md">
      <Stack gap="sm">
        {error ? (
          <Text size="sm" c="red">{error}</Text>
        ) : (
          <>
            <Text size="sm" c="dimmed">파일: {fileName}</Text>
            <Text size="sm">{incoming?.name || "(이름 없음)"} · 거래 {incomingCount}건</Text>
            <Select
              label="가져올 위치"
              data={data}
              value={target}
              onChange={(value) => setTarget(value || "__new__")}
              allowDeselect={false}
            />
            <Text size="xs" c="dimmed">
              기존 지갑을 선택하면 거래가 해당 지갑에 합쳐집니다. 새 지갑으로 가져오려면 첫 옵션을 선택하세요.
            </Text>
          </>
        )}
        <Group justify="flex-end" pt="sm">
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={handleConfirm}
            disabled={!incoming || (target === "__new__" && !canCreateNew)}
          >
            가져오기
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function WalletsCard({
  state,
  onSelectWallet,
  onAddWallet,
  onRenameWallet,
  onDeleteWallet,
  onExportWallet,
  onImportWallet,
  onConfirm,
}) {
  const importResetRef = useRef(null);
  const [editModal, setEditModal] = useState({ open: false, wallet: null });
  const [importModal, setImportModal] = useState({ open: false, parsed: null, fileName: "", error: "" });

  const canAddWallet = state.wallets.length < MAX_WALLETS;

  async function handleImportFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setImportModal({ open: true, parsed, fileName: file.name, error: "" });
    } catch {
      setImportModal({ open: true, parsed: null, fileName: file.name, error: "지갑 파일을 읽지 못했습니다. JSON 형식을 확인해주세요." });
    } finally {
      importResetRef.current?.();
    }
  }

  function confirmImport(targetWalletId) {
    onImportWallet(importModal.parsed, targetWalletId);
    setImportModal({ open: false, parsed: null, fileName: "", error: "" });
  }

  function requestDelete(wallet) {
    if (state.wallets.length <= 1) {
      onConfirm({
        title: "지갑 삭제 불가",
        message: "최소 1개의 지갑은 남겨두어야 합니다.",
        confirmLabel: "확인",
        confirmColor: "blue",
        action: null,
      });
      return;
    }
    onConfirm({
      title: "지갑 삭제",
      message: `"${wallet.name}" 지갑과 ${wallet.entries.length}건의 거래가 모두 삭제됩니다. 계속하시겠습니까?`,
      action: () => {
        onDeleteWallet(wallet.id);
        setEditModal({ open: false, wallet: null });
      },
    });
  }

  return (
    <>
      <Card withBorder radius="sm" shadow="sm">
        <Group justify="space-between" mb="sm" wrap="nowrap">
          <div>
            <Title order={4}>Wallets</Title>
            <Text size="xs" c="dimmed">
              최대 {MAX_WALLETS}개까지 추가할 수 있습니다. ({state.wallets.length}/{MAX_WALLETS})
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            <FileButton onChange={handleImportFile} accept="application/json" resetRef={importResetRef}>
              {(props) => (
                <Button {...props} size="xs" variant="default" leftSection={<IconUpload size={14} />}>
                  가져오기
                </Button>
              )}
            </FileButton>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onAddWallet} disabled={!canAddWallet}>
              지갑 추가
            </Button>
          </Group>
        </Group>
        <Stack gap="xs">
          {state.wallets.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              isSelected={wallet.id === state.selectedWalletId}
              onSelect={() => onSelectWallet(wallet.id)}
              onEdit={() => setEditModal({ open: true, wallet })}
              onExport={() => onExportWallet(wallet.id)}
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
