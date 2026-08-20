/**
 * @vitest-environment jsdom
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SignOutButton } from './SignOutButton.jsx';
import { renderWithMantine } from './testUtils.jsx';

function render(props = {}) {
  return renderWithMantine(
    <SignOutButton pendingSync={false} onConfirm={vi.fn()} {...props} />
  );
}

describe('SignOutButton', () => {
  it('asks before ending the session', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render({ onConfirm });

    await user.click(screen.getByRole('button', { name: /로그아웃/ }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmColor: 'red', action: expect.any(Function) })
    );
  });

  // Signing out with unsent edits risks the only copy of them, so the warning
  // has to lead with that rather than the routine wording.
  it('warns about unsent changes in the confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render({ onConfirm, pendingSync: true });

    await user.click(screen.getByRole('button', { name: /로그아웃/ }));

    expect(onConfirm.mock.calls[0][0].message).toMatch(/서버로 못 보낸 변경/);
  });

  it('uses the routine wording when everything has landed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render({ onConfirm, pendingSync: false });

    await user.click(screen.getByRole('button', { name: /로그아웃/ }));

    expect(onConfirm.mock.calls[0][0].message).toMatch(/로그인 세션을 끝냅니다/);
  });

  // The service worker's SPA fallback answered every same-origin navigation
  // with the cached index.html, so this request never left the device.
  it('navigates to the Access logout endpoint on confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render({ onConfirm });

    await user.click(screen.getByRole('button', { name: /로그아웃/ }));

    const assigned = [];
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    delete window.location;
    window.location = { set href(value) { assigned.push(value); } };
    try {
      onConfirm.mock.calls[0][0].action();
    } finally {
      if (original) Object.defineProperty(window, 'location', original);
    }

    expect(assigned).toEqual(['/cdn-cgi/access/logout']);
  });
});
