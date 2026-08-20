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
      onSyncNow={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchDeployedVersion.mockResolvedValue({ ok: true, version: 'aaaaaaa', builtAt: null });
});

describe('version reporting', () => {
  it('shows the build the app is running', async () => {
    render();
    expect(screen.getByText('aaaaaaa')).toBeInTheDocument();
    await waitFor(() => expect(fetchDeployedVersion).toHaveBeenCalled());
  });

  it('shows what the server is serving once it answers', async () => {
    fetchDeployedVersion.mockResolvedValue({ ok: true, version: 'bbbbbbb', builtAt: null });
    render();

    await waitFor(() => expect(screen.getByText('bbbbbbb')).toBeInTheDocument());
  });

  it('says so when the server cannot be reached', async () => {
    fetchDeployedVersion.mockResolvedValue({ ok: false, version: null, builtAt: null });
    render();

    await waitFor(() => expect(screen.getByText(/확인 불가/)).toBeInTheDocument());
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
    fetchDeployedVersion.mockResolvedValue({ ok: true, version: 'bbbbbbb', builtAt: null });
    render();

    const button = await screen.findByRole('button', { name: /업데이트/ });
    await user.click(button);

    await waitFor(() => expect(checkForServiceWorkerUpdate).toHaveBeenCalledTimes(1));
    expect(applyServiceWorkerUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('manual sync', () => {
  it('re-reads the server on demand', async () => {
    const user = userEvent.setup();
    const onSyncNow = vi.fn(() => Promise.resolve());
    render({ onSyncNow });

    await user.click(screen.getByRole('button', { name: /지금 동기화/ }));

    expect(onSyncNow).toHaveBeenCalledTimes(1);
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
