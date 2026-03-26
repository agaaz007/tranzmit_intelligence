/**
 * Playwright-based rrweb replay and screenshot capture.
 * 2-pass approach: fast scan (pixel-diff) then quality capture for selected keyframes.
 */

import { chromium, Browser, Page } from 'playwright';
import { computePixelDiffScores, selectKeyframes, computeScanFps, extractDomEventTimestamps, type ScanFrame, type SelectedFrame } from './selection';

export interface KeyframeCapture {
  timestamp: number;
  base64: string;
  reason: string;
}

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;
const FULL_WIDTH = 1280;
const FULL_HEIGHT = 720;

/**
 * Replay rrweb events in a headless browser and capture keyframes using the 4-layer selection algorithm.
 */
export async function captureKeyframes(
  events: any[],
  domEventTimestamps: number[]
): Promise<KeyframeCapture[]> {
  if (!events || events.length < 2) return [];

  const sorted = [...events].sort((a: any, b: any) => a.timestamp - b.timestamp);
  const startMs = sorted[0].timestamp;
  const endMs = sorted[sorted.length - 1].timestamp;
  const durationSec = (endMs - startMs) / 1000;

  if (durationSec <= 0) return [];

  const { fps: scanFps, totalFrames } = computeScanFps(durationSec);

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: FULL_WIDTH, height: FULL_HEIGHT },
    });
    const page = await context.newPage();

    // Load a minimal page with rrweb-player
    await page.setContent(getReplayerHtml(), { waitUntil: 'domcontentloaded' });

    // Inject rrweb-player JS — resolve via node_modules path directly to avoid exports map issues
    const path = await import('path');
    const playerDir = path.join(process.cwd(), 'node_modules', 'rrweb-player', 'dist');
    await page.addScriptTag({ path: path.join(playerDir, 'rrweb-player.js') });
    await page.addStyleTag({ path: path.join(playerDir, 'style.css') });

    // Initialize the replayer with events
    await page.evaluate((eventsJson: string) => {
      const events = JSON.parse(eventsJson);
      const container = document.getElementById('player-container')!;
      // @ts-ignore — rrweb-player is loaded via script tag
      const player = new rrwebPlayer({
        target: container,
        props: {
          events,
          width: 1280,
          height: 720,
          autoPlay: false,
          showController: false,
          skipInactive: false,
        },
      });
      (window as any).__player = player;
    }, JSON.stringify(sorted));

    // Wait for player to initialize
    await page.waitForTimeout(1000);

    // ===== Pass 1: Fast scan =====
    console.log(`[Capture] Pass 1: scanning ${totalFrames} frames at ${scanFps.toFixed(2)} fps`);

    const frameBuffers: Uint8Array[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const timestampMs = (i / scanFps) * 1000;
      await page.evaluate((ms: number) => {
        (window as any).__player?.goto(ms);
      }, timestampMs);
      await page.waitForTimeout(50); // brief settle

      const screenshot = await page.screenshot({
        type: 'jpeg',
        quality: 20,
        clip: { x: 0, y: 0, width: THUMB_WIDTH, height: THUMB_HEIGHT },
      });

      frameBuffers.push(new Uint8Array(screenshot));
    }

    // Compute pixel-diff scores
    const scanFrames = computePixelDiffScores(frameBuffers, THUMB_WIDTH, THUMB_HEIGHT, scanFps);

    // ===== 4-Layer Selection =====
    const selected = selectKeyframes(scanFrames, durationSec, domEventTimestamps);
    console.log(`[Capture] Selected ${selected.length} keyframes: ${summarizeReasons(selected)}`);

    // ===== Pass 2: Quality capture =====
    console.log(`[Capture] Pass 2: capturing ${selected.length} frames at full resolution`);

    const keyframes: KeyframeCapture[] = [];

    for (const frame of selected) {
      const timestampMs = frame.timestampSec * 1000;
      await page.evaluate((ms: number) => {
        (window as any).__player?.goto(ms);
      }, timestampMs);
      await page.waitForTimeout(300); // full settle for quality

      try {
        const screenshot = await page.screenshot({
          type: 'jpeg',
          quality: 60,
          clip: { x: 0, y: 0, width: FULL_WIDTH, height: FULL_HEIGHT },
        });

        keyframes.push({
          timestamp: frame.timestampSec,
          base64: screenshot.toString('base64'),
          reason: frame.reason,
        });
      } catch (err) {
        console.warn(`[Capture] Failed at ${frame.timestampSec}s:`, err);
      }
    }

    await context.close();
    return keyframes;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function getReplayerHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; }
    body { background: #fff; overflow: hidden; }
    #player-container { width: 1280px; height: 720px; }
  </style>
</head>
<body>
  <div id="player-container"></div>
</body>
</html>`;
}

function summarizeReasons(frames: SelectedFrame[]): string {
  const counts: Record<string, number> = {};
  for (const f of frames) {
    counts[f.reason] = (counts[f.reason] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
}
