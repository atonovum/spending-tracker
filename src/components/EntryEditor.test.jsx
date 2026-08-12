/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine, createMockState, waitForModal } from '../settings/testUtils.jsx';
import App from '../App.jsx';

const STATE_KEY = 'spending-tracker-v4';

const formatDateLocal = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Day 1 is the only day-of-month every month has, so a monthly series anchored
 *  to it stays well-defined whatever today's date is. */
const firstOfMonth = (monthOffset) => {
  const now = new Date();
  return formatDateLocal(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1));
};

const readState = () => JSON.parse(localStorage.getItem(STATE_KEY));
const wallet = (state) => state.wallets[0];

describe('Scheduled transactions — materialisation in the app', () => {
  const seriesStart = firstOfMonth(-2);
  const thisMonth = firstOfMonth(0);

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries = [];
    mockState.wallets[0].scheduled = [
      {
        id: 'rent',
        startDate: seriesStart,
        amount: 500000,
        categoryId: 'cat-expense-1',
        labelIds: [],
        note: '월세 반복',
        repeat: 'monthly',
        repeatEndDate: '',
        lastRunDate: '',
      },
    ];
    localStorage.setItem(STATE_KEY, JSON.stringify(mockState));
  });

  it('creates a real transaction for every occurrence that has come due', async () => {
    renderWithMantine(<App />);

    await waitFor(() => expect(readState().wallets[0].entries.length).toBeGreaterThan(0));
    const entries = wallet(readState()).entries;

    // Three months' worth: the start month, the one after, and this one.
    expect(entries.map((entry) => entry.date).sort()).toEqual([seriesStart, firstOfMonth(-1), thisMonth]);
    // A materialised row is a plain entry — no repeat, no link the UI depends on.
    expect(entries[0]).not.toHaveProperty('repeat');
    expect(wallet(readState()).scheduled[0].lastRunDate).toBe(thisMonth);
  });

  it('does not create the same transaction twice when the app loads again', async () => {
    renderWithMantine(<App />);
    await waitFor(() => expect(readState().wallets[0].entries.length).toBe(3));

    const { unmount } = renderWithMantine(<App />);
    unmount();
    renderWithMantine(<App />);

    await waitFor(() => expect(readState().wallets[0].entries.length).toBe(3));
  });
});

describe('Scheduled transactions — editing', () => {
  const seriesStart = firstOfMonth(-2);
  const thisMonth = firstOfMonth(0);

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries = [];
    mockState.wallets[0].scheduled = [
      {
        id: 'rent',
        startDate: seriesStart,
        amount: 500000,
        categoryId: 'cat-expense-1',
        labelIds: [],
        note: '월세 반복',
        repeat: 'monthly',
        repeatEndDate: '',
        lastRunDate: '',
      },
    ];
    localStorage.setItem(STATE_KEY, JSON.stringify(mockState));
  });

  async function openScheduleFromSettings(user) {
    renderWithMantine(<App />);
    await user.click(screen.getByRole('tab', { name: /settings/i }));

    const heading = screen.getByRole('heading', { name: /Scheduled/i });
    await user.click(heading.closest('div[class*="Card"]') || heading.parentElement);
    await waitForModal();

    const scheduledModal = screen.getByRole('dialog');
    await user.click(within(scheduledModal).getByText('월세 반복').closest('div[class*="Paper"]'));
    await waitForModal();

    return screen.getByText('예약 거래 수정').closest('[role="dialog"]');
  }

  it('opens the schedule itself, showing its start date and leaving it editable', async () => {
    const user = userEvent.setup();
    const dialog = await openScheduleFromSettings(user);

    const startDate = within(dialog).getByLabelText('시작일');
    expect(startDate).toHaveValue(seriesStart);
    expect(startDate).not.toBeDisabled();
  });

  it('leaves already-created transactions alone when the schedule changes', async () => {
    const user = userEvent.setup();
    const dialog = await openScheduleFromSettings(user);

    const before = wallet(readState()).entries;
    expect(before).toHaveLength(3);

    const amount = within(dialog).getByLabelText(/금액/);
    await user.clear(amount);
    await user.type(amount, '900000');
    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    await waitFor(() => expect(wallet(readState()).scheduled[0].amount).toBe(900000));

    // The whole point of materialisation: history is a record, not a view of
    // the template. Raising the rent must not rewrite the months already paid.
    const after = wallet(readState()).entries;
    expect(after).toHaveLength(3);
    expect(after.every((entry) => entry.amount === 500000)).toBe(true);
  });

  it('keeps the cursor, so a saved schedule does not re-create its history', async () => {
    const user = userEvent.setup();
    const dialog = await openScheduleFromSettings(user);

    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    await waitFor(() => expect(wallet(readState()).scheduled[0].lastRunDate).toBe(thisMonth));
    expect(wallet(readState()).entries).toHaveLength(3);
  });
});

describe('Scheduled transactions — deleting', () => {
  const seriesStart = firstOfMonth(-2);

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries = [];
    mockState.wallets[0].scheduled = [
      {
        id: 'rent',
        startDate: seriesStart,
        amount: 500000,
        categoryId: 'cat-expense-1',
        labelIds: [],
        note: '월세 반복',
        repeat: 'monthly',
        repeatEndDate: '',
        lastRunDate: '',
      },
    ];
    localStorage.setItem(STATE_KEY, JSON.stringify(mockState));
  });

  async function openDeleteConfirm(user) {
    renderWithMantine(<App />);
    await user.click(screen.getByRole('tab', { name: /settings/i }));

    const heading = screen.getByRole('heading', { name: /Scheduled/i });
    await user.click(heading.closest('div[class*="Card"]') || heading.parentElement);
    await waitForModal();
    await user.click(within(screen.getByRole('dialog')).getByText('월세 반복').closest('div[class*="Paper"]'));
    await waitForModal();

    const editor = screen.getByText('예약 거래 수정').closest('[role="dialog"]');
    await user.click(within(editor).getByRole('button', { name: /삭제/i }));
    await waitForModal();

    return screen.getByText('예약 거래 삭제').closest('[role="dialog"]');
  }

  it('asks once, and says what happens to the transactions already created', async () => {
    const user = userEvent.setup();
    const dialog = await openDeleteConfirm(user);

    expect(within(dialog).getByText('이미 만들어진 거래는 그대로 남습니다.')).toBeInTheDocument();
    // The old three-way dialog is gone: "반복만 중단" only existed to keep the
    // template alive so past rows kept being computed.
    expect(screen.queryByText(/반복만 중단/)).not.toBeInTheDocument();
    expect(screen.queryByText('모든 기록 삭제')).not.toBeInTheDocument();
  });

  it('keeps every transaction the schedule already created', async () => {
    const user = userEvent.setup();
    const dialog = await openDeleteConfirm(user);

    expect(wallet(readState()).entries).toHaveLength(3);
    await user.click(within(dialog).getByRole('button', { name: /삭제/i }));

    await waitFor(() => expect(wallet(readState()).scheduled).toHaveLength(0));
    expect(wallet(readState()).entries).toHaveLength(3);
  });

  it('leaves the schedule untouched when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const dialog = await openDeleteConfirm(user);

    await user.click(within(dialog).getByRole('button', { name: /취소/i }));

    await waitFor(() => expect(screen.queryByText('예약 거래 삭제')).not.toBeInTheDocument());
    expect(wallet(readState()).scheduled).toHaveLength(1);
  });
});

describe('EntryEditor — a materialised transaction is an ordinary entry', () => {
  const seriesStart = firstOfMonth(-2);
  const thisMonth = firstOfMonth(0);

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries = [];
    mockState.wallets[0].scheduled = [
      {
        id: 'rent',
        startDate: seriesStart,
        amount: 500000,
        categoryId: 'cat-expense-1',
        labelIds: [],
        note: '월세 반복',
        repeat: 'monthly',
        repeatEndDate: '',
        lastRunDate: '',
      },
    ];
    localStorage.setItem(STATE_KEY, JSON.stringify(mockState));
  });

  async function openLedgerRow(user) {
    renderWithMantine(<App />);
    await user.click(await screen.findByText('월세 반복'));
    await waitForModal();
    return screen.getByRole('dialog');
  }

  it('shows the row that was clicked, with an editable date and no repeat field', async () => {
    const user = userEvent.setup();
    const dialog = await openLedgerRow(user);

    const date = within(dialog).getByLabelText('날짜');
    expect(date).toHaveValue(thisMonth);
    // The lock this editor used to apply existed because the row was computed
    // from the template. It is a stored record now, so there is nothing to lock.
    expect(date).not.toBeDisabled();
    expect(within(dialog).queryByLabelText('반복')).not.toBeInTheDocument();
  });

  it('edits one occurrence without moving the series or its siblings', async () => {
    const user = userEvent.setup();
    const dialog = await openLedgerRow(user);

    const amount = within(dialog).getByLabelText(/금액/);
    await user.clear(amount);
    await user.type(amount, '123456');
    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    await waitFor(() => {
      const entries = wallet(readState()).entries;
      expect(entries.find((entry) => entry.date === thisMonth).amount).toBe(123456);
    });

    const state = readState();
    expect(wallet(state).scheduled[0].startDate).toBe(seriesStart);
    expect(wallet(state).scheduled[0].amount).toBe(500000);
    expect(wallet(state).entries.filter((entry) => entry.amount === 500000)).toHaveLength(2);
  });

  it('deletes just that transaction, with no confirmation dialog', async () => {
    const user = userEvent.setup();
    const dialog = await openLedgerRow(user);

    await user.click(within(dialog).getByRole('button', { name: /삭제/i }));

    await waitFor(() => expect(wallet(readState()).entries).toHaveLength(2));
    expect(screen.queryByText('예약 거래 삭제')).not.toBeInTheDocument();
    expect(wallet(readState()).scheduled).toHaveLength(1);
  });

  it('does not resurrect a deleted occurrence on the next load', async () => {
    const user = userEvent.setup();
    const dialog = await openLedgerRow(user);
    await user.click(within(dialog).getByRole('button', { name: /삭제/i }));
    await waitFor(() => expect(wallet(readState()).entries).toHaveLength(2));

    renderWithMantine(<App />);

    await waitFor(() => expect(wallet(readState()).entries).toHaveLength(2));
  });
});

describe('EntryEditor — adding transactions and schedules', () => {
  const todayStr = formatDateLocal(new Date());
  const nextWeek = formatDateLocal(new Date(Date.now() + 7 * 86400000));

  beforeEach(() => {
    localStorage.clear();
    const mockState = createMockState();
    mockState.wallets[0].entries = [];
    localStorage.setItem(STATE_KEY, JSON.stringify(mockState));
  });

  async function openAddEntry(user) {
    renderWithMantine(<App />);
    await user.click(screen.getByRole('button', { name: '거래 추가' }));
    await waitForModal();
    return screen.getByRole('dialog');
  }

  it('stores a plain past-or-today transaction as an entry', async () => {
    const user = userEvent.setup();
    const dialog = await openAddEntry(user);

    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    await waitFor(() => expect(wallet(readState()).entries).toHaveLength(1));
    expect(wallet(readState()).entries[0].date).toBe(todayStr);
    expect(wallet(readState()).scheduled).toHaveLength(0);
  });

  it('turns a future-dated transaction into a one-time schedule', async () => {
    const user = userEvent.setup();
    const dialog = await openAddEntry(user);

    const date = within(dialog).getByLabelText('날짜');
    await user.clear(date);
    await user.type(date, nextWeek);
    await user.click(within(dialog).getByRole('button', { name: /저장/i }));

    await waitFor(() => expect(wallet(readState()).scheduled).toHaveLength(1));
    const schedule = wallet(readState()).scheduled[0];
    expect(schedule.startDate).toBe(nextWeek);
    expect(schedule.repeat).toBe('none');
    // It has not happened yet, so there is no transaction for it.
    expect(wallet(readState()).entries).toHaveLength(0);
  });
});

describe('EntryEditor - default date and date shortcuts', () => {
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
    });
    localStorage.setItem(STATE_KEY, JSON.stringify(mockState));
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
    const savedState = readState();
    expect(savedState.version).toBe(4);
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
      expect(wallet(readState()).entries.find((e) => e.id === 'edit-me').date).toBe(yesterdayStr);
    });
    expect(localStorage.getItem(LAST_DATE_KEY)).toBe('2026-02-14');

    await waitForModalClosed();
    const dialog = await openAddEntry(user);
    expect(within(dialog).getByLabelText('날짜')).toHaveValue('2026-02-14');
  });

  it('keeps the stored entry free of derived occurrence fields after saving', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await user.click(screen.getByText('Editable today entry'));
    await waitForModal();
    const editor = screen.getByText('거래 수정').closest('[role="dialog"]');
    await user.click(within(editor).getByRole('button', { name: /저장/i }));

    await waitFor(() => {
      const entry = wallet(readState()).entries.find((e) => e.id === 'edit-me');
      expect(entry.category).toBeUndefined();
      expect(entry.labels).toBeUndefined();
      expect(entry.occurrenceDate).toBeUndefined();
    });
  });

  it('selects multiple labels from the entry label dropdown', async () => {
    const user = userEvent.setup();
    renderWithMantine(<App />);

    await user.click(screen.getByText('Editable today entry'));
    await waitForModal();
    const editor = screen.getByText('거래 수정').closest('[role="dialog"]');

    expect(within(editor).getByText('선택 0개')).toBeInTheDocument();

    const labelInput = within(editor).getByPlaceholderText('레이블');
    await user.click(labelInput);
    await user.click(await screen.findByRole('option', { name: '업무' }));
    await user.click(labelInput);
    await user.click(await screen.findByRole('option', { name: '개인' }));

    expect(within(editor).getByText('선택 2개')).toBeInTheDocument();

    await user.click(within(editor).getByRole('button', { name: /저장/i }));

    await waitFor(() => {
      expect(wallet(readState()).entries.find((e) => e.id === 'edit-me').labelIds).toEqual(['label-1', 'label-2']);
    });
  });
});
