import type { SemanticSession } from '@/lib/rrweb-parser';

export interface KeyframeCapture {
  timestamp: number; // seconds into the session
  base64: string;    // base64-encoded JPEG
  reason: string;    // why this frame was selected
}

/**
 * Dynamically import Playwright. Returns null if not available (e.g. Vercel serverless).
 */
async function getPlaywright() {
  try {
    const pw = await import('playwright');
    return pw.chromium;
  } catch {
    console.warn('[Multimodal] Playwright not available — running DOM-only analysis');
    return null;
  }
}

const MAX_FRAMES = 25;

/**
 * Extract key timestamps from the parsed session where visual context matters most.
 * Uses DOM analysis output to target friction moments.
 */
export function extractKeyTimestamps(semanticSession: SemanticSession): { seconds: number; reason: string }[] {
  const timestamps: { seconds: number; reason: string }[] = [];
  const seen = new Set<number>();

  const addTimestamp = (seconds: number, reason: string) => {
    // Round to nearest second, skip duplicates within 1s
    const rounded = Math.round(seconds);
    if (rounded < 0 || seen.has(rounded)) return;
    seen.add(rounded);
    timestamps.push({ seconds: rounded, reason });
  };

  // Always capture first and last moment
  addTimestamp(0, 'session-start');

  for (const log of semanticSession.logs) {
    // Parse timestamp like [00:12] to seconds
    const match = log.timestamp.match(/\[(\d{2}):(\d{2})\]/);
    if (!match) continue;
    const sec = parseInt(match[1]) * 60 + parseInt(match[2]);

    // Capture at friction signals
    if (log.flags.includes('[RAGE CLICK]')) {
      addTimestamp(sec, 'rage-click');
    } else if (log.flags.includes('[NO RESPONSE]') || log.flags.includes('[DEAD CLICK]')) {
      addTimestamp(sec, 'dead-click');
    } else if (log.flags.includes('[CONSOLE ERROR]') || log.flags.includes('[NETWORK ERROR]')) {
      addTimestamp(sec, 'error');
    } else if (log.flags.includes('[RAPID SCROLL]')) {
      addTimestamp(sec, 'rapid-scroll');
    } else if (log.action.includes('Navigated')) {
      addTimestamp(sec, 'navigation');
    } else if (log.action.includes('Content loaded')) {
      addTimestamp(sec, 'content-loaded');
    }
  }

  // Add temporal coverage: fill gaps > 10s with evenly spaced frames
  const sorted = [...timestamps].sort((a, b) => a.seconds - b.seconds);
  const durationStr = semanticSession.totalDuration;
  const durationMatch = durationStr.match(/(\d+)m\s*(\d+)s/) || durationStr.match(/(\d+)s/);
  let totalSeconds = 0;
  if (durationMatch) {
    if (durationMatch.length === 3) {
      totalSeconds = parseInt(durationMatch[1]) * 60 + parseInt(durationMatch[2]);
    } else {
      totalSeconds = parseInt(durationMatch[1]);
    }
  }

  if (totalSeconds > 0) {
    const coverageInterval = totalSeconds <= 30 ? 5 : totalSeconds <= 120 ? 10 : 20;
    for (let t = 0; t <= totalSeconds; t += coverageInterval) {
      addTimestamp(t, 'coverage');
    }
    addTimestamp(totalSeconds, 'session-end');
  }

  // Sort and trim to MAX_FRAMES, prioritizing friction signals
  const priority: Record<string, number> = {
    'session-start': 0, 'session-end': 0,
    'rage-click': 1, 'dead-click': 1, 'error': 1,
    'rapid-scroll': 2, 'navigation': 2, 'content-loaded': 2,
    'coverage': 3,
  };

  const all = [...timestamps].sort((a, b) => {
    const pa = priority[a.reason] ?? 4;
    const pb = priority[b.reason] ?? 4;
    if (pa !== pb) return pa - pb;
    return a.seconds - b.seconds;
  });

  if (all.length > MAX_FRAMES) {
    // Keep high-priority frames, trim coverage
    const kept = all.slice(0, MAX_FRAMES);
    return kept.sort((a, b) => a.seconds - b.seconds);
  }

  return all.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Capture screenshots from an rrweb session at specified timestamps
 * using a headless browser with rrweb-player.
 */
export async function captureKeyframes(
  events: unknown[],
  timestamps: { seconds: number; reason: string }[]
): Promise<KeyframeCapture[]> {
  if (timestamps.length === 0) return [];

  const chromium = await getPlaywright();
  if (!chromium) {
    // Playwright not available (serverless) — return empty, caller will do DOM-only analysis
    return [];
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    // Build a minimal HTML page with rrweb-player loaded via CDN
    const html = `<!DOCTYPE html>
<html><head>
<style>
  * { margin: 0; padding: 0; }
  body { background: #fff; overflow: hidden; }
  .rr-player { margin: 0 !important; }
  .rr-controller { display: none !important; }
</style>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/style.css" />
<script src="https://cdn.jsdelivr.net/npm/rrweb-player@latest/dist/index.js"><\/script>
</head>
<body>
<div id="player-container"></div>
<script>
  window.__captureReady = false;
  window.__initPlayer = function(events) {
    try {
      const player = new rrwebPlayer({
        target: document.getElementById('player-container'),
        props: {
          events: events,
          width: 1280,
          height: 720,
          autoPlay: false,
          showController: false,
          skipInactive: false,
          showWarning: false,
          showDebug: false,
        }
      });
      window.__player = player;
      window.__captureReady = true;
    } catch(e) {
      console.error('Player init failed:', e);
      window.__captureReady = false;
    }
  };

  window.__seekTo = function(timeMs) {
    if (window.__player) {
      window.__player.goto(timeMs);
    }
  };
<\/script>
</body></html>`;

    await page.setContent(html, { waitUntil: 'networkidle' });

    // Initialize player with events
    await page.evaluate((evts) => {
      (window as unknown as { __initPlayer: (e: unknown[]) => void }).__initPlayer(evts);
    }, events);

    // Wait for player to initialize
    await page.waitForFunction(() => {
      return (window as unknown as { __captureReady: boolean }).__captureReady;
    }, { timeout: 15000 });

    // Small delay for initial render
    await page.waitForTimeout(500);

    const captures: KeyframeCapture[] = [];

    for (const ts of timestamps) {
      // Seek to timestamp (rrweb-player uses milliseconds)
      await page.evaluate((ms) => {
        (window as unknown as { __seekTo: (ms: number) => void }).__seekTo(ms);
      }, ts.seconds * 1000);

      // Wait for render
      await page.waitForTimeout(300);

      // Capture screenshot of the player iframe content
      const screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 75,
        clip: { x: 0, y: 0, width: 1280, height: 720 },
      });

      captures.push({
        timestamp: ts.seconds,
        base64: screenshot.toString('base64'),
        reason: ts.reason,
      });
    }

    return captures;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
