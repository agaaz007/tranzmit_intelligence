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
    const insight = await prisma.synthesizedInsight.findUnique({
      where: { projectId },
    });

    if (!insight) {
      return NextResponse.json(null);
    }

    const data: SynthesizedInsightData = {
      id: insight.id,
      projectId: insight.projectId,
      sessionCount: insight.sessionCount,
      criticalIssues: insight.criticalIssues ? JSON.parse(insight.criticalIssues) : [],
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
