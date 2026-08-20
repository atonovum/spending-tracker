/**
 * @vitest-environment jsdom
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncCard } from './SyncCard.jsx';
import { renderWithMantine } from './testUtils.jsx';
import { fetchDeployedVersion } from '../lib/appVersion.js';
import { applyServiceWorkerUpdate, checkForServiceWorkerUpdate } from '../lib/swUpdate.js';

vi.mock('../lib/appVersion.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, APP_VERSION: 'aaaaaaa', fetchDeployedVersion: vi.fn() };
});

vi.mock('../lib/swUpdate.js', () => ({
  checkForServiceWorkerUpdate: vi.fn(() => Promise.resolve(true)),
  applyServiceWorkerUpdate: vi.fn(() => Promise.resolve()),
}));

function render(props = {}) {
  return renderWithMantine(
    <SyncCard
      pendingSync={false}
      onSyncNow={vi.fn(() => Promise.resolve(true))}
      onConfirm={vi.fn()}
      onNotify={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchDeployedVersion.mockResolvedValue({ ok: true, reason: 'ok', status: 200, version: 'aaaaaaa', builtAt: null });
});

describe('version reporting', () => {
  it('shows the build the app is running', async () => {
    render();
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument();
    await waitFor(() => expect(fetchDeployedVersion).toHaveBeenCalled());
  });

  it('shows what the server is serving once it answers', async () => {
    fetchDeployedVersion.mockResolvedValue({ ok: true, reason: 'ok', status: 200, version: 'bbbbbbb', builtAt: null });
    render();

    await waitFor(() => expect(screen.getByText('bbbbbbb')).toBeInTheDocument());
  });

  // Each failure asks something different of the user, so each gets its own
  // wording rather than a shared "unavailable".
  it.each([
    ['auth', /로그인 필요/],
    ['missing', /배포본에 없음/],
    ['unreachable', /서버 응답 없음/],
    ['malformed', /형식 오류/],
  ])('names why the deployed version could not be read: %s', async (reason, expected) => {
    fetchDeployedVersion.mockResolvedValue({ ok: false, reason, status: 0, version: null, builtAt: null });
    render();

    await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
  });

  // A 404 says the asset is not in the deployment; a request that never
  // completed says nothing about the server at all. The code is the difference.
  it('shows the status code when there was a response', async () => {
    fetchDeployedVersion.mockResolvedValue({
      ok: false,
      reason: 'unreachable',
      status: 404,
      version: null,
      builtAt: null,
    });
    render();

    await waitFor(() => expect(screen.getByText(/서버 응답 없음 \(404\)/)).toBeInTheDocument());
  });

  it('offers no update when the versions match', async () => {
    render();

    await waitFor(() => expect(fetchDeployedVersion).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /업데이트/ })).not.toBeInTheDocument();
  });
});

describe('applying an update', () => {
  // The manifest only says whether it is worth looking; re-fetching `sw.js` is
  // what actually finds the new build, so both calls have to happen.
  it('re-checks the worker and hands over to it', async () => {
    const user = userEvent.setup();
    fetchDeployedVersion.mockResolvedValue({ ok: true, reason: 'ok', status: 200, version: 'bbbbbbb', builtAt: null });
    render();

    const button = await screen.findByRole('button', { name: /업데이트/ });
    await user.click(button);

    await waitFor(() => expect(checkForServiceWorkerUpdate).toHaveBeenCalledTimes(1));
    expect(applyServiceWorkerUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('manual sync', () => {
  // The two directions are not symmetric on purpose: local -> server happens on
  // its own when a transaction changes, server -> local is this button.
  it('pulls the server document down', async () => {
    const user = userEvent.setup();
    const onSyncNow = vi.fn(() => Promise.resolve(true));
    render({ onSyncNow });

    await user.click(screen.getByRole('button', { name: /지금 동기화/ }));

    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  // Pressing the button is the expression of intent, so nothing is asked when
  // there is nothing to lose.
  it('does not ask first when everything has landed', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render({ onConfirm, pendingSync: false });

    await user.click(screen.getByRole('button', { name: /지금 동기화/ }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('asks first when this device is holding unsent changes', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onSyncNow = vi.fn(() => Promise.resolve(true));
    render({ onConfirm, onSyncNow, pendingSync: true });

    await user.click(screen.getByRole('button', { name: /지금 동기화/ }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmColor: 'red', action: expect.any(Function) })
    );
    // Nothing happens until the confirmation is taken.
    expect(onSyncNow).not.toHaveBeenCalled();

    await onConfirm.mock.calls[0][0].action();
    expect(onSyncNow).toHaveBeenCalledTimes(1);
  });

  it('reports when the server document could not be read', async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    render({ onNotify, onSyncNow: vi.fn(() => Promise.resolve(false)) });

    await user.click(screen.getByRole('button', { name: /지금 동기화/ }));

    await waitFor(() => expect(onNotify).toHaveBeenCalledWith(expect.any(String), false));
  });

  it('reports that this device is holding unsent changes', async () => {
    render({ pendingSync: true });

    expect(screen.getByText(/보내지 못한 변경/)).toBeInTheDocument();
  });

  it('reports being in sync otherwise', async () => {
    render({ pendingSync: false });

    expect(screen.getByText(/서버와 동기화됨/)).toBeInTheDocument();
  });
});
