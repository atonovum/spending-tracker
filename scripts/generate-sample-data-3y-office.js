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

// deterministic RNG
let seed = 20260505;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function choice(list) {
  return list[randInt(0, list.length - 1)];
}

const categories = [
  { id: "salary", name: "급여", type: "income", color: "#1565c0" },
  { id: "side_income", name: "부수입", type: "income", color: "#1e88e5" },
  { id: "gift_income", name: "선물/환급", type: "income", color: "#42a5f5" },
  { id: "food", name: "식비", type: "expense", color: "#e53935" },
  { id: "transport", name: "교통", type: "expense", color: "#ef5350" },
  { id: "rent", name: "월세", type: "expense", color: "#d81b60" },
  { id: "utilities", name: "공과금", type: "expense", color: "#6d4c41" },
  { id: "shopping", name: "쇼핑", type: "expense", color: "#8e24aa" },
  { id: "hospital", name: "병원", type: "expense", color: "#5d4037" },
  { id: "travel", name: "여행", type: "expense", color: "#546e7a" },
  { id: "insurance", name: "보험", type: "expense", color: "#455a64" },
  { id: "communication", name: "통신", type: "expense", color: "#78909c" },
  { id: "education", name: "자기계발", type: "expense", color: "#7e57c2" },
  { id: "saving", name: "저축", type: "expense", color: "#2e7d32" },
  { id: "etc", name: "기타", type: "expense", color: "#90a4ae" },
];

const labels = [
  { id: "fixed", name: "고정", color: "#455a64" },
  { id: "variable", name: "변동", color: "#8d6e63" },
  { id: "event", name: "이벤트", color: "#ff8f00" },
  { id: "plan", name: "계획", color: "#7b1fa2" },
];

const entries = [];

function addEntry(year, monthIndex, day, amount, categoryId, labelId, note) {
  const date = makeDate(year, monthIndex, day);
  const today = new Date();
  if (date > today) return;
  entries.push({
    id: uid(),
    date: toDateInput(date),
    amount: Math.abs(amount),
    categoryId,
    labelId,
    note,
    repeat: "none",
  });
}

const today = new Date();
const firstMonth = new Date(today.getFullYear(), today.getMonth() - 35, 1); // recent 3 years

for (let m = 0; m < 36; m += 1) {
  const cur = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + m, 1);
  const year = cur.getFullYear();
  const monthIndex = cur.getMonth();
  const month = monthIndex + 1;

  // income
  addEntry(year, monthIndex, 25, 5500000, "salary", "fixed", "월급");
  if (rand() < 0.45) addEntry(year, monthIndex, randInt(3, 27), randInt(80000, 450000), "side_income", "variable", "부수입");
  if (rand() < 0.2) addEntry(year, monthIndex, randInt(5, 26), randInt(20000, 180000), "gift_income", "event", "선물/환급");

  // fixed expenses
  addEntry(year, monthIndex, 1, randInt(1050000, 1300000), "rent", "fixed", "월세");
  addEntry(year, monthIndex, 10, randInt(170000, 290000), "utilities", "fixed", "전기/가스/수도");
  addEntry(year, monthIndex, 12, randInt(65000, 95000), "communication", "fixed", "통신비");
  addEntry(year, monthIndex, 18, randInt(140000, 240000), "insurance", "fixed", "보험료");
  addEntry(year, monthIndex, randInt(8, 22), randInt(50000, 180000), "education", "plan", "자기계발");

  // food and transportation
  const foodCount = randInt(18, 30);
  for (let i = 0; i < foodCount; i += 1) {
    addEntry(year, monthIndex, randInt(1, daysInMonth(year, monthIndex)), randInt(7000, 26000), "food", "variable", choice(["아침", "점심", "저녁", "커피"]));
  }
  const transportCount = randInt(10, 18);
  for (let i = 0; i < transportCount; i += 1) {
    addEntry(year, monthIndex, randInt(1, daysInMonth(year, monthIndex)), randInt(1400, 19000), "transport", "variable", choice(["지하철", "버스", "택시"]));
  }

  // variable life expenses
  const shoppingCount = randInt(2, 7);
  for (let i = 0; i < shoppingCount; i += 1) {
    addEntry(year, monthIndex, randInt(1, daysInMonth(year, monthIndex)), randInt(25000, 320000), "shopping", "variable", "생활용품/쇼핑");
  }
  const hospitalCount = randInt(0, 3);
  for (let i = 0; i < hospitalCount; i += 1) {
    addEntry(year, monthIndex, randInt(1, daysInMonth(year, monthIndex)), randInt(30000, 190000), "hospital", "event", "병원/약국");
  }
  const etcCount = randInt(1, 4);
  for (let i = 0; i < etcCount; i += 1) {
    addEntry(year, monthIndex, randInt(1, daysInMonth(year, monthIndex)), randInt(15000, 140000), "etc", "variable", "기타 지출");
  }

  // summer vacation months: expenses > income
  const isSummer = month === 6 || month === 7 || month === 8;
  if (isSummer) {
    addEntry(year, monthIndex, randInt(3, 10), randInt(900000, 1800000), "travel", "event", "항공권");
    addEntry(year, monthIndex, randInt(10, 20), randInt(1200000, 2800000), "travel", "event", "호텔/숙박");
    addEntry(year, monthIndex, randInt(15, 27), randInt(500000, 1300000), "travel", "event", "현지 교통/관광");
    if (rand() < 0.4) addEntry(year, monthIndex, randInt(12, 24), randInt(300000, 700000), "shopping", "event", "휴가 쇼핑");
  } else {
    // monthly saving 1M ~ 2M
    addEntry(year, monthIndex, 27, randInt(1000000, 2000000), "saving", "plan", "월 저축");
  }
}

const wallet = {
  id: uid(),
  name: "직장인 샘플 지갑 3Y",
  entries: entries.sort((a, b) => (a.date > b.date ? 1 : -1)),
};

const output = {
  version: 2,
  exportedAt: new Date().toISOString(),
  wallet,
  categories,
  labels,
};

process.stdout.write(JSON.stringify(output, null, 2));
