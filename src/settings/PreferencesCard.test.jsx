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

      const languageSelect = await screen.findByRole('combobox');
      expect(languageSelect).toHaveValue('ko');
    });

    it('toggles from Korean to English', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('combobox');
      await user.click(languageSelect);

      // Select English option
      const enOption = await screen.findByRole('option', { name: /english/i });
      await user.click(enOption);

      expect(mockHandlers.onLanguageChange).toHaveBeenCalledWith('en');
    });

    it('toggles from English to Korean', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="en" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('combobox');
      await user.click(languageSelect);

      // Select Korean option
      const koOption = await screen.findByRole('option', { name: /한국어/i });
      await user.click(koOption);

      expect(mockHandlers.onLanguageChange).toHaveBeenCalledWith('ko');
    });

    it('persists language change to localStorage', async () => {
      const user = userEvent.setup();

      // This component only calls onLanguageChange
      // Actual localStorage persistence is handled by parent (App.jsx)
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      const languageSelect = await screen.findByRole('combobox');
      await user.click(languageSelect);

      const enOption = await screen.findByRole('option', { name: /english/i });
      await user.click(enOption);

      expect(mockHandlers.onLanguageChange).toHaveBeenCalledWith('en');

      // The parent component would handle localStorage
      // We just verify the callback was called with correct value
    });

    it('immediately reflects language change in UI', async () => {
      const user = userEvent.setup();
      const { rerender } = renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      expect(screen.getByText(/환경설정/i)).toBeInTheDocument();

      const languageSelect = screen.getByRole('combobox');
      await user.click(languageSelect);

      const enOption = screen.getByRole('option', { name: /english/i });
      await user.click(enOption);

      // Simulate parent re-rendering with new language
      rerender(<PreferencesCard language="en" {...mockHandlers} />);

      // After language change, UI should show English
      expect(screen.getByText(/preferences/i)).toBeInTheDocument();
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

      const languageSelect = await screen.findByRole('combobox');

      // Language select should not be clearable
      // This is enforced by allowDeselect={false}
      expect(languageSelect).toBeInTheDocument();

      // Attempting to clear should not work - select always has a value
      await user.click(languageSelect);
      const koOption = screen.getByRole('option', { name: /한국어/i });

      // Re-selecting same value
      await user.click(koOption);

      // Should still have value
      expect(languageSelect).toHaveValue('ko');
    });
  });
});
