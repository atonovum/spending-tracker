/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  inferCategoryIcon,
  normalizeCategory,
  normalizeLabel,
  normalizeWallet,
  normalizeState,
  loadState,
  saveState,
  loadLastEntryDate,
  saveLastEntryDate,
  applySampleSeed,
  SAMPLE_SEED_ENABLED,
} from './storage.js';
import { ACTIVE_STORAGE_KEY, LAST_ENTRY_DATE_KEY, STORAGE_KEYS } from './finance.js';
import { SAMPLE_WALLETS } from './sampleData.js';

describe('inferCategoryIcon', () => {
  describe('income patterns', () => {
    it('infers salary icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'salary', type: 'income' })).toBe('salary');
      expect(inferCategoryIcon({ id: 'wage-monthly', type: 'income' })).toBe('salary');
      expect(inferCategoryIcon({ id: 'payroll', type: 'income' })).toBe('salary');
    });

    it('infers salary icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'income-1', name: '급여', type: 'income' })).toBe('salary');
      expect(inferCategoryIcon({ id: 'income-1', name: '월급', type: 'income' })).toBe('salary');
      expect(inferCategoryIcon({ id: 'income-1', name: '봉급', type: 'income' })).toBe('salary');
      expect(inferCategoryIcon({ id: 'income-1', name: '연봉', type: 'income' })).toBe('salary');
    });

    it('infers gift icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'gift', type: 'income' })).toBe('gift');
      expect(inferCategoryIcon({ id: 'refund-tax', type: 'income' })).toBe('gift');
      expect(inferCategoryIcon({ id: 'bonus', type: 'income' })).toBe('gift');
    });

    it('infers gift icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'income-2', name: '선물', type: 'income' })).toBe('gift');
      expect(inferCategoryIcon({ id: 'income-2', name: '환급', type: 'income' })).toBe('gift');
      expect(inferCategoryIcon({ id: 'income-2', name: '보너스', type: 'income' })).toBe('gift');
      expect(inferCategoryIcon({ id: 'income-2', name: '용돈', type: 'income' })).toBe('gift');
    });

    it('infers savings icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'savings', type: 'income' })).toBe('savings');
      expect(inferCategoryIcon({ id: 'deposit-interest', type: 'income' })).toBe('savings');
    });

    it('infers savings icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'income-3', name: '저축', type: 'income' })).toBe('savings');
      expect(inferCategoryIcon({ id: 'income-3', name: '적금', type: 'income' })).toBe('savings');
      expect(inferCategoryIcon({ id: 'income-3', name: '예금', type: 'income' })).toBe('savings');
    });

    it('defaults to wallet for unmatched income categories', () => {
      expect(inferCategoryIcon({ id: 'other-income', type: 'income' })).toBe('wallet');
      expect(inferCategoryIcon({ id: 'misc', name: 'Other', type: 'income' })).toBe('wallet');
    });
  });

  describe('expense patterns', () => {
    it('infers food icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'food', type: 'expense' })).toBe('food');
      expect(inferCategoryIcon({ id: 'meal-lunch', type: 'expense' })).toBe('food');
      expect(inferCategoryIcon({ id: 'dining-out', type: 'expense' })).toBe('food');
    });

    it('infers food icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-1', name: '식비', type: 'expense' })).toBe('food');
      expect(inferCategoryIcon({ id: 'expense-1', name: '식사', type: 'expense' })).toBe('food');
      expect(inferCategoryIcon({ id: 'expense-1', name: '외식', type: 'expense' })).toBe('food');
      expect(inferCategoryIcon({ id: 'expense-1', name: '음식', type: 'expense' })).toBe('food');
    });

    it('infers bus icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'transport', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'bus-fare', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'taxi', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'car-fuel', type: 'expense' })).toBe('bus');
    });

    it('infers bus icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-2', name: '교통', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'expense-2', name: '버스', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'expense-2', name: '택시', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'expense-2', name: '주유', type: 'expense' })).toBe('bus');
      expect(inferCategoryIcon({ id: 'expense-2', name: '차량', type: 'expense' })).toBe('bus');
    });

    it('infers hospital icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'health', type: 'expense' })).toBe('hospital');
      expect(inferCategoryIcon({ id: 'hospital-visit', type: 'expense' })).toBe('hospital');
      expect(inferCategoryIcon({ id: 'medical', type: 'expense' })).toBe('hospital');
      expect(inferCategoryIcon({ id: 'drug-store', type: 'expense' })).toBe('hospital');
    });

    it('infers hospital icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-3', name: '의료', type: 'expense' })).toBe('hospital');
      expect(inferCategoryIcon({ id: 'expense-3', name: '병원', type: 'expense' })).toBe('hospital');
      expect(inferCategoryIcon({ id: 'expense-3', name: '약', type: 'expense' })).toBe('hospital');
    });

    it('infers house icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'house', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'home-rent', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'housing', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'rent-monthly', type: 'expense' })).toBe('house');
    });

    it('infers house icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-4', name: '주거', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'expense-4', name: '월세', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'expense-4', name: '전세', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'expense-4', name: '관리비', type: 'expense' })).toBe('house');
      expect(inferCategoryIcon({ id: 'expense-4', name: '집', type: 'expense' })).toBe('house');
    });

    it('infers utility icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'utility', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'telecom', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'phone-bill', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'gas', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'electric', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'water', type: 'expense' })).toBe('utility');
    });

    it('infers utility icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-5', name: '통신', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'expense-5', name: '전기', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'expense-5', name: '가스', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'expense-5', name: '수도', type: 'expense' })).toBe('utility');
      expect(inferCategoryIcon({ id: 'expense-5', name: '공과', type: 'expense' })).toBe('utility');
    });

    it('infers travel icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'travel', type: 'expense' })).toBe('travel');
      expect(inferCategoryIcon({ id: 'trip-summer', type: 'expense' })).toBe('travel');
      expect(inferCategoryIcon({ id: 'vacation', type: 'expense' })).toBe('travel');
    });

    it('infers travel icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-6', name: '여행', type: 'expense' })).toBe('travel');
      expect(inferCategoryIcon({ id: 'expense-6', name: '휴가', type: 'expense' })).toBe('travel');
    });

    it('infers study icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'study', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'education', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'book-store', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'learning', type: 'expense' })).toBe('study');
    });

    it('infers study icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-7', name: '교육', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'expense-7', name: '학습', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'expense-7', name: '도서', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'expense-7', name: '책', type: 'expense' })).toBe('study');
      expect(inferCategoryIcon({ id: 'expense-7', name: '학원', type: 'expense' })).toBe('study');
    });

    it('infers cart icon from id patterns', () => {
      expect(inferCategoryIcon({ id: 'shop', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'grocery', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'mart', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'retail', type: 'expense' })).toBe('cart');
    });

    it('infers cart icon from Korean name patterns', () => {
      expect(inferCategoryIcon({ id: 'expense-8', name: '쇼핑', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'expense-8', name: '마트', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'expense-8', name: '장보기', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'expense-8', name: '구매', type: 'expense' })).toBe('cart');
    });

    it('defaults to cart for unmatched expense categories', () => {
      expect(inferCategoryIcon({ id: 'other', type: 'expense' })).toBe('cart');
      expect(inferCategoryIcon({ id: 'misc', name: 'Other', type: 'expense' })).toBe('cart');
    });
  });
});

describe('normalizeCategory', () => {
  it('generates uid for missing id', () => {
    const result = normalizeCategory({ name: 'Test' }, 0);
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
  });

  it('preserves existing id', () => {
    const result = normalizeCategory({ id: 'cat-1', name: 'Test' }, 0);
    expect(result.id).toBe('cat-1');
  });

  it('generates default name for missing name', () => {
    const result1 = normalizeCategory({ id: 'cat-1' }, 0);
    expect(result1.name).toBe('카테고리 1');

    const result2 = normalizeCategory({ id: 'cat-2' }, 5);
    expect(result2.name).toBe('카테고리 6');
  });

  it('preserves existing name', () => {
    const result = normalizeCategory({ id: 'cat-1', name: 'Food' }, 0);
    expect(result.name).toBe('Food');
  });

  it('clamps type to income or expense', () => {
    const income = normalizeCategory({ id: 'cat-1', type: 'income' }, 0);
    expect(income.type).toBe('income');

    const expense = normalizeCategory({ id: 'cat-2', type: 'expense' }, 0);
    expect(expense.type).toBe('expense');

    const invalid = normalizeCategory({ id: 'cat-3', type: 'other' }, 0);
    expect(invalid.type).toBe('expense');

    const missing = normalizeCategory({ id: 'cat-4' }, 0);
    expect(missing.type).toBe('expense');
  });

  it('sets default color based on type', () => {
    const income = normalizeCategory({ id: 'cat-1', type: 'income' }, 0);
    expect(income.color).toBe('#1565c0');

    const expense = normalizeCategory({ id: 'cat-2', type: 'expense' }, 0);
    expect(expense.color).toBe('#c62828');
  });

  it('preserves existing color', () => {
    const result = normalizeCategory({ id: 'cat-1', color: '#ff0000' }, 0);
    expect(result.color).toBe('#ff0000');
  });

  it('replaces spark icon with inferred icon', () => {
    const result = normalizeCategory({ id: 'salary', icon: 'spark', type: 'income' }, 0);
    expect(result.icon).toBe('salary');
  });

  it('preserves valid existing icon', () => {
    const result = normalizeCategory({ id: 'cat-1', icon: 'wallet' }, 0);
    expect(result.icon).toBe('wallet');
  });

  it('infers icon when missing', () => {
    const result = normalizeCategory({ id: 'food', type: 'expense' }, 0);
    expect(result.icon).toBe('food');
  });
});

describe('normalizeLabel', () => {
  it('generates uid for missing id', () => {
    const result = normalizeLabel({ name: 'Test' }, 0);
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
  });

  it('preserves existing id', () => {
    const result = normalizeLabel({ id: 'label-1', name: 'Test' }, 0);
    expect(result.id).toBe('label-1');
  });

  it('generates default name for missing name', () => {
    const result1 = normalizeLabel({ id: 'label-1' }, 0);
    expect(result1.name).toBe('레이블 1');

    const result2 = normalizeLabel({ id: 'label-2' }, 3);
    expect(result2.name).toBe('레이블 4');
  });

  it('preserves existing name', () => {
    const result = normalizeLabel({ id: 'label-1', name: 'Work' }, 0);
    expect(result.name).toBe('Work');
  });
});

describe('normalizeWallet', () => {
  const mockCategories = [{ id: 'cat-1', name: 'Food' }];
  const mockLabels = [{ id: 'label-1', name: 'Work' }];

  it('generates uid for missing id', () => {
    const result = normalizeWallet({}, mockCategories, mockLabels);
    expect(result.id).toBeTruthy();
    expect(typeof result.id).toBe('string');
  });

  it('preserves existing id', () => {
    const result = normalizeWallet({ id: 'wallet-1' }, mockCategories, mockLabels);
    expect(result.id).toBe('wallet-1');
  });

  it('sets default name for missing name', () => {
    const result = normalizeWallet({ id: 'wallet-1' }, mockCategories, mockLabels);
    expect(result.name).toBe('지갑');
  });

  it('preserves existing name', () => {
    const result = normalizeWallet({ id: 'wallet-1', name: 'Main' }, mockCategories, mockLabels);
    expect(result.name).toBe('Main');
  });

  it('normalizes entries array', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [
        { date: '2026-01-01', amount: 1000, categoryId: 'cat-1' },
        { date: '2026-01-02', amount: '2000', categoryId: 'cat-1' },
      ],
    };

    const result = normalizeWallet(wallet, mockCategories, mockLabels);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].id).toBeTruthy();
    expect(result.entries[0].amount).toBe(1000);
    expect(result.entries[1].amount).toBe(2000);
  });

  it('converts string amount to number (NaN for invalid strings)', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [{ date: '2026-01-01', amount: '12.3abc', categoryId: 'cat-1' }],
    };

    const result = normalizeWallet(wallet, mockCategories, mockLabels);
    expect(result.entries[0].amount).toBeNaN();
  });

  it('uses fallback categoryId when missing', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [{ date: '2026-01-01', amount: 1000 }],
    };

    const result = normalizeWallet(wallet, mockCategories, mockLabels);
    expect(result.entries[0].categoryId).toBe('cat-1');
  });

  it('uses empty string for categoryId when no categories exist', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [{ date: '2026-01-01', amount: 1000 }],
    };

    const result = normalizeWallet(wallet, [], mockLabels);
    expect(result.entries[0].categoryId).toBe('');
  });

  it('sets default date for missing date', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [{ amount: 1000, categoryId: 'cat-1' }],
    };

    const result = normalizeWallet(wallet, mockCategories, mockLabels);
    expect(result.entries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('strips the legacy repeat fields — repetition belongs to wallet.scheduled', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [{ date: '2026-01-01', amount: 1000, categoryId: 'cat-1' }],
    };

    const result = normalizeWallet(wallet, mockCategories, mockLabels);
    expect(result.entries[0]).not.toHaveProperty('repeat');
    expect(result.entries[0]).not.toHaveProperty('repeatEndDate');
    expect(result.scheduled).toEqual([]);
  });

  it('drops label ids that no longer exist', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [
        { date: '2026-01-01', amount: 1000, categoryId: 'cat-1', labelIds: ['label-1', 'label-deleted'] },
      ],
    };

    const result = normalizeWallet(wallet, mockCategories, mockLabels);
    expect(result.entries[0].labelIds).toEqual(['label-1']);
  });

  it('drops all label ids when no labels are provided', () => {
    const wallet = {
      id: 'wallet-1',
      entries: [{ date: '2026-01-01', amount: 1000, categoryId: 'cat-1', labelIds: ['label-1'] }],
    };

    expect(normalizeWallet(wallet, mockCategories, []).entries[0].labelIds).toEqual([]);
    expect(normalizeWallet(wallet, mockCategories, undefined).entries[0].labelIds).toEqual([]);
  });

  it('returns empty entries for non-array entries', () => {
    const result1 = normalizeWallet({ id: 'wallet-1' }, mockCategories, mockLabels);
    expect(result1.entries).toEqual([]);

    const result2 = normalizeWallet({ id: 'wallet-2', entries: null }, mockCategories, mockLabels);
    expect(result2.entries).toEqual([]);
  });
});

describe('normalizeState', () => {
  it('wraps legacy single wallet into wallets array', () => {
    const legacy = {
      wallet: { id: 'wallet-1', name: 'Main', entries: [] },
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
    };

    const result = normalizeState(legacy);
    expect(result.wallets).toHaveLength(1);
    expect(result.wallets[0].id).toBe('wallet-1');
    expect(result.selectedWalletId).toBe('wallet-1');
  });

  it('preserves multi-wallet structure', () => {
    const multi = {
      wallets: [
        { id: 'wallet-1', name: 'Main', entries: [] },
        { id: 'wallet-2', name: 'Savings', entries: [] },
      ],
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
      selectedWalletId: 'wallet-2',
    };

    const result = normalizeState(multi);
    expect(result.wallets).toHaveLength(2);
    expect(result.selectedWalletId).toBe('wallet-2');
  });

  it('forces version 4', () => {
    const input1 = { wallets: [], categories: [], labels: [], version: 1 };
    const result1 = normalizeState(input1);
    expect(result1.version).toBe(4);

    const input2 = { wallets: [], categories: [], labels: [], version: 2 };
    const result2 = normalizeState(input2);
    expect(result2.version).toBe(4);
  });

  it('clamps language to en or ko', () => {
    const en = normalizeState({ wallets: [], categories: [], labels: [], language: 'en' });
    expect(en.language).toBe('en');

    const ko = normalizeState({ wallets: [], categories: [], labels: [], language: 'ko' });
    expect(ko.language).toBe('ko');

    const invalid = normalizeState({ wallets: [], categories: [], labels: [], language: 'fr' });
    expect(invalid.language).toBe('ko');

    const missing = normalizeState({ wallets: [], categories: [], labels: [] });
    expect(missing.language).toBe('ko');
  });

  it('uses fallback from DEFAULT_SEED when wallets is empty', () => {
    const result = normalizeState({ wallets: [], categories: [], labels: [] });
    expect(result.wallets.length).toBeGreaterThan(0);
  });

  it('uses fallback from DEFAULT_SEED when categories is empty', () => {
    const result = normalizeState({ wallets: [{ id: 'w1', entries: [] }], categories: [], labels: [] });
    expect(result.categories.length).toBeGreaterThan(0);
  });

  it('uses fallback from DEFAULT_SEED when labels is empty', () => {
    const result = normalizeState({ wallets: [{ id: 'w1', entries: [] }], categories: [], labels: [] });
    expect(result.labels.length).toBeGreaterThan(0);
  });

  it('sets selectedWalletId to first wallet when missing', () => {
    const result = normalizeState({
      wallets: [{ id: 'wallet-1', entries: [] }],
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
    });
    expect(result.selectedWalletId).toBe('wallet-1');
  });

  it('preserves selectedWalletId even if wallet does not exist', () => {
    const result = normalizeState({
      wallets: [{ id: 'wallet-1', entries: [] }],
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
      selectedWalletId: 'non-existent',
    });
    expect(result.selectedWalletId).toBe('non-existent');
  });
});

describe('loadState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns DEFAULT_SEED when localStorage is empty', () => {
    const result = loadState();
    expect(result.version).toBe(4);
    expect(result.wallets.length).toBeGreaterThan(0);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.labels.length).toBeGreaterThan(0);
  });

  it('loads from ACTIVE_STORAGE_KEY when present', () => {
    const state = {
      wallets: [{ id: 'wallet-1', name: 'Main', entries: [] }],
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
      selectedWalletId: 'wallet-1',
      language: 'ko',
    };

    localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(state));

    const result = loadState();
    expect(result.wallets[0].id).toBe('wallet-1');
    expect(result.version).toBe(4);
  });

  it('tries STORAGE_KEYS in order and uses first valid key', () => {
    const state = {
      wallets: [{ id: 'wallet-legacy', name: 'Legacy', entries: [] }],
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
    };

    localStorage.setItem(STORAGE_KEYS[1], JSON.stringify(state));

    const result = loadState();
    expect(result.wallets[0].id).toBe('wallet-legacy');
  });

  it('returns DEFAULT_SEED when safeJsonParse returns null', () => {
    localStorage.setItem(ACTIVE_STORAGE_KEY, 'invalid json');

    const result = loadState();
    expect(result.version).toBe(4);
    expect(result.wallets.length).toBeGreaterThan(0);
  });
});

describe('saveState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves state to localStorage and returns ok: true', () => {
    const state = {
      version: 3,
      wallets: [{ id: 'wallet-1', name: 'Main', entries: [] }],
      categories: [{ id: 'cat-1', name: 'Food' }],
      labels: [{ id: 'label-1', name: 'Work' }],
      selectedWalletId: 'wallet-1',
      language: 'ko',
    };

    const result = saveState(state);

    expect(result).toEqual({ ok: true });
    expect(localStorage.getItem(ACTIVE_STORAGE_KEY)).toBeTruthy();

    const saved = JSON.parse(localStorage.getItem(ACTIVE_STORAGE_KEY));
    expect(saved.wallets[0].id).toBe('wallet-1');
  });

  it('returns ok: false when localStorage.setItem throws QuotaExceededError', () => {
    const state = { wallets: [], categories: [], labels: [] };

    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
    const error = new Error('QuotaExceededError');
    error.name = 'QuotaExceededError';
    mockSetItem.mockImplementation(() => {
      throw error;
    });

    const result = saveState(state);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);

    mockSetItem.mockRestore();
  });

  it('returns ok: false when localStorage.setItem throws in private mode', () => {
    const state = { wallets: [], categories: [], labels: [] };

    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
    const error = new Error('Private mode error');
    mockSetItem.mockImplementation(() => {
      throw error;
    });

    const result = saveState(state);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);

    mockSetItem.mockRestore();
  });

  it('returns ok: false when JSON.stringify throws', () => {
    const circular = {};
    circular.self = circular;

    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');

    const result = saveState(circular);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();

    mockSetItem.mockRestore();
  });
});

describe('dev sample seed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is off outside the dev server, so the suite and any build see the plain seed', () => {
    // The flag is a build-time constant (`import.meta.env.DEV`), not an env
    // var: nothing a caller does at runtime can switch sample data on.
    expect(SAMPLE_SEED_ENABLED).toBe(false);

    const sampleIds = SAMPLE_WALLETS.map((wallet) => wallet.id);
    const seeded = loadState().wallets.map((wallet) => wallet.id);
    expect(seeded.some((id) => sampleIds.includes(id))).toBe(false);
  });

  it('passes state straight through when seeding is off', () => {
    const state = { wallets: [{ id: 'wallet-1', entries: [] }] };
    expect(applySampleSeed(state)).toBe(state);
  });
});

describe('last entry date', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty string when nothing has been stored', () => {
    expect(loadLastEntryDate()).toBe('');
  });

  it('round-trips a valid date', () => {
    expect(saveLastEntryDate('2026-02-14')).toEqual({ ok: true });
    expect(localStorage.getItem(LAST_ENTRY_DATE_KEY)).toBe('2026-02-14');
    expect(loadLastEntryDate()).toBe('2026-02-14');
  });

  it('refuses to store a malformed date', () => {
    expect(saveLastEntryDate('yesterday')).toEqual({ ok: false });
    expect(saveLastEntryDate('')).toEqual({ ok: false });
    expect(saveLastEntryDate(undefined)).toEqual({ ok: false });
    expect(localStorage.getItem(LAST_ENTRY_DATE_KEY)).toBeNull();
  });

  it('ignores a corrupted stored value instead of feeding it to the editor', () => {
    localStorage.setItem(LAST_ENTRY_DATE_KEY, 'not-a-date');
    expect(loadLastEntryDate()).toBe('');
  });

  it('is stored outside the normalised state so no schema migration is needed', () => {
    saveLastEntryDate('2026-02-14');
    expect(STORAGE_KEYS).not.toContain(LAST_ENTRY_DATE_KEY);
    // loadState must not pick the preference key up as a state candidate.
    expect(loadState().version).toBe(4);
  });

  it('returns ok: false when localStorage rejects the write', () => {
    const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
    const error = new Error('Private mode error');
    mockSetItem.mockImplementation(() => {
      throw error;
    });

    const result = saveLastEntryDate('2026-02-14');

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);

    mockSetItem.mockRestore();
  });

  it('returns an empty string when localStorage rejects the read', () => {
    const mockGetItem = vi.spyOn(Storage.prototype, 'getItem');
    mockGetItem.mockImplementation(() => {
      throw new Error('Private mode error');
    });

    expect(loadLastEntryDate()).toBe('');

    mockGetItem.mockRestore();
  });
});
