/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletsCard } from './WalletsCard.jsx';
import { renderWithMantine, createMockState, waitForModal } from './testUtils.jsx';

describe('WalletsCard', () => {
  let mockState;
  let mockHandlers;
  let mockWalletTotals;

  beforeEach(() => {
    localStorage.clear();
    mockState = createMockState();
    mockWalletTotals = new Map([['wallet-1', 1000]]);
    mockHandlers = {
      onSelectWallet: vi.fn(),
      onAddWallet: vi.fn(),
      onRenameWallet: vi.fn(),
      onDeleteWallet: vi.fn(),
      onExportWallet: vi.fn(),
      onImportWallet: vi.fn(),
      onConfirm: vi.fn((payload) => {
        if (payload.action) payload.action();
      }),
    };
  });

  describe('Rendering', () => {
    it('displays wallet count and limit', () => {
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      expect(screen.getByText(/1.*5/i)).toBeInTheDocument();
    });

    it('displays all wallets with their totals', () => {
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      expect(screen.getByText('메인 지갑')).toBeInTheDocument();
      expect(screen.getByText(/₩1,000/i)).toBeInTheDocument();
    });

    it('shows selected wallet with filled star icon', () => {
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const starButton = within(walletPaper).getByLabelText(/선택됨/i);

      expect(starButton).toBeInTheDocument();
    });
  });

  describe('Adding wallet', () => {
    it('calls onAddWallet when add button is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      expect(mockHandlers.onAddWallet).toHaveBeenCalled();
    });

    it('disables add button when MAX_WALLETS (5) reached', () => {
      const stateWithMaxWallets = createMockState({
        wallets: Array.from({ length: 5 }, (_, i) => ({
          id: `wallet-${i + 1}`,
          name: `지갑 ${i + 1}`,
          entries: [],
        })),
      });

      renderWithMantine(
        <WalletsCard
          state={stateWithMaxWallets}
          walletTotals={new Map()}
          {...mockHandlers}
        />
      );

      const addButton = screen.getByRole('button', { name: /추가/i });
      expect(addButton).toBeDisabled();
    });

    it('enables add button when under MAX_WALLETS', () => {
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const addButton = screen.getByRole('button', { name: /추가/i });
      expect(addButton).not.toBeDisabled();
    });
  });

  describe('Selecting wallet', () => {
    it('calls onSelectWallet when star icon is clicked', async () => {
      const user = userEvent.setup();
      const stateWithMultipleWallets = createMockState({
        wallets: [
          mockState.wallets[0],
          { id: 'wallet-2', name: '저축 지갑', entries: [] },
        ],
        selectedWalletId: 'wallet-1',
      });

      renderWithMantine(
        <WalletsCard
          state={stateWithMultipleWallets}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      // Click star on second wallet
      const savingsWalletPaper = screen.getByText('저축 지갑').closest('[class*="Paper"]');
      const starButton = within(savingsWalletPaper).getByLabelText(/선택하기/i);
      await user.click(starButton);

      expect(mockHandlers.onSelectWallet).toHaveBeenCalledWith('wallet-2');
    });
  });

  describe('Editing wallet', () => {
    it('opens edit modal when edit button is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const editButton = within(walletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();
      expect(screen.getByRole('dialog', { name: /지갑 편집/i })).toBeInTheDocument();
    });

    it('renames wallet when save is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const editButton = within(walletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();

      const nameInput = screen.getByLabelText(/이름/i);
      await user.clear(nameInput);
      await user.type(nameInput, '주 지갑');

      const saveButton = screen.getByRole('button', { name: /저장/i });
      await user.click(saveButton);

      expect(mockHandlers.onRenameWallet).toHaveBeenCalledWith('wallet-1', '주 지갑');
    });

    it('does not rename when name is unchanged', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const editButton = within(walletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();

      const saveButton = screen.getByRole('button', { name: /저장/i });
      await user.click(saveButton);

      expect(mockHandlers.onRenameWallet).not.toHaveBeenCalled();
    });

    it('disables save button when name is empty', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const editButton = within(walletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();

      const nameInput = screen.getByLabelText(/이름/i);
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /저장/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Deleting wallet', () => {
    it('deletes wallet after confirmation', async () => {
      const user = userEvent.setup();
      const stateWithMultipleWallets = createMockState({
        wallets: [
          mockState.wallets[0],
          { id: 'wallet-2', name: '임시 지갑', entries: [] },
        ],
      });

      renderWithMantine(
        <WalletsCard
          state={stateWithMultipleWallets}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      // Open edit modal for second wallet
      const tempWalletPaper = screen.getByText('임시 지갑').closest('[class*="Paper"]');
      const editButton = within(tempWalletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();

      // Click delete button in modal
      const deleteButton = screen.getByRole('button', { name: /삭제/i });
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/삭제/i),
          message: expect.stringContaining('임시 지갑'),
        })
      );

      expect(mockHandlers.onDeleteWallet).toHaveBeenCalledWith('wallet-2');
    });

    it('prevents deleting last wallet', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const editButton = within(walletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();

      const deleteButton = screen.getByRole('button', { name: /삭제/i });
      expect(deleteButton).toBeDisabled();

      await user.click(deleteButton);
      expect(mockHandlers.onDeleteWallet).not.toHaveBeenCalled();
    });

    it('shows entry count in delete confirmation', async () => {
      const user = userEvent.setup();
      const stateWithMultipleWallets = createMockState({
        wallets: [
          mockState.wallets[0],
          {
            id: 'wallet-2',
            name: '임시 지갑',
            entries: [
              { id: 'e1', date: '2026-01-01', amount: 100, categoryId: 'cat-expense-1' },
              { id: 'e2', date: '2026-01-02', amount: 200, categoryId: 'cat-expense-1' },
            ],
          },
        ],
      });

      renderWithMantine(
        <WalletsCard
          state={stateWithMultipleWallets}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const tempWalletPaper = screen.getByText('임시 지갑').closest('[class*="Paper"]');
      const editButton = within(tempWalletPaper).getByLabelText(/편집/i);
      await user.click(editButton);

      await waitForModal();

      const deleteButton = screen.getByRole('button', { name: /삭제/i });
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/2.*거래/),
        })
      );
    });
  });

  describe('Exporting wallet', () => {
    it('calls onExportWallet when export button is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const walletPaper = screen.getByText('메인 지갑').closest('[class*="Paper"]');
      const exportButton = within(walletPaper).getByLabelText(/내보내기/i);
      await user.click(exportButton);

      expect(mockHandlers.onExportWallet).toHaveBeenCalledWith('wallet-1');
    });
  });

  describe('Importing wallet', () => {
    it('opens import modal when file is selected', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const importButton = screen.getByRole('button', { name: /가져오기/i });

      // Create a mock JSON file
      const fileContent = JSON.stringify({
        wallet: {
          id: 'imported-wallet',
          name: '가져온 지갑',
          entries: [{ id: 'e1', date: '2026-01-01', amount: 500, categoryId: 'cat-expense-1' }],
        },
      });
      const file = new File([fileContent], 'wallet.json', { type: 'application/json' });

      // Find the hidden file input (inside FileButton)
      const fileInput = importButton.parentElement.querySelector('input[type="file"]');
      await user.upload(fileInput, file);

      await waitForModal();
      expect(screen.getByRole('dialog', { name: /가져오기/i })).toBeInTheDocument();
      expect(screen.getByText(/가져온 지갑/i)).toBeInTheDocument();
    });

    it('imports as new wallet when "new wallet" is selected', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const importButton = screen.getByRole('button', { name: /가져오기/i });

      const fileContent = JSON.stringify({
        wallet: { id: 'imported', name: '가져온 지갑', entries: [] },
      });
      const file = new File([fileContent], 'wallet.json', { type: 'application/json' });

      const fileInput = importButton.parentElement.querySelector('input[type="file"]');
      await user.upload(fileInput, file);

      await waitForModal();

      // Default selection should be "new wallet"
      const confirmButton = screen.getByRole('button', { name: /가져오기/i });
      await user.click(confirmButton);

      expect(mockHandlers.onImportWallet).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet: expect.objectContaining({ name: '가져온 지갑' }),
        }),
        null // null means new wallet
      );
    });

    it('imports into existing wallet when selected', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const importButton = screen.getByRole('button', { name: /가져오기/i });

      const fileContent = JSON.stringify({
        wallet: { id: 'imported', name: '가져온 지갑', entries: [{ id: 'e1', amount: 100 }] },
      });
      const file = new File([fileContent], 'wallet.json', { type: 'application/json' });

      const fileInput = importButton.parentElement.querySelector('input[type="file"]');
      await user.upload(fileInput, file);

      await waitForModal();

      // Select existing wallet
      const targetSelect = screen.getByRole('combobox');
      await user.click(targetSelect);

      await waitFor(() => {
        const existingOption = screen.getByText(/메인 지갑.*2/);
        return user.click(existingOption);
      });

      const confirmButton = screen.getAllByRole('button', { name: /가져오기/i }).pop();
      await user.click(confirmButton);

      expect(mockHandlers.onImportWallet).toHaveBeenCalledWith(
        expect.any(Object),
        'wallet-1' // merge into existing wallet
      );
    });

    it('shows error when invalid JSON file is uploaded', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <WalletsCard
          state={mockState}
          walletTotals={mockWalletTotals}
          {...mockHandlers}
        />
      );

      const importButton = screen.getByRole('button', { name: /가져오기/i });

      const file = new File(['invalid json {'], 'wallet.json', { type: 'application/json' });

      const fileInput = importButton.parentElement.querySelector('input[type="file"]');
      await user.upload(fileInput, file);

      await waitForModal();
      expect(screen.getByText(/오류/i)).toBeInTheDocument();
    });

    it('disables new wallet option when MAX_WALLETS reached', async () => {
      const user = userEvent.setup();
      const stateWithMaxWallets = createMockState({
        wallets: Array.from({ length: 5 }, (_, i) => ({
          id: `wallet-${i + 1}`,
          name: `지갑 ${i + 1}`,
          entries: [],
        })),
      });

      renderWithMantine(
        <WalletsCard
          state={stateWithMaxWallets}
          walletTotals={new Map()}
          {...mockHandlers}
        />
      );

      const importButton = screen.getByRole('button', { name: /가져오기/i });

      const fileContent = JSON.stringify({
        wallet: { id: 'imported', name: '가져온 지갑', entries: [] },
      });
      const file = new File([fileContent], 'wallet.json', { type: 'application/json' });

      const fileInput = importButton.parentElement.querySelector('input[type="file"]');
      await user.upload(fileInput, file);

      await waitForModal();

      // "New wallet" option should mention limit
      expect(screen.getByText(/limit reached/i)).toBeInTheDocument();
    });
  });
});
