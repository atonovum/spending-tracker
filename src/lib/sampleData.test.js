/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  SAMPLE_WALLETS,
  buildSampleSchedules,
  buildSampleWallets,
  dayOffset,
  latestEntryDate,
  shiftDate,
  shiftEntry,
  shiftWalletToDate,
  withSampleData,
} from './sampleData.js';
import { fromDateInput, validDate } from './finance.js';
import { materializeWallet, upcomingDate } from './schedules.js';
import { normalizeState } from './storage.js';
import defaultSeed from '../../samples/default-seed.json';

const defaultSeedIds = {
  categories: defaultSeed.categories.map((category) => category.id),
  labels: defaultSeed.labels.map((label) => label.id),
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from, to) {
  return Math.round((fromDateInput(to).getTime() - fromDateInput(from).getTime()) / DAY_MS);
}

describe('dayOffset', () => {
  it('counts whole days forward and backward', () => {
    expect(dayOffset('2026-08-01', '2026-08-12')).toBe(11);
    expect(dayOffset('2026-08-12', '2026-08-01')).toBe(-11);
    expect(dayOffset('2026-08-12', '2026-08-12')).toBe(0);
  });

  it('counts across month, year and leap-day boundaries', () => {
    expect(dayOffset('2026-01-31', '2026-02-01')).toBe(1);
    expect(dayOffset('2025-12-31', '2026-01-01')).toBe(1);
    expect(dayOffset('2024-02-28', '2024-03-01')).toBe(2); // leap year
    expect(dayOffset('2025-02-28', '2025-03-01')).toBe(1); // non-leap year
  });

  it('returns 0 for unparseable input instead of NaN', () => {
    expect(dayOffset('', '2026-08-12')).toBe(0);
    expect(dayOffset('2026-08-12', 'tomorrow')).toBe(0);
    expect(dayOffset(undefined, undefined)).toBe(0);
  });
});

describe('shiftDate', () => {
  it('shifts by whole days', () => {
    expect(shiftDate('2026-08-12', 5)).toBe('2026-08-17');
    expect(shiftDate('2026-08-12', -5)).toBe('2026-08-07');
    expect(shiftDate('2026-08-12', 0)).toBe('2026-08-12');
  });

  it('rolls over month ends instead of producing day 32', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDate('2026-03-31', 31)).toBe('2026-05-01');
    expect(shiftDate('2026-05-31', -1)).toBe('2026-05-30');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap days on both sides of the boundary', () => {
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDate('2024-02-29', 1)).toBe('2024-03-01');
    expect(shiftDate('2025-02-28', 1)).toBe('2025-03-01');
    expect(shiftDate('2024-02-29', 365)).toBe('2025-02-28');
  });

  it('never emits an out-of-range date over a long sweep', () => {
    for (let days = -800; days <= 800; days += 7) {
      const shifted = shiftDate('2024-02-29', days);
      expect(validDate(shifted)).toBe(true);
      // Round-tripping only survives if the calendar date really exists.
      expect(fromDateInput(shifted)).not.toBeNull();
      expect(shiftDate(shifted, -days)).toBe('2024-02-29');
    }
  });

  it('passes non-dates through untouched', () => {
    expect(shiftDate('', 10)).toBe('');
    expect(shiftDate(undefined, 10)).toBe(undefined);
    expect(shiftDate('not-a-date', 10)).toBe('not-a-date');
    expect(shiftDate('2026-13-45', 10)).toBe('2026-13-45');
  });
});

describe('shiftEntry', () => {
  it('shifts repeatEndDate by the same offset as date', () => {
    const entry = {
      id: 'e1',
      date: '2026-01-31',
      repeat: 'monthly',
      repeatEndDate: '2026-12-31',
      amount: 1000,
    };

    const shifted = shiftEntry(entry, 10);

    expect(shifted.date).toBe('2026-02-10');
    expect(shifted.repeatEndDate).toBe('2027-01-10');
    expect(daysBetween(shifted.date, shifted.repeatEndDate)).toBe(
      daysBetween(entry.date, entry.repeatEndDate)
    );
  });

  it('keeps repeatEndDate after date even when the offset is negative', () => {
    const shifted = shiftEntry({ date: '2026-03-01', repeatEndDate: '2026-03-02' }, -400);
    expect(shifted.date < shifted.repeatEndDate).toBe(true);
  });

  it('leaves an empty repeatEndDate empty', () => {
    expect(shiftEntry({ date: '2026-01-01', repeatEndDate: '' }, 3).repeatEndDate).toBe('');
    expect(shiftEntry({ date: '2026-01-01' }, 3).repeatEndDate).toBe('');
  });

  it('preserves every other field', () => {
    const entry = {
      id: 'e1',
      date: '2026-01-01',
      amount: 5500,
      categoryId: 'salary',
      labelIds: ['fixed'],
      note: 'Monthly salary',
      repeat: 'none',
      repeatEndDate: '',
    };

    expect(shiftEntry(entry, 7)).toEqual({ ...entry, date: '2026-01-08' });
  });
});

describe('latestEntryDate', () => {
  it('returns the maximum valid date', () => {
    expect(
      latestEntryDate([{ date: '2026-01-01' }, { date: '2026-03-05' }, { date: '2026-02-09' }])
    ).toBe('2026-03-05');
  });

  it('ignores malformed and missing dates', () => {
    expect(latestEntryDate([{ date: 'soon' }, {}, { date: '2026-01-01' }])).toBe('2026-01-01');
  });

  it('returns "" when there is nothing usable', () => {
    expect(latestEntryDate([])).toBe('');
    expect(latestEntryDate(null)).toBe('');
    expect(latestEntryDate([{ note: 'no date' }])).toBe('');
  });
});

describe('shiftWalletToDate', () => {
  const wallet = {
    id: 'w1',
    name: 'Sample',
    entries: [
      { id: 'a', date: '2026-01-01', repeatEndDate: '' },
      { id: 'b', date: '2026-01-31', repeatEndDate: '' },
      { id: 'c', date: '2026-02-10', repeatEndDate: '2026-06-10' },
    ],
  };

  it('lands the latest entry exactly on the target date', () => {
    const shifted = shiftWalletToDate(wallet, '2026-08-12');
    expect(latestEntryDate(shifted.entries)).toBe('2026-08-12');
  });

  it('preserves the relative spacing between every entry', () => {
    const shifted = shiftWalletToDate(wallet, '2026-08-12');
    for (let i = 1; i < wallet.entries.length; i += 1) {
      expect(daysBetween(shifted.entries[i - 1].date, shifted.entries[i].date)).toBe(
        daysBetween(wallet.entries[i - 1].date, wallet.entries[i].date)
      );
    }
    expect(shifted.entries[2].repeatEndDate).toBe(
      shiftDate('2026-06-10', dayOffset('2026-02-10', shifted.entries[2].date))
    );
  });

  it('shifts backwards when the target is in the past', () => {
    const shifted = shiftWalletToDate(wallet, '2020-05-04');
    expect(latestEntryDate(shifted.entries)).toBe('2020-05-04');
    expect(shifted.entries.every((entry) => validDate(entry.date))).toBe(true);
  });

  it('keeps identity fields and entry count', () => {
    const shifted = shiftWalletToDate(wallet, '2026-08-12');
    expect(shifted.id).toBe('w1');
    expect(shifted.name).toBe('Sample');
    expect(shifted.entries).toHaveLength(3);
    expect(shifted.entries.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the source wallet', () => {
    shiftWalletToDate(wallet, '2026-08-12');
    expect(wallet.entries[0].date).toBe('2026-01-01');
  });

  it('tolerates a wallet with no usable entries', () => {
    expect(shiftWalletToDate({ id: 'w2' }, '2026-08-12').entries).toEqual([]);
    expect(shiftWalletToDate({ id: 'w2', entries: [] }, '2026-08-12').entries).toEqual([]);
  });
});

describe('buildSampleWallets', () => {
  it('ends every sample wallet on the target date', () => {
    const wallets = buildSampleWallets('2026-08-12');
    expect(wallets).toHaveLength(3);
    for (const wallet of wallets) {
      expect(latestEntryDate(wallet.entries)).toBe('2026-08-12');
    }
  });

  it('defaults the target to today', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (const wallet of buildSampleWallets()) {
      expect(latestEntryDate(wallet.entries)).toBe(iso);
    }
  });

  it('keeps ids, entry counts and span of every fixture', () => {
    const wallets = buildSampleWallets('2026-08-12');
    wallets.forEach((wallet, index) => {
      const source = SAMPLE_WALLETS[index];
      expect(wallet.id).toBe(source.id);
      expect(wallet.entries).toHaveLength(source.entries.length);
      expect(
        daysBetween(wallet.entries[0].date, wallet.entries[wallet.entries.length - 1].date)
      ).toBe(daysBetween(source.entries[0].date, source.entries[source.entries.length - 1].date));
    });
  });

  it('produces only valid dates and preserves per-entry spacing', () => {
    const wallets = buildSampleWallets('2026-08-12');
    wallets.forEach((wallet, index) => {
      const source = SAMPLE_WALLETS[index];
      const offset = dayOffset(source.entries[0].date, wallet.entries[0].date);
      wallet.entries.forEach((entry, i) => {
        expect(validDate(entry.date)).toBe(true);
        expect(fromDateInput(entry.date)).not.toBeNull();
        expect(dayOffset(source.entries[i].date, entry.date)).toBe(offset);
      });
    });
  });

  it('does not mutate the imported fixtures', () => {
    const before = SAMPLE_WALLETS.map((wallet) => wallet.entries[0].date);
    buildSampleWallets('2026-08-12');
    buildSampleWallets('2019-01-01');
    expect(SAMPLE_WALLETS.map((wallet) => wallet.entries[0].date)).toEqual(before);
  });
});

describe('withSampleData', () => {
  const sampleIds = SAMPLE_WALLETS.map((wallet) => wallet.id);

  it('appends the sample wallets to an existing document', () => {
    const state = {
      wallets: [{ id: 'mine', name: 'Mine', entries: [{ id: 'x', date: '2026-08-01' }] }],
      selectedWalletId: 'mine',
      categories: [],
      labels: [],
    };

    const result = withSampleData(state, '2026-08-12');

    expect(result.wallets.map((wallet) => wallet.id)).toEqual(['mine', ...sampleIds]);
    expect(result.wallets[0].entries).toHaveLength(1);
  });

  it('replaces previously seeded samples instead of duplicating them', () => {
    const once = withSampleData({ wallets: [] }, '2026-08-11');
    const twice = withSampleData(once, '2026-08-12');

    expect(twice.wallets.map((wallet) => wallet.id)).toEqual(sampleIds);
    for (const wallet of twice.wallets) {
      expect(latestEntryDate(wallet.entries)).toBe('2026-08-12');
    }
  });

  it('keeps the developer wallets untouched', () => {
    const mine = { id: 'mine', name: 'Mine', entries: [{ id: 'x', date: '2026-08-01' }] };
    const result = withSampleData({ wallets: [mine], selectedWalletId: 'mine' }, '2026-08-12');
    expect(result.wallets[0]).toBe(mine);
  });

  it('adds back only the categories and labels the samples need', () => {
    const custom = { id: 'custom', name: 'Custom', type: 'expense' };
    const result = withSampleData(
      { wallets: [], categories: [custom], labels: [{ id: 'fixed', name: 'Fixed' }] },
      '2026-08-12'
    );

    expect(result.categories[0]).toBe(custom);
    expect(result.categories.map((category) => category.id)).toContain('salary');
    expect(result.categories.filter((category) => category.id === 'salary')).toHaveLength(1);
    expect(result.labels.filter((label) => label.id === 'fixed')).toHaveLength(1);
    expect(result.labels.length).toBeGreaterThan(1);
  });

  it('selects a sample wallet when the selection is empty or missing', () => {
    const emptySelection = withSampleData(
      { wallets: [{ id: 'wallet_default', name: 'My Wallet', entries: [] }], selectedWalletId: 'wallet_default' },
      '2026-08-12'
    );
    expect(emptySelection.selectedWalletId).toBe(sampleIds[0]);

    const danglingSelection = withSampleData({ wallets: [], selectedWalletId: 'gone' }, '2026-08-12');
    expect(danglingSelection.selectedWalletId).toBe(sampleIds[0]);
  });

  it('keeps a selection that points at a populated wallet', () => {
    const result = withSampleData(
      {
        wallets: [{ id: 'mine', name: 'Mine', entries: [{ id: 'x', date: '2026-08-01' }] }],
        selectedWalletId: 'mine',
      },
      '2026-08-12'
    );
    expect(result.selectedWalletId).toBe('mine');
  });

  it('carries a legacy single-wallet document over instead of dropping it', () => {
    const result = withSampleData(
      { wallet: { id: 'legacy', name: 'Legacy', entries: [{ id: 'x', date: '2026-08-01' }] } },
      '2026-08-12'
    );
    expect(result.wallets.map((wallet) => wallet.id)).toEqual(['legacy', ...sampleIds]);
  });

  it('handles an empty or absent document', () => {
    expect(withSampleData(undefined, '2026-08-12').wallets.map((wallet) => wallet.id)).toEqual(sampleIds);
    expect(withSampleData({}, '2026-08-12').selectedWalletId).toBe(sampleIds[0]);
  });

  it('preserves unrelated top-level fields', () => {
    const result = withSampleData({ wallets: [], language: 'en', currency: 'USD', updatedAt: 42 }, '2026-08-12');
    expect(result.language).toBe('en');
    expect(result.currency).toBe('USD');
    expect(result.updatedAt).toBe(42);
  });
});

describe('buildSampleSchedules', () => {
  const TARGET = '2026-08-13';

  it('seeds one repeating and one one-time 예약 거래', () => {
    const schedules = buildSampleSchedules('wallet_x', TARGET);

    expect(schedules).toHaveLength(2);
    expect(schedules[0].repeat).toBe('monthly');
    expect(schedules[1].repeat).toBe('none');
  });

  it('namespaces ids by wallet, so materialised entry ids stay distinct', () => {
    const a = buildSampleSchedules('wallet_a', TARGET);
    const b = buildSampleSchedules('wallet_b', TARGET);

    expect(a.map((schedule) => schedule.id)).not.toEqual(b.map((schedule) => schedule.id));
  });

  it('dates the schedules relative to the target, never from the frozen fixture', () => {
    expect(buildSampleSchedules('w', TARGET)[0].startDate).toBe('2026-06-14');
    expect(buildSampleSchedules('w', TARGET)[1].startDate).toBe('2026-08-23');
  });

  it('returns nothing for an unusable target date', () => {
    expect(buildSampleSchedules('w', 'nonsense')).toEqual([]);
  });

  it('leaves both a created transaction and an upcoming one visible today', () => {
    const wallet = materializeWallet({ id: 'w', entries: [], scheduled: buildSampleSchedules('w', TARGET) }, TARGET);

    // The monthly one has already produced real transactions...
    expect(wallet.entries.length).toBeGreaterThan(0);
    expect(wallet.entries.every((entry) => entry.date <= TARGET)).toBe(true);
    // ...and both schedules still have somewhere to go.
    expect(wallet.scheduled).toHaveLength(2);
    expect(wallet.scheduled.every((schedule) => upcomingDate(schedule, fromDateInput('2031-01-01')))).toBe(true);
  });
});

describe('sample wallets carry schedules', () => {
  it('attaches them to every sample wallet', () => {
    for (const wallet of buildSampleWallets('2026-08-13')) {
      expect(wallet.scheduled).toHaveLength(2);
    }
  });

  it('survives normalisation, so the dev app really sees them', () => {
    const state = normalizeState(withSampleData(defaultSeed, '2026-08-13'));
    const sampleWallet = state.wallets.find((wallet) => wallet.id === SAMPLE_WALLETS[0].id);

    expect(sampleWallet.scheduled).toHaveLength(2);
    expect(sampleWallet.scheduled[0].repeat).toBe('monthly');
    // Normalisation must not fire them — that is materialisation's job.
    expect(sampleWallet.scheduled[0].lastRunDate).toBe('');
  });

  it('references categories and labels the seed actually defines', () => {
    const [wallet] = buildSampleWallets('2026-08-13');
    for (const schedule of wallet.scheduled) {
      expect(defaultSeedIds.categories).toContain(schedule.categoryId);
      for (const labelId of schedule.labelIds) {
        expect(defaultSeedIds.labels).toContain(labelId);
      }
    }
  });
});
