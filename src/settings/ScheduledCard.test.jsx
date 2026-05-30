/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduledCard } from './ScheduledCard.jsx';
import { renderWithMantine, createMockState, waitForModal } from './testUtils.jsx';

describe('ScheduledCard', () => {
  let mockState;
  let mockHandlers;
  let mockScheduledEntries;

  beforeEach(() => {
    localStorage.clear();
    mockState = createMockState();

    mockScheduledEntries = [
      {
        id: 'sched-1',
        date: '2026-01-01',
        amount: 3000,
        categoryId: 'cat-expense-1',
        labelIds: ['label-1'],
        note: '월급날 식사',
        repeat: 'monthly',
        repeatEndDate: '2026-12-31',
        nextDate: '2026-02-01',
      },
      {
        id: 'sched-2',
        date: '2026-01-15',
        amount: 50000,
        categoryId: 'cat-income-1',
        labelIds: [],
        note: '',
        repeat: 'monthly',
        repeatEndDate: '',
        nextDate: '2026-02-15',
      },
    ];

    mockHandlers = {
      getCategory: vi.fn((id) => mockState.categories.find((c) => c.id === id)),
      getLabel: vi.fn((id) => mockState.labels.find((l) => l.id === id)),
      onEditEntry: vi.fn(),
    };
  });

  describe('Opening modal', () => {
    it('opens scheduled entries modal when card is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/반복 거래/i)).toBeInTheDocument();
    });

    it('displays scheduled entry count on card', () => {
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('Displaying scheduled entries', () => {
    it('shows all scheduled entries in modal', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      // Both entries should be visible
      expect(screen.getByText('식비')).toBeInTheDocument();
      expect(screen.getByText('급여')).toBeInTheDocument();
    });

    it('displays entry category icon and name', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText('식비')).toBeInTheDocument();
      expect(mockHandlers.getCategory).toHaveBeenCalledWith('cat-expense-1');
    });

    it('displays entry labels', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText('업무')).toBeInTheDocument();
      expect(mockHandlers.getLabel).toHaveBeenCalledWith('label-1');
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('displays repeat frequency badge', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      // Both entries are monthly
      const monthlyBadges = screen.getAllByText(/매월/i);
      expect(monthlyBadges).toHaveLength(2);
    });

    it('displays start date and end date', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
      expect(screen.getByText(/2026-12-31/)).toBeInTheDocument();
    });

    it('shows endless when no end date', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText(/무기한/i)).toBeInTheDocument();
    });

    it('displays next occurrence date', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText(/2026-02-01/)).toBeInTheDocument();
      expect(screen.getByText(/2026-02-15/)).toBeInTheDocument();
    });

    it('displays entry note when present', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText('월급날 식사')).toBeInTheDocument();
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('displays amount with correct color for expense', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      const expenseAmount = screen.getByText(/-₩3,000/i);
      expect(expenseAmount).toHaveStyle({ color: '#F08A8A' });
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('displays amount with correct color for income', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      const incomeAmount = screen.getByText(/₩50,000/i);
      expect(incomeAmount).toHaveStyle({ color: '#5BB97A' });
    });
  });

  describe('Editing scheduled entry', () => {
    it('calls onEditEntry when entry is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      // Click on first entry
      const firstEntry = screen.getByText('식비').closest('[class*="Paper"]');
      await user.click(firstEntry);

      expect(mockHandlers.onEditEntry).toHaveBeenCalledWith(mockScheduledEntries[0]);
    });

    it('shows hover effect on entry', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={mockScheduledEntries}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      const firstEntry = screen.getByText('식비').closest('[class*="Paper"]');

      // Entry should have cursor-pointer class
      expect(firstEntry).toHaveClass('cursor-pointer');
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no scheduled entries', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={[]}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText(/반복 거래가 없습니다/i)).toBeInTheDocument();
    });

    it('displays 0 count on card when no entries', () => {
      renderWithMantine(
        <ScheduledCard
          scheduledEntries={[]}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('Category and label lookup', () => {
    it('shows fallback when category not found', async () => {
      const user = userEvent.setup();
      const entriesWithMissingCategory = [
        {
          ...mockScheduledEntries[0],
          categoryId: 'non-existent',
        },
      ];

      renderWithMantine(
        <ScheduledCard
          scheduledEntries={entriesWithMissingCategory}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      expect(screen.getByText(/카테고리 없음/i)).toBeInTheDocument();
    });

    it('filters out non-existent labels', async () => {
      const user = userEvent.setup();
      const entriesWithMissingLabel = [
        {
          ...mockScheduledEntries[0],
          labelIds: ['label-1', 'non-existent', 'label-2'],
        },
      ];

      renderWithMantine(
        <ScheduledCard
          scheduledEntries={entriesWithMissingLabel}
          {...mockHandlers}
        />
      );

      const card = screen.getByRole('heading', { name: /Scheduled/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();

      // Should show existing labels only
      expect(screen.getByText('업무')).toBeInTheDocument();
      expect(screen.getByText('개인')).toBeInTheDocument();
    });
  });
});
