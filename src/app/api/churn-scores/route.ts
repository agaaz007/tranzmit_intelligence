import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';
import { runDailyChurnScoring } from '@/lib/churn-scoring/scorer';

/**
 * GET /api/churn-scores
 *
 * List churn scores. Params:
 *   projectId (required), date, riskLevel, segment, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const result = await getProjectWithAccess(projectId);
    if (!result) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const date = searchParams.get('date');
    const riskLevel = searchParams.get('riskLevel');
    const segment = searchParams.get('segment');
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);
    const offset = Number(searchParams.get('offset') || 0);

    const where: any = { projectId };

    if (date) {
      where.date = new Date(date);
    }
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }
    if (segment) {
      where.segment = segment;
    }

    const [scores, total] = await Promise.all([
      prisma.dailyChurnScore.findMany({
        where,
        orderBy: [{ date: 'desc' }, { riskScore: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.dailyChurnScore.count({ where }),
    ]);

    return NextResponse.json({ scores, total, limit, offset });
  } catch (error: any) {
    console.error('[ChurnScores API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch churn scores' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/churn-scores
 *
 * Manual trigger. Body: { projectId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const result = await getProjectWithAccess(projectId);
    if (!result) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const summary = await runDailyChurnScoring(projectId);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('[ChurnScores API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to compute churn scores' },
      { status: 500 }
    );
  }
}
