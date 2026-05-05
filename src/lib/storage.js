import sampleOffice from "../../samples/3y-salaryman-wallet.json";
import { ACTIVE_STORAGE_KEY, STORAGE_KEYS, safeJsonParse, uid } from "./finance.js";

function inferCategoryIcon(category) {
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

function normalizeCategory(category, index) {
  return {
    id: category.id || uid(),
    name: category.name || `카테고리 ${index + 1}`,
    type: category.type === "income" ? "income" : "expense",
    color: category.color || (category.type === "income" ? "#1565c0" : "#c62828"),
    icon: category.icon && category.icon !== "spark" ? category.icon : inferCategoryIcon(category),
  };
}

function normalizeLabel(label, index) {
  return {
    id: label.id || uid(),
    name: label.name || `레이블 ${index + 1}`,
    color: label.color || "#64748b",
  };
}

function normalizeWallet(wallet, categories, labels) {
  return {
    id: wallet.id || uid(),
    name: wallet.name || "지갑",
    entries: Array.isArray(wallet.entries)
      ? wallet.entries.map((entry) => ({
          id: entry.id || uid(),
          date: entry.date || new Date().toISOString().slice(0, 10),
          amount: Number(entry.amount || 0),
          categoryId: entry.categoryId || categories[0]?.id || "",
          labelId: entry.labelId || labels[0]?.id || "",
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
      : sampleOffice;

  const categories = (Array.isArray(seed.categories) && seed.categories.length ? seed.categories : sampleOffice.categories || []).map(normalizeCategory);
  const labels = (Array.isArray(seed.labels) && seed.labels.length ? seed.labels : sampleOffice.labels || []).map(normalizeLabel);
  const wallets = (Array.isArray(seed.wallets) ? seed.wallets : []).map((wallet) => normalizeWallet(wallet, categories, labels));

  if (!wallets.length) {
    wallets.push(normalizeWallet(sampleOffice.wallet, categories, labels));
  }

  return {
    version: 3,
    selectedWalletId: seed.selectedWalletId || wallets[0].id,
    wallets,
    categories,
    labels,
  };
}

export function loadState() {
  for (const key of STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (parsed) return normalizeState(parsed);
  }
  return normalizeState(sampleOffice);
}

export function saveState(state) {
  localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(state));
}
