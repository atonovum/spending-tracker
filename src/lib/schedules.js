import {
  addDays,
  expandEntry,
  fromDateInput,
  nextScheduleDate,
  normalizeLabelIds,
  scheduleSeries,
  startOfDay,
  toDateInput,
  uid,
  validDate,
} from "./finance.js";

/**
 * 예약 거래 (scheduled transactions) — templates, and the materialisation that
 * turns them into real transactions.
 *
 * The model: a schedule is *not* a transaction. It lives in `wallet.scheduled`
 * and describes a transaction that will be created later, once or repeatedly.
 * When an occurrence comes due, `materializeState` writes a plain entry into
 * `wallet.entries`. From that moment the entry and the schedule are
 * independent: editing the schedule never rewrites what was already created,
 * and deleting the schedule never removes it.
 *
 * Why not derive the past instead (the pre-v4 model)? Because a derived row
 * carries the template's *current* values: raising a subscription's amount
 * silently rewrote every past month, deleting the template deleted its history,
 * and a single occurrence could not be edited at all — there was nowhere to put
 * the difference. Materialised rows are ordinary entries and have none of those
 * problems. Only the *future* is still derived (see
 * `buildPendingScheduledOccurrences` in `finance.js`), because it has not
 * happened yet.
 */

/** Today as "YYYY-MM-DD", in local time. */
export function todayString() {
  return toDateInput(startOfDay(new Date()));
}

/**
 * Id of the entry a schedule occurrence materialises into.
 *
 * Derived from the schedule id and the occurrence date so that a second pass
 * over the same occurrence is recognisable even if the cursor was lost (a
 * restored backup, a half-applied sync). It is a de-duplication key only —
 * nothing reads the schedule back out of it, and the entry stays editable and
 * deletable like any other.
 */
export function scheduleOccurrenceId(scheduleId, date) {
  return `${scheduleId}-${date}`;
}

export function normalizeSchedule(schedule, categories = [], knownLabelIds = null) {
  const source = schedule || {};
  // `date` is accepted as an alias so a v3 repeating entry can be handed over
  // as-is by the migration below.
  const startDate = validDate(source.startDate)
    ? source.startDate
    : validDate(source.date)
      ? source.date
      : todayString();
  return {
    id: source.id || uid(),
    startDate,
    amount: Number(source.amount || 0),
    categoryId: source.categoryId || categories[0]?.id || "",
    labelIds: normalizeLabelIds(source).filter((id) => !knownLabelIds || knownLabelIds.has(id)),
    note: source.note || "",
    repeat: source.repeat || "none",
    repeatEndDate: validDate(source.repeatEndDate) ? source.repeatEndDate : "",
    // Materialisation cursor: the last occurrence date written out as an entry.
    // "" means nothing has been generated yet.
    lastRunDate: validDate(source.lastRunDate) ? source.lastRunDate : "",
  };
}

/**
 * Occurrence dates of `schedule` that are due on or before `todayStr` and have
 * not been generated yet (strictly after the cursor).
 */
export function dueOccurrences(schedule, todayStr = todayString()) {
  const start = fromDateInput(schedule?.startDate);
  const today = fromDateInput(todayStr);
  if (!start || !today || start > today) return [];
  const cursor = validDate(schedule.lastRunDate) ? schedule.lastRunDate : "";
  return expandEntry(scheduleSeries(schedule), start, today)
    .map((occurrence) => occurrence.occurrenceDate)
    .filter((date) => !cursor || date > cursor);
}

/**
 * The date a schedule will next create a transaction, or null when it never
 * will again (a spent one-time schedule, an expired repeat).
 *
 * Cursor-aware on purpose: an occurrence that already materialised today is in
 * the past as far as the *schedule* is concerned, so the answer is the one
 * after it. Never returns a date before today.
 */
export function upcomingDate(schedule, hardEnd) {
  const today = startOfDay(new Date());
  const cursor = validDate(schedule?.lastRunDate) ? fromDateInput(schedule.lastRunDate) : null;
  const afterCursor = cursor ? addDays(cursor, 1) : null;
  const target = afterCursor && afterCursor > today ? afterCursor : today;
  const next = nextScheduleDate(schedule, target, hardEnd);
  return next ? toDateInput(next) : null;
}

/**
 * Materialise everything `schedule` owes up to `todayStr`.
 *
 * `existingIds` is the wallet's set of entry ids; it is read *and* extended, so
 * a single pass never emits the same id twice. Idempotent twice over: the
 * cursor stops a second run from generating anything, and the id check stops a
 * duplicate even when the cursor is missing.
 *
 * @returns {{ schedule: object, created: object[] }} the schedule with its
 *   cursor advanced (the same object when nothing was due) and the new entries.
 */
export function materializeSchedule(schedule, existingIds, todayStr = todayString()) {
  const dates = dueOccurrences(schedule, todayStr);
  if (!dates.length) return { schedule, created: [] };

  const created = [];
  for (const date of dates) {
    const id = scheduleOccurrenceId(schedule.id, date);
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    created.push({
      id,
      date,
      amount: schedule.amount,
      categoryId: schedule.categoryId,
      labelIds: [...(schedule.labelIds || [])],
      note: schedule.note || "",
    });
  }
  return { schedule: { ...schedule, lastRunDate: dates[dates.length - 1] }, created };
}

/**
 * A one-time schedule is spent once it has fired: its content now lives in a
 * real, independent entry and it has no future occurrence left. Dropping it
 * keeps 설정 > 예약 거래 a list of things that are still going to happen.
 * Repeating schedules are always kept, including expired ones — their end date
 * is editable, so they can be resumed.
 */
export function isSpentSchedule(schedule) {
  return (schedule?.repeat || "none") === "none" && !!schedule?.lastRunDate;
}

/** Materialise every schedule in a wallet. Returns `wallet` when nothing was due. */
export function materializeWallet(wallet, todayStr = todayString()) {
  const schedules = Array.isArray(wallet?.scheduled) ? wallet.scheduled : [];
  if (!schedules.length) return wallet;

  const existingIds = new Set((wallet.entries || []).map((entry) => entry.id));
  const created = [];
  let changed = false;
  const scheduled = [];
  for (const schedule of schedules) {
    const result = materializeSchedule(schedule, existingIds, todayStr);
    if (result.schedule !== schedule) changed = true;
    created.push(...result.created);
    if (isSpentSchedule(result.schedule)) changed = true;
    else scheduled.push(result.schedule);
  }
  if (!changed) return wallet;
  return { ...wallet, entries: [...created, ...(wallet.entries || [])], scheduled };
}

/**
 * Materialise every wallet's schedules.
 *
 * Deliberately *not* part of `normalizeState`. Normalisation is a pure
 * sanitiser that runs on every import, every KV read and every load; it must be
 * idempotent and must not invent records — an imported wallet should not
 * silently sprout transactions on the way in. Materialisation is the opposite:
 * it depends on the current date and writes new records, so it runs once, at
 * the point where the app takes ownership of a document (initial load, and
 * again when a remote document is adopted).
 *
 * Returns the same object when nothing was due, so an untouched load does not
 * trigger a save or a sync push.
 */
export function materializeState(state, todayStr = todayString()) {
  if (!state || !Array.isArray(state.wallets)) return state;
  let changed = false;
  const wallets = state.wallets.map((wallet) => {
    const next = materializeWallet(wallet, todayStr);
    if (next !== wallet) changed = true;
    return next;
  });
  return changed ? { ...state, wallets } : state;
}

/**
 * Does a pre-v4 entry describe a template rather than a transaction?
 *
 * A repeating entry always did — it was never a single transaction. A
 * *future-dated* one-time entry did too: pre-v4 it was hidden from the ledger
 * buckets (which stop at today) and shown in 설정 > 예약 거래 and in the
 * "예정된 거래" block, i.e. it behaved as a schedule in every visible way. That
 * second rule only applies while migrating a legacy document, hence the flag.
 */
export function isLegacyTemplateEntry(entry, { todayStr, convertFutureOneTime }) {
  const repeat = entry?.repeat || "none";
  if (repeat !== "none") return true;
  return Boolean(convertFutureOneTime && validDate(entry?.date) && entry.date > todayStr);
}

/**
 * v3 → v4 shape migration for one wallet's collections.
 *
 * Non-destructive and idempotent: every legacy template becomes a schedule
 * *plus* the entries it used to render, so the ledger shows exactly the same
 * rows before and after. A v4 wallet has no repeating entries left, so a second
 * pass finds nothing to convert.
 *
 * @param {object[]} entries normalised v4-shaped entries, still carrying their
 *   legacy `repeat` / `repeatEndDate` fields.
 * @param {object[]} scheduled already-normalised schedules (v4 input).
 */
export function migrateLegacyTemplates(entries, scheduled, options = {}) {
  const todayStr = options.todayStr || todayString();
  const convertFutureOneTime = options.convertFutureOneTime === true;
  const categories = options.categories || [];
  const knownLabelIds = options.knownLabelIds || null;

  const plain = [];
  const templates = [];
  for (const entry of entries) {
    if (isLegacyTemplateEntry(entry, { todayStr, convertFutureOneTime })) templates.push(entry);
    else plain.push(entry);
  }
  if (!templates.length) return { entries: plain, scheduled };

  const existingIds = new Set(plain.map((entry) => entry.id));
  const created = [];
  const migrated = templates.map((entry) => {
    const schedule = normalizeSchedule({ ...entry, startDate: entry.date }, categories, knownLabelIds);
    const result = materializeSchedule(schedule, existingIds, todayStr);
    created.push(...result.created);
    return result.schedule;
  });

  return { entries: [...plain, ...created], scheduled: [...scheduled, ...migrated] };
}
