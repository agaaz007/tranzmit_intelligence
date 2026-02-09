import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/interviews - List interviews
 * Query params: projectId, cohortId, campaignId, status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const cohortId = searchParams.get('cohortId');
    const campaignId = searchParams.get('campaignId');
    const status = searchParams.get('status');
    const interviewId = searchParams.get('interviewId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Get specific interview
    if (interviewId) {
      const interview = await prisma.interview.findUnique({
        where: { id: interviewId },
        include: {
          insights: true,
          cohort: true,
          campaign: true,
        },
      });

      if (!interview) {
        return NextResponse.json(
          { error: 'Interview not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        interview: {
          ...interview,
          transcript: interview.transcript ? JSON.parse(interview.transcript) : null,
          metadata: interview.metadata ? JSON.parse(interview.metadata) : null,
          insights: interview.insights.map(ins => ({
            ...ins,
            painPoints: ins.painPoints ? JSON.parse(ins.painPoints) : null,
            suggestions: ins.suggestions ? JSON.parse(ins.suggestions) : null,
            themes: ins.themes ? JSON.parse(ins.themes) : null,
          })),
        },
      });
    }

    // List interviews with filters
    const where: any = { projectId };
    if (cohortId) where.cohortId = cohortId;
    if (campaignId) where.campaignId = campaignId;
    if (status) where.status = status;

    const interviews = await prisma.interview.findMany({
      where,
      include: {
        cohort: {
          select: { id: true, name: true },
        },
        campaign: {
          select: { id: true, name: true },
        },
        insights: {
          select: { id: true, sentiment: true, satisfaction: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ interviews });
  } catch (error: any) {
    console.error('[Interviews API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch interviews' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/interviews - Create/schedule interview
 * Body: projectId, userId, userEmail, userName, cohortId?, campaignId?, scheduledAt?
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      userId,
      userEmail,
      userName,
      cohortId,
      campaignId,
      scheduledAt,
      metadata,
    } = body;

    if (!projectId || !userId) {
      return NextResponse.json(
        { error: 'projectId and userId are required' },
        { status: 400 }
      );
    }

    const interview = await prisma.interview.create({
      data: {
        projectId,
        userId,
        userEmail,
        userName,
        cohortId,
        campaignId,
        status: scheduledAt ? 'scheduled' : 'in_progress',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return NextResponse.json({ interview });
  } catch (error: any) {
    console.error('[Interviews API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create interview' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/interviews - Update interview
 * Body: interviewId, status?, transcript?, notes?
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { interviewId, status, transcript, notes, startedAt, completedAt } = body;

    if (!interviewId) {
      return NextResponse.json(
        { error: 'interviewId is required' },
        { status: 400 }
      );
    }

    const updateData: any = { updatedAt: new Date() };

    if (status) updateData.status = status;
    if (transcript) updateData.transcript = JSON.stringify(transcript);
    if (notes !== undefined) updateData.notes = notes;
    if (startedAt) updateData.startedAt = new Date(startedAt);
    if (completedAt) updateData.completedAt = new Date(completedAt);

    const interview = await prisma.interview.update({
      where: { id: interviewId },
      data: updateData,
    });

    return NextResponse.json({ interview });
  } catch (error: any) {
    console.error('[Interviews API] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update interview' },
      { status: 500 }
    );
  }
}
