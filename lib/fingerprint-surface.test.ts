import { describe, expect, it } from 'vitest';
import { collectFingerprintSurface } from './fingerprint-surface';

describe('collectFingerprintSurface', () => {
  it('collects the basic UA/platform/screen/timezone/languages signals', async () => {
    const surface = await collectFingerprintSurface();

    expect(surface.userAgent.available).toBe(true);
    expect(surface.platform.available).toBe(true);
    expect(surface.screenResolution.available).toBe(true);
    expect(surface.timezone.available).toBe(true);
    expect(surface.languages.available).toBe(true);
  });

  it('marks canvas/WebGL/audio signals unavailable instead of throwing, without affecting the other signals', async () => {
    // jsdom has no real canvas/WebGL/audio rendering, so this exercises the
    // same graceful-degradation path a fingerprint-resistant browser would.
    const surface = await collectFingerprintSurface();

    expect(surface.canvasHash.available).toBe(false);
    expect(surface.webgl.available).toBe(false);
    expect(surface.audioFingerprint.available).toBe(false);
    expect(surface.userAgent.available).toBe(true);
  });
});
