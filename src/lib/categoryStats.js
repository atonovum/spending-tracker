import { fromDateInput, normalizeLabelIds, signedAmount, startOfDay } from "./finance.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Sub-bucket frames for zooming INTO a single ledger period:
 *   - week  → 7 daily sub-buckets (one per day inside the week range)
 *   - month → 3-day intervals starting from day 1 of the month
 *   - year  → 12 monthly sub-buckets (Jan..Dec of the period's year)
 *
 * @param {"week"|"month"|"year"} mode
 * @param {Date} periodStart inclusive
 * @param {Date} periodEnd   inclusive
 * @returns {Array<{ key: string, label: string, start: Date, end: Date }>}
 */
export function buildSubBucketFrames(mode, periodStart, periodEnd) {
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) return [];
  const start = startOfDay(periodStart);
  const end = startOfDay(periodEnd);
  if (start > end) return [];

  if (mode === "week") {
    const frames = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (day > end) break;
      frames.push({ key: isoKey(day), label: String(day.getDate()), start: day, end: day });
    }
    return frames;
  }

  if (mode === "month") {
    const y = start.getFullYear();
    const m = start.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const frames = [];
    for (let day = 1; day <= lastDay; day += 3) {
      const s = new Date(y, m, day);
      const eDay = Math.min(day + 2, lastDay);
      const e = new Date(y, m, eDay);
      const label = day === eDay ? `${day}` : `${day}~${eDay}`;
      frames.push({ key: `${isoKey(s)}_${isoKey(e)}`, label, start: s, end: e });
    }
    return frames;
  }

  const y = start.getFullYear();
  const frames = [];
  for (let month = 0; month < 12; month += 1) {
    const s = new Date(y, month, 1);
    const e = new Date(y, month + 1, 0);
    frames.push({ key: `${y}-${pad2(month + 1)}`, label: `${month + 1}월`, start: s, end: e });
  }
  return frames;
}

/**
 * Aggregate items into sub-buckets within a single ledger period for one
 * category. Items outside [periodStart, periodEnd] or of other categories are
 * skipped. Income amounts contribute their absolute value to the magnitude.
 *
 * @param {Array} items raw occurrence items (e.g. statsBucket.items)
 * @param {"week"|"month"|"year"} mode
 * @param {Date} periodStart inclusive
 * @param {Date} periodEnd   inclusive
 * @param {string} categoryId
 * @param {Array} categories optional category array for lookup
 * @returns {Array<{ key: string, label: string, total: number, count: number }>}
 *   `count` is the number of category items contributing to that sub-bucket.
 */
export function aggregateCategoryBySubBucket(items, mode, periodStart, periodEnd, categoryId, categories = []) {
  if (!Array.isArray(items)) return [];
  const frames = buildSubBucketFrames(mode, periodStart, periodEnd);
  if (!frames.length) return [];
  const totals = new Array(frames.length).fill(0);
  const counts = new Array(frames.length).fill(0);
  for (const item of items) {
    if (item?.categoryId !== categoryId) continue;
    const date = fromDateInput(item.occurrenceDate);
    if (!date) continue;
    const idx = frames.findIndex((f) => date >= f.start && date <= f.end);
    if (idx < 0) continue;
    totals[idx] += Math.abs(signedAmount(item, categories));
    counts[idx] += 1;
  }
  return frames.map((f, i) => ({ key: f.key, label: f.label, total: totals[i], count: counts[i] }));
}

/**
 * Aggregate items by label for a single category. Items with multiple labels
 * contribute to each of those labels. Items with no labels are grouped under
 * `labelId: null`. Result is sorted by amount descending.
 *
 * @param {Array} items raw occurrence items already scoped to a period
 * @param {string} categoryId
 * @param {Array} categories optional category array for lookup
 * @returns {Array<{ labelId: string | null, count: number, amount: number }>}
 */
export function aggregateCategoryByLabel(items, categoryId, categories = []) {
  if (!Array.isArray(items)) return [];
  const map = new Map();
  for (const item of items) {
    if (item?.categoryId !== categoryId) continue;
    const ids = normalizeLabelIds(item);
    const amount = Math.abs(signedAmount(item, categories));
    if (!ids.length) {
      const cur = map.get(null) || { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += amount;
      map.set(null, cur);
    } else {
      for (const id of ids) {
        const cur = map.get(id) || { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += amount;
        map.set(id, cur);
      }
    }
  }
  return [...map.entries()]
    .map(([labelId, agg]) => ({ labelId, count: agg.count, amount: agg.amount }))
    .sort((a, b) => b.amount - a.amount);
}
