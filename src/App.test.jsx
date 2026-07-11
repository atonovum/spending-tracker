import { describe, expect, it } from 'vitest';
import { filterEntriesByFacets, sortEntriesForDisplay, summarizeEntries } from './App.jsx';

describe('sortEntriesForDisplay', () => {
  it('orders imported ascending entries newest-first before pagination', () => {
    const entries = [
      { id: 'mar-01-a', occurrenceDate: '2026-03-01' },
      { id: 'mar-01-b', occurrenceDate: '2026-03-01' },
      { id: 'mar-02-a', occurrenceDate: '2026-03-02' },
      { id: 'mar-03-a', occurrenceDate: '2026-03-03' },
      { id: 'mar-04-a', occurrenceDate: '2026-03-04' },
      { id: 'mar-31-a', occurrenceDate: '2026-03-31' },
      { id: 'mar-31-b', occurrenceDate: '2026-03-31' },
    ];

    const firstPage = sortEntriesForDisplay(entries).slice(0, 3);

    expect(firstPage.map((entry) => entry.occurrenceDate)).toEqual([
      '2026-03-31',
      '2026-03-31',
      '2026-03-04',
    ]);
  });

  it('keeps input order for entries on the same date', () => {
    const entries = [
      { id: 'first', occurrenceDate: '2026-03-31' },
      { id: 'second', occurrenceDate: '2026-03-31' },
      { id: 'third', occurrenceDate: '2026-03-31' },
    ];

    const sorted = sortEntriesForDisplay(entries);

    expect(sorted.map((entry) => entry.id)).toEqual(['first', 'second', 'third']);
  });
});

describe('filterEntriesByFacets', () => {
  it('keeps entries matching selected categories and labels', () => {
    const entries = [
      { id: 'salary', categoryId: 'income', labelIds: ['fixed'] },
      { id: 'lunch', categoryId: 'food', labelIds: ['variable'] },
      { id: 'rent', categoryId: 'rent', labelIds: ['fixed'] },
      { id: 'unlabeled', categoryId: 'food', labelIds: [] },
    ];

    const result = filterEntriesByFacets(entries, {
      categoryIds: new Set(['food', 'rent']),
      labelIds: new Set(['variable']),
    });

    expect(result.map((entry) => entry.id)).toEqual(['lunch']);
  });

  it('treats null facets as all selected', () => {
    const entries = [
      { id: 'salary', categoryId: 'income', labelIds: ['fixed'] },
      { id: 'lunch', categoryId: 'food', labelIds: ['variable'] },
    ];

    const result = filterEntriesByFacets(entries, { categoryIds: null, labelIds: null });

    expect(result).toEqual(entries);
  });
});

describe('summarizeEntries', () => {
  it('returns income and expense totals for the supplied entries only', () => {
    const categories = [
      { id: 'income', type: 'income' },
      { id: 'food', type: 'expense' },
      { id: 'rent', type: 'expense' },
    ];
    const entries = [
      { categoryId: 'income', amount: 1000 },
      { categoryId: 'food', amount: 150 },
      { categoryId: 'rent', amount: 500 },
    ];

    expect(summarizeEntries(entries, categories)).toEqual({ income: 1000, expense: 650 });
  });
});
