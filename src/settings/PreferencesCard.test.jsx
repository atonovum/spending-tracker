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

  function getSelectInputByLabel(label) {
    return screen.getAllByLabelText(label).find((element) => element.tagName === 'INPUT');
  }

  beforeEach(() => {
    localStorage.clear();
    mockHandlers = {
      onLanguageChange: vi.fn(),
      onCurrencyChange: vi.fn(),
    };
  });

  describe('Language toggle', () => {
    it('displays current language', async () => {
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      await screen.findByDisplayValue('한국어');
      const languageSelect = getSelectInputByLabel(/언어/i);
      expect(languageSelect).toHaveValue('한국어');
    });

    it('toggles from Korean to English', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      await screen.findByDisplayValue('한국어');
      const languageSelect = getSelectInputByLabel(/언어/i);
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

      await screen.findByDisplayValue('English');
      const languageSelect = getSelectInputByLabel(/언어|language/i);
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

      await screen.findByDisplayValue('한국어');
      const languageSelect = getSelectInputByLabel(/언어/i);
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

      await screen.findByDisplayValue('한국어');
      const languageSelect = getSelectInputByLabel(/언어/i);
      expect(languageSelect).toHaveValue('한국어');

      await user.click(languageSelect);
      const enOption = await screen.findByRole('option', { name: /english/i });
      await user.click(enOption);

      rerender(<PreferencesCard language="en" {...mockHandlers} />);

      // The Select textbox displays the label of the new value.
      expect(await screen.findByDisplayValue('English')).toHaveValue('English');
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

    // Currency moved to the wallet card in v5: it varies per wallet, so it must
    // not reappear as a document-wide preference here.
    it('does not offer a document-wide currency setting', () => {
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      expect(screen.queryByText(/통화/i)).not.toBeInTheDocument();
    });

    it('does not allow deselecting language', async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <PreferencesCard language="ko" {...mockHandlers} />
      );

      await screen.findByDisplayValue('한국어');
      const languageSelect = getSelectInputByLabel(/언어/i);
      expect(languageSelect).toBeInTheDocument();

      await user.click(languageSelect);
      const koOption = await screen.findByRole('option', { name: /한국어/i });
      await user.click(koOption);

      // allowDeselect={false} — select always has a value (label shown)
      expect(languageSelect).toHaveValue('한국어');
    });
  });
});
