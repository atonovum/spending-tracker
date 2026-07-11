import fs from "fs";
import Papa from "papaparse";
import { parseWalletCsv } from "../src/lib/csv.js";

const defaultSeed = JSON.parse(fs.readFileSync("samples/default-seed.json", "utf8"));

// 1. Read Spendee CSV
const inputCsvText = fs.readFileSync("samples/transactions_export_2026-06-09_cash-wallet.csv", "utf8");
const parsedSpendee = Papa.parse(inputCsvText, { header: true, skipEmptyLines: true });

// 2. Convert to project's custom CSV format: Date,Type,Category,Amount,Note,Labels
const convertedRows = parsedSpendee.data.map(row => {
  // Date: e.g. "2025-11-01T08:09:04+00:00" -> "2025-11-01"
  const date = (row.Date || "").slice(0, 10);
  const type = (row.Type || "").toLowerCase();
  const category = row["Category name"] || row.Category || "";
  const amount = Math.abs(parseFloat(row.Amount || 0));
  const note = row.Note || "";
  const labels = row.Labels || "";
  return { Date: date, Type: type, Category: category, Amount: amount, Note: note, Labels: labels };
});

const convertedCsvText = Papa.unparse(convertedRows, { newline: "\n" });
fs.writeFileSync("samples/transactions_export_converted.csv", convertedCsvText, "utf8");
console.log("Converted CSV saved to samples/transactions_export_converted.csv");

// 3. Parse custom CSV using our actual app parser to resolve/auto-create categories & labels
const parseResult = parseWalletCsv(convertedCsvText, defaultSeed.categories, defaultSeed.labels);

const csvWallet = {
  id: "wallet_converted",
  name: "Cash Wallet",
  entries: parseResult.entries,
};

// Combine all into state JSON payload
const statePayload = {
  version: 3,
  wallets: [csvWallet],
  selectedWalletId: csvWallet.id,
  categories: [...defaultSeed.categories, ...parseResult.newCategories],
  labels: [...defaultSeed.labels, ...parseResult.newLabels],
  language: "ko",
};

fs.writeFileSync("samples/converted-seed.json", JSON.stringify(statePayload, null, 2), "utf8");
console.log("State payload saved to samples/converted-seed.json");
