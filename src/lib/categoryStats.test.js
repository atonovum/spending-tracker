import { describe, it, expect } from "vitest";
import {
  buildSubBucketFrames,
  aggregateCategoryBySubBucket,
  aggregateCategoryByLabel,
} from "./categoryStats.js";

function makeItem(overrides) {
  return {
    id: "i",
    occurrenceDate: "2026-04-10",
    amount: 100,
    categoryId: "cat-1",
    labelIds: [],
    note: "",
    category: { type: "expense" },
    ...overrides,
  };
}

describe("buildSubBucketFrames", () => {
  it("returns 7 daily frames for week mode", () => {
    const start = new Date(2026, 3, 6);
    const end = new Date(2026, 3, 12);
    const frames = buildSubBucketFrames("week", start, end);
    expect(frames).toHaveLength(7);
    expect(frames[0].label).toBe("6");
    expect(frames[6].label).toBe("12");
    expect(frames[0].key).toBe("2026-04-06");
  });

  it("returns 10 three-day frames for April (30 days)", () => {
    const start = new Date(2026, 3, 1);
    const end = new Date(2026, 3, 30);
    const frames = buildSubBucketFrames("month", start, end);
    expect(frames).toHaveLength(10);
    expect(frames[0].label).toBe("1~3");
    expect(frames[9].label).toBe("28~30");
  });

  it("returns 11 frames for a 31-day month with last bucket being one day", () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31);
    const frames = buildSubBucketFrames("month", start, end);
    expect(frames).toHaveLength(11);
    expect(frames[10].label).toBe("31");
  });

  it("returns 12 monthly frames for year mode", () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    const frames = buildSubBucketFrames("year", start, end);
    expect(frames).toHaveLength(12);
    expect(frames[0].label).toBe("1월");
    expect(frames[11].label).toBe("12월");
    expect(frames[3].key).toBe("2026-04");
  });

  it("returns [] for invalid input", () => {
    expect(buildSubBucketFrames("month", null, new Date())).toEqual([]);
    expect(buildSubBucketFrames("month", new Date(2026, 5, 1), new Date(2026, 4, 1))).toEqual([]);
  });
});

describe("aggregateCategoryBySubBucket", () => {
  const periodStart = new Date(2026, 3, 1);
  const periodEnd = new Date(2026, 3, 30);

  it("returns [] for non-array input", () => {
    expect(aggregateCategoryBySubBucket(null, "month", periodStart, periodEnd, "cat-1")).toEqual([]);
  });

  it("buckets a month's items into 3-day intervals (April 2026)", () => {
    const items = [
      makeItem({ occurrenceDate: "2026-04-01", amount: 50 }),
      makeItem({ occurrenceDate: "2026-04-03", amount: 70 }),
      makeItem({ occurrenceDate: "2026-04-04", amount: 200 }),
      makeItem({ occurrenceDate: "2026-04-28", amount: 30 }),
    ];
    const series = aggregateCategoryBySubBucket(items, "month", periodStart, periodEnd, "cat-1");
    expect(series).toHaveLength(10);
    expect(series[0]).toEqual({ key: "2026-04-01_2026-04-03", label: "1~3", total: 120, count: 2 });
    expect(series[1]).toEqual({ key: "2026-04-04_2026-04-06", label: "4~6", total: 200, count: 1 });
    expect(series[9]).toEqual({ key: "2026-04-28_2026-04-30", label: "28~30", total: 30, count: 1 });
  });

  it("returns count alongside total per sub-bucket", () => {
    const items = [
      makeItem({ occurrenceDate: "2026-04-04", amount: 100 }),
      makeItem({ occurrenceDate: "2026-04-05", amount: 100 }),
      makeItem({ occurrenceDate: "2026-04-06", amount: 100 }),
      makeItem({ occurrenceDate: "2026-04-15", amount: 50 }),
    ];
    const series = aggregateCategoryBySubBucket(items, "month", periodStart, periodEnd, "cat-1");
    expect(series[0].count).toBe(0);
    expect(series[1].count).toBe(3);
    expect(series[1].total).toBe(300);
    expect(series[4].count).toBe(1);
    expect(series[4].total).toBe(50);
  });

  it("buckets a year's items into 12 monthly bars (year mode)", () => {
    const yearStart = new Date(2026, 0, 1);
    const yearEnd = new Date(2026, 11, 31);
    const items = [
      makeItem({ occurrenceDate: "2026-01-15", amount: 100 }),
      makeItem({ occurrenceDate: "2026-04-10", amount: 200 }),
      makeItem({ occurrenceDate: "2026-04-25", amount: 50 }),
      makeItem({ occurrenceDate: "2026-12-31", amount: 999 }),
    ];
    const series = aggregateCategoryBySubBucket(items, "year", yearStart, yearEnd, "cat-1");
    expect(series).toHaveLength(12);
    expect(series[0].total).toBe(100);
    expect(series[3].total).toBe(250);
    expect(series[11].total).toBe(999);
    expect(series[5].total).toBe(0);
  });

  it("buckets a week's items into 7 daily bars (week mode)", () => {
    const wkStart = new Date(2026, 3, 6);
    const wkEnd = new Date(2026, 3, 12);
    const items = [
      makeItem({ occurrenceDate: "2026-04-06", amount: 10 }),
      makeItem({ occurrenceDate: "2026-04-08", amount: 30 }),
      makeItem({ occurrenceDate: "2026-04-08", amount: 5 }),
      makeItem({ occurrenceDate: "2026-04-12", amount: 100 }),
    ];
    const series = aggregateCategoryBySubBucket(items, "week", wkStart, wkEnd, "cat-1");
    expect(series).toHaveLength(7);
    expect(series[0].total).toBe(10);
    expect(series[2].total).toBe(35);
    expect(series[6].total).toBe(100);
  });

  it("ignores items outside the period", () => {
    const items = [
      makeItem({ occurrenceDate: "2026-03-31", amount: 999 }),
      makeItem({ occurrenceDate: "2026-05-01", amount: 999 }),
      makeItem({ occurrenceDate: "2026-04-15", amount: 42 }),
    ];
    const series = aggregateCategoryBySubBucket(items, "month", periodStart, periodEnd, "cat-1");
    const grand = series.reduce((sum, s) => sum + s.total, 0);
    expect(grand).toBe(42);
  });

  it("ignores items of other categories", () => {
    const items = [
      makeItem({ occurrenceDate: "2026-04-02", amount: 100, categoryId: "cat-1" }),
      makeItem({ occurrenceDate: "2026-04-02", amount: 999, categoryId: "cat-other" }),
    ];
    const series = aggregateCategoryBySubBucket(items, "month", periodStart, periodEnd, "cat-1");
    expect(series[0].total).toBe(100);
  });

  it("treats income amounts as positive magnitude", () => {
    const items = [
      makeItem({
        occurrenceDate: "2026-04-02",
        amount: 500,
        categoryId: "cat-inc",
        category: { type: "income" },
      }),
    ];
    const series = aggregateCategoryBySubBucket(items, "month", periodStart, periodEnd, "cat-inc");
    expect(series[0].total).toBe(500);
  });
});

describe("aggregateCategoryByLabel", () => {
  it("returns [] for non-array input", () => {
    expect(aggregateCategoryByLabel(null, "cat-1")).toEqual([]);
    expect(aggregateCategoryByLabel(undefined, "cat-1")).toEqual([]);
  });

  it("aggregates items by labelId for the target category", () => {
    const items = [
      makeItem({ amount: 100, labelIds: ["L1"] }),
      makeItem({ amount: 50, labelIds: ["L1"] }),
      makeItem({ amount: 200, labelIds: ["L2"] }),
    ];
    expect(aggregateCategoryByLabel(items, "cat-1")).toEqual([
      { labelId: "L2", count: 1, amount: 200 },
      { labelId: "L1", count: 2, amount: 150 },
    ]);
  });

  it("counts items with multiple labels under each label", () => {
    const items = [makeItem({ amount: 100, labelIds: ["L1", "L2"] })];
    const result = aggregateCategoryByLabel(items, "cat-1");
    expect(result).toContainEqual({ labelId: "L1", count: 1, amount: 100 });
    expect(result).toContainEqual({ labelId: "L2", count: 1, amount: 100 });
  });

  it("groups items without labels under labelId=null", () => {
    const items = [
      makeItem({ amount: 100, labelIds: [] }),
      makeItem({ amount: 30, labelIds: [] }),
      makeItem({ amount: 70, labelIds: ["L1"] }),
    ];
    const result = aggregateCategoryByLabel(items, "cat-1");
    expect(result).toContainEqual({ labelId: null, count: 2, amount: 130 });
    expect(result).toContainEqual({ labelId: "L1", count: 1, amount: 70 });
  });

  it("ignores items from other categories", () => {
    const items = [
      makeItem({ amount: 100, labelIds: ["L1"] }),
      makeItem({ amount: 999, labelIds: ["L1"], categoryId: "cat-other" }),
    ];
    expect(aggregateCategoryByLabel(items, "cat-1")).toEqual([{ labelId: "L1", count: 1, amount: 100 }]);
  });

  it("sorts result by amount descending", () => {
    const items = [
      makeItem({ amount: 10, labelIds: ["A"] }),
      makeItem({ amount: 1000, labelIds: ["C"] }),
      makeItem({ amount: 100, labelIds: ["B"] }),
    ];
    expect(aggregateCategoryByLabel(items, "cat-1").map((r) => r.labelId)).toEqual(["C", "B", "A"]);
  });
});
