import type { StorageAreaLike } from './storage';

// Local-only history of detected egress IPs: storage.local, never
// transmitted, bounded, erasable with one call. See the ip-history spec.

const KEY = 'ip-history';
export const HISTORY_MAX_ENTRIES = 20;

export interface HistoryEntry {
  checkedAt: number;
  addresses: string[];
}

function isEntry(value: unknown): value is HistoryEntry {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.checkedAt === 'number' &&
    Array.isArray(entry.addresses) &&
    entry.addresses.every((address) => typeof address === 'string')
  );
}

export async function readHistory(local: StorageAreaLike): Promise<HistoryEntry[]> {
  const stored = (await local.get(KEY))[KEY];
  return Array.isArray(stored) ? stored.filter(isEntry) : [];
}

// Newest first. A run identical to the newest entry is not appended -
// rechecking an unchanged setup must not flood the bound.
export async function appendHistory(
  local: StorageAreaLike,
  addresses: string[],
  checkedAt: number = Date.now(),
): Promise<void> {
  const unique = [...new Set(addresses)].sort();
  if (unique.length === 0) return;

  const history = await readHistory(local);
  const newest = history[0];
  if (newest && JSON.stringify([...newest.addresses].sort()) === JSON.stringify(unique)) return;

  await local.set({ [KEY]: [{ checkedAt, addresses: unique }, ...history].slice(0, HISTORY_MAX_ENTRIES) });
}

export async function clearHistory(local: StorageAreaLike): Promise<void> {
  await local.remove(KEY);
}
