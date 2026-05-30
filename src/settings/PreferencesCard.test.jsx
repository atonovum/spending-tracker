/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreferencesCard } from './PreferencesCard.jsx';
import { renderWithMantine } from './testUtils.jsx';

describe('PreferencesCard', () => {
  let mockHandlers;

  beforeEach(() => {
    localStorage.clear();
    mockHandlers = {
      onLanguageChange: vi.fn(),
    };
  });

  describe('Language toggle', () => {
    it('displays current language', async () => {
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('textbox');
      expect(languageSelect).toHaveValue('한국어');
    });

    it('toggles from Korean to English', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('textbox');
      await user.click(languageSelect);

      const enOption = await screen.findByRole('option', { name: /english/i });
      await user.click(enOption);

      expect(mockHandlers.onLanguageChange).toHaveBeenCalledWith('en');
    });

    it('toggles from English to Korean', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="en" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('textbox');
      await user.click(languageSelect);

      const koOption = await screen.findByRole('option', { name: /한국어/i });
      await user.click(koOption);

      expect(mockHandlers.onLanguageChange).toHaveBeenCalledWith('ko');
    });

    it('persists language change to localStorage', async () => {
      const user = userEvent.setup();

      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('textbox');
      await user.click(languageSelect);

      const enOption = await screen.findByRole('option', { name: /english/i });
      await user.click(enOption);

      expect(mockHandlers.onLanguageChange).toHaveBeenCalledWith('en');
    });

    it('immediately reflects language change in UI', async () => {
      const user = userEvent.setup();
      const { rerender } = renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('textbox');
      expect(languageSelect).toHaveValue('한국어');

      await user.click(languageSelect);
      const enOption = await screen.findByRole('option', { name: /english/i });
      await user.click(enOption);

      rerender(<PreferencesCard language="en" {...mockHandlers} />);

      // The Select textbox displays the label of the new value.
      expect(await screen.findByRole('textbox')).toHaveValue('English');
    });
  });

  describe('Rendering', () => {
    it('renders preferences title', () => {
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      expect(screen.getByRole('heading', { name: /Preferences/i })).toBeInTheDocument();
    });

    it('renders language label', () => {
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      expect(screen.getByText(/언어/i)).toBeInTheDocument();
    });

    it('does not allow deselecting language', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('textbox');
      expect(languageSelect).toBeInTheDocument();

      await user.click(languageSelect);
      const koOption = await screen.findByRole('option', { name: /한국어/i });
      await user.click(koOption);

      // allowDeselect={false} — select always has a value (label shown)
      expect(languageSelect).toHaveValue('한국어');
    });
  });
});
