const MISSING = Symbol("missing");

export function sameDocumentContent(left, right) {
  return deepEqual(documentContent(left), documentContent(right));
}

export function threeWayMerge(base, local, remote) {
  const conflicts = [];
  const merged = mergeValue(documentContent(base), documentContent(local), documentContent(remote), "", conflicts);
  const state = {
    ...merged,
    version: Math.max(Number(base?.version) || 0, Number(local?.version) || 0, Number(remote?.version) || 0),
    selectedWalletId: selectedWallet(local, merged.wallets),
    updatedAt: typeof remote?.updatedAt === "number" ? remote.updatedAt : 0,
  };
  validateReferences(state, conflicts);
  return conflicts.length ? { ok: false, conflicts: [...new Set(conflicts)] } : { ok: true, state };
}

export function reconcileDocuments({ base, local, remote, localDirty }) {
  if (!remote) return { type: "push", reason: "remote-empty", state: local };

  if (base) {
    const merged = threeWayMerge(base, local, remote);
    if (!merged.ok) return { type: "conflict", reason: "concurrent-change", conflicts: merged.conflicts };
    if (sameDocumentContent(merged.state, remote)) {
      return { type: "adopt", reason: "remote-only", state: merged.state };
    }
    return { type: "push", reason: "merged", state: merged.state };
  }

  const state = { ...remote, selectedWalletId: selectedWallet(local, remote.wallets) };
  if (sameDocumentContent(local, remote)) return { type: "adopt", reason: "same-content", state };

  const localRevision = revisionOf(local);
  const remoteRevision = revisionOf(remote);
  if (localRevision === remoteRevision) {
    return { type: "push", reason: "same-revision-local-divergence", state: local };
  }
  if (localDirty) return { type: "conflict", reason: "missing-base", conflicts: ["document"] };
  if (localRevision > remoteRevision) return { type: "push", reason: "local-newer", state: local };
  return { type: "adopt", reason: "remote-authoritative", state };
}

function documentContent(state) {
  if (!state || typeof state !== "object") return state;
  const { updatedAt: _updatedAt, selectedWalletId: _selectedWalletId, ...content } = state;
  return content;
}

function revisionOf(state) {
  return typeof state?.updatedAt === "number" && Number.isFinite(state.updatedAt) ? state.updatedAt : 0;
}

function selectedWallet(local, wallets) {
  const ids = new Set((wallets || []).map((wallet) => wallet.id));
  return ids.has(local?.selectedWalletId) ? local.selectedWalletId : wallets?.[0]?.id || "";
}

function mergeValue(base, local, remote, path, conflicts) {
  if (deepEqual(local, remote)) return local;
  if (deepEqual(local, base)) return remote;
  if (deepEqual(remote, base)) return local;
  if (base === MISSING || local === MISSING || remote === MISSING) {
    conflicts.push(path);
    return local === MISSING ? remote : local;
  }
  if (isEntityCollection(base, local, remote)) {
    return mergeEntityCollection(base, local, remote, path, conflicts);
  }
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      const value = mergeValue(valueAt(base, key), valueAt(local, key), valueAt(remote, key), childPath(path, key), conflicts);
      if (value !== MISSING) result[key] = value;
    }
    return result;
  }
  conflicts.push(path);
  return local;
}

function mergeEntityCollection(base, local, remote, path, conflicts) {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const ids = [...localById.keys(), ...remoteById.keys()].filter((id, index, all) => all.indexOf(id) === index);
  const result = [];
  for (const id of ids) {
    const value = mergeValue(
      baseById.has(id) ? baseById.get(id) : MISSING,
      localById.has(id) ? localById.get(id) : MISSING,
      remoteById.has(id) ? remoteById.get(id) : MISSING,
      `${path}[${id}]`,
      conflicts,
    );
    if (value !== MISSING) result.push(value);
  }
  return result;
}

function isEntityCollection(...values) {
  if (!values.every(Array.isArray)) return false;
  const items = values.flat();
  return items.length > 0 && items.every((item) => isPlainObject(item) && typeof item.id === "string" && item.id);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && value !== MISSING;
}

function valueAt(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : MISSING;
}

function childPath(path, key) {
  return path ? `${path}.${key}` : key;
}

function deepEqual(left, right) {
  if (left === right) return true;
  if (left === MISSING || right === MISSING) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (isPlainObject(left) || isPlainObject(right)) {
    if (!isPlainObject(left) || !isPlainObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
  }
  return false;
}

function validateReferences(state, conflicts) {
  const categoryIds = new Set((state.categories || []).map((category) => category.id));
  const labelIds = new Set((state.labels || []).map((label) => label.id));
  for (const wallet of state.wallets || []) {
    for (const collection of ["entries", "scheduled"]) {
      for (const item of wallet[collection] || []) {
        const path = `wallets[${wallet.id}].${collection}[${item.id}]`;
        if (!categoryIds.has(item.categoryId)) conflicts.push(`${path}.categoryId`);
        for (const labelId of item.labelIds || []) {
          if (!labelIds.has(labelId)) conflicts.push(`${path}.labelIds`);
        }
      }
    }
  }
}
