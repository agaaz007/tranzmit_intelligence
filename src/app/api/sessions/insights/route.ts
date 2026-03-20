import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { SynthesizedInsightData } from '@/types/session';

// GET: Fetch persisted synthesized insights for a project
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const [insight, actualSessionCount] = await Promise.all([
      prisma.synthesizedInsight.findUnique({ where: { projectId } }),
      prisma.session.count({ where: { projectId } }),
    ]);

    if (!insight) {
      return NextResponse.json(null);
    }

    // Normalize critical issues — the dashboard synthesize route stores
    // `linked_sessions` + `evidence.session_count` instead of `sessionIds`,
    // so we unify both shapes into EnhancedCriticalIssue format.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawIssues: any[] = insight.criticalIssues ? JSON.parse(insight.criticalIssues) : [];
    const normalizedIssues = rawIssues.map((issue) => {
      const sessionIds: string[] = issue.sessionIds?.length
        ? issue.sessionIds
        : issue.linked_sessions?.length
          ? issue.linked_sessions
          : [];
      const evidenceCount: number = issue.evidence?.session_count || 0;
      return {
        title: issue.title || '',
        description: issue.description || '',
        frequency: issue.frequency || (evidenceCount > 0 ? `${evidenceCount} sessions affected` : ''),
        severity: issue.severity || 'medium',
        recommendation: issue.recommendation || '',
        sessionIds,
        sessionNames: issue.sessionNames || [],
        evidenceSessionCount: evidenceCount,
      };
    });

    const data: SynthesizedInsightData = {
      id: insight.id,
      projectId: insight.projectId,
      sessionCount: actualSessionCount,
      criticalIssues: normalizedIssues,
      patternSummary: insight.patternSummary || '',
      topUserGoals: insight.topUserGoals ? JSON.parse(insight.topUserGoals) : [],
      immediateActions: insight.immediateActions ? JSON.parse(insight.immediateActions) : [],
      lastSyncedAt: insight.lastSyncedAt?.toISOString() || null,
      lastAnalyzedAt: insight.lastAnalyzedAt?.toISOString() || null,
      lastSynthesizedAt: insight.lastSynthesizedAt?.toISOString() || null,
      syncStatus: insight.syncStatus,
      syncError: insight.syncError,
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Insights] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
