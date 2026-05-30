import { describe, it, expect } from 'vitest';
import { format, makeT, formatMoney, DEFAULT_LANGUAGE } from './i18n.jsx';

describe('format', () => {
  it('returns template as-is when vars is not provided', () => {
    expect(format('Hello world')).toBe('Hello world');
    expect(format('No placeholders here')).toBe('No placeholders here');
  });

  it('returns template as-is when vars is null', () => {
    expect(format('Hello world', null)).toBe('Hello world');
  });

  it('returns template as-is when vars is undefined', () => {
    expect(format('Hello world', undefined)).toBe('Hello world');
  });

  it('replaces single placeholder', () => {
    expect(format('Hello {name}', { name: 'Alice' })).toBe('Hello Alice');
    expect(format('Count: {count}', { count: 5 })).toBe('Count: 5');
  });

  it('replaces multiple placeholders', () => {
    expect(format('{greeting} {name}, you have {count} messages', {
      greeting: 'Hello',
      name: 'Bob',
      count: 3,
    })).toBe('Hello Bob, you have 3 messages');
  });

  it('preserves placeholder when key is missing from vars', () => {
    expect(format('Hello {name}', {})).toBe('Hello {name}');
    expect(format('Hello {name}', { other: 'value' })).toBe('Hello {name}');
  });

  it('replaces some placeholders and preserves missing ones', () => {
    expect(format('{a} {b} {c}', { a: '1', c: '3' })).toBe('1 {b} 3');
  });

  it('auto-stringifies number vars', () => {
    expect(format('Count: {count}', { count: 42 })).toBe('Count: 42');
    expect(format('Value: {value}', { value: 0 })).toBe('Value: 0');
    expect(format('Price: {price}', { price: 12.99 })).toBe('Price: 12.99');
  });

  it('auto-stringifies boolean vars', () => {
    expect(format('Active: {active}', { active: true })).toBe('Active: true');
    expect(format('Valid: {valid}', { valid: false })).toBe('Valid: false');
  });

  it('coerces non-string template to string', () => {
    expect(format(123, {})).toBe('123');
    expect(format(null, {})).toBe('null');
    expect(format(undefined, {})).toBe('undefined');
  });

  it('handles empty template', () => {
    expect(format('', { name: 'Alice' })).toBe('');
  });

  it('handles placeholder at start', () => {
    expect(format('{name} says hello', { name: 'Alice' })).toBe('Alice says hello');
  });

  it('handles placeholder at end', () => {
    expect(format('Hello {name}', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('handles repeated placeholder', () => {
    expect(format('{name} and {name}', { name: 'Alice' })).toBe('Alice and Alice');
  });

  it('handles consecutive placeholders', () => {
    expect(format('{a}{b}{c}', { a: '1', b: '2', c: '3' })).toBe('123');
  });
});

describe('makeT', () => {
  it('returns translation function for Korean', () => {
    const t = makeT('ko');
    expect(typeof t).toBe('function');
    expect(t('tab.ledger')).toBe('Ledger');
    expect(t('tab.stats')).toBe('Stats');
  });

  it('returns translation function for English', () => {
    const t = makeT('en');
    expect(typeof t).toBe('function');
    expect(t('tab.ledger')).toBe('Ledger');
    expect(t('tab.stats')).toBe('Stats');
  });

  it('returns key itself when key is missing from dictionary', () => {
    const t = makeT('ko');
    expect(t('non.existent.key')).toBe('non.existent.key');
  });

  it('falls back to ko when requested language is missing', () => {
    const t = makeT('fr');
    expect(t('tab.ledger')).toBe('Ledger');
    expect(t('chart.income')).toBe('수입');
  });

  it('falls back to ko when language is null', () => {
    const t = makeT(null);
    expect(t('tab.ledger')).toBe('Ledger');
  });

  it('falls back to ko when language is undefined', () => {
    const t = makeT(undefined);
    expect(t('tab.ledger')).toBe('Ledger');
  });

  it('interpolates vars via format', () => {
    const t = makeT('ko');
    expect(t('stats.selectedRange', { label: '2026-01' })).toBe('선택 구간: 2026-01');
    expect(t('stats.summary.count', { count: 5 })).toBe('총 5건');
  });

  it('interpolates vars in English', () => {
    const t = makeT('en');
    expect(t('stats.selectedRange', { label: '2026-01' })).toBe('Range: 2026-01');
    expect(t('stats.summary.count', { count: 5 })).toBe('5 total');
  });

  it('preserves placeholders when vars are missing', () => {
    const t = makeT('ko');
    expect(t('stats.selectedRange', {})).toBe('선택 구간: {label}');
  });

  it('returns key when key is missing even with vars', () => {
    const t = makeT('ko');
    expect(t('non.existent.key', { foo: 'bar' })).toBe('non.existent.key');
  });

  it('works with numeric vars', () => {
    const t = makeT('ko');
    expect(t('stats.summary.count', { count: 0 })).toBe('총 0건');
    expect(t('stats.summary.count', { count: 100 })).toBe('총 100건');
  });
});

describe('formatMoney', () => {
  describe('Korean locale', () => {
    it('formats positive values', () => {
      expect(formatMoney(1234, 'ko')).toBe('1,234원');
      expect(formatMoney(100, 'ko')).toBe('100원');
      expect(formatMoney(1, 'ko')).toBe('1원');
    });

    it('formats negative values', () => {
      expect(formatMoney(-1234, 'ko')).toBe('-1,234원');
      expect(formatMoney(-100, 'ko')).toBe('-100원');
      expect(formatMoney(-1, 'ko')).toBe('-1원');
    });

    it('formats zero', () => {
      expect(formatMoney(0, 'ko')).toBe('0원');
    });

    it('rounds to integer', () => {
      expect(formatMoney(1234.567, 'ko')).toBe('1,235원');
      expect(formatMoney(1234.4, 'ko')).toBe('1,234원');
      expect(formatMoney(1234.5, 'ko')).toBe('1,235원');
    });

    it('formats large numbers with thousand separators', () => {
      expect(formatMoney(1000000, 'ko')).toBe('1,000,000원');
      expect(formatMoney(9876543, 'ko')).toBe('9,876,543원');
    });
  });

  describe('English locale', () => {
    it('formats positive values', () => {
      expect(formatMoney(1234, 'en')).toBe('$1,234');
      expect(formatMoney(100, 'en')).toBe('$100');
      expect(formatMoney(1, 'en')).toBe('$1');
    });

    it('formats negative values', () => {
      expect(formatMoney(-1234, 'en')).toBe('-$1,234');
      expect(formatMoney(-100, 'en')).toBe('-$100');
      expect(formatMoney(-1, 'en')).toBe('-$1');
    });

    it('formats zero', () => {
      expect(formatMoney(0, 'en')).toBe('$0');
    });

    it('rounds to integer', () => {
      expect(formatMoney(1234.567, 'en')).toBe('$1,235');
      expect(formatMoney(1234.4, 'en')).toBe('$1,234');
      expect(formatMoney(1234.5, 'en')).toBe('$1,235');
    });

    it('formats large numbers with thousand separators', () => {
      expect(formatMoney(1000000, 'en')).toBe('$1,000,000');
      expect(formatMoney(9876543, 'en')).toBe('$9,876,543');
    });
  });

  describe('default language', () => {
    it('defaults to ko when lang is not specified', () => {
      expect(formatMoney(1234)).toBe('1,234원');
    });

    it('uses en-US format when lang is null', () => {
      expect(formatMoney(1234, null)).toBe('$1,234');
    });

    it('defaults to ko when lang is undefined', () => {
      expect(formatMoney(1234, undefined)).toBe('1,234원');
    });

    it('uses en-US format when lang is unrecognized', () => {
      expect(formatMoney(1234, 'fr')).toBe('$1,234');
    });
  });

  describe('edge cases', () => {
    it('handles very large numbers', () => {
      expect(formatMoney(999999999999, 'ko')).toBe('999,999,999,999원');
      expect(formatMoney(999999999999, 'en')).toBe('$999,999,999,999');
    });

    it('handles very small positive values', () => {
      expect(formatMoney(0.4, 'ko')).toBe('0원');
      expect(formatMoney(0.5, 'ko')).toBe('1원');
      expect(formatMoney(0.6, 'ko')).toBe('1원');
    });

    it('handles very small negative values', () => {
      expect(formatMoney(-0.4, 'ko')).toBe('-0원');
      expect(formatMoney(-0.5, 'ko')).toBe('-1원');
      expect(formatMoney(-0.6, 'ko')).toBe('-1원');
    });

    it('handles negative zero', () => {
      expect(formatMoney(-0, 'ko')).toBe('0원');
      expect(formatMoney(-0, 'en')).toBe('$0');
    });
  });
});
