"use client";

import html2canvas from "html2canvas";
import { Replayer } from "rrweb";

export interface ClientKeyframe {
  timestamp: number; // seconds into the session
  base64: string; // base64-encoded JPEG
  reason: string;
}

const MAX_FRAMES = 15;
const REPLAY_WIDTH = 1280;
const REPLAY_HEIGHT = 720;

/**
 * Compute evenly-spaced timestamps + start/end for screenshot capture.
 */
function computeTimestamps(
  events: { timestamp: number }[]
): { seconds: number; reason: string }[] {
  if (events.length < 2) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const startMs = sorted[0].timestamp;
  const endMs = sorted[sorted.length - 1].timestamp;
  const durationSec = (endMs - startMs) / 1000;

  if (durationSec <= 0) return [{ seconds: 0, reason: "session-start" }];

  const timestamps: { seconds: number; reason: string }[] = [];
  const seen = new Set<number>();

  const add = (sec: number, reason: string) => {
    const rounded = Math.round(sec);
    if (rounded < 0 || seen.has(rounded)) return;
    seen.add(rounded);
    timestamps.push({ seconds: rounded, reason });
  };

  add(0, "session-start");
  add(Math.round(durationSec), "session-end");

  // Fill with evenly-spaced frames
  const frameCount = Math.min(MAX_FRAMES - 2, Math.floor(durationSec / 2));
  if (frameCount > 0) {
    const interval = durationSec / (frameCount + 1);
    for (let i = 1; i <= frameCount; i++) {
      add(Math.round(interval * i), "coverage");
    }
  }

  return timestamps.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Wait for a specified number of milliseconds.
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Capture keyframes from rrweb events client-side using a hidden Replayer + html2canvas.
 * Returns base64-encoded JPEG screenshots at key moments.
 */
export async function captureKeyframesClientSide(
  events: unknown[],
  onProgress?: (captured: number, total: number) => void
): Promise<ClientKeyframe[]> {
  if (!events || events.length < 2) return [];

  const timestamps = computeTimestamps(
    events as { timestamp: number }[]
  );
  if (timestamps.length === 0) return [];

  // Create a hidden container for the replayer
  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed; left: -9999px; top: -9999px;
    width: ${REPLAY_WIDTH}px; height: ${REPLAY_HEIGHT}px;
    overflow: hidden; z-index: -1;
  `;
  document.body.appendChild(container);

  let replayer: Replayer | null = null;
  const captures: ClientKeyframe[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replayer = new Replayer(events as any[], {
      root: container,
      skipInactive: false,
      showWarning: false,
      showDebug: false,
      liveMode: false,
      UNSAFE_replayCanvas: false,
    });

    // Wait for initial render
    replayer.pause(0);
    await wait(500);

    const iframe = container.querySelector("iframe");
    if (!iframe || !iframe.contentDocument) {
      console.warn("[Capture] No iframe found in replayer");
      return [];
    }

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];

      // Seek to the timestamp (rrweb uses milliseconds)
      replayer.pause(ts.seconds * 1000);
      await wait(300); // let DOM settle

      try {
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc || !iframeDoc.documentElement) continue;

        const canvas = await html2canvas(iframeDoc.documentElement, {
          width: REPLAY_WIDTH,
          height: REPLAY_HEIGHT,
          scale: 1,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });

        // Convert to JPEG base64
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

        captures.push({
          timestamp: ts.seconds,
          base64,
          reason: ts.reason,
        });
      } catch (err) {
        console.warn(`[Capture] Failed at ${ts.seconds}s:`, err);
      }

      onProgress?.(i + 1, timestamps.length);
    }

    return captures;
  } finally {
    if (replayer) {
      try {
        replayer.destroy();
      } catch {
        // ignore
      }
    }
    document.body.removeChild(container);
  }
}
