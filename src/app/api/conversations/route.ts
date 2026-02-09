import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const source = searchParams.get('source');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const where: Record<string, string> = { projectId };
    if (source) {
      where.source = source;
    }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { conversedAt: 'desc' },
      select: {
        id: true,
        source: true,
        externalId: true,
        participantName: true,
        participantEmail: true,
        participantPhone: true,
        status: true,
        duration: true,
        analysisStatus: true,
        metadata: true,
        createdAt: true,
        conversedAt: true,
      },
    });

    const parsed = conversations.map((c) => ({
      ...c,
      metadata: c.metadata ? JSON.parse(c.metadata) : null,
    }));

    return NextResponse.json({ conversations: parsed });
  } catch (error) {
    console.error('[Conversations] Failed to list:', error);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
}
