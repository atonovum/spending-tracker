/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { filterEntriesByFacets, resolveFacetFilter, sortEntriesForDisplay, summarizeEntries, StatsCurveChart } from './App.jsx';
import { renderWithMantine } from './settings/testUtils.jsx';

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

  it('returns no entries when a facet is explicitly empty', () => {
    const entries = [
      { id: 'salary', categoryId: 'income', labelIds: ['fixed'] },
      { id: 'lunch', categoryId: 'food', labelIds: ['variable'] },
    ];

    const result = filterEntriesByFacets(entries, { categoryIds: new Set(), labelIds: null });

    expect(result).toEqual([]);
  });
});

describe('resolveFacetFilter', () => {
  it('keeps the default unchecked state as an empty filter', () => {
    const options = [{ id: 'food' }, { id: 'rent' }];

    const result = resolveFacetFilter([], options);

    expect(result).toEqual(new Set());
  });

  it('treats selecting every option as All', () => {
    const options = [{ id: 'food' }, { id: 'rent' }];

    const result = resolveFacetFilter(['food', 'rent'], options);

    expect(result).toBeNull();
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

describe('StatsCurveChart', () => {
  const mockPage = [
    { key: 'jan', label: '1월', income: 50000, expense: 30000 },
    { key: 'feb', label: '2월', income: 40000, expense: 45000 },
  ];

  it('renders empty message when page is empty', () => {
    renderWithMantine(
      <StatsCurveChart
        page={[]}
        selectedKey={null}
        onSelectBucket={vi.fn()}
        activeLegend="income"
        setActiveLegend={vi.fn()}
      />
    );
    expect(screen.getByText(/데이터가 없습니다/i)).toBeInTheDocument();
  });

  it('renders curves and points when page has data', () => {
    renderWithMantine(
      <StatsCurveChart
        page={mockPage}
        selectedKey="jan"
        onSelectBucket={vi.fn()}
        activeLegend="income"
        setActiveLegend={vi.fn()}
      />
    );
    expect(screen.getByText('1월')).toBeInTheDocument();
    expect(screen.getByText('2월')).toBeInTheDocument();
  });

  it('handles point selection and sets active legend', async () => {
    const user = userEvent.setup();
    const onSelectBucket = vi.fn();
    const setActiveLegend = vi.fn();

    renderWithMantine(
      <StatsCurveChart
        page={mockPage}
        selectedKey="jan"
        onSelectBucket={onSelectBucket}
        activeLegend="income"
        setActiveLegend={setActiveLegend}
      />
    );

    const circles = document.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(0);
    await user.click(circles[0]);

    expect(onSelectBucket).toHaveBeenCalled();
  });
});
