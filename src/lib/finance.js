export const STORAGE_KEYS = ["spending-tracker-v3", "spending-tracker-v2", "spending-tracker-v1"];
export const ACTIVE_STORAGE_KEY = "spending-tracker-v3";
export const MAX_WALLETS = 5;

export const REPEAT_OPTIONS = [
  { value: "none", label: "반복 없음" },
  { value: "daily", label: "매일" },
  { value: "every_other_day", label: "격일" },
  { value: "weekday", label: "평일" },
  { value: "weekend", label: "주말" },
  { value: "biweekly", label: "격주" },
  { value: "fourweekly", label: "4주" },
  { value: "monthly", label: "한달" },
  { value: "3months", label: "3개월" },
  { value: "6months", label: "6개월" },
  { value: "yearly", label: "1년" },
];

export function uid() {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 16) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function fromDateInput(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

export function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatMoney(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.round(Math.abs(value));
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}

export function normalizeLabelIds(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.labelIds)) return entry.labelIds.filter(Boolean);
  return entry.labelId ? [entry.labelId] : [];
}

export function formatShortDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatAxisTick(value) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
  return `${sign}${Math.round(abs)}`;
}

export function signedAmount(item, categories = []) {
  // If item already has a category object with type (e.g., from resolveEntryData), use it
  if (item?.category && typeof item.category === "object" && item.category.type) {
    return item.category.type === "income" ? Math.abs(item.amount || 0) : -Math.abs(item.amount || 0);
  }

  // Otherwise, look up category by categoryId
  const categoryId = item?.categoryId;
  if (!categoryId) {
    return -Math.abs(item.amount || 0);
  }

  const category = categories.find((cat) => cat.id === categoryId);
  if (!category) {
    return -Math.abs(item.amount || 0);
  }

  return category.type === "income" ? Math.abs(item.amount || 0) : -Math.abs(item.amount || 0);
}

export function resolveFullRange(entries) {
  const end = startOfDay(new Date());
  const earliest = entries
    .map((entry) => fromDateInput(entry.date))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  return { start: earliest || addDays(end, -364), end };
}

export function resolveFlowRange(mode) {
  const end = startOfDay(new Date());
  if (mode === "week") return { start: addDays(end, -6), end };
  if (mode === "month") return { start: addDays(end, -29), end };
  return { start: addDays(end, -364), end };
}

export function weekBucketRange(anchorEnd, indexFromCurrent) {
  const end = addDays(anchorEnd, -(indexFromCurrent * 7));
  const start = addDays(end, -6);
  return { start, end };
}

export function bucketKeyForDate(mode, date, end = startOfDay(new Date())) {
  if (mode === "week") {
    const diff = Math.floor((startOfDay(end) - startOfDay(date)) / 86400000);
    const index = Math.floor(diff / 7);
    return toDateInput(weekBucketRange(end, index).start);
  }
  if (mode === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return String(date.getFullYear());
}

export function buildBucketFrames(mode, earliest, end) {
  if (mode === "week") {
    const diff = Math.max(0, Math.floor((startOfDay(end) - startOfDay(earliest)) / 86400000));
    const maxIndex = Math.floor(diff / 7);
    const frames = [];
    for (let i = maxIndex; i >= 0; i -= 1) {
      const range = weekBucketRange(end, i);
      frames.push({
        key: toDateInput(range.start),
        label: `${formatShortDate(range.start)} ~ ${formatShortDate(range.end)}`,
        start: range.start,
        end: range.end,
      });
    }
    return frames;
  }
  if (mode === "month") {
    const frames = [];
    let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      frames.push({
        key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        label: `${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, "0")}`,
        start,
        end: monthEnd,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return frames;
  }
  const frames = [];
  for (let y = earliest.getFullYear(); y <= end.getFullYear(); y += 1) {
    frames.push({ key: String(y), label: `${y}년`, start: new Date(y, 0, 1), end: new Date(y, 11, 31) });
  }
  return frames;
}

export function groupOccurrences(occurrences, mode, categories = []) {
  const end = startOfDay(new Date());
  const earliest = occurrences
    .map((entry) => fromDateInput(entry.occurrenceDate))
    .filter(Boolean)
    .sort((a, b) => a - b)[0] || end;
  const frames = buildBucketFrames(mode, earliest, end);
  const map = new Map(frames.map((frame) => [frame.key, { ...frame, income: 0, expense: 0, net: 0, items: [] }]));
  for (const item of occurrences) {
    const date = fromDateInput(item.occurrenceDate);
    if (!date || date > end) continue;
    const key = bucketKeyForDate(mode, date, end);
    const bucket = map.get(key);
    if (!bucket) continue;
    const signed = signedAmount(item, categories);
    if (signed >= 0) bucket.income += signed;
    else bucket.expense += Math.abs(signed);
    bucket.net += signed;
    bucket.items.push(item);
  }
  let running = 0;
  return frames.map((frame) => {
    const bucket = map.get(frame.key);
    running += bucket.net;
    return { ...bucket, cumulative: running };
  });
}

export function inRangeOccurrences(occurrences, start, end) {
  return occurrences.filter((item) => {
    const date = fromDateInput(item.occurrenceDate);
    return !!date && date >= start && date <= end;
  });
}

export function nextRepeatDate(date, repeat) {
  const next = new Date(date.getTime());
  if (repeat === "daily") next.setDate(next.getDate() + 1);
  else if (repeat === "every_other_day") next.setDate(next.getDate() + 2);
  else if (repeat === "weekday") {
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  } else if (repeat === "weekend") {
    next.setDate(next.getDate() + 1);
    while (next.getDay() !== 0 && next.getDay() !== 6) next.setDate(next.getDate() + 1);
  } else if (repeat === "biweekly") next.setDate(next.getDate() + 14);
  else if (repeat === "fourweekly") next.setDate(next.getDate() + 28);
  else if (repeat === "3months") next.setMonth(next.getMonth() + 3);
  else if (repeat === "6months") next.setMonth(next.getMonth() + 6);
  else if (repeat === "yearly") next.setMonth(next.getMonth() + 12);
  else next.setMonth(next.getMonth() + 1);
  return startOfDay(next);
}

export function expandEntry(entry, start, end) {
  const result = [];
  const origin = fromDateInput(entry.date);
  if (!origin) return result;
  const repeat = entry.repeat || "none";
  const repeatEnd = validDate(entry.repeatEndDate) ? fromDateInput(entry.repeatEndDate) : null;
  if (repeat === "none") {
    if (origin >= start && origin <= end) result.push(withOccurrence(entry, origin));
    return result;
  }
  let cursor = new Date(origin.getTime());
  let guard = 0;
  while (cursor <= end && guard < 4000) {
    if (repeatEnd && cursor > repeatEnd) break;
    if (cursor >= start) result.push(withOccurrence(entry, cursor));
    cursor = nextRepeatDate(cursor, repeat);
    guard += 1;
  }
  return result;
}

export function withOccurrence(entry, date) {
  return { ...entry, occurrenceDate: toDateInput(date) };
}

export function buildOccurrences(entries, range) {
  const all = [];
  for (const entry of entries) {
    all.push(...expandEntry(entry, range.start, range.end));
  }
  return all;
}

export function sumSigned(occurrences, categories = []) {
  return occurrences.reduce((sum, item) => sum + signedAmount(item, categories), 0);
}

export function roundedAxisMax(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1.5 ? 0.2 : normalized <= 3 ? 0.5 : 1;
  return Math.ceil(value / (step * magnitude)) * step * magnitude;
}

export function resolveSelectedBucketKey(map, mode, buckets) {
  const current = map[mode];
  if (current && buckets.some((bucket) => bucket.key === current)) return current;
  const now = startOfDay(new Date());
  const key = bucketKeyForDate(mode, now, now);
  map[mode] = buckets.some((bucket) => bucket.key === key) ? key : buckets[buckets.length - 1]?.key || null;
  return map[mode];
}

export function nextOccurrenceOnOrAfter(entry, target, hardEnd) {
  const repeat = entry.repeat || "none";
  if (repeat === "none") {
    const d = fromDateInput(entry.date);
    return d && d >= target && d <= hardEnd ? d : null;
  }
  const origin = fromDateInput(entry.date);
  if (!origin) return null;
  const repeatEnd = validDate(entry.repeatEndDate) ? fromDateInput(entry.repeatEndDate) : null;
  let cursor = new Date(origin.getTime());
  let guard = 0;
  while (cursor < target && guard < 4000) {
    cursor = nextRepeatDate(cursor, repeat);
    if (!cursor) return null;
    if (repeatEnd && cursor > repeatEnd) return null;
    guard += 1;
  }
  if (cursor > hardEnd) return null;
  if (repeatEnd && cursor > repeatEnd) return null;
  return cursor;
}

export function buildPendingScheduledOccurrences(wallet, selectedRange) {
  const now = startOfDay(new Date());
  const end = selectedRange?.end ? startOfDay(selectedRange.end) : addDays(now, 366);
  const windowStart = addDays(now, 1);
  if (windowStart > end) return [];
  const result = [];
  for (const entry of wallet.entries) {
    if ((entry.repeat || "none") === "none") continue;
    const origin = fromDateInput(entry.date);
    if (!origin || origin > end) continue;
    const repeatEnd = validDate(entry.repeatEndDate) ? fromDateInput(entry.repeatEndDate) : null;
    if (repeatEnd && repeatEnd < windowStart) continue;
    const next = nextOccurrenceOnOrAfter(entry, windowStart, end);
    if (!next) continue;
    const view = withOccurrence(entry, next);
    const endText = validDate(entry.repeatEndDate) ? entry.repeatEndDate : "없음";
    view.note = `${entry.note || "메모 없음"} · 시작:${entry.date} · 종료:${endText}`;
    result.push(view);
  }
  return result.sort((a, b) => (a.occurrenceDate === b.occurrenceDate ? (a.id > b.id ? 1 : -1) : a.occurrenceDate > b.occurrenceDate ? 1 : -1));
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
