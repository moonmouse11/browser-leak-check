import {
  ALL_SOURCES,
  DNS_SOURCE,
  HTTP_SOURCES,
  STUN_SOURCES,
  type HttpSource,
  type StunSource,
} from './config';
import { clearCache } from './session-cache';
import type { StorageAreaLike } from './storage';

// Which third-party sources the user allows the extension to contact.
// Stored in storage.local only: sync storage would send the list of
// services the user trusts to their Google / Firefox account.
const KEY = 'selection';

// Comparing addresses needs at least two IP-echo services.
export const MIN_HTTP_SOURCES = 2;

interface StoredSelection {
  version: 1;
  selected: string[];
  // Every registry id the user was shown when saving. A registry id not in
  // here was added by a later update, so it stays unselected until the user
  // opts in - and the selection UI can mark it as new.
  knownIds: string[];
}

export interface LoadedSelection {
  selected: string[];
  knownIds: string[];
  // False when a registry update left fewer than MIN_HTTP_SOURCES selected
  // IP-echo services - the popup then shows the selection screen again.
  valid: boolean;
}

export type SelectionValidation = { valid: true } | { valid: false; reason: string };

const REGISTRY_IDS = new Set(ALL_SOURCES.map((source) => source.id));
const HTTP_IDS = new Set(HTTP_SOURCES.map((source) => source.id));

export function recommendedSelection(): string[] {
  return ALL_SOURCES.filter((source) => source.recommended).map((source) => source.id);
}

export function validateSelection(ids: Iterable<string>): SelectionValidation {
  const httpCount = [...new Set(ids)].filter((id) => HTTP_IDS.has(id)).length;
  if (httpCount < MIN_HTTP_SOURCES) {
    return {
      valid: false,
      reason: `select at least ${MIN_HTTP_SOURCES} ip-echo services - comparing results needs two`,
    };
  }
  return { valid: true };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// Null means the user has never saved a selection (first run).
export async function loadSelection(local: StorageAreaLike): Promise<LoadedSelection | null> {
  const stored = (await local.get(KEY))[KEY] as Partial<StoredSelection> | undefined;
  if (!stored || !isStringArray(stored.selected) || !isStringArray(stored.knownIds)) return null;

  // Sources removed from the registry by an update are dropped silently;
  // sources added by one aren't in `selected`, so they stay off.
  const selected = stored.selected.filter((id) => REGISTRY_IDS.has(id));
  return { selected, knownIds: stored.knownIds, valid: validateSelection(selected).valid };
}

// Clears the session cache too, so the next check runs against exactly
// the new selection instead of showing results gathered from the old one.
export async function saveSelection(
  ids: Iterable<string>,
  areas: { local: StorageAreaLike; session: StorageAreaLike | null },
): Promise<void> {
  const selected = [...new Set(ids)].filter((id) => REGISTRY_IDS.has(id));
  const validation = validateSelection(selected);
  if (!validation.valid) throw new Error(validation.reason);

  const stored: StoredSelection = { version: 1, selected, knownIds: [...REGISTRY_IDS] };
  await areas.local.set({ [KEY]: stored });
  await clearCache(areas.session);
}

export interface SelectedSources {
  http: HttpSource[];
  stun: StunSource[];
  dns: boolean;
}

// Registry order, not selection order, so results always list the same way.
export function selectedSources(ids: Iterable<string>): SelectedSources {
  const selected = new Set(ids);
  return {
    http: HTTP_SOURCES.filter((source) => selected.has(source.id)),
    stun: STUN_SOURCES.filter((source) => selected.has(source.id)),
    dns: selected.has(DNS_SOURCE.id),
  };
}
