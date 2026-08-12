import { useState } from "react";
import { Stack } from "@mantine/core";
import { WalletsCard } from "./WalletsCard.jsx";
import { CategoriesCard } from "./CategoriesCard.jsx";
import { LabelsCard } from "./LabelsCard.jsx";
import { ScheduledCard } from "./ScheduledCard.jsx";
import { PreferencesCard } from "./PreferencesCard.jsx";
import { ConfirmModal } from "./shared.jsx";

const EMPTY_CONFIRM = { open: false, title: "", message: "", action: null, confirmLabel: "삭제", confirmColor: "red" };

function Settings({
  state,
  scheduledEntries,
  walletTotals,
  language,
  currency,
  onLanguageChange,
  onCurrencyChange,
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

  function handleConfirm() {
    if (confirm.action) confirm.action();
    setConfirm(EMPTY_CONFIRM);
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
        currency={currency}
        onLanguageChange={onLanguageChange}
        onCurrencyChange={onCurrencyChange}
      />

      <ConfirmModal
        opened={confirm.open}
        title={confirm.title}
        message={confirm.message}
        onConfirm={handleConfirm}
        onClose={() => setConfirm(EMPTY_CONFIRM)}
        confirmLabel={confirm.confirmLabel}
        confirmColor={confirm.confirmColor}
      />
    </Stack>
  );
}

export default Settings;
