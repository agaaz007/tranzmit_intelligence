import { NextRequest, NextResponse } from 'next/server';
import { createPostHogClient } from '@/lib/posthog';
import { prisma } from '@/lib/prisma';

// GET /api/sessions/[sessionId]/summary - Get AI summary for a session
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const { sessionId } = await params;
    const projectId = request.nextUrl.searchParams.get('projectId');
    const comprehensive = request.nextUrl.searchParams.get('comprehensive') === 'true';

    if (!projectId) {
        return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    if (!sessionId) {
        return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }

        const posthogClient = createPostHogClient({
            apiKey: project.posthogKey,
            projectId: project.posthogProjId,
            host: project.posthogHost,
        });

        // If comprehensive flag is set, return full session data
        if (comprehensive) {
            const comprehensiveData = await posthogClient.getComprehensiveSessionData(sessionId);
            
            return NextResponse.json({
                sessionId,
                recording: comprehensiveData.recording,
                events: comprehensiveData.events,
                person: comprehensiveData.person,
                summary: comprehensiveData.summary,
                consoleLogs: comprehensiveData.consoleLogs,
                available: true,
            });
        }

        // Otherwise just return AI summary
        const summary = await posthogClient.getSessionAISummary(sessionId);

        return NextResponse.json({
            sessionId,
            summary,
            available: !!summary,
        });
    } catch (error) {
        console.error('Failed to fetch session data:', error);
        return NextResponse.json(
            { 
                error: error instanceof Error ? error.message : 'Failed to fetch session data',
                sessionId,
                summary: null,
                available: false,
            },
            { status: 200 } // Return 200 even on failure so UI can handle gracefully
        );
    }
}
