import sample2y from "../../samples/2y-sample-wallet.json";
import sample3y from "../../samples/3y-sample-wallet.json";
import sample5y from "../../samples/5y-sample-wallet.json";
import defaultSeed from "../../samples/default-seed.json";
import { addDays, fromDateInput, toDateInput, validDate } from "./finance.js";

/**
 * Dev-only sample fixtures, re-dated at load time.
 *
 * The JSON files under `samples/` are frozen at generation time, so they drift
 * out of the visible range as real time passes. Rather than rewriting the
 * tracked files (6500+ entries → a huge unwanted diff in every working tree),
 * every date is shifted by a single whole-day offset while the state is loaded.
 * The transform is pure: nothing is written to disk, and the result is exact on
 * every run instead of once a day.
 *
 * The offset is computed per wallet from that wallet's own latest entry, so each
 * sample wallet ends exactly on the target date. Because it is one offset for
 * the whole wallet, the relative spacing between its entries is untouched.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sample wallets in the order they are seeded. `[0]` is the default pick. */
export const SAMPLE_WALLETS = [sample2y, sample3y, sample5y];

/** Whole-day distance between two "YYYY-MM-DD" strings (0 when unparseable). */
export function dayOffset(from, to) {
  const start = fromDateInput(from);
  const end = fromDateInput(to);
  if (!start || !end) return 0;
  // Round rather than truncate: a DST transition inside the span leaves the
  // difference an hour off a whole number of days.
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

/**
 * Shift a "YYYY-MM-DD" string by whole days. Arithmetic goes through `Date`,
 * so month-end and leap-day rollovers land on real calendar dates. Anything
 * that is not a well-formed date (`""`, `undefined`, garbage) is passed through
 * untouched — those are the schema's "no value" forms, not dates to move.
 */
export function shiftDate(value, days) {
  if (!validDate(value)) return value;
  const base = fromDateInput(value);
  if (!base) return value;
  return toDateInput(addDays(base, days));
}

/**
 * `repeatEndDate` moves by the same offset as `date`, so a repeat series keeps
 * its length and never ends before it starts.
 */
export function shiftEntry(entry, days) {
  return {
    ...entry,
    date: shiftDate(entry?.date, days),
    repeatEndDate: shiftDate(entry?.repeatEndDate ?? "", days),
  };
}

/** Latest valid entry date in a wallet, or "" when there is none. */
export function latestEntryDate(entries) {
  if (!Array.isArray(entries)) return "";
  return entries.reduce((latest, entry) => {
    const date = entry?.date;
    return validDate(date) && date > latest ? date : latest;
  }, "");
}

/**
 * 예약 거래 for a sample wallet, dated relative to `targetDate` rather than
 * shifted like the entries: they are generated here, not read from the frozen
 * fixtures, so they are already correct for today.
 *
 * Positioned so both halves of the feature are on screen during development:
 * the monthly one starts two months back, so it has already created real
 * transactions in the ledger *and* still has an upcoming occurrence; the
 * one-time one is ten days out, so it sits in 예정된 거래 waiting to fire.
 *
 * Ids are prefixed with the wallet id because materialised entries derive
 * theirs from the schedule id, and the same schedule appears in every sample
 * wallet.
 */
export function buildSampleSchedules(walletId, targetDate) {
  const today = fromDateInput(targetDate);
  if (!today) return [];
  return [
    {
      id: `${walletId}_sched_subscription`,
      startDate: toDateInput(addDays(today, -60)),
      amount: 13900,
      categoryId: "subscription",
      labelIds: ["fixed"],
      note: "음악 스트리밍 구독",
      repeat: "monthly",
      repeatEndDate: "",
      lastRunDate: "",
    },
    {
      id: `${walletId}_sched_insurance`,
      startDate: toDateInput(addDays(today, 10)),
      amount: 240000,
      categoryId: "healthcare",
      labelIds: ["events"],
      note: "연간 건강검진 예약",
      repeat: "none",
      repeatEndDate: "",
      lastRunDate: "",
    },
  ];
}

/** Shift every entry so the wallet's latest entry falls on `targetDate`. */
export function shiftWalletToDate(wallet, targetDate) {
  const entries = Array.isArray(wallet?.entries) ? wallet.entries : [];
  const latest = latestEntryDate(entries);
  const days = latest ? dayOffset(latest, targetDate) : 0;
  return {
    ...wallet,
    entries: entries.map((entry) => shiftEntry(entry, days)),
    scheduled: buildSampleSchedules(wallet?.id, targetDate),
  };
}

/** The three sample wallets, each ending on `targetDate` (default: today). */
export function buildSampleWallets(targetDate = toDateInput(new Date())) {
  return SAMPLE_WALLETS.map((wallet) => shiftWalletToDate(wallet, targetDate));
}

function mergeById(existing, required) {
  const merged = Array.isArray(existing) ? existing.filter(Boolean) : [];
  const known = new Set(merged.map((item) => item?.id));
  for (const item of required) {
    if (!known.has(item.id)) merged.push(item);
  }
  return merged;
}

/**
 * Force freshly-dated sample wallets into a state document.
 *
 * Non-destructive by design: wallets the developer created are kept as they
 * are, and only wallets carrying a sample wallet id are replaced (so reloading
 * re-dates the samples instead of piling up copies). Categories and labels the
 * samples reference are added back when missing, otherwise sample entries would
 * resolve to the wrong category and flip sign in the ledger.
 *
 * The selection is only moved when it does not resolve to a wallet with
 * entries — that covers the fresh seed (whose default wallet is empty) without
 * fighting a developer who switched wallets on purpose.
 *
 * Sample wallets can push the wallet count past `MAX_WALLETS`; that only
 * disables "add wallet" in settings, and it is dev-only.
 */
export function withSampleData(state, targetDate = toDateInput(new Date())) {
  const samples = buildSampleWallets(targetDate);
  const sampleIds = new Set(samples.map((wallet) => wallet.id));
  // v1/v2 documents carry a single `wallet`; keep it rather than dropping it.
  const stored = Array.isArray(state?.wallets)
    ? state.wallets
    : state?.wallet
      ? [state.wallet]
      : [];
  const wallets = [...stored.filter((wallet) => !sampleIds.has(wallet?.id)), ...samples];

  const selected = wallets.find((wallet) => wallet?.id === state?.selectedWalletId);
  const selectionIsPopulated = Boolean(selected?.entries?.length);

  return {
    ...state,
    wallets,
    categories: mergeById(state?.categories, defaultSeed.categories),
    labels: mergeById(state?.labels, defaultSeed.labels),
    selectedWalletId: selectionIsPopulated ? state.selectedWalletId : samples[0].id,
  };
}
