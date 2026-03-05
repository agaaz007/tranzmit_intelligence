import { prisma } from '@/lib/prisma';
import { discoverPatterns } from './pattern-discovery';

interface TriggerCheckResult {
  triggered: boolean;
  reason: string;
  result?: Awaited<ReturnType<typeof discoverPatterns>>;
}

const SESSION_THRESHOLD = 10;
const HOURS_BETWEEN_RUNS = 24;

export async function checkAndTriggerDiscovery(projectId: string): Promise<TriggerCheckResult> {
  const lastPattern = await prisma.discoveredPattern.findFirst({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (lastPattern) {
    const hoursSinceLast = (Date.now() - lastPattern.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < HOURS_BETWEEN_RUNS) {
      return { triggered: false, reason: `Last discovery ran ${Math.round(hoursSinceLast)}h ago (threshold: ${HOURS_BETWEEN_RUNS}h)` };
    }
  }

  const newSessionCount = await prisma.session.count({
    where: {
      projectId,
      analysisStatus: 'completed',
      createdAt: lastPattern ? { gt: lastPattern.createdAt } : undefined,
    },
  });

  if (newSessionCount < SESSION_THRESHOLD && lastPattern) {
    return { triggered: false, reason: `Only ${newSessionCount} new sessions (threshold: ${SESSION_THRESHOLD})` };
  }

  const result = await discoverPatterns(projectId);
  return { triggered: true, reason: `Discovered patterns from ${newSessionCount} new sessions`, result };
}
