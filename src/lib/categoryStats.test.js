import { describe, it, expect } from "vitest";
import { aggregateCategoryByBucket, aggregateCategoryByLabel } from "./categoryStats.js";

function makeItem(overrides) {
  return {
    id: "i",
    date: "2026-01-01",
    amount: 100,
    categoryId: "cat-1",
    labelIds: [],
    note: "",
    repeat: "none",
    repeatEndDate: "",
    category: { type: "expense" },
    ...overrides,
  };
}

describe("aggregateCategoryByBucket", () => {
  it("returns empty array for non-array input", () => {
    expect(aggregateCategoryByBucket(null, "cat-1")).toEqual([]);
    expect(aggregateCategoryByBucket(undefined, "cat-1")).toEqual([]);
  });

  it("returns zero totals for buckets with no matching items", () => {
    const buckets = [
      { key: "2026-01", label: "Jan", items: [makeItem({ categoryId: "cat-2" })] },
      { key: "2026-02", label: "Feb", items: [] },
    ];
    expect(aggregateCategoryByBucket(buckets, "cat-1")).toEqual([
      { key: "2026-01", label: "Jan", total: 0 },
      { key: "2026-02", label: "Feb", total: 0 },
    ]);
  });

  it("sums absolute amounts of matching category items per bucket", () => {
    const buckets = [
      {
        key: "2026-01",
        label: "Jan",
        items: [
          makeItem({ amount: 100 }),
          makeItem({ amount: 50, categoryId: "cat-2" }),
          makeItem({ amount: 200 }),
        ],
      },
      {
        key: "2026-02",
        label: "Feb",
        items: [makeItem({ amount: 75 })],
      },
    ];
    expect(aggregateCategoryByBucket(buckets, "cat-1")).toEqual([
      { key: "2026-01", label: "Jan", total: 300 },
      { key: "2026-02", label: "Feb", total: 75 },
    ]);
  });

  it("treats income amounts as positive in the total magnitude", () => {
    const buckets = [
      {
        key: "2026-01",
        label: "Jan",
        items: [
          makeItem({ amount: 500, categoryId: "cat-inc", category: { type: "income" } }),
        ],
      },
    ];
    expect(aggregateCategoryByBucket(buckets, "cat-inc")).toEqual([
      { key: "2026-01", label: "Jan", total: 500 },
    ]);
  });

  it("handles buckets without items field defensively", () => {
    const buckets = [{ key: "k", label: "L" }];
    expect(aggregateCategoryByBucket(buckets, "cat-1")).toEqual([
      { key: "k", label: "L", total: 0 },
    ]);
  });
});

describe("aggregateCategoryByLabel", () => {
  it("returns empty array when no buckets", () => {
    expect(aggregateCategoryByLabel([], "cat-1")).toEqual([]);
    expect(aggregateCategoryByLabel(null, "cat-1")).toEqual([]);
  });

  it("aggregates items by labelId for the target category", () => {
    const buckets = [
      {
        items: [
          makeItem({ amount: 100, labelIds: ["L1"] }),
          makeItem({ amount: 50, labelIds: ["L1"] }),
          makeItem({ amount: 200, labelIds: ["L2"] }),
        ],
      },
    ];
    const result = aggregateCategoryByLabel(buckets, "cat-1");
    expect(result).toEqual([
      { labelId: "L2", count: 1, amount: 200 },
      { labelId: "L1", count: 2, amount: 150 },
    ]);
  });

  it("counts items with multiple labels under each label", () => {
    const buckets = [
      {
        items: [
          makeItem({ amount: 100, labelIds: ["L1", "L2"] }),
        ],
      },
    ];
    const result = aggregateCategoryByLabel(buckets, "cat-1");
    expect(result).toContainEqual({ labelId: "L1", count: 1, amount: 100 });
    expect(result).toContainEqual({ labelId: "L2", count: 1, amount: 100 });
  });

  it("groups items without labels under labelId=null", () => {
    const buckets = [
      {
        items: [
          makeItem({ amount: 100, labelIds: [] }),
          makeItem({ amount: 30, labelIds: [] }),
          makeItem({ amount: 70, labelIds: ["L1"] }),
        ],
      },
    ];
    const result = aggregateCategoryByLabel(buckets, "cat-1");
    expect(result).toContainEqual({ labelId: null, count: 2, amount: 130 });
    expect(result).toContainEqual({ labelId: "L1", count: 1, amount: 70 });
  });

  it("ignores items from other categories", () => {
    const buckets = [
      {
        items: [
          makeItem({ amount: 100, labelIds: ["L1"] }),
          makeItem({ amount: 999, labelIds: ["L1"], categoryId: "cat-other" }),
        ],
      },
    ];
    const result = aggregateCategoryByLabel(buckets, "cat-1");
    expect(result).toEqual([{ labelId: "L1", count: 1, amount: 100 }]);
  });

  it("sorts result by amount descending", () => {
    const buckets = [
      {
        items: [
          makeItem({ amount: 10, labelIds: ["A"] }),
          makeItem({ amount: 1000, labelIds: ["C"] }),
          makeItem({ amount: 100, labelIds: ["B"] }),
        ],
      },
    ];
    const result = aggregateCategoryByLabel(buckets, "cat-1");
    expect(result.map((r) => r.labelId)).toEqual(["C", "B", "A"]);
  });
});
