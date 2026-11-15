import { afterEach, describe, expect, it, vi } from 'vitest';
import { appendHistory, clearHistory, HISTORY_MAX_ENTRIES, readHistory } from './ip-history';
import type { StorageAreaLike } from './storage';

function fakeStorage(): StorageAreaLike & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key: string) => ({ [key]: data[key] }),
    set: async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    },
    remove: async (key: string) => {
      delete data[key];
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ip history', () => {
  it('appends newest-first with a timestamp and deduped addresses', async () => {
    const storage = fakeStorage();

    await appendHistory(storage, ['203.0.113.9', '203.0.113.9'], 1000);
    await appendHistory(storage, ['198.51.100.7'], 2000);

    const history = await readHistory(storage);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ checkedAt: 2000, addresses: ['198.51.100.7'] });
    expect(history[1]).toEqual({ checkedAt: 1000, addresses: ['203.0.113.9'] });
  });

  it('skips a run identical to the newest entry', async () => {
    const storage = fakeStorage();

    await appendHistory(storage, ['203.0.113.9'], 1000);
    await appendHistory(storage, ['203.0.113.9'], 2000);

    expect(await readHistory(storage)).toHaveLength(1);
  });

  it('drops the oldest entries beyond the bound', async () => {
    const storage = fakeStorage();

    for (let i = 0; i < HISTORY_MAX_ENTRIES + 3; i++) {
      await appendHistory(storage, [`203.0.113.${i}`], i);
    }

    const history = await readHistory(storage);
    expect(history).toHaveLength(HISTORY_MAX_ENTRIES);
    expect(history.at(-1)?.addresses).toEqual(['203.0.113.3']);
  });

  it('clears completely', async () => {
    const storage = fakeStorage();
    await appendHistory(storage, ['203.0.113.9']);

    await clearHistory(storage);

    expect(await readHistory(storage)).toEqual([]);
  });

  it('ignores malformed stored data', async () => {
    const storage = fakeStorage();
    storage.data['ip-history'] = [{ nope: true }, 'junk', { checkedAt: 1, addresses: ['203.0.113.9'] }];

    expect(await readHistory(storage)).toEqual([{ checkedAt: 1, addresses: ['203.0.113.9'] }]);
  });

  it('never touches the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const storage = fakeStorage();

    await appendHistory(storage, ['203.0.113.9']);
    await readHistory(storage);
    await clearHistory(storage);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
