// Usage: node scripts/generate-sample-data.js <months> > <output.json>
//
// Loads categories/labels from samples/default-seed.json and emits a single
// wallet JSON ({ id, name, entries[] }). Designed so the running cash flow
// stays strictly positive throughout the full range.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(__dirname, "../samples/default-seed.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

const categoryIds = new Set(seed.categories.map((c) => c.id));
function need(id) {
  if (!categoryIds.has(id)) throw new Error(`Missing category id: ${id}`);
  return id;
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toDateInput(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function makeDate(year, monthIndex, day) {
  const d = Math.min(day, daysInMonth(year, monthIndex));
  return new Date(year, monthIndex, d);
}

let seedRng = 20260506;
function rand() {
  seedRng = (seedRng * 1664525 + 1013904223) % 4294967296;
  return seedRng / 4294967296;
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function choice(list) {
  return list[randInt(0, list.length - 1)];
}

function generate(months) {
  const entries = [];
  const today = new Date();
  const firstMonth = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);

  function addEntry(year, monthIndex, day, amount, categoryId, labelIds, note) {
    const date = makeDate(year, monthIndex, day);
    if (date > today) return;
    entries.push({
      id: uid(),
      date: toDateInput(date),
      amount: Math.abs(amount),
      categoryId: need(categoryId),
      labelIds: Array.isArray(labelIds) ? labelIds : labelIds ? [labelIds] : [],
      note,
      repeat: "none",
      repeatEndDate: "",
    });
  }

  for (let m = 0; m < months; m += 1) {
    const cur = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + m, 1);
    const year = cur.getFullYear();
    const monthIndex = cur.getMonth();
    const month = monthIndex + 1;

    // Salary on day 1 → cash buffer always present before fixed costs.
    addEntry(year, monthIndex, 1, 5500000, "salary", ["fixed"], "Monthly salary");
    if (rand() < 0.4) addEntry(year, monthIndex, randInt(3, 27), randInt(80000, 450000), "incentive", ["variable"], "Performance bonus");
    if (rand() < 0.15) addEntry(year, monthIndex, randInt(5, 26), randInt(20000, 180000), "income_other", ["events"], "Refund / gift");

    addEntry(year, monthIndex, 5, randInt(1050000, 1300000), "rent", ["fixed"], "Monthly rent");
    addEntry(year, monthIndex, 10, randInt(170000, 290000), "utility", ["fixed"], "Electricity / gas / water");
    addEntry(year, monthIndex, 12, randInt(65000, 95000), "utility", ["fixed"], "Phone / internet");
    addEntry(year, monthIndex, 18, randInt(140000, 240000), "subscription", ["fixed"], "Insurance");
    addEntry(year, monthIndex, 7, randInt(20000, 30000), "subscription", ["fixed"], choice(["Netflix", "Spotify", "iCloud", "Disney+"]));
    if (rand() < 0.5) addEntry(year, monthIndex, 8, randInt(35000, 80000), "subscription", ["fixed"], "Gym membership");

    const groceryCount = randInt(2, 4);
    for (let i = 0; i < groceryCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, daysInMonth(year, monthIndex)), randInt(40000, 130000), "groceries", ["variable"], "Groceries");
    }

    const foodCount = randInt(18, 28);
    for (let i = 0; i < foodCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, daysInMonth(year, monthIndex)), randInt(7000, 24000), "food_drink", ["variable"], choice(["Breakfast", "Lunch", "Dinner", "Coffee"]));
    }

    const transportCount = randInt(10, 16);
    for (let i = 0; i < transportCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, daysInMonth(year, monthIndex)), randInt(1400, 17000), "transport", ["variable"], choice(["Subway", "Bus", "Taxi"]));
    }

    if (rand() < 0.7) addEntry(year, monthIndex, randInt(2, 28), randInt(50000, 110000), "car", ["variable"], "Fuel");
    if (rand() < 0.12) addEntry(year, monthIndex, randInt(2, 28), randInt(120000, 500000), "car", ["events"], "Maintenance");

    const shoppingCount = randInt(1, 4);
    for (let i = 0; i < shoppingCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, daysInMonth(year, monthIndex)), randInt(20000, 200000), "shopping", ["variable"], "Shopping");
    }

    const healthCount = randInt(0, 2);
    for (let i = 0; i < healthCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, daysInMonth(year, monthIndex)), randInt(20000, 150000), "healthcare", ["events"], "Clinic / pharmacy");
    }

    const entCount = randInt(1, 3);
    for (let i = 0; i < entCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, 28), randInt(10000, 70000), "entertainment", ["variable"], choice(["Movie", "Concert", "Game"]));
    }

    const hobbyCount = randInt(0, 2);
    for (let i = 0; i < hobbyCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, 28), randInt(20000, 180000), "hobby", ["variable"], "Hobby");
    }

    if (rand() < 0.5) addEntry(year, monthIndex, randInt(2, 28), randInt(20000, 100000), "beauty", ["variable"], "Salon / cosmetics");

    if (rand() < 0.35) addEntry(year, monthIndex, randInt(2, 28), randInt(40000, 180000), "education", ["lieu"], "Course / book");

    const otherCount = randInt(1, 2);
    for (let i = 0; i < otherCount; i += 1) {
      addEntry(year, monthIndex, randInt(2, 28), randInt(15000, 100000), "expense_other", ["variable"], "Misc");
    }

    // One modest summer trip per summer month, total ≪ monthly net so cumulative keeps growing.
    const isSummer = month === 6 || month === 7 || month === 8;
    if (isSummer) {
      addEntry(year, monthIndex, randInt(10, 25), randInt(700000, 1400000), "travel", ["events"], "Summer trip");
    }
  }

  return entries;
}

const monthsArg = parseInt(process.argv[2], 10);
const months = Number.isFinite(monthsArg) && monthsArg > 0 ? monthsArg : 36;

const entries = generate(months).sort((a, b) => (a.date > b.date ? 1 : -1));

const wallet = {
  id: `wallet_${Math.round(months / 12)}y_${uid()}`,
  name: `Sample ${Math.round(months / 12)}Y Wallet`,
  entries,
};

process.stdout.write(JSON.stringify(wallet, null, 2));
