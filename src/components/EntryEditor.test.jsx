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

    const formatDateLocal = (date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const today = new Date();
    const todayStr = formatDateLocal(today);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = formatDateLocal(lastWeek);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateLocal(tomorrow);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateLocal(yesterday);

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

    mockState.wallets[0].entries.push({
      id: 'one-time-future',
      date: tomorrowStr,
      amount: 42000,
      categoryId: 'cat-expense-1',
      labelIds: [],
      note: 'Future one-time',
      repeat: 'none',
      repeatEndDate: '',
    });

    mockState.wallets[0].entries.push({
      id: 'one-time-past',
      date: yesterdayStr,
      amount: 12000,
      categoryId: 'cat-expense-1',
      labelIds: [],
      note: 'Past one-time',
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
    const modal = screen.getByRole('dialog');
    const entryCard = within(modal).getByText(note).closest('div[class*="Paper"]');
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

  // The editor and the delete-confirmation modal both carry a "취소" button, and
  // the editor stays mounted underneath the confirmation. Scope every 취소 query
  // to its own dialog instead of searching the whole screen.
  function getDialogContaining(text) {
    return screen.getByText(text).closest('[role="dialog"]');
  }

  it('should close the editor when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await openScheduledEntryEditor(user, 'Monthly subscription');

    const editorModal = getDialogContaining('거래 수정');
    await user.click(within(editorModal).getByRole('button', { name: /취소/i }));

    await waitFor(() => {
      expect(screen.queryByText('거래 수정')).not.toBeInTheDocument();
    });
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
    expect(within(getDialogContaining('예약 거래 삭제')).getByText('취소')).toBeInTheDocument();
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
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const yesterdayStr = `${yyyy}-${mm}-${dd}`;
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
    const cancelButton = within(getDialogContaining('예약 거래 삭제')).getByRole('button', { name: /취소/i });
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

  it('should list future one-time transactions in Settings scheduled list only', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const settingsTab = screen.getByRole('tab', { name: /settings/i });
    await user.click(settingsTab);

    const scheduledHeading = screen.getByRole('heading', { name: /Scheduled/i });
    const scheduledCard = scheduledHeading.closest('div[class*="Card"]') || scheduledHeading.parentElement;
    await user.click(scheduledCard);
    await waitForModal();

    const modal = screen.getByRole('dialog');
    expect(within(modal).getByText('Future one-time')).toBeInTheDocument();
    expect(within(modal).queryByText('Past one-time')).not.toBeInTheDocument();
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

  it('should keep the stored entry free of derived occurrence fields after saving', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const entryCard = screen.getByText('One-time expense');
    await user.click(entryCard);
    await waitForModal();

    const saveButton = screen.getByRole('button', { name: /저장/i });
    await user.click(saveButton);

    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'regular-1');
    expect(entry.occurrenceDate).toBeUndefined();
    expect(entry.category).toBeUndefined();
    expect(entry.labels).toBeUndefined();
  });

  it('should select multiple labels from the entry label dropdown', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const entryCard = screen.getByText('One-time expense');
    await user.click(entryCard);
    await waitForModal();

    expect(screen.getByText('선택 0개')).toBeInTheDocument();

    const labelInput = screen.getByPlaceholderText('레이블');
    await user.click(labelInput);
    await user.click(await screen.findByRole('option', { name: '업무' }));
    await user.click(labelInput);
    await user.click(await screen.findByRole('option', { name: '개인' }));

    expect(screen.getByText('선택 2개')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /저장/i });
    await user.click(saveButton);

    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'regular-1');
    expect(entry.labelIds).toEqual(['label-1', 'label-2']);
  });
});

// Regression: a ledger row for a repeating entry is an *occurrence*, not the
// stored entry. Opening it used to show the series seed date (the Aug 5 start)
// instead of the occurrence the user clicked (Sep 5), and saving from there
// would have rewritten the seed and shifted every future occurrence.
describe('EntryEditor - repeating occurrence date', () => {
  const formatDateLocal = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Day 1 is the only day-of-month that exists in every month, so the seed and
  // the current-month occurrence stay well-defined whatever today's date is.
  const firstOfMonth = (monthOffset) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  };

  const seedDateStr = formatDateLocal(firstOfMonth(-2));
  const occurrenceDateStr = formatDateLocal(firstOfMonth(0));

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries = [
      {
        id: 'rent-1',
        date: seedDateStr,
        amount: 500000,
        categoryId: 'cat-expense-1',
        labelIds: [],
        note: '월세 반복',
        repeat: 'monthly',
        repeatEndDate: '',
      },
    ];
    localStorage.setItem('spending-tracker-v3', JSON.stringify(mockState));
  });

  async function openCurrentMonthOccurrence(user) {
    renderWithMantine(<App />);
    await user.click(screen.getByText('월세 반복'));
    await waitForModal();
    return screen.getByRole('dialog');
  }

  async function openSeedFromSettings(user) {
    renderWithMantine(<App />);
    await user.click(screen.getByRole('tab', { name: /settings/i }));

    const scheduledHeading = screen.getByRole('heading', { name: /Scheduled/i });
    const scheduledCard = scheduledHeading.closest('div[class*="Card"]') || scheduledHeading.parentElement;
    await user.click(scheduledCard);
    await waitForModal();

    const scheduledModal = screen.getByRole('dialog');
    await user.click(within(scheduledModal).getByText('월세 반복').closest('div[class*="Paper"]'));
    await waitForModal();

    return screen.getByText('거래 수정').closest('[role="dialog"]');
  }

  it('shows the clicked occurrence date, not the series seed date', async () => {
    const user = userEvent.setup();
    const dialog = await openCurrentMonthOccurrence(user);

    expect(within(dialog).getByLabelText('날짜')).toHaveValue(occurrenceDateStr);
    expect(occurrenceDateStr).not.toBe(seedDateStr);
  });

  it('locks the date field on an occurrence and explains where the start date lives', async () => {
    const user = userEvent.setup();
    const dialog = await openCurrentMonthOccurrence(user);

    expect(within(dialog).getByLabelText('날짜')).toBeDisabled();
    expect(within(dialog).getByText(new RegExp(seedDateStr))).toBeInTheDocument();
  });

  it('does not move the series when an occurrence is saved', async () => {
    const user = userEvent.setup();
    const dialog = await openCurrentMonthOccurrence(user);

    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    const entry = savedState.wallets[0].entries.find(e => e.id === 'rent-1');
    expect(entry.date).toBe(seedDateStr);
    expect(entry.repeat).toBe('monthly');
    expect(entry.occurrenceDate).toBeUndefined();
  });

  it('keeps the series start date editable from the Settings scheduled list', async () => {
    const user = userEvent.setup();
    const dialog = await openSeedFromSettings(user);

    const dateInput = within(dialog).getByLabelText('날짜');
    expect(dateInput).toHaveValue(seedDateStr);
    expect(dateInput).not.toBeDisabled();
  });
});

describe('EntryEditor - default date and date shortcuts', () => {
  const formatDateLocal = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = formatDateLocal(new Date());
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDateLocal(d);
  })();

  const LAST_DATE_KEY = 'spending-tracker-last-entry-date';

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries.push({
      id: 'edit-me',
      date: todayStr,
      amount: 15000,
      categoryId: 'cat-expense-1',
      labelIds: [],
      note: 'Editable today entry',
      repeat: 'none',
      repeatEndDate: '',
    });
    localStorage.setItem('spending-tracker-v3', JSON.stringify(mockState));
  });

  // The FAB and the modal heading share the "거래 추가" text, so this query is
  // pinned to the button role, and everything inside the editor is scoped to
  // the dialog.
  async function openAddEntry(user) {
    await user.click(screen.getByRole('button', { name: '거래 추가' }));
    await waitForModal();
    return screen.getByRole('dialog');
  }

  // The editor only re-reads its defaults when it remounts, and Mantine keeps a
  // closing modal mounted through its exit transition. Reopening before that
  // finishes would assert against the previous session's state.
  async function waitForModalClosed() {
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  }

  it('defaults to today when no entry has been added on this device yet', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const dialog = await openAddEntry(user);

    expect(within(dialog).getByLabelText('날짜')).toHaveValue(todayStr);
  });

  it('defaults to the date the last entry was added with', async () => {
    localStorage.setItem(LAST_DATE_KEY, '2026-02-14');
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const dialog = await openAddEntry(user);

    expect(within(dialog).getByLabelText('날짜')).toHaveValue('2026-02-14');
  });

  it('falls back to today when the stored date is unusable', async () => {
    localStorage.setItem(LAST_DATE_KEY, 'not-a-date');
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const dialog = await openAddEntry(user);

    expect(within(dialog).getByLabelText('날짜')).toHaveValue(todayStr);
  });

  it('sets the date from the 어제 and 오늘 buttons', async () => {
    localStorage.setItem(LAST_DATE_KEY, '2026-02-14');
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const dialog = await openAddEntry(user);
    const dateInput = within(dialog).getByLabelText('날짜');

    await user.click(within(dialog).getByRole('button', { name: '어제' }));
    expect(dateInput).toHaveValue(yesterdayStr);

    await user.click(within(dialog).getByRole('button', { name: '오늘' }));
    expect(dateInput).toHaveValue(todayStr);
  });

  it('remembers the date after an entry is added, without touching the state schema', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    const dialog = await openAddEntry(user);
    await user.click(within(dialog).getByRole('button', { name: '어제' }));
    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    await waitFor(() => {
      expect(localStorage.getItem(LAST_DATE_KEY)).toBe(yesterdayStr);
    });

    // The preference lives in its own key: the persisted document is untouched.
    const savedState = JSON.parse(localStorage.getItem('spending-tracker-v3'));
    expect(savedState.version).toBe(3);
    expect(savedState.lastEntryDate).toBeUndefined();

    await waitForModalClosed();
    const reopened = await openAddEntry(user);
    expect(within(reopened).getByLabelText('날짜')).toHaveValue(yesterdayStr);
  });

  it('does not re-seed the default date when an existing entry is edited', async () => {
    localStorage.setItem(LAST_DATE_KEY, '2026-02-14');
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await user.click(screen.getByText('Editable today entry'));
    await waitForModal();
    const editor = screen.getByText('거래 수정').closest('[role="dialog"]');
    await user.click(within(editor).getByRole('button', { name: '어제' }));
    await user.click(within(editor).getByRole('button', { name: /저장/i }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('spending-tracker-v3'));
      expect(saved.wallets[0].entries.find(e => e.id === 'edit-me').date).toBe(yesterdayStr);
    });
    expect(localStorage.getItem(LAST_DATE_KEY)).toBe('2026-02-14');

    await waitForModalClosed();
    const dialog = await openAddEntry(user);
    expect(within(dialog).getByLabelText('날짜')).toHaveValue('2026-02-14');
  });
});
