import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncSessionsFromPostHog } from '@/lib/session-sync';
import { syncSessionsFromMixpanel } from '@/lib/mixpanel-sync';

// POST: Batch import sessions from PostHog or Mixpanel
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, count = 10, source, daysBack = 7 } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Get project to check which integration is configured
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        posthogKey: true,
        posthogProjId: true,
        mixpanelKey: true,
        mixpanelProjId: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const hasPostHog = project.posthogKey && project.posthogProjId;
    const hasMixpanel = project.mixpanelKey && project.mixpanelProjId;

    let result;
    let usedSource: string;

    // Use explicit source if provided, otherwise auto-detect
    if (source === 'mixpanel' || (!source && hasMixpanel && !hasPostHog)) {
      if (!hasMixpanel) {
        return NextResponse.json({ error: 'Mixpanel not configured for this project' }, { status: 400 });
      }
      result = await syncSessionsFromMixpanel(projectId, daysBack);
      usedSource = 'mixpanel';
    } else if (source === 'posthog' || (!source && hasPostHog)) {
      if (!hasPostHog) {
        return NextResponse.json({ error: 'PostHog not configured for this project' }, { status: 400 });
      }
      result = await syncSessionsFromPostHog(projectId, count);
      usedSource = 'posthog';
    } else {
      return NextResponse.json({ error: 'No analytics integration configured. Please configure PostHog or Mixpanel in Settings.' }, { status: 400 });
    }

    return NextResponse.json({ ...result, source: usedSource });
  } catch (error) {
    console.error('[Session Sync] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }, { status: 500 });
  }
}
