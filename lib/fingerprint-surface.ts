export interface FingerprintSignal<T> {
  value: T | null;
  available: boolean;
}

export interface FingerprintSurface {
  userAgent: FingerprintSignal<string>;
  platform: FingerprintSignal<string>;
  screenResolution: FingerprintSignal<string>;
  timezone: FingerprintSignal<string>;
  languages: FingerprintSignal<string[]>;
  canvasHash: FingerprintSignal<string>;
  webgl: FingerprintSignal<{ vendor: string; renderer: string }>;
  audioFingerprint: FingerprintSignal<string>;
}

function safe<T>(compute: () => T): FingerprintSignal<T> {
  try {
    return { value: compute(), available: true };
  } catch {
    return { value: null, available: false };
  }
}

async function safeAsync<T>(compute: () => Promise<T>): Promise<FingerprintSignal<T>> {
  try {
    return { value: await compute(), available: true };
  } catch {
    return { value: null, available: false };
  }
}

function collectBasicSignals() {
  return {
    userAgent: safe(() => navigator.userAgent),
    platform: safe(() => navigator.platform),
    screenResolution: safe(() => `${screen.width}x${screen.height}`),
    timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    languages: safe(() => [...navigator.languages]),
  };
}

async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function collectCanvasHash(): Promise<FingerprintSignal<string>> {
  return safeAsync(async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');

    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('leak-extension fingerprint', 2, 2);

    const dataUrl = canvas.toDataURL();
    if (!dataUrl || dataUrl === 'data:,') throw new Error('canvas readback blocked');
    return hashText(dataUrl);
  });
}

function collectWebglInfo(): FingerprintSignal<{ vendor: string; renderer: string }> {
  return safe(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) throw new Error('webgl unavailable');

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) throw new Error('WEBGL_debug_renderer_info unavailable');

    return {
      vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
    };
  });
}

// Standard oscillator + dynamics-compressor technique: the compressor's
// output is influenced by device/browser-specific audio processing, so the
// summed tail of the rendered buffer is a stable per-device fingerprint.
async function collectAudioFingerprint(): Promise<FingerprintSignal<string>> {
  return safeAsync(async () => {
    const OfflineCtx: typeof OfflineAudioContext | undefined =
      window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error('OfflineAudioContext unavailable');

    const context = new OfflineCtx(1, 5000, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;

    const compressor = context.createDynamicsCompressor();
    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const buffer = await context.startRendering();
    const channelData = buffer.getChannelData(0);

    let sum = 0;
    for (let i = 4500; i < channelData.length; i++) sum += Math.abs(channelData[i] ?? 0);
    return sum.toString(16);
  });
}

export async function collectFingerprintSurface(): Promise<FingerprintSurface> {
  const [canvasHash, audioFingerprint] = await Promise.all([
    collectCanvasHash(),
    collectAudioFingerprint(),
  ]);

  return {
    ...collectBasicSignals(),
    canvasHash,
    webgl: collectWebglInfo(),
    audioFingerprint,
  };
}
