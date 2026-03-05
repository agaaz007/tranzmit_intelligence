import { describe, it, expect } from 'vitest';
import {
  computeEngagementScore,
  computeFrustrationScore,
  computeRiskLevel,
  type SessionSummary,
  type InterviewSummary,
} from '../profile-scoring';

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    analysisStatus: 'completed',
    analysis: { ux_rating: 6, frustration_points: [{ timestamp: '0:30', issue: 'confusing nav' }] },
    startTime: new Date(),
    duration: 300,
    ...overrides,
  };
}

function makeInterview(overrides: Partial<InterviewSummary> = {}): InterviewSummary {
  return {
    sentiment: 'negative',
    painPoints: [{ point: 'slow loading', severity: 'high' }],
    ...overrides,
  };
}

describe('computeEngagementScore', () => {
  it('returns 0 for empty sessions', () => {
    expect(computeEngagementScore([])).toBe(0);
  });

  it('returns higher score for longer sessions', () => {
    const short = [makeSession({ duration: 30 })];
    const long = [makeSession({ duration: 600 })];
    expect(computeEngagementScore(long)).toBeGreaterThan(computeEngagementScore(short));
  });

  it('returns higher score for more sessions', () => {
    const one = [makeSession()];
    const many = [makeSession(), makeSession(), makeSession()];
    expect(computeEngagementScore(many)).toBeGreaterThan(computeEngagementScore(one));
  });

  it('caps at 100', () => {
    const sessions = Array.from({ length: 50 }, () => makeSession({ duration: 3600, analysis: { ux_rating: 10 } }));
    expect(computeEngagementScore(sessions)).toBeLessThanOrEqual(100);
  });

  it('returns score in 0-100 range', () => {
    const score = computeEngagementScore([makeSession()]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('considers UX ratings', () => {
    const low = [makeSession({ analysis: { ux_rating: 2 } })];
    const high = [makeSession({ analysis: { ux_rating: 9 } })];
    expect(computeEngagementScore(high)).toBeGreaterThan(computeEngagementScore(low));
  });
});

describe('computeFrustrationScore', () => {
  it('returns 0 for no sessions and no interviews', () => {
    expect(computeFrustrationScore([], [])).toBe(0);
  });

  it('returns higher score for more frustration points', () => {
    const calm = [makeSession({ analysis: { frustration_points: [] } })];
    const angry = [makeSession({ analysis: { frustration_points: Array.from({ length: 8 }, (_, i) => ({ timestamp: `${i}:00`, issue: `issue-${i}` })) } })];
    expect(computeFrustrationScore(angry, [])).toBeGreaterThan(computeFrustrationScore(calm, []));
  });

  it('negative interview sentiment increases frustration', () => {
    const sessions = [makeSession()];
    const noInterview = computeFrustrationScore(sessions, []);
    const withInterview = computeFrustrationScore(sessions, [makeInterview({ sentiment: 'negative' })]);
    expect(withInterview).toBeGreaterThan(noInterview);
  });

  it('caps at 100', () => {
    const sessions = Array.from({ length: 20 }, () =>
      makeSession({ analysis: { ux_rating: 1, frustration_points: Array.from({ length: 20 }, (_, i) => ({ timestamp: `${i}:00`, issue: `issue-${i}` })) } })
    );
    const interviews = Array.from({ length: 10 }, () => makeInterview());
    expect(computeFrustrationScore(sessions, interviews)).toBeLessThanOrEqual(100);
  });

  it('low UX ratings increase frustration', () => {
    const highRated = [makeSession({ analysis: { ux_rating: 9, frustration_points: [] } })];
    const lowRated = [makeSession({ analysis: { ux_rating: 2, frustration_points: [] } })];
    expect(computeFrustrationScore(lowRated, [])).toBeGreaterThan(computeFrustrationScore(highRated, []));
  });
});

describe('computeRiskLevel', () => {
  it('returns "churned" for users not seen in over 30 days', () => {
    expect(computeRiskLevel(50, 50, 35)).toBe('churned');
  });

  it('returns "churned" for disengaged users not seen in 2+ weeks', () => {
    expect(computeRiskLevel(10, 30, 16)).toBe('churned');
  });

  it('returns "high" for high frustration', () => {
    expect(computeRiskLevel(50, 65, 5)).toBe('high');
  });

  it('returns "high" for low engagement + week absence', () => {
    expect(computeRiskLevel(20, 30, 10)).toBe('high');
  });

  it('returns "low" for highly engaged, low frustration, recent users', () => {
    expect(computeRiskLevel(80, 10, 1)).toBe('low');
  });

  it('returns "medium" for moderate signals', () => {
    expect(computeRiskLevel(45, 35, 5)).toBe('medium');
  });
});
