/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { filterEntriesByFacets, resolveFacetFilter, sortEntriesForDisplay, summarizeEntries, CategoryStatsChart, StatsCurveChart } from './App.jsx';
import { createMockState, renderWithMantine } from './settings/testUtils.jsx';
import { ACTIVE_STORAGE_KEY } from './lib/finance.js';

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

  // The chart is drawn in a fixed 640x210 viewBox scaled to the card's width,
  // so a phone renders every number at roughly half size — the desktop axis
  // type landed around 6px on screen. Phones get larger type, and the left
  // gutter widens with it so a widened y-axis tick still clears the plot.
  function axisFontsFor(matchesMobile) {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: matchesMobile && query.includes('48em'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    });
    try {
      renderWithMantine(
        <StatsCurveChart
          page={mockPage}
          selectedKey="jan"
          onSelectBucket={vi.fn()}
          activeLegend="income"
          setActiveLegend={vi.fn()}
        />
      );
      const label = screen.getByText('1월');
      const gridLine = document.querySelector('line');
      const tick = [...document.querySelectorAll('text')].find((node) => node !== label);
      const result = {
        label: Number.parseFloat(label.style.fontSize),
        tick: Number.parseFloat(tick.style.fontSize),
        plotLeft: Number(gridLine.getAttribute('x1')),
      };
      cleanup();
      return result;
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  }

  it('enlarges the axis labels on mobile and widens the gutter to fit them', () => {
    const desktop = axisFontsFor(false);
    const mobile = axisFontsFor(true);

    expect(mobile.label).toBeGreaterThan(desktop.label);
    expect(mobile.tick).toBeGreaterThan(desktop.tick);
    // Without this the larger tick runs under the first grid line.
    expect(mobile.plotLeft).toBeGreaterThan(desktop.plotLeft);
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

describe('CategoryStatsChart', () => {
  const categories = [{ id: 'food', name: '식비', type: 'expense', color: '#F08A8A', icon: 'food' }];
  const periodStart = new Date(2026, 2, 2); // Mon 2026-03-02
  const periodEnd = new Date(2026, 2, 8);
  const items = [
    { id: 'a', categoryId: 'food', amount: 12000, occurrenceDate: '2026-03-02' },
    { id: 'b', categoryId: 'food', amount: 8000, occurrenceDate: '2026-03-02' },
    { id: 'c', categoryId: 'food', amount: 5000, occurrenceDate: '2026-03-04' },
  ];

  function renderChart() {
    return renderWithMantine(
      <CategoryStatsChart
        items={items}
        ledgerMode="week"
        periodStart={periodStart}
        periodEnd={periodEnd}
        categoryId="food"
        color="#F08A8A"
        categories={categories}
      />
    );
  }

  it('shows the selected bar amount, not only the entry count', async () => {
    const user = userEvent.setup();
    renderChart();

    // The transparent hit target per sub-bucket; index 0 is 2026-03-02.
    const hitTargets = document.querySelectorAll('rect[fill="transparent"]');
    expect(hitTargets.length).toBeGreaterThan(0);
    await user.click(hitTargets[0]);

    const tip = screen.getByText(/20,000원/);
    expect(tip).toBeInTheDocument();
    // The count stays as secondary context.
    expect(tip.textContent).toContain('2건');
  });

  // Phones hide the 건수 column of the 카테고리별 통계 table, so this tip is
  // where the count is read there. It gets its own line under the amount
  // instead of trailing it on one long line.
  it('stacks 건수 under 금액 in the bar tip on mobile', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: query.includes('48em'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    });
    try {
      const user = userEvent.setup();
      renderChart();

      const hitTargets = document.querySelectorAll('rect[fill="transparent"]');
      await user.click(hitTargets[0]);

      // Two separate <text> nodes, not one "금액 · 건수" string.
      const amount = screen.getByText('20,000원');
      const count = screen.getByText('2건');
      expect(amount).not.toBe(count);
      expect(Number(count.getAttribute('y'))).toBeGreaterThan(Number(amount.getAttribute('y')));

      // Both lines carry the larger phone face, and the tip background has to
      // have grown with them — a font bump alone would spill the text out of
      // its own rect, since every number in this chart is in viewBox units.
      const mobileFont = Number.parseFloat(amount.style.fontSize);
      expect(Number.parseFloat(count.style.fontSize)).toBe(mobileFont);
      const rect = amount.closest('g').querySelector('rect');
      const rectTop = Number(rect.getAttribute('y'));
      const rectBottom = rectTop + Number(rect.getAttribute('height'));
      expect(Number(amount.getAttribute('y'))).toBeGreaterThan(rectTop);
      expect(Number(count.getAttribute('y'))).toBeLessThan(rectBottom);

      window.matchMedia = originalMatchMedia;
      cleanup();
      renderChart();
      const desktopUser = userEvent.setup();
      await desktopUser.click(document.querySelectorAll('rect[fill="transparent"]')[0]);
      const desktopTip = screen.getByText(/20,000원/);
      expect(Number.parseFloat(desktopTip.style.fontSize)).toBeLessThan(mobileFont);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('clears the selection when the same bar is clicked again', async () => {
    const user = userEvent.setup();
    renderChart();

    const hitTargets = document.querySelectorAll('rect[fill="transparent"]');
    await user.click(hitTargets[0]);
    expect(screen.getByText(/20,000원/)).toBeInTheDocument();

    await user.click(hitTargets[0]);
    expect(screen.queryByText(/20,000원/)).not.toBeInTheDocument();
  });
});

// Mobile regression: the stats tables used to run past the viewport edge and
// cut their right-hand columns off. They must scroll inside their own box so
// the page body never scrolls horizontally.
describe('stats tables horizontal overflow', () => {
  const formatDateLocal = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  beforeEach(() => {
    localStorage.clear();
    const state = createMockState();
    state.wallets[0].entries = [
      {
        id: 'stats-1',
        date: formatDateLocal(new Date()),
        amount: 12000,
        categoryId: 'cat-expense-1',
        labelIds: ['label-1'],
        note: '',
        repeat: 'none',
        repeatEndDate: '',
      },
    ];
    localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(state));
  });

  async function openStatsTab(user) {
    renderWithMantine(<App />);
    await user.click(screen.getByRole('tab', { name: /stats/i }));
  }

  // The 카테고리별 통계 table is fitted to the viewport rather than scrolled:
  // `table-layout: fixed` (via .stats-category-table) bounds the numeric columns
  // and the category name truncates. jsdom does not lay out, so this pins the
  // structural contract — no scroll container, and the name cell carries the
  // class the truncation rule targets.
  it('fits the 카테고리별 통계 table instead of scrolling it sideways', async () => {
    const user = userEvent.setup();
    await openStatsTab(user);

    const table = screen.getByText('비중').closest('table');
    expect(table).not.toBeNull();
    expect(table.className).toContain('stats-category-table');
    // Fit is the primary mechanism; the wrapper is only a fallback for
    // viewports below the table's readable floor.
    expect(table.closest('.stats-category-scroll')).not.toBeNull();

    const name = table.querySelector('.stats-category-name');
    expect(name).not.toBeNull();
    // Full text stays reachable even when the rendered name is clipped.
    expect(name.getAttribute('title')).toBe(name.textContent);
  });

  // The 레이블 table is fitted the same way. Its old Mantine ScrollContainer
  // pinned a 340px floor — wider than the content column of any phone — so it
  // scrolled sideways on every mobile viewport even though three columns fit.
  it('fits the 레이블 stats table instead of scrolling it sideways', async () => {
    const user = userEvent.setup();
    await openStatsTab(user);

    // The label table is the one with income/expense columns.
    const table = screen.getAllByText('레이블')
      .map((node) => node.closest('table'))
      .filter(Boolean)[0];
    expect(table).not.toBeNull();
    expect(table.className).toContain('stats-label-table');
    expect(table.closest('.mantine-TableScrollContainer-scrollContainer')).toBeNull();
    // The wrapper stays as a fallback for viewports under the readable floor.
    expect(table.closest('.stats-label-scroll')).not.toBeNull();

    const name = table.querySelector('.stats-label-name');
    expect(name).not.toBeNull();
    // Full text stays reachable even when the rendered name is clipped.
    expect(name.getAttribute('title')).toBe(name.textContent);
  });
});
