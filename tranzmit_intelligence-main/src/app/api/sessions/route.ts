import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { SessionListItem, CreateSessionInput, SessionsListResponse } from '@/types/session';
import { getProjectWithAccess } from '@/lib/auth';

// GET: List sessions for a project (without events for performance)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const source = searchParams.get('source') || 'all';

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Verify user has access to this project
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const skip = (page - 1) * limit;
    const distinctId = searchParams.get('distinctId');

    // Build where clause
    const where: { projectId: string; source?: string; distinctId?: string } = { projectId };
    if (source !== 'all') {
      where.source = source;
    }
    if (distinctId) {
      where.distinctId = distinctId;
    }

    // Fetch sessions without events (for performance)
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
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
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.session.count({ where }),
    ]);

    // Transform to SessionListItem format
    const sessionList: SessionListItem[] = sessions.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      source: s.source as 'upload' | 'posthog',
      posthogSessionId: s.posthogSessionId || undefined,
      distinctId: s.distinctId || undefined,
      startTime: s.startTime?.toISOString(),
      endTime: s.endTime?.toISOString(),
      duration: s.duration || undefined,
      eventCount: s.eventCount,
      analysisStatus: s.analysisStatus as 'pending' | 'analyzing' | 'completed' | 'failed',
      analysis: s.analysis ? JSON.parse(s.analysis) : undefined,
      hasEvents: true, // Events are stored in DB
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    const response: SessionsListResponse = {
      sessions: sessionList,
      total,
      page,
      limit,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error listing sessions:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Create a new session (from upload)
export async function POST(req: NextRequest) {
  try {
    const body: CreateSessionInput = await req.json();
    const { projectId, name, events, source, posthogSessionId, distinctId, startTime, endTime, duration, metadata } = body;

    if (!projectId || !name || !events || !source) {
      return NextResponse.json({ error: 'projectId, name, events, and source are required' }, { status: 400 });
    }

    // Verify user has access to this project
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if session already exists (for PostHog deduplication)
    if (posthogSessionId) {
      const existing = await prisma.session.findUnique({
        where: { projectId_posthogSessionId: { projectId, posthogSessionId } },
      });
      if (existing) {
        return NextResponse.json({ error: 'Session already exists', sessionId: existing.id }, { status: 409 });
      }
    }

    // Create session
    const session = await prisma.session.create({
      data: {
        projectId,
        name,
        source,
        posthogSessionId,
        distinctId,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        duration,
        events: JSON.stringify(events),
        eventCount: events.length,
        metadata: metadata ? JSON.stringify(metadata) : null,
        analysisStatus: 'pending',
      },
    });

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
      hasEvents: true,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };

    return NextResponse.json({ session: sessionItem }, { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
