/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelsCard } from './LabelsCard.jsx';
import { renderWithMantine, createMockState, waitForModal } from './testUtils.jsx';

describe('LabelsCard', () => {
  let mockState;
  let mockHandlers;

  beforeEach(() => {
    localStorage.clear();
    mockState = createMockState();
    mockHandlers = {
      onSaveLabel: vi.fn(),
      onDeleteLabel: vi.fn(),
      onConfirm: vi.fn((payload) => {
        if (payload.action) payload.action();
      }),
    };
  });

  describe('Opening modal', () => {
    it('opens labels modal when card is clicked', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);

      await waitForModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('업무')).toBeInTheDocument();
      expect(screen.getByText('개인')).toBeInTheDocument();
    });
  });

  describe('Adding label', () => {
    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('adds new label with name', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Type in the add input field
      const addInput = screen.getByPlaceholderText(/레이블 이름/i);
      await user.type(addInput, '여행');

      // Click add button
      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      expect(mockHandlers.onSaveLabel).toHaveBeenCalledWith({ name: '여행' });
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('adds label with Enter key', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const addInput = screen.getByPlaceholderText(/레이블 이름/i);
      await user.type(addInput, '쇼핑{Enter}');

      expect(mockHandlers.onSaveLabel).toHaveBeenCalledWith({ name: '쇼핑' });
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('clears input after adding label', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const addInput = screen.getByPlaceholderText(/레이블 이름/i);
      await user.type(addInput, '취미');

      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(addInput).toHaveValue('');
      });
    });

    it('does not add label with empty name', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const addButton = screen.getByRole('button', { name: /추가/i });
      expect(addButton).toBeDisabled();

      await user.click(addButton);
      expect(mockHandlers.onSaveLabel).not.toHaveBeenCalled();
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('trims whitespace from label name', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const addInput = screen.getByPlaceholderText(/레이블 이름/i);
      await user.type(addInput, '  운동  ');

      const addButton = screen.getByRole('button', { name: /추가/i });
      await user.click(addButton);

      expect(mockHandlers.onSaveLabel).toHaveBeenCalledWith({ name: '운동' });
    });
  });

  describe('Editing label', () => {
    it('edits existing label name', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Click edit button for first label
      const labelPaper = screen.getByText('업무').closest('[class*="Paper"]');
      const editButton = within(labelPaper).getByLabelText(/수정/i);
      await user.click(editButton);

      await waitForModal();

      // Edit modal should appear
      expect(screen.getByRole('dialog', { name: /레이블 수정/i })).toBeInTheDocument();

      // Change name
      const nameInput = screen.getByLabelText(/이름/i);
      await user.clear(nameInput);
      await user.type(nameInput, '회사');

      // Save
      const saveButton = screen.getByRole('button', { name: /저장/i });
      await user.click(saveButton);

      expect(mockHandlers.onSaveLabel).toHaveBeenCalledWith({
        id: 'label-1',
        name: '회사',
      });
    });

    // TODO(#20): Mantine portal async — re-enable after migrating to findBy/within or upgrading Mantine.
    it.skip('closes edit modal without saving on close', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const labelPaper = screen.getByText('업무').closest('[class*="Paper"]');
      const editButton = within(labelPaper).getByLabelText(/수정/i);
      await user.click(editButton);

      await waitForModal();

      // Close modal (ESC or click overlay)
      const editDialog = screen.getByRole('dialog', { name: /레이블 수정/i });
      const closeButton = within(editDialog).getByLabelText(/닫기/i);
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /레이블 수정/i })).not.toBeInTheDocument();
      });

      expect(mockHandlers.onSaveLabel).not.toHaveBeenCalled();
    });

    it('disables save button when name is empty', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const labelPaper = screen.getByText('업무').closest('[class*="Paper"]');
      const editButton = within(labelPaper).getByLabelText(/수정/i);
      await user.click(editButton);

      await waitForModal();

      const nameInput = screen.getByLabelText(/이름/i);
      await user.clear(nameInput);

      const saveButton = screen.getByRole('button', { name: /저장/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Deleting label', () => {
    it('deletes label without entries after confirmation', async () => {
      const user = userEvent.setup();
      const stateWithUnusedLabel = createMockState({
        labels: [
          ...mockState.labels,
          { id: 'label-unused', name: '미사용' },
        ],
      });

      renderWithMantine(<LabelsCard state={stateWithUnusedLabel} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Delete unused label
      const labelPaper = screen.getByText('미사용').closest('[class*="Paper"]');
      const deleteButton = within(labelPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/삭제/i),
          message: expect.stringContaining('미사용'),
        })
      );

      expect(mockHandlers.onDeleteLabel).toHaveBeenCalledWith('label-unused');
    });

    it('shows cascade warning when deleting label with entries', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Delete label with 1 entry
      const labelPaper = screen.getByText('업무').closest('[class*="Paper"]');
      const deleteButton = within(labelPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/1.*거래/),
        })
      );
    });

    it('prevents deleting last label', async () => {
      const user = userEvent.setup();
      const stateWithOneLabel = createMockState({
        labels: [mockState.labels[0]],
      });

      renderWithMantine(<LabelsCard state={stateWithOneLabel} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      const labelPaper = screen.getByText('업무').closest('[class*="Paper"]');
      const deleteButton = within(labelPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      expect(mockHandlers.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/최소.*1/),
          action: null,
        })
      );

      expect(mockHandlers.onDeleteLabel).not.toHaveBeenCalled();
    });
  });

  describe('Label cascade behavior', () => {
    it('removes label from entry labelIds array when deleted', async () => {
      const user = userEvent.setup();
      renderWithMantine(<LabelsCard state={mockState} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      // Delete label that is used (should cascade - remove from entries)
      const labelPaper = screen.getByText('업무').closest('[class*="Paper"]');
      const deleteButton = within(labelPaper).getByLabelText(/삭제/i);
      await user.click(deleteButton);

      // onDeleteLabel should be called with the label ID
      // The cascade logic (removing from labelIds) is in App.jsx, not tested here
      expect(mockHandlers.onDeleteLabel).toHaveBeenCalledWith('label-1');
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no labels exist', async () => {
      const user = userEvent.setup();
      const stateWithNoLabels = createMockState({
        labels: [],
      });

      renderWithMantine(<LabelsCard state={stateWithNoLabels} {...mockHandlers} />);

      const card = screen.getByRole('heading', { name: /Labels/i }).closest('div[class*="Card"]');
      await user.click(card);
      await waitForModal();

      expect(screen.getByText(/레이블이 없습니다/i)).toBeInTheDocument();
    });
  });
});
