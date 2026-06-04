import Papa from "papaparse";

/**
 * Generate a unique ID for entries
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
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

  for (const entry of wallet.entries) {
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
    const key = `${cat.type}:${cat.name}`;
    categoryMap.set(key, cat.id);
  }

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

    // Match category by (Type, Category name)
    const categoryKey = `${row.Type}:${row.Category}`;
    const categoryId = categoryMap.get(categoryKey);
    if (!categoryId) {
      result.rejected.push({
        row: rowNumber,
        reason: "missingCategory",
        category: row.Category,
        type: row.Type,
      });
      continue;
    }

    // Parse labels
    const labelIds = [];
    if (row.Labels && row.Labels.trim()) {
      const labelNames = row.Labels.split(";").map((name) => name.trim()).filter(Boolean);
      for (const name of labelNames) {
        const labelId = labelNameToId.get(name);
        if (labelId) {
          labelIds.push(labelId);
        } else {
          result.unknownLabels.add(name);
        }
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

  return result;
}
