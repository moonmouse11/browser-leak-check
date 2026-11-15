import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ALL_SOURCES,
  BANDWIDTH_SOURCE,
  CONTACTED_SOURCES,
  HTTP_SOURCES,
  PROBE_TARGETS,
  RDAP_SOURCE,
  STATUS_SOURCES,
  STUN_SOURCES,
  TRACE_SOURCES,
} from './config';

// Registry invariants: the selection UI, the checks, the disclosure copy
// and the e2e allowlist all derive from this one list, so its integrity
// is guarded here rather than by review.
describe('source registry', () => {
  it('has unique ids across every contacted endpoint', () => {
    const ids = CONTACTED_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('labels every entry with name and operator', () => {
    for (const source of CONTACTED_SOURCES) {
      expect(source.id).toBeTruthy();
      expect(source.name).toBeTruthy();
      expect(source.operator).toBeTruthy();
      expect(source.url).toBeTruthy();
    }
  });

  it('keeps the selectable set to http/stun/dns/trace', () => {
    expect(ALL_SOURCES.map((s) => s.kind).sort()).toEqual(
      [
        ...HTTP_SOURCES.map(() => 'http'),
        ...STUN_SOURCES.map(() => 'stun'),
        'dns',
        ...TRACE_SOURCES.map(() => 'trace'),
      ].sort(),
    );
  });

  it('lists every non-selectable kind in CONTACTED_SOURCES only', () => {
    const selectable = new Set(ALL_SOURCES.map((s) => s.id));
    for (const source of [...STATUS_SOURCES, RDAP_SOURCE, ...PROBE_TARGETS, BANDWIDTH_SOURCE]) {
      expect(selectable.has(source.id)).toBe(false);
    }
  });

  it('marks trace sources as not recommended (opt-in by design)', () => {
    for (const source of TRACE_SOURCES) {
      expect(source.recommended).toBe(false);
    }
  });

  it('keeps third-party URLs out of source files outside the registry', () => {
    // Endpoint URLs must live in lib/config.ts (plus the e2e-only swap
    // modules and their tests); anything else is drift.
    const allowed = new Set([
      'lib/config.ts',
      'lib/extra-sources.e2e.ts',
      'lib/extra-sources.ts',
      // Recorded response bodies used as parser fixtures, not endpoints.
      'lib/ip-sources.samples.ts',
    ]);
    const offenders: string[] = [];
    for (const file of readdirSync('lib')) {
      if (!file.endsWith('.ts') || allowed.has(`lib/${file}`) || file.endsWith('.test.ts')) continue;
      const urls = readFileSync(`lib/${file}`, 'utf8').match(/https:\/\/[a-z0-9.-]+/gi) ?? [];
      // Constants like a docs link are fine; third-party endpoints are not.
      const endpoints = urls.filter((url) => !url.includes('github.com'));
      if (endpoints.length > 0) offenders.push(`lib/${file}: ${endpoints.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});
