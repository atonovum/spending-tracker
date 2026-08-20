import { useState } from "react";
import { Stack } from "@mantine/core";
import { WalletsCard } from "./WalletsCard.jsx";
import { CategoriesCard } from "./CategoriesCard.jsx";
import { LabelsCard } from "./LabelsCard.jsx";
import { ScheduledCard } from "./ScheduledCard.jsx";
import { PreferencesCard } from "./PreferencesCard.jsx";
import { SyncCard } from "./SyncCard.jsx";
import { SignOutButton } from "./SignOutButton.jsx";
import { ConfirmModal } from "./shared.jsx";

/**
 * Only `open` is flipped on close — see `closeConfirm`. The rest is the shape
 * a never-opened modal has.
 */
const EMPTY_CONFIRM = { open: false, title: "", message: "", action: null, confirmLabel: "삭제", confirmColor: "red" };

function Settings({
  state,
  pendingSync,
  onSyncNow,
  scheduledEntries,
  walletTotals,
  language,
  onLanguageChange,
  onWalletCurrencyChange,
  onSelectWallet,
  onAddWallet,
  onRenameWallet,
  onDeleteWallet,
  onExportWallet,
  onImportWallet,
  onSaveCategory,
  onDeleteCategory,
  onMergeCategories,
  onSaveLabel,
  onDeleteLabel,
  onEditSchedule,
  onAddSchedule,
}) {
  const [confirm, setConfirm] = useState(EMPTY_CONFIRM);

  function getCategory(id) {
    return state.categories.find((category) => category.id === id);
  }

  function getLabel(id) {
    return state.labels.find((label) => label.id === id);
  }

  function requestConfirm({ title, message, action, confirmLabel, confirmColor }) {
    setConfirm({
      open: true,
      title,
      message,
      action,
      confirmLabel: confirmLabel || "삭제",
      confirmColor: confirmColor || "red",
    });
  }

  /**
   * Closing keeps the content and only flips `open`.
   *
   * Resetting to `EMPTY_CONFIRM` here wiped the title, message and label while
   * Mantine was still playing the modal's exit transition, so a "로그아웃"
   * dialog visibly turned into a blank one with a "삭제" button on its way out.
   * The payload is fully replaced by the next `requestConfirm`, so leaving it
   * in place costs nothing.
   */
  function closeConfirm() {
    setConfirm((prev) => ({ ...prev, open: false }));
  }

  function handleConfirm() {
    if (confirm.action) confirm.action();
    closeConfirm();
  }

  return (
    <Stack gap="md">
      <WalletsCard
        state={state}
        walletTotals={walletTotals}
        onSelectWallet={onSelectWallet}
        onAddWallet={onAddWallet}
        onRenameWallet={onRenameWallet}
        onDeleteWallet={onDeleteWallet}
        onExportWallet={onExportWallet}
        onImportWallet={onImportWallet}
        onWalletCurrencyChange={onWalletCurrencyChange}
        onConfirm={requestConfirm}
      />

      <CategoriesCard
        state={state}
        onSaveCategory={onSaveCategory}
        onDeleteCategory={onDeleteCategory}
        onMergeCategories={onMergeCategories}
        onConfirm={requestConfirm}
      />

      <LabelsCard
        state={state}
        onSaveLabel={onSaveLabel}
        onDeleteLabel={onDeleteLabel}
        onConfirm={requestConfirm}
      />

      <ScheduledCard
        scheduledEntries={scheduledEntries}
        getCategory={getCategory}
        getLabel={getLabel}
        onEditSchedule={onEditSchedule}
        onAddSchedule={onAddSchedule}
      />

      <PreferencesCard
        language={language}
        onLanguageChange={onLanguageChange}
      />

      <SyncCard
        pendingSync={pendingSync}
        onSyncNow={onSyncNow}
      />

      <SignOutButton pendingSync={pendingSync} onConfirm={requestConfirm} />

      <ConfirmModal
        opened={confirm.open}
        title={confirm.title}
        message={confirm.message}
        onConfirm={handleConfirm}
        onClose={closeConfirm}
        confirmLabel={confirm.confirmLabel}
        confirmColor={confirm.confirmColor}
      />
    </Stack>
  );
}

export default Settings;
