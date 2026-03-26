/**
 * Playwright-based rrweb replay and screenshot capture.
 * 2-pass approach: fast scan (pixel-diff via screenshots) then quality capture for selected keyframes.
 */

import path from 'path';
import { chromium, Browser } from 'playwright';
import { selectKeyframes, computeScanFps, type ScanFrame, type SelectedFrame } from './selection';

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
 * Simple pixel-diff between two same-size JPEG/PNG buffers.
 * Compares raw byte values — not perfect for compressed formats but good enough
 * for detecting visual changes between frames.
 */
function bufferDiffScore(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  // Sample every 64th byte for speed
  const step = 64;
  let totalDiff = 0;
  let samples = 0;
  for (let i = 0; i < len; i += step) {
    totalDiff += Math.abs(a[i] - b[i]);
    samples++;
  }
  return samples > 0 ? totalDiff / samples : 0;
}

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

    // Load a minimal page
    await page.setContent(getReplayerHtml(), { waitUntil: 'domcontentloaded' });

    // Inject @rrweb/replay UMD build (exposes global rrweb.Replayer)
    const replayDir = path.join(process.cwd(), 'node_modules', '@rrweb', 'replay', 'dist');
    await page.addScriptTag({ path: path.join(replayDir, 'replay.umd.cjs') });
    await page.addStyleTag({ path: path.join(replayDir, 'style.css') });

    // Initialize the Replayer with events
    await page.evaluate((eventsJson: string) => {
      const events = JSON.parse(eventsJson);
      const container = document.getElementById('player-container')!;
      // @ts-ignore — rrweb loaded via UMD script tag
      const replayer = new rrweb.Replayer(events, {
        root: container,
        skipInactive: false,
        showWarning: false,
        liveMode: false,
        triggerFocus: false,
        mouseTail: false,
      });
      (window as any).__replayer = replayer;
    }, JSON.stringify(sorted));

    // Wait for replayer to initialize
    await page.waitForTimeout(1000);

    // ===== Pass 1: Fast scan =====
    console.log(`[Capture] Pass 1: scanning ${totalFrames} frames at ${scanFps.toFixed(2)} fps`);

    const scanFrames: ScanFrame[] = [];
    let prevBuf: Buffer | null = null;

    for (let i = 0; i < totalFrames; i++) {
      const timestampMs = (i / scanFps) * 1000;
      await page.evaluate((ms: number) => {
        (window as any).__replayer?.pause(ms);
      }, timestampMs);
      await page.waitForTimeout(50);

      // Take a small, low-quality screenshot for diff comparison
      const buf = await page.screenshot({
        type: 'jpeg',
        quality: 10,
        clip: { x: 0, y: 0, width: THUMB_WIDTH, height: THUMB_HEIGHT },
      });

      const diffScore = prevBuf ? bufferDiffScore(prevBuf, buf) : 0;

      scanFrames.push({
        index: i,
        timestampSec: i / scanFps,
        diffScore,
      });

      prevBuf = buf;
    }

    // ===== 4-Layer Selection =====
    const selected = selectKeyframes(scanFrames, durationSec, domEventTimestamps);
    console.log(`[Capture] Selected ${selected.length} keyframes: ${summarizeReasons(selected)}`);

    // ===== Pass 2: Quality capture =====
    console.log(`[Capture] Pass 2: capturing ${selected.length} frames at full resolution`);

    const keyframes: KeyframeCapture[] = [];

    for (const frame of selected) {
      const timestampMs = frame.timestampSec * 1000;
      await page.evaluate((ms: number) => {
        (window as any).__replayer?.pause(ms);
      }, timestampMs);
      await page.waitForTimeout(300);

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
    #player-container { width: ${FULL_WIDTH}px; height: ${FULL_HEIGHT}px; }
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
