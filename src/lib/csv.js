import Papa from "papaparse";

/**
 * Generate a unique ID for entries
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const CATEGORY_COLOR_PALETTE = [
  "#c62828", "#ef6c00", "#6a1b9a", "#0277bd", "#37474f",
  "#00897b", "#d81b60", "#1976d2", "#2e7d32", "#5d4037",
  "#7e57c2", "#455a64", "#ff7043", "#ec407a", "#78909c",
  "#1565c0", "#43a047", "#0288d1", "#8d6e63", "#546e7a",
  "#3949ab", "#f4511e", "#00acc1", "#7cb342", "#ab47bc",
];

function pickUnusedColor(usedColors) {
  const available = CATEGORY_COLOR_PALETTE.filter((c) => !usedColors.has(c));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return CATEGORY_COLOR_PALETTE[Math.floor(Math.random() * CATEGORY_COLOR_PALETTE.length)];
}

function sortEntriesByNewestDate(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return 0;
  });
}

/**
 * Serialize a wallet to CSV format
 * @param {Object} wallet - The wallet object with entries
 * @param {Array} categories - Array of category objects
 * @param {Array} labels - Array of label objects
 * @returns {string} CSV string with UTF-8 encoding (no BOM)
 */
export function serializeWalletCsv(wallet, categories, labels) {
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
  const labelMap = new Map(labels.map((lbl) => [lbl.id, lbl]));

  const rows = [];
  // Map to track which Labels values need quoting (when individual label names contain semicolons)
  const labelsNeedQuoting = new Map();

  for (const entry of sortEntriesByNewestDate(wallet.entries)) {
    const category = categoryMap.get(entry.categoryId);
    if (!category) continue; // Skip entries with unknown category

    const labelNamesArray = entry.labelIds
      .map((id) => labelMap.get(id)?.name)
      .filter(Boolean);

    const labelNames = labelNamesArray.join(";");

    // Track if any individual label name contains semicolon (needs quoting)
    if (labelNamesArray.some((name) => name.includes(";"))) {
      labelsNeedQuoting.set(labelNames, true);
    }

    rows.push({
      Date: entry.date,
      Type: category.type,
      Category: category.name,
      Amount: entry.amount,
      Note: entry.note || "",
      Labels: labelNames,
    });
  }

  // PapaParse returns empty string for empty data, but we need header
  if (rows.length === 0) {
    return "Date,Type,Category,Amount,Note,Labels\n";
  }

  return Papa.unparse(rows, {
    header: true,
    columns: ["Date", "Type", "Category", "Amount", "Note", "Labels"],
    newline: "\n",
    // Quote fields that need it: commas, quotes, newlines (RFC 4180), plus individual label names with semicolons
    quotes(value, columnIndex) {
      const valueStr = String(value);
      // Always quote if contains comma, quote, or newline (RFC 4180)
      if (valueStr.includes(",") || valueStr.includes('"') || valueStr.includes("\n")) {
        return true;
      }
      // Quote Labels column if any individual label name contained semicolon
      if (columnIndex === 5 && labelsNeedQuoting.has(valueStr)) {
        return true;
      }
      return false;
    },
  });
}

/**
 * Parse CSV text into wallet entries
 * @param {string} text - CSV text content
 * @param {Array} categories - Array of category objects
 * @param {Array} labels - Array of label objects
 * @returns {Object} { entries: Array, rejected: Array, unknownLabels: Set, error?: string }
 */
export function parseWalletCsv(text, categories, labels) {
  const result = {
    entries: [],
    rejected: [],
    unknownLabels: new Set(),
    newCategories: [],
    newLabels: [],
    error: null,
  };

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  // Validate header
  const expectedHeader = ["Date", "Type", "Category", "Amount", "Note", "Labels"];
  if (parsed.meta.fields?.length !== expectedHeader.length || !expectedHeader.every((h, i) => parsed.meta.fields[i] === h)) {
    result.error = "invalidHeader";
    return result;
  }

  const categoryMap = new Map();
  for (const cat of categories) {
    const key = `${cat.type.toLowerCase()}:${cat.name}`;
    categoryMap.set(key, cat.id);
  }

  const usedColors = new Set(categories.map((cat) => cat.color));
  const labelNameToId = new Map(labels.map((lbl) => [lbl.name, lbl.id]));

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNumber = i + 2; // +1 for 1-based, +1 for header

    // Validate date format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(row.Date)) {
      result.rejected.push({
        row: rowNumber,
        reason: "invalidDate",
        date: row.Date,
      });
      continue;
    }

    // Validate and parse amount
    const amount = Math.abs(Number(row.Amount));
    if (Number.isNaN(amount)) {
      result.rejected.push({
        row: rowNumber,
        reason: "invalidAmount",
        amount: row.Amount,
      });
      continue;
    }

    // Match category by (type, name) — case-insensitive type, auto-create if missing
    const type = row.Type.toLowerCase();
    const categoryKey = `${type}:${row.Category}`;
    let categoryId = categoryMap.get(categoryKey);
    if (!categoryId) {
      const newId = uid();
      const color = pickUnusedColor(usedColors);
      usedColors.add(color);
      const newCat = { id: newId, name: row.Category, type, color, icon: "spark" };
      result.newCategories.push(newCat);
      categoryMap.set(categoryKey, newId);
      categoryId = newId;
    }

    // Parse labels — auto-create if missing
    const labelIds = [];
    if (row.Labels && row.Labels.trim()) {
      const labelNames = row.Labels.split(";").map((name) => name.trim()).filter(Boolean);
      for (const name of labelNames) {
        let labelId = labelNameToId.get(name);
        if (!labelId) {
          const newId = uid();
          result.newLabels.push({ id: newId, name });
          labelNameToId.set(name, newId);
          labelId = newId;
        }
        labelIds.push(labelId);
      }
    }

    result.entries.push({
      id: uid(),
      date: row.Date,
      amount,
      categoryId,
      labelIds,
      note: row.Note || "",
      repeat: "none",
      repeatEndDate: "",
    });
  }

  result.entries = sortEntriesByNewestDate(result.entries);
  return result;
}
