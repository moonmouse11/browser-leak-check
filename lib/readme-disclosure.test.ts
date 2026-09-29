import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_SOURCES } from './config';

// The README's privacy section is the written disclosure; this keeps it
// from falling behind the registry when a service is added.
describe('README disclosure', () => {
  const readme = readFileSync('README.md', 'utf8');

  for (const source of ALL_SOURCES) {
    const host = source.url.startsWith('stun:')
      ? source.url.slice('stun:'.length).split(':')[0]!
      : new URL(source.url).host;

    it(`names ${source.id} (${host})`, () => {
      expect(readme).toContain(host);
    });
  }
});
