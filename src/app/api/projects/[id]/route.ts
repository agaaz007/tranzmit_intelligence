import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/projects/[id] - Get project details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ project });
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
 * Body: name?, posthogKey?, posthogHost?, posthogProjId?
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, posthogKey, posthogHost, posthogProjId } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (posthogKey !== undefined) updateData.posthogKey = posthogKey;
    if (posthogHost !== undefined) updateData.posthogHost = posthogHost;
    if (posthogProjId !== undefined) updateData.posthogProjId = posthogProjId;

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
