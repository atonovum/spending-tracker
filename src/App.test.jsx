import { describe, expect, it } from 'vitest';
import { sortEntriesForDisplay } from './App.jsx';

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
