import type { CheckResults } from './checks';
import type { StorageAreaLike } from './storage';

// One completed check, kept in storage.session (memory only, gone when the
// browser closes) so the report page opened from the popup shows the
// popup's results instead of contacting every service a second time.
const KEY = 'lastCheck';

export async function readCache(session: StorageAreaLike | null): Promise<CheckResults | null> {
  if (!session) return null;
  const cached = (await session.get(KEY))[KEY] as CheckResults | undefined;
  return cached && typeof cached.checkedAt === 'number' ? cached : null;
}

export async function writeCache(session: StorageAreaLike | null, results: CheckResults): Promise<void> {
  await session?.set({ [KEY]: results });
}

export async function clearCache(session: StorageAreaLike | null): Promise<void> {
  await session?.remove(KEY);
}
