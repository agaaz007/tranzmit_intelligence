/**
 * 4-Layer Keyframe Selection Algorithm
 * Ported from the Python A/B test script.
 * Pure computation — no browser or API dependencies.
 */

export interface ScanFrame {
  index: number;
  timestampSec: number;
  diffScore: number;
}

export interface SelectedFrame {
  timestampSec: number;
  reason: string;
  priority: number;
  diffScore: number;
}

const MAX_IMAGES = 30;
const MIN_GAP_SEC = 0.5;

/**
 * Compute pixel-diff scores between consecutive frame buffers.
 * Each buffer is a flat Uint8Array of RGBA pixels at thumbnail resolution.
 * Samples every 16th pixel, converts to grayscale, computes average absolute diff.
 */
export function computePixelDiffScores(
  frameBuffers: Uint8Array[],
  width: number,
  height: number,
  analysisFps: number
): ScanFrame[] {
  const pixelCount = width * height;
  const sampleStep = 16;
  const sampledPixels = Math.ceil(pixelCount / sampleStep);

  const frames: ScanFrame[] = [];

  for (let i = 0; i < frameBuffers.length; i++) {
    if (i === 0) {
      frames.push({ index: i, timestampSec: 0, diffScore: 0 });
      continue;
    }

    const curr = frameBuffers[i];
    const prev = frameBuffers[i - 1];
    let totalDiff = 0;

    for (let p = 0; p < pixelCount; p += sampleStep) {
      const offset = p * 4; // RGBA
      // Grayscale: 0.299*R + 0.587*G + 0.114*B
      const grayCurr = 0.299 * curr[offset] + 0.587 * curr[offset + 1] + 0.114 * curr[offset + 2];
      const grayPrev = 0.299 * prev[offset] + 0.587 * prev[offset + 1] + 0.114 * prev[offset + 2];
      totalDiff += Math.abs(grayCurr - grayPrev);
    }

    frames.push({
      index: i,
      timestampSec: i / analysisFps,
      diffScore: totalDiff / sampledPixels,
    });
  }

  return frames;
}

/**
 * Extract DOM event timestamps from SemanticSession logs.
 * Returns timestamps in seconds.
 */
export function extractDomEventTimestamps(
  logs: Array<{ timestamp: string }>
): number[] {
  const seconds: Set<number> = new Set();
  for (const log of logs) {
    const match = log.timestamp.match(/\[(\d{2}):(\d{2})\]/);
    if (match) {
      seconds.add(parseInt(match[1]) * 60 + parseInt(match[2]));
    }
  }
  return Array.from(seconds).sort((a, b) => a - b);
}

/**
 * Compute the adaptive scan FPS based on session duration.
 * Hard-capped at 150 scan frames.
 */
export function computeScanFps(durationSec: number): { fps: number; totalFrames: number } {
  let fps: number;
  if (durationSec <= 60) fps = 2.0;
  else if (durationSec <= 180) fps = 1.0;
  else fps = 0.5;

  let totalFrames = Math.ceil(durationSec * fps);
  if (totalFrames > 150) {
    fps = 150 / durationSec;
    totalFrames = 150;
  }

  return { fps, totalFrames };
}

function findNearestFrame(scanFrames: ScanFrame[], targetSec: number): ScanFrame | null {
  if (scanFrames.length === 0) return null;
  let best = scanFrames[0];
  let bestDist = Math.abs(best.timestampSec - targetSec);
  for (const f of scanFrames) {
    const dist = Math.abs(f.timestampSec - targetSec);
    if (dist < bestDist) {
      best = f;
      bestDist = dist;
    }
  }
  return best;
}

function isTooClose(timestampSec: number, selected: Set<number>): boolean {
  for (const existing of selected) {
    if (Math.abs(timestampSec - existing) < MIN_GAP_SEC) return true;
  }
  return false;
}

/**
 * 4-layer keyframe selection algorithm.
 *
 * Layer 1: Activity spikes (pixel-diff above threshold)
 * Layer 2: Transition boundaries (frame before each spike)
 * Layer 3: Temporal coverage (interval-based)
 * Layer 4: DOM event anchors
 *
 * Returns selected frames sorted by timestamp, capped at MAX_IMAGES.
 */
export function selectKeyframes(
  scanFrames: ScanFrame[],
  durationSec: number,
  domEventTimestamps: number[]
): SelectedFrame[] {
  if (scanFrames.length === 0) return [];

  // Very short sessions — just first and last
  if (durationSec < 5 || scanFrames.length < 3) {
    const result: SelectedFrame[] = [
      { timestampSec: scanFrames[0].timestampSec, reason: 'session-start', priority: 0, diffScore: 0 },
    ];
    if (scanFrames.length > 1) {
      const last = scanFrames[scanFrames.length - 1];
      result.push({ timestampSec: last.timestampSec, reason: 'session-end', priority: 0, diffScore: last.diffScore });
    }
    return result;
  }

  // Compute threshold
  const nonzero = scanFrames
    .filter(f => f.diffScore > 0.5)
    .map(f => f.diffScore)
    .sort((a, b) => a - b);
  const median = nonzero.length > 0 ? nonzero[Math.floor(nonzero.length / 2)] : 0;
  const threshold = Math.max(median * 1.5, 2.0);

  const candidates = new Map<number, SelectedFrame>(); // keyed by timestampSec (rounded)
  const selectedTimestamps = new Set<number>();

  const addCandidate = (frame: ScanFrame, reason: string, priority: number) => {
    const ts = Math.round(frame.timestampSec * 10) / 10; // round to 0.1s
    const existing = candidates.get(ts);
    if (existing && existing.priority <= priority) return; // keep higher priority
    candidates.set(ts, {
      timestampSec: frame.timestampSec,
      reason,
      priority,
      diffScore: frame.diffScore,
    });
  };

  // Always include first and last
  addCandidate(scanFrames[0], 'session-start', 0);
  addCandidate(scanFrames[scanFrames.length - 1], 'session-end', 0);

  // Layer 1: Activity spikes
  const activityCandidates = scanFrames
    .filter(f => f.diffScore >= threshold)
    .sort((a, b) => b.diffScore - a.diffScore);

  const activityIndices = new Set<number>();
  for (const frame of activityCandidates) {
    if (!isTooClose(frame.timestampSec, selectedTimestamps)) {
      addCandidate(frame, 'activity', 1);
      selectedTimestamps.add(frame.timestampSec);
      activityIndices.add(frame.index);
    }
  }

  // Layer 2: Transition boundaries
  for (const idx of activityIndices) {
    if (idx > 0) {
      const beforeFrame = scanFrames[idx - 1];
      if (!isTooClose(beforeFrame.timestampSec, selectedTimestamps)) {
        addCandidate(beforeFrame, 'before-transition', 2);
        selectedTimestamps.add(beforeFrame.timestampSec);
      }
    }
  }

  // Layer 3: Temporal coverage
  const coverageInterval = durationSec <= 30 ? 3 : durationSec <= 120 ? 8 : durationSec <= 300 ? 15 : 20;
  for (let t = 0; t <= durationSec; t += coverageInterval) {
    const nearest = findNearestFrame(scanFrames, t);
    if (nearest && !isTooClose(nearest.timestampSec, selectedTimestamps)) {
      addCandidate(nearest, 'coverage', 3);
      selectedTimestamps.add(nearest.timestampSec);
    }
  }

  // Layer 4: DOM event anchors
  for (const ts of domEventTimestamps) {
    const nearest = findNearestFrame(scanFrames, ts);
    if (nearest && !isTooClose(nearest.timestampSec, selectedTimestamps)) {
      addCandidate(nearest, 'dom-event', 1);
      selectedTimestamps.add(nearest.timestampSec);
    }
  }

  // Collect and trim
  let all = Array.from(candidates.values());

  if (all.length > MAX_IMAGES) {
    // Sort by priority (keep important), then by diffScore (keep interesting)
    all.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.diffScore - a.diffScore;
    });
    all = all.slice(0, MAX_IMAGES);
  }

  // Final sort by timestamp
  return all.sort((a, b) => a.timestampSec - b.timestampSec);
}
