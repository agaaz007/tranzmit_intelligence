import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, distinctIds, userName, interviewApiKey } = body;

    if (!projectId || !Array.isArray(distinctIds) || distinctIds.length === 0) {
      return NextResponse.json({ error: 'projectId and distinctIds are required' }, { status: 400 });
    }

    const access = await getProjectWithAccess(projectId);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const triggers = await Promise.all(
      distinctIds.map(async (distinctId: string) => {
        // Upsert: if there's already a pending trigger for this user, reset it
        const existing = await prisma.widgetTrigger.findFirst({
          where: { projectId, distinctId, status: 'pending' },
        });

        if (existing) {
          return prisma.widgetTrigger.update({
            where: { id: existing.id },
            data: { expiresAt, userName: userName || existing.userName, interviewApiKey: interviewApiKey || existing.interviewApiKey, updatedAt: new Date() },
          });
        }

        return prisma.widgetTrigger.create({
          data: { projectId, distinctId, userName, interviewApiKey, expiresAt },
        });
      })
    );

    return NextResponse.json({ ok: true, count: triggers.length });
  } catch (error) {
    console.error('[Widget Trigger] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const access = await getProjectWithAccess(projectId);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const triggers = await prisma.widgetTrigger.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ triggers });
  } catch (error) {
    console.error('[Widget Trigger GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
