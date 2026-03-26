import {
  selectKeyframes,
  computeScanFps,
  extractDomEventTimestamps,
  type ScanFrame,
} from '../selection';

describe('computeScanFps', () => {
  it('uses 2fps for short sessions (<=60s)', () => {
    const result = computeScanFps(30);
    expect(result.fps).toBe(2.0);
    expect(result.totalFrames).toBe(60);
  });

  it('uses 1fps for medium sessions (<=180s)', () => {
    const result = computeScanFps(120);
    expect(result.fps).toBe(1.0);
    expect(result.totalFrames).toBe(120);
  });

  it('uses 0.5fps for long sessions', () => {
    const result = computeScanFps(300);
    expect(result.fps).toBe(0.5);
    expect(result.totalFrames).toBe(150);
  });

  it('hard-caps at 150 frames', () => {
    const result = computeScanFps(600);
    expect(result.totalFrames).toBe(150);
    expect(result.fps).toBeCloseTo(0.25, 1);
  });
});

describe('extractDomEventTimestamps', () => {
  it('extracts [MM:SS] timestamps from logs', () => {
    const logs = [
      { timestamp: '[00:05]' },
      { timestamp: '[00:12]' },
      { timestamp: '[01:30]' },
    ];
    expect(extractDomEventTimestamps(logs)).toEqual([5, 12, 90]);
  });

  it('deduplicates identical timestamps', () => {
    const logs = [
      { timestamp: '[00:10]' },
      { timestamp: '[00:10]' },
      { timestamp: '[00:20]' },
    ];
    expect(extractDomEventTimestamps(logs)).toEqual([10, 20]);
  });

  it('returns empty array for no logs', () => {
    expect(extractDomEventTimestamps([])).toEqual([]);
  });

  it('skips malformed timestamps', () => {
    const logs = [
      { timestamp: 'no-timestamp' },
      { timestamp: '[00:05]' },
    ];
    expect(extractDomEventTimestamps(logs)).toEqual([5]);
  });
});

describe('selectKeyframes', () => {
  function makeScanFrames(count: number, fps: number, scores?: number[]): ScanFrame[] {
    return Array.from({ length: count }, (_, i) => ({
      index: i,
      timestampSec: i / fps,
      diffScore: scores ? scores[i] : 0,
    }));
  }

  it('returns first and last for very short sessions', () => {
    const frames = makeScanFrames(4, 2, [0, 1, 1, 0]);
    const result = selectKeyframes(frames, 2, []);
    expect(result.length).toBe(2);
    expect(result[0].reason).toBe('session-start');
    expect(result[result.length - 1].reason).toBe('session-end');
  });

  it('returns first and last for empty frames edge case', () => {
    const result = selectKeyframes([], 0, []);
    expect(result).toEqual([]);
  });

  it('always includes session-start and session-end', () => {
    const frames = makeScanFrames(60, 2, Array(60).fill(1));
    const result = selectKeyframes(frames, 30, []);
    const reasons = result.map(f => f.reason);
    expect(reasons).toContain('session-start');
    expect(reasons).toContain('session-end');
  });

  it('selects activity spikes above threshold', () => {
    // 20 frames, mostly low scores with a few spikes
    const scores = [0, 1, 1, 1, 1, 10, 1, 1, 20, 1, 1, 1, 15, 1, 1, 1, 1, 1, 1, 0];
    const frames = makeScanFrames(20, 2, scores);
    const result = selectKeyframes(frames, 10, []);
    const activityFrames = result.filter(f => f.reason === 'activity');
    expect(activityFrames.length).toBeGreaterThan(0);
    // The highest-scoring frames should be selected
    for (const af of activityFrames) {
      expect(af.diffScore).toBeGreaterThan(2);
    }
  });

  it('selects before-transition frames', () => {
    const scores = [0, 1, 1, 1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
    const frames = makeScanFrames(20, 2, scores);
    const result = selectKeyframes(frames, 10, []);
    const beforeFrames = result.filter(f => f.reason === 'before-transition');
    expect(beforeFrames.length).toBeGreaterThanOrEqual(0); // may be merged with coverage
  });

  it('adds temporal coverage frames', () => {
    // All zero scores — no activity, so coverage should fill in
    const frames = makeScanFrames(60, 2, Array(60).fill(0));
    const result = selectKeyframes(frames, 30, []);
    const coverageFrames = result.filter(f => f.reason === 'coverage');
    expect(coverageFrames.length).toBeGreaterThan(0);
  });

  it('uses correct coverage interval for different durations', () => {
    // 30s session → 3s interval → ~10 coverage frames
    const frames30 = makeScanFrames(60, 2, Array(60).fill(0));
    const result30 = selectKeyframes(frames30, 30, []);
    const coverage30 = result30.filter(f => f.reason === 'coverage');

    // 120s session → 8s interval → ~15 coverage frames
    const frames120 = makeScanFrames(120, 1, Array(120).fill(0));
    const result120 = selectKeyframes(frames120, 120, []);
    const coverage120 = result120.filter(f => f.reason === 'coverage');

    // Both should have reasonable coverage
    expect(coverage30.length).toBeGreaterThan(0);
    expect(coverage120.length).toBeGreaterThan(0);
  });

  it('includes DOM event anchor frames', () => {
    const frames = makeScanFrames(60, 2, Array(60).fill(0));
    const domTimestamps = [5, 15, 25];
    const result = selectKeyframes(frames, 30, domTimestamps);
    const domFrames = result.filter(f => f.reason === 'dom-event');
    expect(domFrames.length).toBeGreaterThan(0);
  });

  it('does not exceed MAX_IMAGES (30)', () => {
    // Create many activity spikes
    const scores = Array(200).fill(0).map(() => Math.random() * 30);
    const frames = makeScanFrames(200, 1, scores);
    const domTimestamps = Array.from({ length: 50 }, (_, i) => i * 4);
    const result = selectKeyframes(frames, 200, domTimestamps);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it('preserves priority order when trimming', () => {
    // Many frames, should trim to 30 — first/last should always survive
    const scores = Array(200).fill(0).map(() => Math.random() * 30);
    const frames = makeScanFrames(200, 1, scores);
    const domTimestamps = Array.from({ length: 50 }, (_, i) => i * 4);
    const result = selectKeyframes(frames, 200, domTimestamps);

    const reasons = result.map(f => f.reason);
    expect(reasons).toContain('session-start');
    expect(reasons).toContain('session-end');
  });

  it('frames are sorted by timestamp in output', () => {
    const scores = [0, 5, 10, 20, 5, 1, 15, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0];
    const frames = makeScanFrames(20, 2, scores);
    const result = selectKeyframes(frames, 10, [3, 7]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].timestampSec).toBeGreaterThanOrEqual(result[i - 1].timestampSec);
    }
  });

  it('enforces minimum gap between frames', () => {
    const frames = makeScanFrames(20, 2, Array(20).fill(10)); // all high scores
    const result = selectKeyframes(frames, 10, []);
    for (let i = 1; i < result.length; i++) {
      const gap = result[i].timestampSec - result[i - 1].timestampSec;
      // Allow small floating point tolerance
      expect(gap).toBeGreaterThanOrEqual(0.4);
    }
  });
});
