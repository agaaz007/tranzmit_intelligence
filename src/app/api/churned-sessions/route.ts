import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const batchId = searchParams.get('batchId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      projectId,
      source: 'churned',
    };

    // If batchId filter, we need to filter by metadata containing batchId
    // Since metadata is a JSON string, we use contains
    if (batchId) {
      where.metadata = { contains: batchId };
    }

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          source: true,
          distinctId: true,
          startTime: true,
          endTime: true,
          duration: true,
          eventCount: true,
          analysis: true,
          analysisStatus: true,
          analyzedAt: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.session.count({ where }),
    ]);

    // Parse analysis and metadata JSON
    const parsedSessions = sessions.map((s) => {
      let analysis = null;
      let metadata = null;
      try {
        analysis = s.analysis ? JSON.parse(s.analysis) : null;
      } catch { /* ignore */ }
      try {
        metadata = s.metadata ? JSON.parse(s.metadata) : null;
      } catch { /* ignore */ }

      return {
        ...s,
        analysis,
        metadata,
      };
    });

    return NextResponse.json({
      sessions: parsedSessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Churned sessions list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
