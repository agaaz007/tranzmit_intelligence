import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

/**
 * GET /api/projects/[id] - Get project details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify user has access to this project
    const result = await getProjectWithAccess(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({ project: result.project });
  } catch (error: any) {
    console.error('[Projects API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id] - Update project settings
 * Body: name?, posthogKey?, posthogHost?, posthogProjId?, mixpanelKey?, mixpanelSecret?, mixpanelProjId?, mixpanelHost?
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify user has access to this project
    const result = await getProjectWithAccess(id);

    if (!result) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      posthogKey,
      posthogHost,
      posthogProjId,
      mixpanelKey,
      mixpanelSecret,
      mixpanelProjId,
      mixpanelHost,
      elevenlabsAgentId,
    } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (posthogKey !== undefined) updateData.posthogKey = posthogKey;
    if (posthogHost !== undefined) updateData.posthogHost = posthogHost;
    if (posthogProjId !== undefined) updateData.posthogProjId = posthogProjId;
    // Mixpanel fields
    if (mixpanelKey !== undefined) updateData.mixpanelKey = mixpanelKey;
    if (mixpanelSecret !== undefined) updateData.mixpanelSecret = mixpanelSecret;
    if (mixpanelProjId !== undefined) updateData.mixpanelProjId = mixpanelProjId;
    if (mixpanelHost !== undefined) updateData.mixpanelHost = mixpanelHost;
    // ElevenLabs
    if (elevenlabsAgentId !== undefined) updateData.elevenlabsAgentId = elevenlabsAgentId;

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ project });
  } catch (error: any) {
    console.error('[Projects API] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update project' },
      { status: 500 }
    );
  }
}
