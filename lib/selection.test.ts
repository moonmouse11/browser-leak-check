import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_SOURCES, DNS_SOURCE, HTTP_SOURCES, STUN_SOURCES } from './config';
import {
  loadSelection,
  recommendedSelection,
  saveSelection,
  selectedSources,
  validateSelection,
} from './selection';
import { readCache, writeCache } from './session-cache';
import type { StorageAreaLike } from './storage';
import type { CheckResults } from './checks';

function fakeArea(initial: Record<string, unknown> = {}): StorageAreaLike & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(key) {
      delete data[key];
    },
  };
}

const [first, second, third] = HTTP_SOURCES.map((source) => source.id);

describe('recommendedSelection', () => {
  it('is ipify, icanhazip, Cloudflare and ident.me plus every STUN server and bash.ws', () => {
    expect(recommendedSelection().sort()).toEqual(
      ['ipify', 'icanhazip', 'cloudflare-trace', 'ident-me', ...STUN_SOURCES.map((s) => s.id), DNS_SOURCE.id].sort(),
    );
  });

  it('is itself a valid selection', () => {
    expect(validateSelection(recommendedSelection()).valid).toBe(true);
  });
});

describe('validateSelection', () => {
  it('needs at least two ip-echo services', () => {
    expect(validateSelection([first!]).valid).toBe(false);
    expect(validateSelection([first!, first!]).valid).toBe(false);
    expect(validateSelection([first!, ...STUN_SOURCES.map((s) => s.id), DNS_SOURCE.id]).valid).toBe(false);
    expect(validateSelection([first!, second!]).valid).toBe(true);
  });

  it('allows zero STUN servers and no DNS check', () => {
    expect(validateSelection([first!, second!]).valid).toBe(true);
  });
});

describe('loadSelection / saveSelection', () => {
  it('returns null on first run', async () => {
    expect(await loadSelection(fakeArea())).toBeNull();
  });

  it('round-trips a saved selection and records every registry id as known', async () => {
    const local = fakeArea();

    await saveSelection([first!, second!, DNS_SOURCE.id], { local, session: null });

    expect(await loadSelection(local)).toEqual({
      selected: [first, second, DNS_SOURCE.id],
      knownIds: ALL_SOURCES.map((source) => source.id),
      valid: true,
    });
  });

  it('refuses to save fewer than two ip-echo services', async () => {
    const local = fakeArea();

    await expect(saveSelection([first!], { local, session: null })).rejects.toThrow(/at least 2/);
    expect(local.data).toEqual({});
  });

  it('keeps a source added by an update deselected', async () => {
    // Saved before `third` existed: it's neither selected nor known.
    const local = fakeArea({
      selection: { version: 1, selected: [first, second], knownIds: [first, second] },
    });

    const loaded = await loadSelection(local);

    expect(loaded?.selected).toEqual([first, second]);
    expect(loaded?.selected).not.toContain(third);
    expect(loaded?.knownIds).not.toContain(third);
  });

  it('drops a selected source the registry no longer has', async () => {
    const local = fakeArea({
      selection: { version: 1, selected: [first, second, third, 'retired-service'], knownIds: [] },
    });

    expect((await loadSelection(local))?.selected).toEqual([first, second, third]);
  });

  it('marks the selection invalid when removals leave fewer than two ip-echo services', async () => {
    const local = fakeArea({
      selection: { version: 1, selected: [first, 'retired-service'], knownIds: [] },
    });

    expect((await loadSelection(local))?.valid).toBe(false);
  });

  it('treats a malformed stored value as no selection', async () => {
    expect(await loadSelection(fakeArea({ selection: { selected: 'ipify' } }))).toBeNull();
  });

  it('never touches sync storage anywhere in the extension', () => {
    // The storage API above only accepts a local area; this guards against
    // some other module reaching for browser.storage.sync directly.
    const offenders = ['lib', 'entrypoints']
      .flatMap((dir) => readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((f) => join(dir, f)))
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .filter((file) => /storage\s*\.\s*sync/.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('empties the session cache when a selection is saved', async () => {
    const local = fakeArea();
    const session = fakeArea();
    await writeCache(session, { checkedAt: 1 } as CheckResults);

    await saveSelection([first!, second!], { local, session });

    expect(await readCache(session)).toBeNull();
  });
});

describe('selectedSources', () => {
  it('splits a selection by kind, in registry order', () => {
    const sources = selectedSources([second!, first!, STUN_SOURCES[0]!.id]);

    expect(sources.http.map((source) => source.id)).toEqual([first, second]);
    expect(sources.stun.map((source) => source.id)).toEqual([STUN_SOURCES[0]!.id]);
    expect(sources.dns).toBe(false);
  });
});
