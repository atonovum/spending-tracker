function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toDateInput(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function choice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const categories = [
  { id: "salary", name: "급여", type: "income", color: "#1565c0" },
  { id: "side_income", name: "부수입", type: "income", color: "#1e88e5" },
  { id: "gift_income", name: "선물/환급", type: "income", color: "#42a5f5" },
  { id: "food", name: "식비", type: "expense", color: "#e53935" },
  { id: "transport", name: "교통", type: "expense", color: "#ef5350" },
  { id: "housing", name: "주거", type: "expense", color: "#d81b60" },
  { id: "shopping", name: "쇼핑", type: "expense", color: "#8e24aa" },
  { id: "health", name: "건강", type: "expense", color: "#6d4c41" },
  { id: "etc", name: "기타", type: "expense", color: "#546e7a" },
];

const labels = [
  { id: "fixed", name: "고정", color: "#455a64" },
  { id: "variable", name: "변동", color: "#8d6e63" },
  { id: "plan", name: "계획", color: "#7b1fa2" },
  { id: "event", name: "이벤트", color: "#ff8f00" },
];

const incomeCategories = categories.filter((c) => c.type === "income");
const expenseCategories = categories.filter((c) => c.type === "expense");

const notes = ["", "", "", "정기 결제", "점심", "저녁", "교통비", "온라인 구매", "병원", "취미"];
const repeats = ["none", "none", "none", "none", "daily", "weekly", "biweekly", "monthly"];

const today = new Date();
const start = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), -730);
const entries = [];

for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
  const date = toDateInput(d);
  const dailyCount = rand(1, 4);
  for (let i = 0; i < dailyCount; i += 1) {
    const isIncome = Math.random() < 0.22;
    const category = isIncome ? choice(incomeCategories) : choice(expenseCategories);
    const amount = isIncome ? rand(30000, 600000) : rand(3000, 150000);
    const label = choice(labels);
    entries.push({
      id: uid(),
      date,
      amount,
      categoryId: category.id,
      labelId: label.id,
      note: choice(notes),
      repeat: choice(repeats),
    });
  }
  if (d.getDate() === 25) {
    entries.push({
      id: uid(),
      date,
      amount: rand(2200000, 4200000),
      categoryId: "salary",
      labelId: "fixed",
      note: "월급",
      repeat: "monthly",
    });
  }
}

const wallet = {
  id: uid(),
  name: "샘플 지갑 2Y",
  entries,
};

const output = {
  version: 2,
  exportedAt: new Date().toISOString(),
  wallet,
  categories,
  labels,
};

process.stdout.write(JSON.stringify(output, null, 2));
