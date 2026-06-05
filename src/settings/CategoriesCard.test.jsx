/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoriesCard } from './CategoriesCard.jsx';
import { renderWithMantine, createMockState, waitForModal } from './testUtils.jsx';

describe('CategoriesCard', () => {
  let mockState;
  let mockHandlers;

  beforeEach(() => {
    localStorage.clear();
    mockState = createMockState();
    mockHandlers = {
      onSaveCategory: vi.fn(),
      onDeleteCategory: vi.fn(),
      onMergeCategories: vi.fn(),
      onConfirm: vi.fn((payload) => {
        if (payload.action) payload.action();
      }),
    };
  });

  describe('Opening modal', () => {
    it('opens categories modal when card is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Tab text "지출 (2)" may be split across spans — match by role + accessible name.
      expect(screen.getByRole('tab', { name: /지출.*2/ })).toBeInTheDocument();
    });
  });

  describe('Adding category', () => {
    it('adds new expense category with name, icon, and color', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      const nameInput = screen.getByLabelText(/이름/i);
      await user.type(nameInput, '쇼핑');

      // IconPicker now uses a grid layout with UnstyledButton components
      // Find and click the cart icon button - use exact match to avoid "쇼핑백"
      const cartIconButton = await screen.findByRole('button', { name: '쇼핑 (Shopping)' });
      await user.click(cartIconButton);

      const colorInput = screen.getByLabelText(/색상/i);
      await user.clear(colorInput);
      await user.type(colorInput, '#FF5722');

      const saveButton = screen.getByRole('button', { name: /저장/i });
      await user.click(saveButton);

      expect(mockHandlers.onSaveCategory).toHaveBeenCalledWith({
        id: undefined,
        name: '쇼핑',
        type: 'expense',
        color: '#FF5722',
        icon: 'cart',
      });
    });

    it('adds new income category when income tab is active', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Switch to income tab
      const incomeTab = screen.getByRole('tab', { name: /수입/i });
      await user.click(incomeTab);

      // Click add button
      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      // Fill name only
      const nameInput = screen.getByLabelText(/이름/i);
      await user.type(nameInput, '보너스');

      // Save
      const saveButton = screen.getByRole('button', { name: /저장/i });
      await user.click(saveButton);

      expect(mockHandlers.onSaveCategory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '보너스',
          type: 'income',
        })
      );
    });

    it('does not save category with empty name', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      // Try to save without name
      const saveButton = screen.getByRole('button', { name: /저장/i });
      expect(saveButton).toBeDisabled();

      expect(mockHandlers.onSaveCategory).not.toHaveBeenCalled();
    });
  });

  describe('Editing category', () => {
    it('edits existing category name and color', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Find and click edit button for first category
      const categoryPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const editButton = within(categoryPaper).getByLabelText(/수정/i);
      await user.click(editButton);

      // Edit name
      const nameInput = screen.getByLabelText(/이름/i);
      await user.clear(nameInput);
      await user.type(nameInput, '음식');

      // Edit color
      const colorInput = screen.getByLabelText(/색상/i);
      await user.clear(colorInput);
      await user.type(colorInput, '#E91E63');

      // Save
      const saveButton = screen.getByRole('button', { name: /저장/i });
      await user.click(saveButton);

      expect(mockHandlers.onSaveCategory).toHaveBeenCalledWith({
        id: 'cat-expense-1',
        name: '음식',
        type: 'expense',
        color: '#E91E63',
        icon: 'food',
      });
    });

    it('can cancel editing', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const categoryPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const editButton = within(categoryPaper).getByLabelText(/수정/i);
      await user.click(editButton);

      // Cancel
      const cancelButton = screen.getByRole('button', { name: /취소/i });
      await user.click(cancelButton);

      // Form should be hidden
      await waitFor(() => {
        expect(screen.queryByLabelText(/이름/i)).not.toBeInTheDocument();
      });

      expect(mockHandlers.onSaveCategory).not.toHaveBeenCalled();
    });
  });

  describe('Deleting category', () => {
    it('deletes category without entries after confirmation', async () => {
      const user = userEvent.setup();
      const stateWithUnusedCategory = createMockState({
        categories: [
          ...mockState.categories,
          { id: 'cat-unused', name: '미사용', type: 'expense', color: '#999', icon: 'cart' },
        ],
      });

      renderWithMantine(<CategoriesCard state={stateWithUnusedCategory} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Find and click delete button for unused category
      const categoryPaper = screen.getByText('미사용').closest('[class*="Paper"]');
      const deleteButton = within(categoryPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      // Confirm should be called with action
      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/삭제/i),
          message: expect.stringContaining('미사용'),
        })
      );

      // onDeleteCategory should be called after confirmation
      expect(mockHandlers.onDeleteCategory).toHaveBeenCalledWith('cat-unused');
    });

    it('shows cascade warning when deleting category with entries', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Delete category with 1 entry
      const categoryPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const deleteButton = within(categoryPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/1.*거래/),
        })
      );
    });

    it('prevents deleting last category', async () => {
      const user = userEvent.setup();
      const stateWithOneCategory = createMockState({
        categories: [mockState.categories[0]],
      });

      renderWithMantine(<CategoriesCard state={stateWithOneCategory} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const categoryPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const deleteButton = within(categoryPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/최소.*1/),
          action: null,
        })
      );

      expect(mockHandlers.onDeleteCategory).not.toHaveBeenCalled();
    });
  });

  describe('Merging categories', () => {
    it('merges selected categories into target', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const foodPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const transportPaper = screen.getByText('교통').closest('[class*="Paper"]');

      const foodCheckbox = within(foodPaper).getByRole('checkbox');
      const transportCheckbox = within(transportPaper).getByRole('checkbox');

      await user.click(foodCheckbox);
      await user.click(transportCheckbox);

      // mergeBtn ("선택 병합") opens the merge modal.
      const openMergeButton = screen.getByRole('button', { name: /선택 병합/ });
      await user.click(openMergeButton);

      // Merge modal appears with title "카테고리 병합".
      const mergeDialog = await screen.findByRole('dialog', { name: /카테고리 병합/ });

      // Select merge target (Mantine 7 Select → textbox).
      const targetSelect = within(mergeDialog).getByRole('textbox');
      await user.click(targetSelect);
      const foodOption = await screen.findByRole('option', { name: '식비' });
      await user.click(foodOption);

      const confirmMergeButton = within(mergeDialog).getByRole('button', { name: '병합' });
      await user.click(confirmMergeButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/병합/i),
        })
      );

      // Source: transport (cat-expense-2), Target: food (cat-expense-1).
      expect(mockHandlers.onMergeCategories).toHaveBeenCalledWith(['cat-expense-2'], 'cat-expense-1');
    });

    it('disables merge button when less than 1 category selected', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const mergeButton = screen.getByRole('button', { name: /병합/i });
      expect(mergeButton).toBeDisabled();
    });

    it('clears selection after successful merge', async () => {
      const user = userEvent.setup();
      // Need at least 2 categories so the source-vs-target filter leaves a non-empty source set.
      const stateWithExtraCategory = createMockState({
        categories: [
          ...mockState.categories,
          { id: 'cat-expense-3', name: '쇼핑', type: 'expense', color: '#888', icon: 'cart' },
        ],
      });
      renderWithMantine(<CategoriesCard state={stateWithExtraCategory} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const shoppingPaper = screen.getByText('쇼핑').closest('[class*="Paper"]');
      const shoppingCheckbox = within(shoppingPaper).getByRole('checkbox');
      await user.click(shoppingCheckbox);

      const openMergeButton = screen.getByRole('button', { name: /선택 병합/ });
      await user.click(openMergeButton);

      const mergeDialog = await screen.findByRole('dialog', { name: /카테고리 병합/ });

      const targetSelect = within(mergeDialog).getByRole('textbox');
      await user.click(targetSelect);
      const foodOption = await screen.findByRole('option', { name: '식비' });
      await user.click(foodOption);

      const confirmMergeButton = within(mergeDialog).getByRole('button', { name: '병합' });
      await user.click(confirmMergeButton);

      // After merge confirmation, the selection set is cleared.
      await waitFor(() => {
        expect(shoppingCheckbox).not.toBeChecked();
      });
    });
  });

  describe('Tab switching', () => {
    it('switches between expense and income tabs', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Expense tab shows expense categories
      expect(screen.getByText('식비')).toBeInTheDocument();
      expect(screen.getByText('교통')).toBeInTheDocument();
      expect(screen.queryByText('급여')).not.toBeInTheDocument();

      // Switch to income tab
      const incomeTab = screen.getByRole('tab', { name: /수입/i });
      await user.click(incomeTab);

      // Income tab shows income categories
      await waitFor(() => {
        expect(screen.getByText('급여')).toBeInTheDocument();
      });
      expect(screen.queryByText('식비')).not.toBeInTheDocument();
    });

    it('maintains separate selection state per tab', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Select expense category
      const foodPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const foodCheckbox = within(foodPaper).getByRole('checkbox');
      await user.click(foodCheckbox);

      expect(foodCheckbox).toBeChecked();

      // Switch to income tab
      const incomeTab = screen.getByRole('tab', { name: /수입/i });
      await user.click(incomeTab);

      // Income checkboxes should not be checked
      const salaryPaper = screen.getByText('급여').closest('[class*="Paper"]');
      const salaryCheckbox = within(salaryPaper).getByRole('checkbox');
      expect(salaryCheckbox).not.toBeChecked();

      // Switch back to expense
      const expenseTab = screen.getByRole('tab', { name: /지출/i });
      await user.click(expenseTab);

      // Expense selection should be preserved
      await waitFor(() => {
        expect(foodCheckbox).toBeChecked();
      });
    });
  });
});
