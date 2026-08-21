import { describe, expect, it } from 'vitest';

import { reconcileDocuments, sameDocumentContent, threeWayMerge } from './syncMerge.js';

function entry(id, overrides = {}) {
  return {
    id,
    date: '2026-08-20',
    amount: 1000,
    categoryId: 'food',
    labelIds: [],
    note: '',
    ...overrides,
  };
}

function doc(entries, updatedAt = 1000, overrides = {}) {
  return {
    version: 5,
    selectedWalletId: 'wallet-1',
    language: 'ko',
    wallets: [{
      id: 'wallet-1',
      name: '생활비',
      currency: 'KRW',
      entries,
      scheduled: [],
    }],
    categories: [{ id: 'food', name: '식비', type: 'expense', color: '#000000', icon: 'food' }],
    labels: [],
    updatedAt,
    ...overrides,
  };
}

function idsOf(state) {
  return state.wallets[0].entries.map((item) => item.id);
}

describe('sameDocumentContent', () => {
  it('ignores the document revision but not user data', () => {
    expect(sameDocumentContent(doc([entry('a')], 1000), doc([entry('a')], 9000))).toBe(true);
    expect(sameDocumentContent(doc([entry('a')], 1000), doc([entry('a', { amount: 2000 })], 1000))).toBe(false);
  });

});

describe('threeWayMerge', () => {
  it('uploads a transaction added only on the offline device', () => {
    const base = doc([entry('a')]);
    const local = doc([entry('offline-new'), entry('a')]);
    const remote = doc([entry('a')], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(idsOf(result.state)).toEqual(['offline-new', 'a']);
  });

  it('downloads a transaction added only on the server', () => {
    const base = doc([entry('a')]);
    const local = doc([entry('a')]);
    const remote = doc([entry('remote-new'), entry('a')], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(idsOf(result.state)).toEqual(['remote-new', 'a']);
  });

  it('keeps independent additions from both devices without duplicates', () => {
    const base = doc([entry('a')]);
    const local = doc([entry('local-new'), entry('a')]);
    const remote = doc([entry('remote-new'), entry('a')], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(idsOf(result.state)).toEqual(['local-new', 'a', 'remote-new']);
    expect(new Set(idsOf(result.state)).size).toBe(3);
  });

  it('merges edits to different fields of the same transaction', () => {
    const base = doc([entry('a')]);
    const local = doc([entry('a', { note: '점심' })]);
    const remote = doc([entry('a', { amount: 1500 })], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(result.state.wallets[0].entries[0]).toMatchObject({ note: '점심', amount: 1500 });
  });

  it('reports a conflict when both devices edit the same field differently', () => {
    const base = doc([entry('a')]);
    const local = doc([entry('a', { amount: 1200 })]);
    const remote = doc([entry('a', { amount: 1500 })], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContain('wallets[wallet-1].entries[a].amount');
  });

  it('propagates a local deletion when the server copy is unchanged', () => {
    const base = doc([entry('a'), entry('b')]);
    const local = doc([entry('b')]);
    const remote = doc([entry('a'), entry('b')], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(idsOf(result.state)).toEqual(['b']);
  });

  it('accepts a remote deletion when the local copy is unchanged', () => {
    const base = doc([entry('a'), entry('b')]);
    const local = doc([entry('a'), entry('b')]);
    const remote = doc([entry('b')], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(idsOf(result.state)).toEqual(['b']);
  });

  it('does not silently choose between deleting and editing the same transaction', () => {
    const base = doc([entry('a')]);
    const local = doc([]);
    const remote = doc([entry('a', { note: '노트북 수정' })], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContain('wallets[wallet-1].entries[a]');
  });

  it('deduplicates the same id when both copies added identical content', () => {
    const base = doc([]);
    const local = doc([entry('same')]);
    const remote = doc([entry('same')], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(idsOf(result.state)).toEqual(['same']);
  });

  it('rejects an id collision with different content', () => {
    const base = doc([]);
    const local = doc([entry('same', { note: '휴대폰' })]);
    const remote = doc([entry('same', { note: '노트북' })], 2000);

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContain('wallets[wallet-1].entries[same]');
  });

  it('rejects a merged transaction whose category was deleted remotely', () => {
    const base = doc([]);
    const local = doc([entry('offline-new')]);
    const remote = doc([], 2000, { categories: [] });

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(false);
    expect(result.conflicts).toContain('wallets[wallet-1].entries[offline-new].categoryId');
  });

  it('keeps the selected wallet local because it is a device preference', () => {
    const wallet2 = { id: 'wallet-2', name: '여행', currency: 'KRW', entries: [], scheduled: [] };
    const base = doc([], 1000, { wallets: [...doc([]).wallets, wallet2] });
    const local = { ...base, selectedWalletId: 'wallet-2' };
    const remote = { ...base, selectedWalletId: 'wallet-1', updatedAt: 2000 };

    const result = threeWayMerge(base, local, remote);

    expect(result.ok).toBe(true);
    expect(result.state.selectedWalletId).toBe('wallet-2');
  });
});

describe('reconcileDocuments', () => {
  it('recovers a legacy untracked local edit when revisions match', () => {
    const local = doc([entry('offline-new'), entry('a')], 1000);
    const remote = doc([entry('a')], 1000);

    expect(reconcileDocuments({ base: null, local, remote, localDirty: false })).toMatchObject({
      type: 'push',
      reason: 'same-revision-local-divergence',
    });
  });

  it('adopts a newer server document when no local edit is pending', () => {
    const local = doc([entry('a')], 1000);
    const remote = doc([entry('remote-new'), entry('a')], 2000);

    expect(reconcileDocuments({ base: null, local, remote, localDirty: false })).toMatchObject({
      type: 'adopt',
      reason: 'remote-authoritative',
    });
  });

  it('keeps local data when both sides changed but no base snapshot exists', () => {
    const local = doc([entry('local-new'), entry('a')], 1000);
    const remote = doc([entry('remote-new'), entry('a')], 2000);

    expect(reconcileDocuments({ base: null, local, remote, localDirty: true })).toMatchObject({
      type: 'conflict',
      reason: 'missing-base',
    });
  });

  it('pushes the merged document when both sides changed independently', () => {
    const base = doc([entry('a')], 1000);
    const local = doc([entry('local-new'), entry('a')], 1000);
    const remote = doc([entry('remote-new'), entry('a')], 2000);

    const result = reconcileDocuments({ base, local, remote, localDirty: true });

    expect(result.type).toBe('push');
    expect(idsOf(result.state)).toEqual(['local-new', 'a', 'remote-new']);
  });

  it('adopts without writing when only the server changed', () => {
    const base = doc([entry('a')], 1000);
    const local = doc([entry('a')], 1000);
    const remote = doc([entry('remote-new'), entry('a')], 2000);

    expect(reconcileDocuments({ base, local, remote, localDirty: false })).toMatchObject({
      type: 'adopt',
      reason: 'remote-only',
    });
  });

  it('seeds an empty server from the local document', () => {
    expect(reconcileDocuments({ base: null, local: doc([entry('a')]), remote: null, localDirty: false })).toMatchObject({
      type: 'push',
      reason: 'remote-empty',
    });
  });
});
