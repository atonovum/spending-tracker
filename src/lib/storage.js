import defaultSeed from "../../samples/default-seed.json";
import { ACTIVE_STORAGE_KEY, LAST_ENTRY_DATE_KEY, normalizeLabelIds, STORAGE_KEYS, safeJsonParse, uid, validDate } from "./finance.js";
import { withSampleData } from "./sampleData.js";

/**
 * Whether the dev sample wallets are seeded. Not an opt-in flag any more: local
 * development must come up with data without anyone remembering an env var.
 *
 * `import.meta.env.DEV` is substituted by Vite at transform time and is decided
 * by the command, not by the environment — `vite` (npm run dev, and the dev
 * container's CMD) bakes in `true`, `vite build` (the only path `npm run build`,
 * `npm run preview` and `npm run deploy` take) always bakes in `false`. No env
 * var can flip it, so sample data cannot reach a deployed bundle; the branch
 * folds to a constant and `sampleData.js` — JSON fixtures included — is
 * tree-shaken out of the production build entirely.
 *
 * Vitest also reports `DEV === true`, hence the `MODE` guard: the suite asserts
 * on the plain seed and must not be handed 6500 sample entries.
 */
export const SAMPLE_SEED_ENABLED = import.meta.env.DEV && import.meta.env.MODE !== "test";

/**
 * In dev, merge freshly-dated sample wallets into whatever state came in
 * (fresh seed, localStorage, or KV). Identity everywhere else.
 */
export function applySampleSeed(state) {
  return SAMPLE_SEED_ENABLED ? withSampleData(state) : state;
}

const DEFAULT_SEED = applySampleSeed(defaultSeed);

export function inferCategoryIcon(category) {
  const id = (category.id || "").toLowerCase();
  const name = category.name || "";
  if (/salary|wage|payroll/.test(id) || /급여|월급|봉급|연봉/.test(name)) return "salary";
  if (/gift|refund|bonus/.test(id) || /선물|환급|보너스|용돈/.test(name)) return "gift";
  if (/save|saving|deposit/.test(id) || /저축|적금|예금/.test(name)) return "savings";
  if (/food|meal|dining/.test(id) || /식비|식사|외식|음식/.test(name)) return "food";
  if (/transport|bus|taxi|car|fuel/.test(id) || /교통|버스|택시|주유|차량/.test(name)) return "bus";
  if (/health|hospital|medical|drug/.test(id) || /의료|병원|약/.test(name)) return "hospital";
  if (/house|home|housing|rent/.test(id) || /주거|월세|전세|관리비|집/.test(name)) return "house";
  if (/utility|telecom|phone|gas|electric|water/.test(id) || /통신|전기|가스|수도|공과/.test(name)) return "utility";
  if (/travel|trip|vacation/.test(id) || /여행|휴가/.test(name)) return "travel";
  if (/study|education|book|learn/.test(id) || /교육|학습|도서|책|학원/.test(name)) return "study";
  if (/shop|cart|grocery|mart|retail/.test(id) || /쇼핑|마트|장보기|구매/.test(name)) return "cart";
  return category.type === "income" ? "wallet" : "cart";
}

export function normalizeCategory(category, index) {
  return {
    id: category.id || uid(),
    name: category.name || `카테고리 ${index + 1}`,
    type: category.type === "income" ? "income" : "expense",
    color: category.color || (category.type === "income" ? "#1565c0" : "#c62828"),
    icon: category.icon && category.icon !== "spark" ? category.icon : inferCategoryIcon(category),
  };
}

export function normalizeLabel(label, index) {
  return {
    id: label.id || uid(),
    name: label.name || `레이블 ${index + 1}`,
  };
}

export function normalizeWallet(wallet, categories, labels) {
  // Imported or migrated state can reference labels that no longer exist. Drop
  // those ids here, at the persistence boundary, so nothing downstream has to
  // guard against dangling references.
  const knownLabelIds = new Set((Array.isArray(labels) ? labels : []).map((label) => label.id));

  return {
    id: wallet.id || uid(),
    name: wallet.name || "지갑",
    entries: Array.isArray(wallet.entries)
      ? wallet.entries.map((entry) => ({
          id: entry.id || uid(),
          date: entry.date || new Date().toISOString().slice(0, 10),
          amount: Number(entry.amount || 0),
          categoryId: entry.categoryId || categories[0]?.id || "",
          labelIds: normalizeLabelIds(entry).filter((id) => knownLabelIds.has(id)),
          note: entry.note || "",
          repeat: entry.repeat || "none",
          repeatEndDate: entry.repeatEndDate || "",
        }))
      : [],
  };
}

export function normalizeState(parsed) {
  const seed = parsed?.wallets
    ? parsed
    : parsed?.wallet
      ? { wallets: [parsed.wallet], categories: parsed.categories || [], labels: parsed.labels || [], selectedWalletId: parsed.wallet.id }
      : DEFAULT_SEED;

  const fallbackCategories = DEFAULT_SEED.categories || [];
  const fallbackLabels = DEFAULT_SEED.labels || [];
  const fallbackWallet = DEFAULT_SEED.wallets?.[0] || DEFAULT_SEED.wallet;

  const categories = (Array.isArray(seed.categories) && seed.categories.length ? seed.categories : fallbackCategories).map(normalizeCategory);
  const labels = (Array.isArray(seed.labels) && seed.labels.length ? seed.labels : fallbackLabels).map(normalizeLabel);
  const wallets = (Array.isArray(seed.wallets) ? seed.wallets : []).map((wallet) => normalizeWallet(wallet, categories, labels));

  if (!wallets.length && fallbackWallet) {
    wallets.push(normalizeWallet(fallbackWallet, categories, labels));
  }

  return {
    version: 3,
    selectedWalletId: seed.selectedWalletId || wallets[0]?.id || "",
    language: seed.language === "en" ? "en" : "ko",
    currency: seed.currency === "USD" ? "USD" : "KRW",
    wallets,
    categories,
    labels,
    updatedAt: typeof seed.updatedAt === "number" ? seed.updatedAt : 0,
  };
}

export function loadState() {
  for (const key of STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    // Stored state normally wins outright. In dev the samples are re-seeded on
    // top of it instead, so a browser that already has state still shows a
    // populated current month — without discarding the developer's own wallets.
    if (parsed) return normalizeState(applySampleSeed(parsed));
  }
  return normalizeState(DEFAULT_SEED);
}

export function saveState(state) {
  try {
    localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Date the user last created an entry with. Stored under its own localStorage
 * key rather than inside the normalised state: it is a per-device UI
 * convenience, not part of the document, so it stays out of export/import, out
 * of the KV sync payload, and needs no schema version bump.
 *
 * @returns {string} a valid "YYYY-MM-DD" string, or "" when unset/unusable.
 */
export function loadLastEntryDate() {
  try {
    const raw = localStorage.getItem(LAST_ENTRY_DATE_KEY);
    return validDate(raw) ? raw : "";
  } catch {
    return "";
  }
}

export function saveLastEntryDate(date) {
  if (!validDate(date)) return { ok: false };
  try {
    localStorage.setItem(LAST_ENTRY_DATE_KEY, date);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}
