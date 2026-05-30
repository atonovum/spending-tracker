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
    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('opens categories modal when card is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('지출 (2)', { selector: '[role="tab"]' })).toBeInTheDocument();
    });
  });

  describe('Adding category', () => {
    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('adds new expense category with name, icon, and color', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      // Open modal
      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Click add button
      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      // Fill form
      const nameInput = screen.getByLabelText(/이름/i);
      await user.type(nameInput, '쇼핑');

      // Select icon (using combobox)
      const iconSelect = await screen.findByRole('combobox', { name: /아이콘/i });
      await user.click(iconSelect);
      await waitFor(() => {
        const cartOption = screen.getByText('카트', { selector: '[role="option"] span' });
        return user.click(cartOption);
      });

      // Change color
      const colorInput = screen.getByLabelText(/색상/i);
      await user.clear(colorInput);
      await user.type(colorInput, '#FF5722');

      // Save
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
    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('merges selected categories into target', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Select two categories via checkboxes
      const foodPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const transportPaper = screen.getByText('교통').closest('[class*="Paper"]');

      const foodCheckbox = within(foodPaper).getByRole('checkbox');
      const transportCheckbox = within(transportPaper).getByRole('checkbox');

      await user.click(foodCheckbox);
      await user.click(transportCheckbox);

      // Click merge button
      const mergeButton = screen.getByRole('button', { name: /병합/i });
      await user.click(mergeButton);

      await waitForModal();

      // Merge modal should appear
      expect(screen.getByText(/병합할 카테고리/i)).toBeInTheDocument();

      // Select target
      const targetSelect = await screen.findByRole('combobox');
      await user.click(targetSelect);

      await waitFor(() => {
        const foodOption = screen.getAllByText('식비').find(el => el.closest('[role="option"]'));
        return user.click(foodOption);
      });

      // Confirm merge
      const confirmMergeButton = screen.getAllByRole('button', { name: /병합/i }).pop();
      await user.click(confirmMergeButton);

      // Should call onConfirm with action
      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/병합/i),
        })
      );

      // After confirmation, onMerge should be called
      // Source: transport (cat-expense-2), Target: food (cat-expense-1)
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

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('clears selection after successful merge', async () => {
      const user = userEvent.setup();
      renderWithMantine(<CategoriesCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Categories/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Select and merge
      const foodPaper = screen.getByText('식비').closest('[class*="Paper"]');
      const foodCheckbox = within(foodPaper).getByRole('checkbox');
      await user.click(foodCheckbox);

      const mergeButton = screen.getByRole('button', { name: /병합/i });
      await user.click(mergeButton);
      await waitForModal();

      const targetSelect = await screen.findByRole('combobox');
      await user.click(targetSelect);
      await waitFor(async () => {
        const option = screen.getAllByText('식비').find(el => el.closest('[role="option"]'));
        await user.click(option);
      });

      const confirmMergeButton = screen.getAllByRole('button', { name: /병합/i }).pop();
      await user.click(confirmMergeButton);

      // After merge, checkbox should be unchecked
      await waitFor(() => {
        expect(foodCheckbox).not.toBeChecked();
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
