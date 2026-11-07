// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { CheckResults } from './checks';
import {
  CATALOG_CARDS,
  createCard,
  renderConnectivityDetail,
  renderStatusDetail,
  renderVisibilityDetail,
  setCardState,
  summarizeResults,
} from './catalog';

function results(overrides: Partial<CheckResults>): CheckResults {
  return {
    version: 2,
    checkedAt: 0,
    selected: [],
    parts: [],
    http: [],
    webrtc: { status: 'off', candidates: [], servers: [] },
    dns: { status: 'off', resolvers: [] },
    ...overrides,
  };
}

describe('catalog cards', () => {
  it('covers every check of the catalog', () => {
    expect(CATALOG_CARDS.map((card) => card.id)).toEqual([
      'ip',
      'webrtc',
      'dns',
      'visibility',
      'connectivity',
      'status',
      'whois',
      'bandwidth',
      'history',
    ]);
  });

  it('creates a runnable card with idle state and a run control', () => {
    const onRun = vi.fn();
    const card = createCard(CATALOG_CARDS.find((c) => c.id === 'ip')!, onRun);

    expect(card.dataset.state).toBe('idle');
    card.querySelector<HTMLButtonElement>('.lc-card-run')!.click();
    expect(onRun).toHaveBeenCalledWith('ip');
  });

  it('creates the history card without a run control', () => {
    const card = createCard(CATALOG_CARDS.find((c) => c.id === 'history')!, vi.fn());
    expect(card.querySelector('.lc-card-run')).toBeNull();
  });

  it('shows the traffic warning on the bandwidth card', () => {
    const card = createCard(CATALOG_CARDS.find((c) => c.id === 'bandwidth')!, vi.fn());
    expect(card.querySelector('.lc-card-note')?.textContent).toContain('mb');
  });

  it('updates one card through every state without touching its neighbours', () => {
    const a = createCard(CATALOG_CARDS.find((c) => c.id === 'ip')!, vi.fn());
    const b = createCard(CATALOG_CARDS.find((c) => c.id === 'dns')!, vi.fn());
    const wrap = document.createElement('div');
    wrap.append(a, b);

    for (const state of ['running', 'done', 'failed', 'off'] as const) {
      setCardState(a, state, `state ${state}`);
      expect(a.dataset.state).toBe(state);
      expect(a.querySelector('.lc-card-summary')?.textContent).toBe(`state ${state}`);
      expect(b.dataset.state).toBe('idle');
    }

    setCardState(a, 'running');
    expect(a.querySelector<HTMLButtonElement>('.lc-card-run')!.disabled).toBe(true);
    setCardState(a, 'off');
    expect(a.querySelector<HTMLButtonElement>('.lc-card-run')!.disabled).toBe(true);
    setCardState(a, 'done');
    expect(a.querySelector<HTMLButtonElement>('.lc-card-run')!.disabled).toBe(false);
  });
});

describe('summarizeResults', () => {
  it('derives per-card states from the parts that ran', () => {
    const summary = summarizeResults(
      results({
        parts: ['http', 'webrtc', 'dns', 'visibility', 'connectivity', 'status', 'whois'],
        http: [
          { sourceId: 'a', status: 'ok', address: '203.0.113.9', family: 'v4' },
          { sourceId: 'b', status: 'ok', address: '203.0.113.9', family: 'v4' },
        ],
        visibility: {
          status: 'done',
          services: [
            { sourceId: 'trace-claude', status: 'ok', trace: { ip: { address: '198.51.100.7', family: 'v4' } }, agreement: 'differs' },
          ],
        },
        connectivity: { status: 'done', reachable: 11, total: 12, verdict: 'partial', results: [] },
        serviceStatus: {
          status: 'done',
          services: [
            { sourceId: 'status-claude', indicator: 'operational' },
            { sourceId: 'status-openai', indicator: 'outage', description: 'Partial outage' },
          ],
        },
        whois: { status: 'done', entries: [{ ip: '203.0.113.9', status: 'ok', name: 'TEST-NET' }] },
      }),
    );

    expect(summary.ip).toMatchObject({ state: 'done' });
    expect(summary.visibility?.state).toBe('done');
    expect(summary.visibility?.summary).toContain('different egress');
    expect(summary.connectivity?.summary).toContain('11/12');
    expect(summary.status?.summary).toContain('incident');
    expect(summary.whois?.summary).toContain('TEST-NET');
  });

  it('marks failed parts failed and keeps the others done', () => {
    const summary = summarizeResults(
      results({
        parts: ['http', 'visibility', 'connectivity'],
        http: [{ sourceId: 'a', status: 'failed', reason: 'timeout' }],
        visibility: { status: 'done', services: [{ sourceId: 'trace-claude', status: 'failed', reason: 'unreachable' }] },
        connectivity: { status: 'done', reachable: 12, total: 12, verdict: 'healthy', results: [] },
      }),
    );

    expect(summary.ip?.state).toBe('failed');
    expect(summary.visibility?.state).toBe('failed');
    expect(summary.connectivity?.state).toBe('done');
  });

  it('reports off states distinctly from failures', () => {
    const summary = summarizeResults(
      results({
        parts: ['http', 'webrtc', 'dns', 'visibility'],
        http: [{ sourceId: 'a', status: 'ok', address: '203.0.113.9', family: 'v4' }],
        visibility: { status: 'off', services: [] },
      }),
    );

    expect(summary.webrtc?.state).toBe('off');
    expect(summary.dns?.state).toBe('off');
    expect(summary.visibility?.state).toBe('off');
  });
});

describe('detail renderers', () => {
  it('renders visibility rows with a differs flag and warp note', () => {
    const wrap = document.createElement('div');
    renderVisibilityDetail(wrap, {
      status: 'done',
      services: [
        {
          sourceId: 'trace-claude',
          status: 'ok',
          trace: { ip: { address: '198.51.100.7', family: 'v4' }, colo: 'IAD', http: 'http/2', tls: 'TLSv1.3', warp: 'off' },
          agreement: 'differs',
        },
        {
          sourceId: 'trace-chatgpt',
          status: 'ok',
          trace: { ip: { address: '203.0.113.9', family: 'v4' }, warp: 'on' },
          agreement: 'differs',
          warp: true,
        },
      ],
    });

    const text = wrap.textContent!;
    expect(text).toContain('198.51.100.7');
    expect(text).toContain('differs from consensus');
    expect(text).toContain('warp');
    expect(wrap.querySelector('[data-state="differing"]')).not.toBeNull();
  });

  it('renders an off visibility check without a table', () => {
    const wrap = document.createElement('div');
    renderVisibilityDetail(wrap, { status: 'off', services: [] });
    expect(wrap.querySelector('table')).toBeNull();
    expect(wrap.textContent).toContain('off');
  });

  it('renders connectivity with per-site rows and the verdict', () => {
    const wrap = document.createElement('div');
    renderConnectivityDetail(wrap, {
      status: 'done',
      reachable: 1,
      total: 2,
      verdict: 'partial',
      results: [
        { targetId: 'probe-google', status: 'reachable', elapsedMs: 42 },
        { targetId: 'probe-github', status: 'unreachable' },
      ],
    });

    expect(wrap.textContent).toContain('partial');
    expect(wrap.textContent).toContain('42 ms');
    expect(wrap.querySelector('[data-state="failed"]')).not.toBeNull();
  });

  it('attributes an unreachable site to an official incident when linked', () => {
    const wrap = document.createElement('div');
    renderConnectivityDetail(
      wrap,
      {
        status: 'done',
        reachable: 1,
        total: 2,
        verdict: 'partial',
        results: [
          { targetId: 'probe-google', status: 'reachable', elapsedMs: 42 },
          { targetId: 'probe-github', status: 'unreachable' },
        ],
      },
      {
        status: 'done',
        services: [{ sourceId: 'status-github', indicator: 'outage', description: 'Partial outage' }],
      },
    );

    expect(wrap.textContent).toContain('service incident: Partial outage');
  });

  it('attributes an incident to the service, with its description', () => {
    const wrap = document.createElement('div');
    renderStatusDetail(wrap, {
      status: 'done',
      services: [{ sourceId: 'status-openai', indicator: 'outage', description: 'Partial System Outage' }],
    });

    expect(wrap.textContent).toContain('Partial System Outage');
  });
});
