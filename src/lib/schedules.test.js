import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dueOccurrences,
  isLegacyTemplateEntry,
  isSpentSchedule,
  materializeSchedule,
  materializeState,
  materializeWallet,
  migrateLegacyTemplates,
  normalizeSchedule,
  scheduleOccurrenceId,
  todayString,
  upcomingDate,
} from './schedules.js';
import { buildOccurrences, fromDateInput, resolveFullRange } from './finance.js';
import { normalizeState, SCHEMA_VERSION } from './storage.js';

const TODAY = '2026-08-12';

function monthlySchedule(overrides = {}) {
  return normalizeSchedule({
    id: 'rent',
    startDate: '2026-05-12',
    amount: 500000,
    categoryId: 'cat-1',
    labelIds: ['label-1'],
    note: '월세',
    repeat: 'monthly',
    ...overrides,
  });
}

describe('normalizeSchedule', () => {
  it('fills every field of the schedule shape', () => {
    const schedule = normalizeSchedule({ startDate: '2026-01-01' }, [{ id: 'cat-1' }]);

    expect(schedule).toMatchObject({
      startDate: '2026-01-01',
      amount: 0,
      categoryId: 'cat-1',
      labelIds: [],
      note: '',
      repeat: 'none',
      repeatEndDate: '',
      lastRunDate: '',
    });
    expect(schedule.id).toBeTruthy();
  });

  it('accepts a legacy entry `date` as the start date', () => {
    expect(normalizeSchedule({ date: '2026-03-04' }).startDate).toBe('2026-03-04');
  });

  it('drops label ids that no longer exist', () => {
    const schedule = normalizeSchedule({ startDate: '2026-01-01', labelIds: ['a', 'b'] }, [], new Set(['b']));
    expect(schedule.labelIds).toEqual(['b']);
  });

  it('rejects an unusable cursor or end date rather than carrying it forward', () => {
    const schedule = normalizeSchedule({ startDate: '2026-01-01', lastRunDate: 'nope', repeatEndDate: '' });
    expect(schedule.lastRunDate).toBe('');
    expect(schedule.repeatEndDate).toBe('');
  });
});

describe('dueOccurrences', () => {
  it('lists every occurrence up to today', () => {
    expect(dueOccurrences(monthlySchedule(), TODAY)).toEqual(['2026-05-12', '2026-06-12', '2026-07-12', '2026-08-12']);
  });

  it('stops at the repeat end date', () => {
    expect(dueOccurrences(monthlySchedule({ repeatEndDate: '2026-06-30' }), TODAY)).toEqual(['2026-05-12', '2026-06-12']);
  });

  it('returns only what the cursor has not covered', () => {
    expect(dueOccurrences(monthlySchedule({ lastRunDate: '2026-06-12' }), TODAY)).toEqual(['2026-07-12', '2026-08-12']);
  });

  it('is empty for a schedule that starts in the future', () => {
    expect(dueOccurrences(monthlySchedule({ startDate: '2026-09-01' }), TODAY)).toEqual([]);
  });

  it('is empty for a one-time schedule that already fired', () => {
    const schedule = normalizeSchedule({ startDate: '2026-08-01', repeat: 'none', lastRunDate: '2026-08-01' });
    expect(dueOccurrences(schedule, TODAY)).toEqual([]);
  });

  it('ignores a schedule with no usable start date', () => {
    expect(dueOccurrences({ startDate: '', repeat: 'monthly' }, TODAY)).toEqual([]);
  });
});

describe('materializeSchedule', () => {
  it('writes one plain entry per due occurrence and advances the cursor', () => {
    const { schedule, created } = materializeSchedule(monthlySchedule(), new Set(), TODAY);

    expect(created).toHaveLength(4);
    expect(created[0]).toEqual({
      id: scheduleOccurrenceId('rent', '2026-05-12'),
      date: '2026-05-12',
      amount: 500000,
      categoryId: 'cat-1',
      labelIds: ['label-1'],
      note: '월세',
    });
    // A materialised transaction is an ordinary entry: no repeat fields, no
    // pointer back at the template.
    expect(Object.keys(created[0]).sort()).toEqual(['amount', 'categoryId', 'date', 'id', 'labelIds', 'note']);
    expect(schedule.lastRunDate).toBe('2026-08-12');
  });

  it('copies the label list instead of sharing it with the schedule', () => {
    const schedule = monthlySchedule();
    const { created } = materializeSchedule(schedule, new Set(), TODAY);

    created[0].labelIds.push('label-2');
    expect(schedule.labelIds).toEqual(['label-1']);
  });

  it('returns the same schedule object when nothing is due', () => {
    const schedule = monthlySchedule({ lastRunDate: '2026-08-12' });
    const result = materializeSchedule(schedule, new Set(), TODAY);

    expect(result.schedule).toBe(schedule);
    expect(result.created).toEqual([]);
  });

  it('creates nothing the second time — the cursor closes the window', () => {
    const first = materializeSchedule(monthlySchedule(), new Set(), TODAY);
    const second = materializeSchedule(first.schedule, new Set(), TODAY);

    expect(second.created).toEqual([]);
  });

  it('creates nothing the second time even if the cursor was lost', () => {
    const ids = new Set();
    materializeSchedule(monthlySchedule(), ids, TODAY);
    // A restored backup, a half-applied sync: the cursor is back at "" but the
    // entries are already there. The derived id is the second guard.
    const second = materializeSchedule(monthlySchedule(), ids, TODAY);

    expect(second.created).toEqual([]);
    expect(second.schedule.lastRunDate).toBe('2026-08-12');
  });
});

describe('materializeWallet', () => {
  it('appends the created entries and keeps the existing ones untouched', () => {
    const existing = { id: 'e1', date: '2026-01-01', amount: 1, categoryId: 'cat-1', labelIds: [], note: '' };
    const wallet = materializeWallet({ id: 'w', entries: [existing], scheduled: [monthlySchedule()] }, TODAY);

    expect(wallet.entries).toHaveLength(5);
    expect(wallet.entries).toContain(existing);
  });

  it('returns the same wallet object when nothing was due', () => {
    const wallet = { id: 'w', entries: [], scheduled: [monthlySchedule({ startDate: '2026-09-01' })] };
    expect(materializeWallet(wallet, TODAY)).toBe(wallet);
  });

  it('returns the same wallet object when there are no schedules at all', () => {
    const wallet = { id: 'w', entries: [], scheduled: [] };
    expect(materializeWallet(wallet, TODAY)).toBe(wallet);
  });

  it('drops a one-time schedule once it has fired', () => {
    const wallet = materializeWallet(
      { id: 'w', entries: [], scheduled: [normalizeSchedule({ id: 's', startDate: '2026-08-01', repeat: 'none', amount: 10 })] },
      TODAY
    );

    // Nothing is lost: its content is now an independent transaction.
    expect(wallet.scheduled).toEqual([]);
    expect(wallet.entries).toHaveLength(1);
    expect(wallet.entries[0].date).toBe('2026-08-01');
  });

  it('keeps a repeating schedule whose end date has passed, so it can be resumed', () => {
    const wallet = materializeWallet(
      { id: 'w', entries: [], scheduled: [monthlySchedule({ repeatEndDate: '2026-06-30' })] },
      TODAY
    );

    expect(wallet.scheduled).toHaveLength(1);
    expect(wallet.entries).toHaveLength(2);
  });

  it('does not re-create an entry the user deleted', () => {
    const once = materializeWallet({ id: 'w', entries: [], scheduled: [monthlySchedule()] }, TODAY);
    const pruned = { ...once, entries: once.entries.filter((entry) => entry.date !== '2026-06-12') };

    const twice = materializeWallet(pruned, TODAY);

    expect(twice).toBe(pruned);
    expect(twice.entries).toHaveLength(3);
  });
});

describe('materializeState', () => {
  it('materialises every wallet', () => {
    const state = {
      wallets: [
        { id: 'a', entries: [], scheduled: [monthlySchedule()] },
        { id: 'b', entries: [], scheduled: [normalizeSchedule({ id: 's', startDate: '2026-08-10', repeat: 'none', amount: 1 })] },
      ],
    };
    const next = materializeState(state, TODAY);

    expect(next.wallets[0].entries).toHaveLength(4);
    expect(next.wallets[1].entries).toHaveLength(1);
  });

  it('returns the same state object when nothing was due, so no save or sync push fires', () => {
    const state = { wallets: [{ id: 'a', entries: [], scheduled: [] }] };
    expect(materializeState(state, TODAY)).toBe(state);
  });

  it('is idempotent', () => {
    const state = { wallets: [{ id: 'a', entries: [], scheduled: [monthlySchedule()] }] };
    const once = materializeState(state, TODAY);
    const twice = materializeState(once, TODAY);

    expect(twice).toBe(once);
    expect(twice.wallets[0].entries).toHaveLength(4);
  });

  it('passes through anything that is not a state document', () => {
    expect(materializeState(null, TODAY)).toBe(null);
    expect(materializeState({}, TODAY)).toEqual({});
  });
});

describe('isSpentSchedule', () => {
  it('is true only for a one-time schedule that has fired', () => {
    expect(isSpentSchedule({ repeat: 'none', lastRunDate: '2026-08-01' })).toBe(true);
    expect(isSpentSchedule({ repeat: 'none', lastRunDate: '' })).toBe(false);
    expect(isSpentSchedule({ repeat: 'monthly', lastRunDate: '2026-08-01' })).toBe(false);
    expect(isSpentSchedule(null)).toBe(false);
  });
});

describe('isLegacyTemplateEntry', () => {
  const options = { todayStr: TODAY, convertFutureOneTime: true };

  it('treats any repeating entry as a template', () => {
    expect(isLegacyTemplateEntry({ date: '2026-01-01', repeat: 'monthly' }, options)).toBe(true);
  });

  it('treats a future-dated one-time entry as a template only while migrating', () => {
    const entry = { date: '2026-09-01', repeat: 'none' };
    expect(isLegacyTemplateEntry(entry, options)).toBe(true);
    expect(isLegacyTemplateEntry(entry, { todayStr: TODAY, convertFutureOneTime: false })).toBe(false);
  });

  it('leaves ordinary past transactions alone', () => {
    expect(isLegacyTemplateEntry({ date: '2026-01-01', repeat: 'none' }, options)).toBe(false);
    expect(isLegacyTemplateEntry({ date: TODAY, repeat: 'none' }, options)).toBe(false);
  });
});

describe('migrateLegacyTemplates', () => {
  const legacyRepeating = {
    id: 'sub',
    date: '2026-05-12',
    amount: 9900,
    categoryId: 'cat-1',
    labelIds: [],
    note: '구독',
    repeat: 'monthly',
    repeatEndDate: '',
  };

  it('turns a repeating entry into a schedule plus the history it used to render', () => {
    const result = migrateLegacyTemplates([legacyRepeating], [], { todayStr: TODAY });

    expect(result.scheduled).toHaveLength(1);
    expect(result.scheduled[0]).toMatchObject({ id: 'sub', startDate: '2026-05-12', repeat: 'monthly', lastRunDate: '2026-08-12' });
    expect(result.entries.map((entry) => entry.date)).toEqual(['2026-05-12', '2026-06-12', '2026-07-12', '2026-08-12']);
  });

  it('keeps the seed date on the schedule rather than discarding it', () => {
    const result = migrateLegacyTemplates([legacyRepeating], [], { todayStr: TODAY });
    expect(result.scheduled[0].startDate).toBe('2026-05-12');
  });

  it('leaves plain past entries exactly as they were', () => {
    const plain = { id: 'e1', date: '2026-04-01', amount: 100, categoryId: 'cat-1', labelIds: [], note: '', repeat: 'none' };
    const result = migrateLegacyTemplates([plain], [], { todayStr: TODAY, convertFutureOneTime: true });

    expect(result.entries).toEqual([plain]);
    expect(result.scheduled).toEqual([]);
  });

  it('converts a future-dated one-time entry into a one-time schedule', () => {
    const future = { id: 'f1', date: '2026-09-01', amount: 100, categoryId: 'cat-1', labelIds: [], note: '보험', repeat: 'none' };
    const result = migrateLegacyTemplates([future], [], { todayStr: TODAY, convertFutureOneTime: true });

    expect(result.entries).toEqual([]);
    expect(result.scheduled[0]).toMatchObject({ id: 'f1', startDate: '2026-09-01', repeat: 'none', lastRunDate: '' });
  });

  it('keeps schedules that were already there', () => {
    const existing = monthlySchedule({ id: 'kept', lastRunDate: '2026-08-12' });
    const result = migrateLegacyTemplates([], [existing], { todayStr: TODAY });

    expect(result.scheduled).toEqual([existing]);
  });

  it('is idempotent — a migrated wallet has nothing left to convert', () => {
    const first = migrateLegacyTemplates([legacyRepeating], [], { todayStr: TODAY });
    const second = migrateLegacyTemplates(first.entries, first.scheduled, { todayStr: TODAY });

    expect(second.entries).toEqual(first.entries);
    expect(second.scheduled).toEqual(first.scheduled);
  });
});

describe('upcomingDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const horizon = fromDateInput('2031-01-01');

  it('is the next occurrence after the one already created', () => {
    expect(upcomingDate(monthlySchedule({ lastRunDate: '2026-08-12' }), horizon)).toBe('2026-09-12');
  });

  it('never looks back past today', () => {
    expect(upcomingDate(monthlySchedule({ lastRunDate: '2026-06-12' }), horizon)).toBe('2026-08-12');
  });

  it('is null once a repeating schedule has expired', () => {
    expect(upcomingDate(monthlySchedule({ repeatEndDate: '2026-06-30', lastRunDate: '2026-06-12' }), horizon)).toBe(null);
  });

  it('is the start date for a schedule that has not fired yet', () => {
    expect(upcomingDate(monthlySchedule({ startDate: '2026-12-25', repeat: 'none' }), horizon)).toBe('2026-12-25');
  });
});

describe('todayString', () => {
  it('is local, not UTC — a late-evening entry must not land on tomorrow', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T23:30:00'));
    expect(todayString()).toBe('2026-08-12');
    vi.useRealTimers();
  });
});

// The migration's real contract: a v3 document opened in v4 must show the user
// exactly the ledger they saw yesterday.
describe('v3 → v4 migration through normalizeState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const legacyState = () => ({
    version: 3,
    selectedWalletId: 'w1',
    categories: [{ id: 'cat-1', name: 'Rent', type: 'expense', color: '#000', icon: 'house' }],
    labels: [],
    wallets: [
      {
        id: 'w1',
        name: 'Main',
        entries: [
          { id: 'sub', date: '2026-05-12', amount: 9900, categoryId: 'cat-1', labelIds: [], note: '구독', repeat: 'monthly', repeatEndDate: '' },
          { id: 'plain', date: '2026-07-03', amount: 4000, categoryId: 'cat-1', labelIds: [], note: '커피', repeat: 'none', repeatEndDate: '' },
          { id: 'future', date: '2026-09-20', amount: 120000, categoryId: 'cat-1', labelIds: [], note: '보험', repeat: 'none', repeatEndDate: '' },
        ],
      },
    ],
  });

  it('produces the v4 shape', () => {
    const result = normalizeState(legacyState());
    const wallet = result.wallets[0];

    expect(result.version).toBe(SCHEMA_VERSION);
    expect(wallet.scheduled.map((schedule) => schedule.id).sort()).toEqual(['future', 'sub']);
    expect(wallet.entries.every((entry) => !('repeat' in entry))).toBe(true);
  });

  it('leaves the ledger identical to what the old model computed', () => {
    const before = legacyState();
    const range = resolveFullRange(before.wallets[0].entries);
    // Pre-v4 every ledger row was expanded from the stored entries.
    const oldRows = buildOccurrences(before.wallets[0].entries, range)
      .map((row) => `${row.occurrenceDate}:${row.amount}:${row.categoryId}`)
      .sort();

    const after = normalizeState(before).wallets[0];
    const newRows = buildOccurrences(after.entries, resolveFullRange(after.entries))
      .map((row) => `${row.occurrenceDate}:${row.amount}:${row.categoryId}`)
      .sort();

    expect(newRows).toEqual(oldRows);
    expect(newRows).toHaveLength(5);
  });

  it('loses nothing: every field of a migrated template survives on the schedule', () => {
    const wallet = normalizeState(legacyState()).wallets[0];
    const schedule = wallet.scheduled.find((item) => item.id === 'sub');

    expect(schedule).toMatchObject({
      startDate: '2026-05-12',
      amount: 9900,
      categoryId: 'cat-1',
      note: '구독',
      repeat: 'monthly',
      repeatEndDate: '',
      lastRunDate: '2026-08-12',
    });
  });

  it('is idempotent — normalising the result again changes nothing', () => {
    const once = normalizeState(legacyState());
    const twice = normalizeState(once);

    expect(twice.wallets[0].entries).toEqual(once.wallets[0].entries);
    expect(twice.wallets[0].scheduled).toEqual(once.wallets[0].scheduled);
  });

  it('does not turn a v4 future-dated entry into a schedule', () => {
    const v4 = {
      version: 4,
      selectedWalletId: 'w1',
      categories: [{ id: 'cat-1', name: 'Rent', type: 'expense', color: '#000', icon: 'house' }],
      labels: [],
      wallets: [{ id: 'w1', name: 'Main', entries: [{ id: 'f', date: '2026-09-20', amount: 1, categoryId: 'cat-1', labelIds: [], note: '' }], scheduled: [] }],
    };

    const wallet = normalizeState(v4).wallets[0];
    expect(wallet.entries).toHaveLength(1);
    expect(wallet.scheduled).toEqual([]);
  });

  it('does not materialise a v4 schedule — that is not normalisation', () => {
    const v4 = {
      version: 4,
      selectedWalletId: 'w1',
      categories: [{ id: 'cat-1', name: 'Rent', type: 'expense', color: '#000', icon: 'house' }],
      labels: [],
      wallets: [{ id: 'w1', name: 'Main', entries: [], scheduled: [monthlySchedule()] }],
    };

    const wallet = normalizeState(v4).wallets[0];
    expect(wallet.entries).toEqual([]);
    expect(wallet.scheduled[0].lastRunDate).toBe('');
  });
});
