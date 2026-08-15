import { describe, it, expect } from "vitest";
import { serializeWalletCsv, parseWalletCsv } from "./csv.js";

describe("serializeWalletCsv", () => {
  const categories = [
    { id: "cat1", name: "Salary", type: "Income" },
    { id: "cat2", name: "Groceries", type: "Expense" },
    { id: "cat3", name: "Transport", type: "Expense" },
  ];

  const labels = [
    { id: "lbl1", name: "Variable" },
    { id: "lbl2", name: "Events" },
    { id: "lbl3", name: "Work" },
  ];

  it("should serialize empty wallet with header only", () => {
    const wallet = { id: "w1", name: "Empty", entries: [] };
    const csv = serializeWalletCsv(wallet, categories, labels);
    expect(csv).toBe("Date,Type,Category,Amount,Note,Labels,Wallet,Currency\n");
  });

  it("should serialize single entry correctly", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 50000,
          categoryId: "cat1",
          labelIds: [],
          note: "January salary",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Date,Type,Category,Amount,Note,Labels,Wallet,Currency");
    expect(lines[1]).toBe("2026-01-15,Income,Salary,50000,January salary,,Test,KRW");
  });

  it("should serialize multiple entries with labels", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 50000,
          categoryId: "cat1",
          labelIds: ["lbl3"],
          note: "Salary",
          repeat: "none",
          repeatEndDate: "",
        },
        {
          id: "e2",
          date: "2026-01-20",
          amount: 30000,
          categoryId: "cat2",
          labelIds: ["lbl1", "lbl2"],
          note: "Weekly shopping",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Date,Type,Category,Amount,Note,Labels,Wallet,Currency");
    expect(lines[1]).toBe("2026-01-20,Expense,Groceries,30000,Weekly shopping,Variable;Events,Test,KRW");
    expect(lines[2]).toBe("2026-01-15,Income,Salary,50000,Salary,Work,Test,KRW");
  });

  it("should serialize entries newest-first by date", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        { id: "old", date: "2026-01-10", amount: 1000, categoryId: "cat2", labelIds: [], note: "old", repeat: "none", repeatEndDate: "" },
        { id: "new", date: "2026-01-20", amount: 2000, categoryId: "cat2", labelIds: [], note: "new", repeat: "none", repeatEndDate: "" },
        { id: "middle", date: "2026-01-15", amount: 1500, categoryId: "cat2", labelIds: [], note: "middle", repeat: "none", repeatEndDate: "" },
      ],
    };

    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n");

    expect(lines.slice(1, 4).map((line) => line.split(",")[0])).toEqual([
      "2026-01-20",
      "2026-01-15",
      "2026-01-10",
    ]);
  });

  it("should handle empty note and no labels", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 15000,
          categoryId: "cat3",
          labelIds: [],
          note: "",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("2026-01-15,Expense,Transport,15000,,,Test,KRW");
  });

  it("should escape commas in category names (RFC 4180)", () => {
    const categoriesWithComma = [{ id: "cat1", name: "Food, Dining", type: "Expense" }];
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 10000,
          categoryId: "cat1",
          labelIds: [],
          note: "Lunch",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categoriesWithComma, labels);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('2026-01-15,Expense,"Food, Dining",10000,Lunch,,Test,KRW');
  });

  it("should escape quotes in note (RFC 4180)", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 5000,
          categoryId: "cat2",
          labelIds: [],
          note: 'Bought "milk" and bread',
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('2026-01-15,Expense,Groceries,5000,"Bought ""milk"" and bread",,Test,KRW');
  });

  it("should escape newlines in note (RFC 4180)", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 5000,
          categoryId: "cat2",
          labelIds: [],
          note: "Line 1\nLine 2",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it("should handle semicolon in label names", () => {
    const labelsWithSemicolon = [{ id: "lbl1", name: "Work;Home" }];
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 10000,
          categoryId: "cat1",
          labelIds: ["lbl1"],
          note: "Test",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labelsWithSemicolon);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('2026-01-15,Income,Salary,10000,Test,"Work;Home",Test,KRW');
  });

  it("should skip entries with unknown categoryId", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 10000,
          categoryId: "unknown",
          labelIds: [],
          note: "Test",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n").filter((line) => line.trim());
    expect(lines).toHaveLength(1); // Only header
  });

  it("should skip labels with unknown labelId", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 10000,
          categoryId: "cat1",
          labelIds: ["lbl1", "unknown", "lbl2"],
          note: "Test",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };
    const csv = serializeWalletCsv(wallet, categories, labels);
    const lines = csv.split("\n");
    expect(lines[1]).toBe("2026-01-15,Income,Salary,10000,Test,Variable;Events,Test,KRW");
  });
});

describe("parseWalletCsv", () => {
  const categories = [
    { id: "cat1", name: "Salary", type: "Income" },
    { id: "cat2", name: "Groceries", type: "Expense" },
    { id: "cat3", name: "Transport", type: "Expense" },
  ];

  const labels = [
    { id: "lbl1", name: "Variable" },
    { id: "lbl2", name: "Events" },
    { id: "lbl3", name: "Work" },
  ];

  it("should parse empty CSV (header only)", () => {
    const csv = "Date,Type,Category,Amount,Note,Labels\n";
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.unknownLabels).toEqual(new Set());
  });

  it("should parse single entry correctly", () => {
    const csv = "Date,Type,Category,Amount,Note,Labels\n2026-01-15,Income,Salary,50000,January salary,";
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      date: "2026-01-15",
      amount: 50000,
      categoryId: "cat1",
      labelIds: [],
      note: "January salary",
      repeat: "none",
      repeatEndDate: "",
    });
    expect(result.entries[0].id).toBeDefined();
    expect(result.rejected).toEqual([]);
  });

  it("should parse entries newest-first by date", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-10,Expense,Groceries,1000,old,
2026-01-20,Expense,Groceries,2000,new,
2026-01-15,Expense,Groceries,1500,middle,`;

    const result = parseWalletCsv(csv, categories, labels);

    expect(result.entries.map((entry) => entry.date)).toEqual([
      "2026-01-20",
      "2026-01-15",
      "2026-01-10",
    ]);
  });

  it("should parse multiple entries with labels", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Income,Salary,50000,Salary,Work
2026-01-20,Expense,Groceries,30000,Weekly shopping,Variable;Events`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      date: "2026-01-20",
      amount: 30000,
      categoryId: "cat2",
      labelIds: ["lbl1", "lbl2"],
      note: "Weekly shopping",
    });
    expect(result.entries[1]).toMatchObject({
      date: "2026-01-15",
      amount: 50000,
      categoryId: "cat1",
      labelIds: ["lbl3"],
      note: "Salary",
    });
  });

  it("should handle empty note and labels", () => {
    const csv = "Date,Type,Category,Amount,Note,Labels\n2026-01-15,Expense,Transport,15000,,";
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      date: "2026-01-15",
      amount: 15000,
      categoryId: "cat3",
      labelIds: [],
      note: "",
    });
  });

  it("should auto-create missing category", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Expense,Unknown,10000,Test,`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.newCategories).toHaveLength(1);
    expect(result.newCategories[0]).toMatchObject({
      name: "Unknown",
      type: "expense",
      icon: "spark",
    });
    expect(result.newCategories[0].id).toBeDefined();
    expect(result.newCategories[0].color).toBeDefined();
    expect(result.entries[0].categoryId).toBe(result.newCategories[0].id);
  });

  it("should match existing category case-insensitively on type", () => {
    const lowercaseCategories = [
      { id: "cat1", name: "Salary", type: "income" },
      { id: "cat2", name: "Groceries", type: "expense" },
    ];
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Income,Salary,50000,Test,
2026-01-16,Expense,Groceries,30000,Test,`;
    const result = parseWalletCsv(csv, lowercaseCategories, labels);
    expect(result.entries).toHaveLength(2);
    expect(result.newCategories).toHaveLength(0);
    expect(result.entries[0].categoryId).toBe("cat2");
    expect(result.entries[1].categoryId).toBe("cat1");
  });

  it("should reuse same auto-created category for multiple rows", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Expense,NewCat,10000,First,
2026-01-16,Expense,NewCat,20000,Second,`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(2);
    expect(result.newCategories).toHaveLength(1);
    expect(result.entries[0].categoryId).toBe(result.entries[1].categoryId);
  });

  it("should reject row with invalid date format", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
01/15/2026,Income,Salary,50000,Test,`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      row: 2,
      reason: "invalidDate",
    });
  });

  it("should reject row with NaN amount", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Income,Salary,abc,Test,`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({
      row: 2,
      reason: "invalidAmount",
    });
  });

  it("should convert amount to absolute value", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Expense,Groceries,-30000,Test,`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].amount).toBe(30000);
  });

  it("should auto-create unknown labels", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Income,Salary,50000,Test,Work;UnknownLabel;Events`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.newLabels).toHaveLength(1);
    expect(result.newLabels[0]).toMatchObject({ name: "UnknownLabel" });
    expect(result.newLabels[0].id).toBeDefined();
    expect(result.entries[0].labelIds).toHaveLength(3);
    expect(result.entries[0].labelIds[0]).toBe("lbl3");
    expect(result.entries[0].labelIds[1]).toBe(result.newLabels[0].id);
    expect(result.entries[0].labelIds[2]).toBe("lbl2");
    expect(result.rejected).toHaveLength(0);
  });

  it("should reuse same auto-created label for multiple rows", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Income,Salary,50000,First,NewLabel
2026-01-16,Income,Salary,30000,Second,NewLabel`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(2);
    expect(result.newLabels).toHaveLength(1);
    expect(result.entries[0].labelIds[0]).toBe(result.entries[1].labelIds[0]);
  });

  it("should parse CSV with RFC 4180 escaped commas", () => {
    const categoriesWithComma = [{ id: "cat1", name: "Food, Dining", type: "Expense" }];
    const csv = 'Date,Type,Category,Amount,Note,Labels\n2026-01-15,Expense,"Food, Dining",10000,Lunch,,Test,KRW';
    const result = parseWalletCsv(csv, categoriesWithComma, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].categoryId).toBe("cat1");
  });

  it("should parse CSV with RFC 4180 escaped quotes", () => {
    const csv =
      'Date,Type,Category,Amount,Note,Labels\n2026-01-15,Expense,Groceries,5000,"Bought ""milk"" and bread",,Test,KRW';
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].note).toBe('Bought "milk" and bread');
  });

  it("should parse CSV with newlines in quoted fields", () => {
    const csv = 'Date,Type,Category,Amount,Note,Labels\n2026-01-15,Expense,Groceries,5000,"Line 1\nLine 2",';
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].note).toBe("Line 1\nLine 2");
  });

  it("should reject CSV with missing header", () => {
    const csv = "2026-01-15,Income,Salary,50000,Test,";
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(0);
    expect(result.error).toBe("invalidHeader");
  });

  it("should reject CSV with wrong header order", () => {
    const csv = "Type,Date,Category,Amount,Note,Labels\n2026-01-15,Income,Salary,50000,Test,";
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(0);
    expect(result.error).toBe("invalidHeader");
  });

  it("should trim whitespace from labels", () => {
    const csv = `Date,Type,Category,Amount,Note,Labels
2026-01-15,Income,Salary,50000,Test,Work ; Events ; Variable`;
    const result = parseWalletCsv(csv, categories, labels);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].labelIds).toEqual(["lbl3", "lbl2", "lbl1"]);
  });

  it("should handle round-trip correctly", () => {
    const wallet = {
      id: "w1",
      name: "Test",
      entries: [
        {
          id: "e1",
          date: "2026-01-15",
          amount: 50000,
          categoryId: "cat1",
          labelIds: ["lbl3"],
          note: "Salary",
          repeat: "monthly",
          repeatEndDate: "2026-12-31",
        },
        {
          id: "e2",
          date: "2026-01-20",
          amount: 30000,
          categoryId: "cat2",
          labelIds: ["lbl1", "lbl2"],
          note: "Shopping",
          repeat: "none",
          repeatEndDate: "",
        },
      ],
    };

    const csv = serializeWalletCsv(wallet, categories, labels);
    const result = parseWalletCsv(csv, categories, labels);

    expect(result.entries).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.unknownLabels.size).toBe(0);

    // Compare excluding IDs (which are regenerated)
    expect(result.entries[0]).toMatchObject({
      date: wallet.entries[1].date,
      amount: wallet.entries[1].amount,
      categoryId: wallet.entries[1].categoryId,
      labelIds: wallet.entries[1].labelIds,
      note: wallet.entries[1].note,
      repeat: "none", // CSV doesn't preserve repeat
      repeatEndDate: "",
    });

    expect(result.entries[1]).toMatchObject({
      date: wallet.entries[0].date,
      amount: wallet.entries[0].amount,
      categoryId: wallet.entries[0].categoryId,
      labelIds: wallet.entries[0].labelIds,
      note: wallet.entries[0].note,
      repeat: "none",
      repeatEndDate: "",
    });
  });
});

describe("wallet columns (v5)", () => {
  const categories = [{ id: "cat1", name: "Salary", type: "income", color: "#111" }];
  const labels = [];

  it("carries the wallet name and currency on every row", () => {
    const wallet = {
      id: "w1",
      name: "여행 지갑",
      currency: "USD",
      entries: [{ id: "e1", date: "2026-01-15", amount: 100, categoryId: "cat1", labelIds: [], note: "" }],
    };

    const lines = serializeWalletCsv(wallet, categories, labels).split("\n");

    expect(lines[0]).toBe("Date,Type,Category,Amount,Note,Labels,Wallet,Currency");
    expect(lines[1].endsWith(",여행 지갑,USD")).toBe(true);
  });

  it("round-trips the wallet name and currency through a parse", () => {
    const wallet = {
      id: "w1",
      name: "여행 지갑",
      currency: "USD",
      entries: [{ id: "e1", date: "2026-01-15", amount: 100, categoryId: "cat1", labelIds: [], note: "" }],
    };

    const result = parseWalletCsv(serializeWalletCsv(wallet, categories, labels), categories, labels);

    expect(result.error).toBeNull();
    expect(result.walletName).toBe("여행 지갑");
    expect(result.walletCurrency).toBe("USD");
    expect(result.entries).toHaveLength(1);
  });

  it("still imports a pre-v5 file that has no wallet columns", () => {
    const csv = "Date,Type,Category,Amount,Note,Labels\n2026-01-15,Income,Salary,50000,,";

    const result = parseWalletCsv(csv, categories, labels);

    expect(result.error).toBeNull();
    expect(result.entries).toHaveLength(1);
    // Nothing to read: the caller falls back to the file name and the default.
    expect(result.walletName).toBe("");
    expect(result.walletCurrency).toBeNull();
  });

  it("rejects a header whose trailing columns are not the wallet ones", () => {
    const csv = "Date,Type,Category,Amount,Note,Labels,Nonsense\n2026-01-15,Income,Salary,50000,,,x";

    expect(parseWalletCsv(csv, categories, labels).error).toBe("invalidHeader");
  });
});
