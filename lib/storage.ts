import { browser } from 'wxt/browser';

// The slice of browser.storage.<area> the selection store and session cache
// use - small enough to fake in unit tests without the extension runtime.
export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export function localArea(): StorageAreaLike {
  return browser.storage.local;
}

// storage.session only exists in Firefox 115+ (Chrome has it since MV3
// launched); without it there's simply no cache and every page runs fresh.
export function sessionArea(): StorageAreaLike | null {
  return browser.storage.session ?? null;
}
