import { normalizeLabelIds, signedAmount } from "./finance.js";

/**
 * Compute the unsigned amount per bucket for a single category.
 *
 * @param {Array<{ key: string, label: string, items: Array }>} buckets
 * @param {string} categoryId
 * @returns {Array<{ key: string, label: string, total: number }>}
 *   total is the sum of absolute signed amounts of items matching categoryId.
 */
export function aggregateCategoryByBucket(buckets, categoryId) {
  if (!Array.isArray(buckets)) return [];
  return buckets.map((bucket) => {
    let total = 0;
    if (Array.isArray(bucket?.items)) {
      for (const item of bucket.items) {
        if (item.categoryId !== categoryId) continue;
        total += Math.abs(signedAmount(item));
      }
    }
    return { key: bucket?.key ?? "", label: bucket?.label ?? "", total };
  });
}

/**
 * Aggregate by label across all buckets for a single category.
 * Items with multiple labels contribute to each of those labels.
 * Items with no labels are bucketed under `labelId: null`.
 *
 * @param {Array<{ items: Array }>} buckets
 * @param {string} categoryId
 * @returns {Array<{ labelId: string | null, count: number, amount: number }>}
 *   sorted by amount descending.
 */
export function aggregateCategoryByLabel(buckets, categoryId) {
  const map = new Map();
  if (!Array.isArray(buckets)) return [];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket?.items)) continue;
    for (const item of bucket.items) {
      if (item.categoryId !== categoryId) continue;
      const ids = normalizeLabelIds(item);
      const amount = Math.abs(signedAmount(item));
      if (!ids.length) {
        const cur = map.get(null) || { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += amount;
        map.set(null, cur);
      } else {
        for (const id of ids) {
          const cur = map.get(id) || { count: 0, amount: 0 };
          cur.count += 1;
          cur.amount += amount;
          map.set(id, cur);
        }
      }
    }
  }
  return [...map.entries()]
    .map(([labelId, agg]) => ({ labelId, count: agg.count, amount: agg.amount }))
    .sort((a, b) => b.amount - a.amount);
}
