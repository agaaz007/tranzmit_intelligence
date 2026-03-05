import { prisma } from '@/lib/prisma';

export interface ErrorSessionCorrelation { errorEventId: string; sessionId: string; confidence: 'high' | 'medium' | 'low'; timeDeltaSeconds: number; }

const WINDOW_SECONDS = 300; // 5 minutes

export async function correlateErrorsWithSessions(projectId: string): Promise<ErrorSessionCorrelation[]> {
  const errors = await prisma.userErrorEvent.findMany({
    where: { projectId, sessionId: null },
    include: { userProfile: { include: { identifiers: true } } },
    orderBy: { occurredAt: 'desc' },
    take: 500,
  });

  const correlations: ErrorSessionCorrelation[] = [];

  for (const error of errors) {
    if (!error.userProfile) continue;
    const distinctIds = error.userProfile.identifiers.map(i => i.identifier);
    if (distinctIds.length === 0) continue;

    const errorTime = error.occurredAt.getTime();
    const windowStart = new Date(errorTime - WINDOW_SECONDS * 1000);
    const windowEnd = new Date(errorTime + WINDOW_SECONDS * 1000);

    const sessions = await prisma.session.findMany({
      where: { projectId, distinctId: { in: distinctIds }, startTime: { lte: windowEnd, gte: windowStart } },
      orderBy: { startTime: 'desc' },
    });
    if (sessions.length === 0) continue;

    let bestSession = sessions[0];
    let bestDelta = Infinity;
    let bestConf: 'high' | 'medium' | 'low' = 'low';

    for (const s of sessions) {
      const start = s.startTime!.getTime();
      const end = s.endTime ? s.endTime.getTime() : start + (s.duration || 0) * 1000;
      let delta: number;
      if (errorTime >= start && errorTime <= end) delta = 0;
      else if (errorTime < start) delta = (start - errorTime) / 1000;
      else delta = (errorTime - end) / 1000;

      if (delta < bestDelta) {
        bestDelta = delta;
        bestSession = s;
        bestConf = delta === 0 ? 'high' : delta <= 60 ? 'medium' : 'low';
      }
    }

    await prisma.userErrorEvent.update({ where: { id: error.id }, data: { sessionId: bestSession.id } });
    correlations.push({ errorEventId: error.id, sessionId: bestSession.id, confidence: bestConf, timeDeltaSeconds: Math.round(bestDelta) });
  }
  return correlations;
}
