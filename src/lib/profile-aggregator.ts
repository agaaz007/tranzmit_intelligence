import { prisma } from '@/lib/prisma';
import { computeEngagementScore, computeFrustrationScore, computeRiskLevel } from './profile-scoring';
import type { SessionSummary, ParsedAnalysis, InterviewSummary } from './profile-scoring';

export async function aggregateProfile(userProfileId: string): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userProfileId },
    include: { identifiers: true },
  });
  if (!profile) return;

  const distinctIds = profile.identifiers.map(i => i.identifier);

  // Fetch sessions by distinctId
  const sessions = distinctIds.length > 0
    ? await prisma.session.findMany({
        where: { projectId: profile.projectId, distinctId: { in: distinctIds } },
        select: { id: true, analysisStatus: true, analysis: true, startTime: true, duration: true },
        orderBy: { startTime: 'asc' },
      })
    : [];

  // Fetch interviews by email
  const interviews = profile.canonicalEmail
    ? await prisma.interview.findMany({
        where: { projectId: profile.projectId, userEmail: profile.canonicalEmail },
        include: { insights: true },
      })
    : [];

  // Map to scoring types
  const sessionSummaries: SessionSummary[] = sessions.map(s => {
    let analysis: ParsedAnalysis | null = null;
    if (s.analysis) {
      try { analysis = JSON.parse(s.analysis); } catch {}
    }
    return {
      analysisStatus: s.analysisStatus,
      analysis,
      startTime: s.startTime,
      duration: s.duration,
    };
  });

  const interviewSummaries: InterviewSummary[] = interviews.flatMap(i =>
    i.insights.map(ins => ({
      sentiment: ins.sentiment ?? undefined,
      satisfaction: ins.satisfaction ?? undefined,
      painPoints: ins.painPoints ? JSON.parse(ins.painPoints) : undefined,
    }))
  );

  const engagementScore = computeEngagementScore(sessionSummaries);
  const frustrationScore = computeFrustrationScore(sessionSummaries, interviewSummaries);

  // Compute days since last seen
  const startTimes = sessions.map(s => s.startTime).filter((t): t is Date => t !== null);
  const lastSeen = startTimes.length > 0 ? new Date(Math.max(...startTimes.map(t => t.getTime()))) : null;
  const firstSeen = startTimes.length > 0 ? new Date(Math.min(...startTimes.map(t => t.getTime()))) : null;
  const daysSinceLastSeen = lastSeen ? (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24) : 999;

  const riskLevel = computeRiskLevel(engagementScore, frustrationScore, daysSinceLastSeen);

  const totalErrors = await prisma.userErrorEvent.count({ where: { userProfileId } });

  // Build behavioral summary
  const allTags = sessionSummaries.flatMap(s => s.analysis?.tags ?? []);
  const allFrustrations = sessionSummaries.flatMap(s =>
    (s.analysis?.frustration_points ?? []).map(fp => fp.issue)
  );
  const tagCounts = new Map<string, number>();
  for (const tag of allTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

  const behavioralSummary = JSON.stringify({
    engagement_pattern: engagementScore > 70 ? 'highly engaged' : engagementScore > 40 ? 'moderately engaged' : 'low engagement',
    frustration_level: frustrationScore > 60 ? 'very frustrated' : frustrationScore > 30 ? 'somewhat frustrated' : 'low frustration',
    top_tags: topTags,
    drop_off_points: [...new Set(allFrustrations)].slice(0, 5),
    session_frequency: sessions.length <= 2 ? 'minimal' : sessions.length <= 8 ? 'moderate' : 'frequent',
  });

  await prisma.userProfile.update({
    where: { id: userProfileId },
    data: {
      behavioralSummary,
      engagementScore,
      frustrationScore,
      riskLevel,
      totalSessions: sessions.length,
      totalErrors,
      firstSeen,
      lastSeen,
    },
  });
}
