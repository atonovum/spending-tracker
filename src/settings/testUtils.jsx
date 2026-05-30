/**
 * Test utilities for Settings components
 */
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { I18nProvider, DEFAULT_LANGUAGE } from '../lib/i18n.jsx';
import '@testing-library/jest-dom';

// Mock matchMedia for Mantine components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock ResizeObserver for ScrollArea
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * Render a component with Mantine provider, notifications, and i18n context
 */
export function renderWithMantine(ui, options = {}) {
  const { language = DEFAULT_LANGUAGE, ...renderOptions } = options;

  const Wrapper = ({ children }) => (
    <I18nProvider lang={language}>
      <MantineProvider>
        <Notifications />
        {children}
      </MantineProvider>
    </I18nProvider>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Create a mock state for testing
 */
export function createMockState(overrides = {}) {
  return {
    version: 3,
    language: 'ko',
    wallets: [
      {
        id: 'wallet-1',
        name: '메인 지갑',
        entries: [
          {
            id: 'entry-1',
            date: '2026-01-01',
            amount: 1000,
            categoryId: 'cat-expense-1',
            labelIds: ['label-1'],
            note: '',
            repeat: 'none',
            repeatEndDate: '',
          },
          {
            id: 'entry-2',
            date: '2026-01-02',
            amount: 2000,
            categoryId: 'cat-income-1',
            labelIds: [],
            note: '',
            repeat: 'none',
            repeatEndDate: '',
          },
        ],
      },
    ],
    categories: [
      {
        id: 'cat-expense-1',
        name: '식비',
        type: 'expense',
        color: '#F08A8A',
        icon: 'food',
      },
      {
        id: 'cat-expense-2',
        name: '교통',
        type: 'expense',
        color: '#FFB454',
        icon: 'bus',
      },
      {
        id: 'cat-income-1',
        name: '급여',
        type: 'income',
        color: '#5BB97A',
        icon: 'salary',
      },
    ],
    labels: [
      {
        id: 'label-1',
        name: '업무',
      },
      {
        id: 'label-2',
        name: '개인',
      },
    ],
    selectedWalletId: 'wallet-1',
    ...overrides,
  };
}

/**
 * Wait for Mantine modal animations
 */
export async function waitForModal() {
  // Mantine modals have transition delays
  return new Promise((resolve) => setTimeout(resolve, 100));
}
