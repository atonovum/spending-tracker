/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine, createMockState, waitForModal } from '../settings/testUtils.jsx';
import App from '../App.jsx';

describe('EntryEditor - Scheduled Transaction Delete Modal', () => {
  let mockState;

  beforeEach(() => {
    localStorage.clear();
    mockState = createMockState();

    // Get dates relative to today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Add a scheduled entry (started last week)
    mockState.wallets[0].entries.push({
      id: 'sched-1',
      date: lastWeekStr,
      amount: 50000,
      categoryId: 'cat-expense-1',
      labelIds: [],
      note: 'Monthly subscription',
      repeat: 'monthly',
      repeatEndDate: '',
    });

    // Add a future-only scheduled entry (starts tomorrow)
    mockState.wallets[0].entries.push({
      id: 'sched-future',
      date: tomorrowStr,
      amount: 30000,
      categoryId: 'cat-expense-1',
      labelIds: [],
      note: 'Future only',
      repeat: 'monthly',
      repeatEndDate: '',
    });

    // Add a regular (non-scheduled) entry (today)
    mockState.wallets[0].entries.push({
      id: 'regular-1',
      date: todayStr,
      amount: 15000,
      categoryId: 'cat-expense-1',
      labelIds: [],
      note: 'One-time expense',
      repeat: 'none',
      repeatEndDate: '',
    });

    localStorage.setItem('spending-tracker-v3', JSON.stringify(mockState));
  });

  async function openScheduledEntryEditor(user, note) {
    // Navigate to Settings tab
    const settingsTab = screen.getByRole('tab', { name: /settings/i });
    await user.click(settingsTab);

    // Find and click the Scheduled Transactions card
    const scheduledHeading = screen.getByRole('heading', { name: /Scheduled/i });
    const scheduledCard = scheduledHeading.closest('div[class*="Card"]') || scheduledHeading.parentElement;
    await user.click(scheduledCard);

    // Wait for ScheduledModal to open
    await waitForModal();

    // Find the entry by note inside the modal
    const entryCard = screen.getByText(note).closest('div[class*="Paper"]');
    await user.click(entryCard);

    // Wait for EntryEditor modal to open
    await waitForModal();
  }

  it('should show confirmation modal when deleting a scheduled entry from Settings', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await openScheduledEntryEditor(user, 'Monthly subscription');

    // Click the delete button
    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);

    // Confirmation modal should appear
    await waitForModal();
    expect(screen.getByText('예약 거래 삭제')).toBeInTheDocument();
    expect(screen.getByText('이 예약 거래를 어떻게 처리하시겠습니까?')).toBeInTheDocument();
  });

  it('should have three options in the confirmation modal', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await openScheduledEntryEditor(user, 'Monthly subscription');

    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);
    await waitForModal();

    // Check for all three options
    expect(screen.getByText('반복만 중단 (권장)')).toBeInTheDocument();
    expect(screen.getByText('모든 기록 삭제')).toBeInTheDocument();
    expect(screen.getByText('취소')).toBeInTheDocument();
  });

  it('should stop future occurrences when "Stop Future" is selected', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await openScheduledEntryEditor(user, 'Monthly subscription');

    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);
    await waitForModal();

    // Click "Stop Future"
    const stopFutureButton = screen.getByText('반복만 중단 (권장)').closest('button');
    await user.click(stopFutureButton);

    // Wait for modal to close (Mantine animations)
    await waitFor(() => {
      expect(screen.queryByText('예약 거래 삭제')).not.toBeInTheDocument();
    });

    // Entry should still exist with repeatEndDate set to yesterday
    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'sched-1');
    expect(entry).toBeDefined();
    expect(entry.repeatEndDate).toBeTruthy();

    // Verify repeatEndDate is yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    expect(entry.repeatEndDate).toBe(yesterdayStr);
  });

  it('should delete all records when "Delete All" is selected', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await openScheduledEntryEditor(user, 'Monthly subscription');

    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);
    await waitForModal();

    // Click "Delete All"
    const deleteAllButton = screen.getByText('모든 기록 삭제').closest('button');
    await user.click(deleteAllButton);

    // Wait for modal to close (Mantine animations)
    await waitFor(() => {
      expect(screen.queryByText('예약 거래 삭제')).not.toBeInTheDocument();
    });

    // Entry should be deleted
    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'sched-1');
    expect(entry).toBeUndefined();
  });

  it('should close modal without changes when "Cancel" is selected', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    // Get initial state before opening
    const initialState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const initialEntry = initialState.wallets[0].entries.find(e => e.id === 'sched-1');

    await openScheduledEntryEditor(user, 'Monthly subscription');

    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);
    await waitForModal();

    // Click "Cancel"
    const cancelButton = screen.getByRole('button', { name: /취소/i });
    await user.click(cancelButton);

    // Wait for modal to close (Mantine animations)
    await waitFor(() => {
      expect(screen.queryByText('예약 거래 삭제')).not.toBeInTheDocument();
    });

    // Entry should remain unchanged
    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'sched-1');
    expect(entry).toEqual(initialEntry);
  });

  it('should show message for future-only scheduled transactions', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await openScheduledEntryEditor(user, 'Future only');

    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);
    await waitForModal();

    // Should show message about no past occurrences
    expect(screen.getByText('아직 발생하지 않은 예약 거래입니다.')).toBeInTheDocument();

    // "Stop Future" button should not be present
    expect(screen.queryByText('반복만 중단 (권장)')).not.toBeInTheDocument();

    // But "Delete All" should still be available
    expect(screen.getByText('모든 기록 삭제')).toBeInTheDocument();
  });

  it('should NOT show confirmation modal for regular entries', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    // Ledger tab is default, find and click on a regular (non-scheduled) entry
    // The entry we added has today's date, so it should appear
    const entryCard = screen.getByText('One-time expense');
    await user.click(entryCard);
    await waitForModal();

    // Click delete
    const deleteButton = screen.getByRole('button', { name: /삭제/i });
    await user.click(deleteButton);

    // Confirmation modal should NOT appear - entry should be deleted immediately
    expect(screen.queryByText('예약 거래 삭제')).not.toBeInTheDocument();

    // Entry should be deleted
    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'regular-1');
    expect(entry).toBeUndefined();
  });
});
