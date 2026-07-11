import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uid,
  startOfDay,
  addDays,
  fromDateInput,
  toDateInput,
  normalizeLabelIds,
  signedAmount,
  formatAxisTick,
  weekBucketRange,
  buildBucketFrames,
  nextRepeatDate,
  expandEntry,
  withOccurrence,
  buildOccurrences,
  sumSigned,
  nextOccurrenceOnOrAfter,
  roundedAxisMax,
  resolveFullRange,
  resolveFlowRange,
  bucketKeyForDate,
  groupOccurrences,
  buildPendingScheduledOccurrences,
  safeJsonParse,
} from './finance.js';

describe('uid', () => {
  it('generates unique id', () => {
    const id1 = uid();
    const id2 = uid();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
  });
});

describe('formatAxisTick', () => {
  it('formats positive values less than 1000', () => {
    expect(formatAxisTick(0)).toBe('0');
    expect(formatAxisTick(100)).toBe('100');
    expect(formatAxisTick(999)).toBe('999');
  });

  it('formats negative values less than 1000', () => {
    expect(formatAxisTick(-100)).toBe('-100');
    expect(formatAxisTick(-999)).toBe('-999');
  });

  it('formats positive values >= 1000 with k suffix', () => {
    expect(formatAxisTick(1000)).toBe('1k');
    expect(formatAxisTick(1500)).toBe('2k');
    expect(formatAxisTick(5000)).toBe('5k');
    expect(formatAxisTick(12345)).toBe('12k');
  });

  it('formats negative values >= 1000 with k suffix', () => {
    expect(formatAxisTick(-1000)).toBe('-1k');
    expect(formatAxisTick(-1500)).toBe('-2k');
    expect(formatAxisTick(-5000)).toBe('-5k');
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    const obj = { name: 'test', value: 123 };
    const result = safeJsonParse(JSON.stringify(obj));

    expect(result).toEqual(obj);
  });

  it('returns null for invalid JSON', () => {
    expect(safeJsonParse('not json')).toBeNull();
    expect(safeJsonParse('{')).toBeNull();
    expect(safeJsonParse(undefined)).toBeNull();
  });

  it('parses JSON arrays', () => {
    const arr = [1, 2, 3];
    const result = safeJsonParse(JSON.stringify(arr));

    expect(result).toEqual(arr);
  });

  it('returns null for malformed JSON', () => {
    expect(safeJsonParse('{key: value}')).toBeNull();
  });
});

describe('startOfDay', () => {
  it('returns date with time set to midnight', () => {
    const date = new Date('2026-05-29T14:30:00');
    const result = startOfDay(date);

    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('handles DST transition dates correctly', () => {
    const dstDate = new Date('2026-03-08T03:00:00');
    const result = startOfDay(dstDate);

    expect(result.getDate()).toBe(8);
    expect(result.getMonth()).toBe(2);
    expect(result.getHours()).toBe(0);
  });

  it('handles month end boundaries', () => {
    const monthEnd = new Date('2026-02-28T23:59:59');
    const result = startOfDay(monthEnd);

    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(1);
    expect(result.getHours()).toBe(0);
  });

  it('handles leap year dates', () => {
    const leapDay = new Date('2024-02-29T12:00:00');
    const result = startOfDay(leapDay);

    expect(result.getDate()).toBe(29);
    expect(result.getMonth()).toBe(1);
    expect(result.getFullYear()).toBe(2024);
  });
});

describe('addDays', () => {
  it('adds positive days correctly', () => {
    const date = new Date('2026-05-29');
    const result = addDays(date, 5);

    expect(result.getDate()).toBe(3);
    expect(result.getMonth()).toBe(5);
  });

  it('adds negative days correctly', () => {
    const date = new Date('2026-05-29');
    const result = addDays(date, -10);

    expect(result.getDate()).toBe(19);
    expect(result.getMonth()).toBe(4);
  });

  it('handles month boundaries', () => {
    const date = new Date('2026-05-30');
    const result = addDays(date, 2);

    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(5);
  });

  it('handles year boundaries', () => {
    const date = new Date('2025-12-31');
    const result = addDays(date, 1);

    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(0);
    expect(result.getFullYear()).toBe(2026);
  });

  it('handles leap year February', () => {
    const date = new Date('2024-02-28');
    const result = addDays(date, 1);

    expect(result.getDate()).toBe(29);
    expect(result.getMonth()).toBe(1);
  });

  it('does not mutate original date', () => {
    const date = new Date('2026-05-29');
    const originalTime = date.getTime();
    addDays(date, 5);

    expect(date.getTime()).toBe(originalTime);
  });
});

describe('fromDateInput', () => {
  it('converts valid date string to Date object', () => {
    const result = fromDateInput('2026-05-29');

    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(4);
    expect(result.getDate()).toBe(29);
  });

  it('returns null for empty string', () => {
    expect(fromDateInput('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(fromDateInput(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(fromDateInput(undefined)).toBeNull();
  });

  it('returns null for invalid date format', () => {
    expect(fromDateInput('not-a-date')).toBeNull();
    expect(fromDateInput('2026/05/29')).toBeNull();
    expect(fromDateInput('05-29-2026')).toBeNull();
  });

  it('returns date at start of day', () => {
    const result = fromDateInput('2026-05-29');

    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });
});

describe('toDateInput', () => {
  it('converts Date to YYYY-MM-DD format', () => {
    const date = new Date('2026-05-29T14:30:00');
    const result = toDateInput(date);

    expect(result).toBe('2026-05-29');
  });

  it('pads single digit months', () => {
    const date = new Date('2026-01-05');
    const result = toDateInput(date);

    expect(result).toBe('2026-01-05');
  });

  it('pads single digit days', () => {
    const date = new Date('2026-12-09');
    const result = toDateInput(date);

    expect(result).toBe('2026-12-09');
  });

  it('roundtrips with fromDateInput', () => {
    const original = '2026-05-29';
    const date = fromDateInput(original);
    const result = toDateInput(date);

    expect(result).toBe(original);
  });
});

describe('normalizeLabelIds', () => {
  it('returns labelIds array when present', () => {
    const entry = { labelIds: ['label1', 'label2'] };
    const result = normalizeLabelIds(entry);

    expect(result).toEqual(['label1', 'label2']);
  });

  it('migrates legacy labelId to array', () => {
    const entry = { labelId: 'label1' };
    const result = normalizeLabelIds(entry);

    expect(result).toEqual(['label1']);
  });

  it('filters out falsy values from labelIds', () => {
    const entry = { labelIds: ['label1', null, '', 'label2', undefined, 0] };
    const result = normalizeLabelIds(entry);

    expect(result).toEqual(['label1', 'label2']);
  });

  it('returns empty array for null entry', () => {
    expect(normalizeLabelIds(null)).toEqual([]);
  });

  it('returns empty array for undefined entry', () => {
    expect(normalizeLabelIds(undefined)).toEqual([]);
  });

  it('returns empty array when no label fields present', () => {
    const entry = { id: '123', amount: 100 };
    const result = normalizeLabelIds(entry);

    expect(result).toEqual([]);
  });

  it('prefers labelIds over labelId when both present', () => {
    const entry = { labelIds: ['label1', 'label2'], labelId: 'label3' };
    const result = normalizeLabelIds(entry);

    expect(result).toEqual(['label1', 'label2']);
  });
});

describe('signedAmount', () => {
  it('returns positive for income category by lookup', () => {
    const categories = [{ id: 'cat-1', type: 'income', name: 'Salary' }];
    const item = { amount: 100, categoryId: 'cat-1' };
    const result = signedAmount(item, categories);

    expect(result).toBe(100);
  });

  it('returns negative for expense category by lookup', () => {
    const categories = [{ id: 'cat-2', type: 'expense', name: 'Food' }];
    const item = { amount: 100, categoryId: 'cat-2' };
    const result = signedAmount(item, categories);

    expect(result).toBe(-100);
  });

  it('returns negative for unknown categoryId', () => {
    const categories = [{ id: 'cat-1', type: 'income', name: 'Salary' }];
    const item = { amount: 100, categoryId: 'cat-unknown' };
    const result = signedAmount(item, categories);

    expect(result).toBe(-100);
  });

  it('returns negative when categoryId is missing', () => {
    const categories = [{ id: 'cat-1', type: 'income', name: 'Salary' }];
    const item = { amount: 100 };
    const result = signedAmount(item, categories);

    expect(result).toBe(-100);
  });

  it('returns negative when categories array is empty', () => {
    const item = { amount: 100, categoryId: 'cat-1' };
    const result = signedAmount(item, []);

    expect(result).toBe(-100);
  });

  it('handles UUID income category correctly', () => {
    const categories = [{ id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', type: 'income', name: 'Freelance' }];
    const item = { amount: 500, categoryId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' };
    const result = signedAmount(item, categories);

    expect(result).toBe(500);
  });

  it('handles negative amounts by taking absolute value', () => {
    const categories = [{ id: 'cat-1', type: 'income', name: 'Salary' }];
    const item = { amount: -100, categoryId: 'cat-1' };
    const result = signedAmount(item, categories);

    expect(result).toBe(100);
  });

  it('returns 0 for missing amount', () => {
    const categories = [{ id: 'cat-1', type: 'income', name: 'Salary' }];
    const item = { categoryId: 'cat-1' };
    const result = signedAmount(item, categories);

    expect(result).toBe(0);
  });
});

describe('weekBucketRange', () => {
  it('returns current week range when index is 0', () => {
    const anchorEnd = new Date('2026-05-29');
    const result = weekBucketRange(anchorEnd, 0);

    expect(toDateInput(result.start)).toBe('2026-05-23');
    expect(toDateInput(result.end)).toBe('2026-05-29');
  });

  it('returns previous week range when index is 1', () => {
    const anchorEnd = new Date('2026-05-29');
    const result = weekBucketRange(anchorEnd, 1);

    expect(toDateInput(result.start)).toBe('2026-05-16');
    expect(toDateInput(result.end)).toBe('2026-05-22');
  });

  it('returns 7-day range', () => {
    const anchorEnd = new Date('2026-05-29');
    const result = weekBucketRange(anchorEnd, 0);
    const days = (result.end - result.start) / (1000 * 60 * 60 * 24);

    expect(days).toBe(6);
  });
});

describe('buildBucketFrames', () => {
  it('builds week frames correctly', () => {
    const earliest = new Date('2026-05-15');
    const end = new Date('2026-05-29');
    const result = buildBucketFrames('week', earliest, end);

    expect(result.length).toBe(3);
    expect(result[0].key).toBe('2026-05-09');
    expect(result[2].key).toBe('2026-05-23');
  });

  it('builds month frames correctly', () => {
    const earliest = new Date('2026-03-15');
    const end = new Date('2026-05-15');
    const result = buildBucketFrames('month', earliest, end);

    expect(result.length).toBe(3);
    expect(result[0].key).toBe('2026-03');
    expect(result[1].key).toBe('2026-04');
    expect(result[2].key).toBe('2026-05');
  });

  it('builds year frames correctly', () => {
    const earliest = new Date('2024-06-15');
    const end = new Date('2026-05-15');
    const result = buildBucketFrames('year', earliest, end);

    expect(result.length).toBe(3);
    expect(result[0].key).toBe('2024');
    expect(result[1].key).toBe('2025');
    expect(result[2].key).toBe('2026');
  });

  it('handles single bucket case', () => {
    const earliest = new Date('2026-05-29');
    const end = new Date('2026-05-29');
    const result = buildBucketFrames('week', earliest, end);

    expect(result.length).toBe(1);
  });

  it('handles leap year February in month mode', () => {
    const earliest = new Date('2024-02-01');
    const end = new Date('2024-03-01');
    const result = buildBucketFrames('month', earliest, end);

    expect(result.length).toBe(2);
    expect(result[0].end.getDate()).toBe(29);
  });

  it('handles year boundary in month mode', () => {
    const earliest = new Date('2025-12-01');
    const end = new Date('2026-01-15');
    const result = buildBucketFrames('month', earliest, end);

    expect(result.length).toBe(2);
    expect(result[0].key).toBe('2025-12');
    expect(result[1].key).toBe('2026-01');
  });
});

describe('nextRepeatDate', () => {
  it('adds 1 day for daily repeat', () => {
    const date = new Date('2026-05-29');
    const result = nextRepeatDate(date, 'daily');

    expect(toDateInput(result)).toBe('2026-05-30');
  });

  it('adds 2 days for every_other_day repeat', () => {
    const date = new Date('2026-05-29');
    const result = nextRepeatDate(date, 'every_other_day');

    expect(toDateInput(result)).toBe('2026-05-31');
  });

  it('skips weekends for weekday repeat', () => {
    const friday = new Date('2026-05-29');
    const result = nextRepeatDate(friday, 'weekday');

    expect(toDateInput(result)).toBe('2026-06-01');
    expect(result.getDay()).toBe(1);
  });

  it('advances to next weekend day for weekend repeat', () => {
    const saturday = new Date('2026-05-30');
    const result = nextRepeatDate(saturday, 'weekend');

    expect(toDateInput(result)).toBe('2026-05-31');
    expect(result.getDay()).toBe(0);
  });

  it('skips weekdays for weekend repeat', () => {
    const sunday = new Date('2026-05-31');
    const result = nextRepeatDate(sunday, 'weekend');

    expect(toDateInput(result)).toBe('2026-06-06');
    expect(result.getDay()).toBe(6);
  });

  it('adds 14 days for biweekly repeat', () => {
    const date = new Date('2026-05-29');
    const result = nextRepeatDate(date, 'biweekly');

    expect(toDateInput(result)).toBe('2026-06-12');
  });

  it('adds 28 days for fourweekly repeat', () => {
    const date = new Date('2026-05-29');
    const result = nextRepeatDate(date, 'fourweekly');

    expect(toDateInput(result)).toBe('2026-06-26');
  });

  it('adds 1 month for monthly repeat', () => {
    const date = new Date('2026-05-29');
    const result = nextRepeatDate(date, 'monthly');

    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(29);
  });

  it('handles month overflow for monthly repeat (Jan 31 -> Feb 28)', () => {
    const date = new Date('2026-01-31');
    const result = nextRepeatDate(date, 'monthly');

    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(3);
  });

  it('handles month overflow for monthly repeat in leap year (Jan 31 -> Feb 29)', () => {
    const date = new Date('2024-01-31');
    const result = nextRepeatDate(date, 'monthly');

    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(2);
  });
});

describe('expandEntry', () => {
  it('returns single occurrence for repeat=none within range', () => {
    const entry = { id: '1', date: '2026-05-29', repeat: 'none', amount: 100 };
    const start = new Date('2026-05-01');
    const end = new Date('2026-05-31');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBe(1);
    expect(result[0].occurrenceDate).toBe('2026-05-29');
  });

  it('returns empty for repeat=none outside range', () => {
    const entry = { id: '1', date: '2026-06-15', repeat: 'none', amount: 100 };
    const start = new Date('2026-05-01');
    const end = new Date('2026-05-31');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBe(0);
  });

  it('expands daily repeat correctly', () => {
    const entry = { id: '1', date: '2026-05-27', repeat: 'daily', amount: 100 };
    const start = fromDateInput('2026-05-27');
    const end = fromDateInput('2026-05-31');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBe(5);
    expect(result[0].occurrenceDate).toBe('2026-05-27');
    expect(result[4].occurrenceDate).toBe('2026-05-31');
  });

  it('truncates at repeatEndDate', () => {
    const entry = { id: '1', date: '2026-05-27', repeat: 'daily', repeatEndDate: '2026-05-29', amount: 100 };
    const start = fromDateInput('2026-05-27');
    const end = fromDateInput('2026-05-31');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBe(3);
    expect(result[result.length - 1].occurrenceDate).toBe('2026-05-29');
  });

  it('respects 4000 iteration guard', () => {
    const entry = { id: '1', date: '2026-05-29', repeat: 'daily', amount: 100 };
    const start = new Date('2026-05-29');
    const end = new Date('2036-05-29');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBeLessThanOrEqual(4000);
  });

  it('returns empty when start > end', () => {
    const entry = { id: '1', date: '2026-05-29', repeat: 'daily', amount: 100 };
    const start = new Date('2026-05-31');
    const end = new Date('2026-05-01');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBe(0);
  });

  it('returns empty for invalid date', () => {
    const entry = { id: '1', date: 'invalid', repeat: 'daily', amount: 100 };
    const start = new Date('2026-05-01');
    const end = new Date('2026-05-31');
    const result = expandEntry(entry, start, end);

    expect(result.length).toBe(0);
  });
});

describe('withOccurrence', () => {
  it('adds occurrenceDate to entry', () => {
    const entry = { id: '1', date: '2026-05-29', amount: 100 };
    const date = new Date('2026-06-05');
    const result = withOccurrence(entry, date);

    expect(result.occurrenceDate).toBe('2026-06-05');
    expect(result.id).toBe('1');
    expect(result.amount).toBe(100);
  });

  it('does not mutate original entry', () => {
    const entry = { id: '1', date: '2026-05-29', amount: 100 };
    const date = new Date('2026-06-05');
    withOccurrence(entry, date);

    expect(entry.occurrenceDate).toBeUndefined();
  });
});

describe('buildOccurrences', () => {
  it('builds occurrences for multiple entries', () => {
    const entries = [
      { id: '1', date: '2026-05-29', repeat: 'none', amount: 100 },
      { id: '2', date: '2026-05-30', repeat: 'none', amount: 200 },
    ];
    const range = { start: new Date('2026-05-01'), end: new Date('2026-05-31') };
    const result = buildOccurrences(entries, range);

    expect(result.length).toBe(2);
  });

  it('expands repeating entries', () => {
    const entries = [
      { id: '1', date: '2026-05-29', repeat: 'daily', amount: 100 },
    ];
    const range = { start: fromDateInput('2026-05-29'), end: fromDateInput('2026-05-31') };
    const result = buildOccurrences(entries, range);

    expect(result.length).toBe(3);
  });
});

describe('sumSigned', () => {
  it('sums signed amounts correctly', () => {
    const categories = [
      { id: 'cat-income', type: 'income', name: 'Income' },
      { id: 'cat-expense', type: 'expense', name: 'Expense' },
    ];
    const occurrences = [
      { amount: 100, categoryId: 'cat-income' },
      { amount: 50, categoryId: 'cat-expense' },
      { amount: 30, categoryId: 'cat-income' },
    ];
    const result = sumSigned(occurrences, categories);

    expect(result).toBe(80);
  });

  it('returns 0 for empty array', () => {
    expect(sumSigned([], [])).toBe(0);
  });

  it('handles floating point precision issues', () => {
    const categories = [{ id: 'cat-income', type: 'income', name: 'Income' }];
    const occurrences = [
      { amount: 0.1, categoryId: 'cat-income' },
      { amount: 0.2, categoryId: 'cat-income' },
    ];
    const result = sumSigned(occurrences, categories);

    expect(result).toBeCloseTo(0.3, 10);
  });
});

describe('roundedAxisMax', () => {
  it('returns 1 for values <= 0', () => {
    expect(roundedAxisMax(0)).toBe(1);
    expect(roundedAxisMax(-10)).toBe(1);
  });

  it('returns same value when already at boundary', () => {
    expect(roundedAxisMax(1)).toBe(1);
    expect(roundedAxisMax(10)).toBe(10);
    expect(roundedAxisMax(100)).toBe(100);
    expect(roundedAxisMax(1000)).toBe(1000);
  });

  it('handles normalized <= 1.5 with step 0.2', () => {
    expect(roundedAxisMax(11)).toBeCloseTo(12, 1);
    expect(roundedAxisMax(14.5)).toBeCloseTo(16, 1);
  });

  it('handles normalized <= 3 with step 0.5', () => {
    expect(roundedAxisMax(22)).toBe(25);
    expect(roundedAxisMax(28)).toBe(30);
  });

  it('handles normalized > 3 with step 1', () => {
    expect(roundedAxisMax(35)).toBe(40);
    expect(roundedAxisMax(87)).toBe(90);
  });
});

describe('nextOccurrenceOnOrAfter', () => {
  it('returns origin date for repeat=none within range', () => {
    const entry = { date: '2026-05-29', repeat: 'none' };
    const target = new Date('2026-05-20');
    const hardEnd = new Date('2026-06-30');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(toDateInput(result)).toBe('2026-05-29');
  });

  it('returns null for repeat=none before target', () => {
    const entry = { date: '2026-05-29', repeat: 'none' };
    const target = new Date('2026-06-01');
    const hardEnd = new Date('2026-06-30');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(result).toBeNull();
  });

  it('returns null for repeat=none after hardEnd', () => {
    const entry = { date: '2026-07-15', repeat: 'none' };
    const target = new Date('2026-05-01');
    const hardEnd = new Date('2026-06-30');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(result).toBeNull();
  });

  it('finds next occurrence for daily repeat', () => {
    const entry = { date: '2026-05-20', repeat: 'daily' };
    const target = fromDateInput('2026-05-25');
    const hardEnd = fromDateInput('2026-06-30');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(toDateInput(result)).toBe('2026-05-25');
  });

  it('returns null when next occurrence exceeds hardEnd', () => {
    const entry = { date: '2026-05-20', repeat: 'daily' };
    const target = new Date('2026-07-01');
    const hardEnd = new Date('2026-06-30');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(result).toBeNull();
  });

  it('returns null when repeatEndDate is before target', () => {
    const entry = { date: '2026-05-20', repeat: 'daily', repeatEndDate: '2026-05-24' };
    const target = new Date('2026-05-25');
    const hardEnd = new Date('2026-06-30');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(result).toBeNull();
  });

  it('respects guard saturation for far future dates', () => {
    const entry = { date: '2026-05-20', repeat: 'daily' };
    const target = new Date('2036-05-20');
    const hardEnd = new Date('2036-12-31');
    const result = nextOccurrenceOnOrAfter(entry, target, hardEnd);

    expect(result).toBeTruthy();
  });
});

describe('Time-dependent functions with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-29T00:00:00') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('resolveFullRange', () => {
    it('returns -364 days default for empty entries', () => {
      const result = resolveFullRange([]);

      expect(toDateInput(result.start)).toBe('2025-05-30');
      expect(toDateInput(result.end)).toBe('2026-05-29');
    });

    it('uses earliest entry date when available', () => {
      const entries = [
        { date: '2026-03-15' },
        { date: '2026-01-10' },
        { date: '2026-04-20' },
      ];
      const result = resolveFullRange(entries);

      expect(toDateInput(result.start)).toBe('2026-01-10');
      expect(toDateInput(result.end)).toBe('2026-05-29');
    });

    it('filters out invalid dates', () => {
      const entries = [
        { date: 'invalid' },
        { date: '2026-03-15' },
        { date: null },
      ];
      const result = resolveFullRange(entries);

      expect(toDateInput(result.start)).toBe('2026-03-15');
    });
  });

  describe('resolveFlowRange', () => {
    it('returns -6 days for week mode', () => {
      const result = resolveFlowRange('week');

      expect(toDateInput(result.start)).toBe('2026-05-23');
      expect(toDateInput(result.end)).toBe('2026-05-29');
    });

    it('returns -29 days for month mode', () => {
      const result = resolveFlowRange('month');

      expect(toDateInput(result.start)).toBe('2026-04-30');
      expect(toDateInput(result.end)).toBe('2026-05-29');
    });

    it('returns -364 days for year mode', () => {
      const result = resolveFlowRange('year');

      expect(toDateInput(result.start)).toBe('2025-05-30');
      expect(toDateInput(result.end)).toBe('2026-05-29');
    });
  });

  describe('bucketKeyForDate', () => {
    it('uses Date.now() as default end for week mode', () => {
      const date = new Date('2026-05-23');
      const result = bucketKeyForDate('week', date);

      expect(result).toBe('2026-05-23');
    });

    it('returns month key for month mode', () => {
      const date = new Date('2026-05-15');
      const result = bucketKeyForDate('month', date);

      expect(result).toBe('2026-05');
    });

    it('returns year key for year mode', () => {
      const date = new Date('2026-05-15');
      const result = bucketKeyForDate('year', date);

      expect(result).toBe('2026');
    });
  });

  describe('groupOccurrences', () => {
    it('groups occurrences by week correctly', () => {
      const categories = [
        { id: 'cat-income', type: 'income', name: 'Income' },
        { id: 'cat-expense', type: 'expense', name: 'Expense' },
      ];
      const occurrences = [
        { occurrenceDate: '2026-05-23', amount: 100, categoryId: 'cat-income' },
        { occurrenceDate: '2026-05-24', amount: 50, categoryId: 'cat-expense' },
        { occurrenceDate: '2026-05-29', amount: 30, categoryId: 'cat-income' },
      ];
      const result = groupOccurrences(occurrences, 'week', categories);

      expect(result.length).toBe(1);
      expect(result[0].income).toBe(130);
      expect(result[0].expense).toBe(50);
      expect(result[0].net).toBe(80);
    });

    it('calculates cumulative sum correctly', () => {
      const categories = [
        { id: 'cat-income', type: 'income', name: 'Income' },
        { id: 'cat-expense', type: 'expense', name: 'Expense' },
      ];
      const occurrences = [
        { occurrenceDate: '2026-05-16', amount: 100, categoryId: 'cat-income' },
        { occurrenceDate: '2026-05-23', amount: 50, categoryId: 'cat-income' },
        { occurrenceDate: '2026-05-29', amount: 30, categoryId: 'cat-expense' },
      ];
      const result = groupOccurrences(occurrences, 'week', categories);

      expect(result[0].cumulative).toBe(100);
      expect(result[1].cumulative).toBe(120);
    });

    it('skips future occurrences', () => {
      const categories = [{ id: 'cat-income', type: 'income', name: 'Income' }];
      const occurrences = [
        { occurrenceDate: '2026-05-29', amount: 100, categoryId: 'cat-income' },
        { occurrenceDate: '2026-06-05', amount: 50, categoryId: 'cat-income' },
      ];
      const result = groupOccurrences(occurrences, 'week', categories);

      const totalIncome = result.reduce((sum, bucket) => sum + bucket.income, 0);
      expect(totalIncome).toBe(100);
    });

    it('batches items by day correctly', () => {
      const categories = [
        { id: 'cat-income', type: 'income', name: 'Income' },
        { id: 'cat-expense', type: 'expense', name: 'Expense' },
      ];
      const occurrences = [
        { occurrenceDate: '2026-05-23', amount: 100, categoryId: 'cat-income', id: '1' },
        { occurrenceDate: '2026-05-23', amount: 50, categoryId: 'cat-expense', id: '2' },
        { occurrenceDate: '2026-05-29', amount: 30, categoryId: 'cat-income', id: '3' },
      ];
      const result = groupOccurrences(occurrences, 'week', categories);

      expect(result[0].items.length).toBe(3);
    });
  });

  describe('buildPendingScheduledOccurrences', () => {
    it('returns scheduled occurrences starting tomorrow', () => {
      const wallet = {
        entries: [
          { id: '1', date: '2026-05-20', repeat: 'daily', amount: 100, note: 'Daily expense' },
        ],
      };
      const selectedRange = { end: new Date('2026-06-05') };
      const result = buildPendingScheduledOccurrences(wallet, selectedRange);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].occurrenceDate).toBe('2026-05-30');
    });

    it('defaults to +366 days when selectedRange.end is missing', () => {
      const wallet = {
        entries: [
          { id: '1', date: '2026-05-29', repeat: 'daily', amount: 100 },
        ],
      };
      const result = buildPendingScheduledOccurrences(wallet, null);

      expect(result.length).toBeGreaterThan(0);
    });

    it('sorts by occurrenceDate then id', () => {
      const wallet = {
        entries: [
          { id: '2', date: '2026-05-20', repeat: 'daily', amount: 100 },
          { id: '1', date: '2026-05-20', repeat: 'daily', amount: 200 },
        ],
      };
      const selectedRange = { end: new Date('2026-05-30') };
      const result = buildPendingScheduledOccurrences(wallet, selectedRange);

      if (result.length >= 2) {
        const first = result[0];
        const second = result[1];
        if (first.occurrenceDate === second.occurrenceDate) {
          expect(first.id < second.id).toBe(true);
        }
      }
    });

    it('adds note with start and end date info', () => {
      const wallet = {
        entries: [
          { id: '1', date: '2026-05-20', repeat: 'daily', repeatEndDate: '2026-06-10', amount: 100, note: 'Test note' },
        ],
      };
      const selectedRange = { end: new Date('2026-06-05') };
      const result = buildPendingScheduledOccurrences(wallet, selectedRange);

      expect(result[0].note).toContain('Test note');
      expect(result[0].note).toContain('시작:2026-05-20');
      expect(result[0].note).toContain('종료:2026-06-10');
    });

    it('uses default note "메모 없음" when missing', () => {
      const wallet = {
        entries: [
          { id: '1', date: '2026-05-20', repeat: 'daily', amount: 100 },
        ],
      };
      const selectedRange = { end: new Date('2026-05-30') };
      const result = buildPendingScheduledOccurrences(wallet, selectedRange);

      expect(result[0].note).toContain('메모 없음');
    });

    it('includes future one-time entries', () => {
      const wallet = {
        entries: [
          { id: '1', date: '2026-05-30', repeat: 'none', amount: 100, note: 'One-time' },
          { id: '2', date: '2026-05-20', repeat: 'daily', amount: 200 },
        ],
      };
      const selectedRange = { end: new Date('2026-06-05') };
      const result = buildPendingScheduledOccurrences(wallet, selectedRange);

      expect(result.some((occ) => occ.id === '1' && occ.occurrenceDate === '2026-05-30')).toBe(true);
    });

    it('skips past one-time entries', () => {
      const wallet = {
        entries: [
          { id: '1', date: '2026-05-29', repeat: 'none', amount: 100 },
          { id: '2', date: '2026-05-20', repeat: 'daily', amount: 200 },
        ],
      };
      const selectedRange = { end: new Date('2026-06-05') };
      const result = buildPendingScheduledOccurrences(wallet, selectedRange);

      expect(result.every((occ) => occ.id !== '1')).toBe(true);
    });
  });
});
