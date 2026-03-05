export interface SessionSummary {
  analysisStatus: string;
  analysis: ParsedAnalysis | null;
  startTime: Date | null;
  duration: number | null;
}

export interface ParsedAnalysis {
  ux_rating?: number;
  frustration_points?: Array<{ timestamp: string; issue: string }>;
  tags?: string[];
  user_intent?: string;
  summary?: string;
}

export interface InterviewSummary {
  sentiment?: string;
  satisfaction?: number;
  painPoints?: Array<{ point: string; severity: string }>;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'churned';

export function computeEngagementScore(sessions: SessionSummary[]): number {
  if (sessions.length === 0) return 0;

  // Session count contribution (max 40 points)
  const sessionPoints = Math.min(sessions.length / 10, 1) * 40;

  // Average duration contribution (max 20 points)
  const durations = sessions.map(s => s.duration ?? 0).filter(d => d > 0);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const durationPoints = Math.min(avgDuration / 300, 1) * 20;

  // Completion rate contribution (max 20 points)
  const completedCount = sessions.filter(s => s.analysisStatus === 'completed').length;
  const completionRate = completedCount / sessions.length;
  const completionPoints = completionRate * 20;

  // Average UX rating contribution (max 20 points)
  const ratings = sessions
    .map(s => s.analysis?.ux_rating)
    .filter((r): r is number => r != null && r > 0);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 5;
  const ratingPoints = (avgRating / 10) * 20;

  return Math.round(Math.min(100, sessionPoints + durationPoints + completionPoints + ratingPoints));
}

export function computeFrustrationScore(sessions: SessionSummary[], interviews: InterviewSummary[]): number {
  if (sessions.length === 0 && interviews.length === 0) return 0;

  let score = 0;

  // Average frustration points per session (max 40 points)
  if (sessions.length > 0) {
    const totalFrustrationPoints = sessions.reduce((sum, s) => {
      return sum + (s.analysis?.frustration_points?.length ?? 0);
    }, 0);
    const avgFrustration = totalFrustrationPoints / sessions.length;
    score += Math.min(avgFrustration / 5, 1) * 40;
  }

  // Low UX ratings (max 30 points)
  if (sessions.length > 0) {
    const ratings = sessions
      .map(s => s.analysis?.ux_rating)
      .filter((r): r is number => r != null);
    if (ratings.length > 0) {
      const lowRatingCount = ratings.filter(r => r < 4).length;
      const lowRatingRatio = lowRatingCount / ratings.length;
      score += lowRatingRatio * 30;
    }
  }

  // Negative interview sentiment (max 30 points)
  const negativeInterviews = interviews.filter(i => i.sentiment === 'negative').length;
  score += Math.min(negativeInterviews * 15, 30);

  return Math.round(Math.min(100, score));
}

export function computeRiskLevel(engagement: number, frustration: number, daysSinceLastSeen: number): RiskLevel {
  if (daysSinceLastSeen > 30 || (daysSinceLastSeen > 14 && engagement < 20)) {
    return 'churned';
  }
  if (frustration > 60 || (engagement < 30 && daysSinceLastSeen > 7)) {
    return 'high';
  }
  if (frustration > 40 || engagement < 50) {
    return 'medium';
  }
  return 'low';
}
