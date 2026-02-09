import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { SessionListItem, SessionWithEvents } from '@/types/session';

// GET: Get single session (optionally with events)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;
    const { searchParams } = new URL(req.url);
    const includeEvents = searchParams.get('includeEvents') === 'true';

    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        name: true,
        source: true,
        posthogSessionId: true,
        distinctId: true,
        startTime: true,
        endTime: true,
        duration: true,
        eventCount: true,
        analysisStatus: true,
        analysis: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        events: includeEvents, // Only include if requested
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (includeEvents) {
      const sessionWithEvents: SessionWithEvents = {
        id: session.id,
        projectId: session.projectId,
        name: session.name,
        source: session.source as 'upload' | 'posthog',
        posthogSessionId: session.posthogSessionId || undefined,
        distinctId: session.distinctId || undefined,
        startTime: session.startTime?.toISOString(),
        endTime: session.endTime?.toISOString(),
        duration: session.duration || undefined,
        eventCount: session.eventCount,
        analysisStatus: session.analysisStatus as 'pending' | 'analyzing' | 'completed' | 'failed',
        analysis: session.analysis ? JSON.parse(session.analysis) : undefined,
        hasEvents: !!session.events,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        events: session.events ? JSON.parse(session.events) : [],
      };
      return NextResponse.json(sessionWithEvents);
    }

    const sessionItem: SessionListItem = {
      id: session.id,
      projectId: session.projectId,
      name: session.name,
      source: session.source as 'upload' | 'posthog',
      posthogSessionId: session.posthogSessionId || undefined,
      distinctId: session.distinctId || undefined,
      startTime: session.startTime?.toISOString(),
      endTime: session.endTime?.toISOString(),
      duration: session.duration || undefined,
      eventCount: session.eventCount,
      analysisStatus: session.analysisStatus as 'pending' | 'analyzing' | 'completed' | 'failed',
      analysis: session.analysis ? JSON.parse(session.analysis) : undefined,
      hasEvents: true,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };

    return NextResponse.json(sessionItem);
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Remove session
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await prisma.session.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
