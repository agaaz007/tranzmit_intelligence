import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPostHogClient } from '@/lib/posthog';
import {
  analyzeCohortBehavior,
  storeCohortAnalysis,
  getCohortAnalyses,
} from '@/lib/cohort-analysis';
import { getProjectWithAccess } from '@/lib/auth';

/**
 * GET /api/cohorts - List cohorts
 * Query params: projectId (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const cohortId = searchParams.get('cohortId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this project
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get specific cohort with analyses and hypotheses
    if (cohortId) {
      const cohort = await prisma.cohort.findUnique({
        where: { id: cohortId },
        include: {
          analyses: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          hypotheses: {
            orderBy: { confidence: 'desc' },
            include: {
              questions: {
                orderBy: { priority: 'desc' },
                take: 3,
              },
            },
          },
          _count: {
            select: { analyses: true, interviews: true, hypotheses: true },
          },
        },
      });

      if (!cohort) {
        return NextResponse.json(
          { error: 'Cohort not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        cohort: {
          ...cohort,
          criteria: cohort.criteria ? JSON.parse(cohort.criteria) : null,
          analyses: cohort.analyses.map(a => ({
            ...a,
            metrics: JSON.parse(a.metrics),
            insights: a.insights ? JSON.parse(a.insights) : null,
            dateRange: JSON.parse(a.dateRange),
          })),
          hypotheses: cohort.hypotheses.map(h => ({
            ...h,
            behaviorPattern: h.behaviorPattern, // Already a string, not JSON
            evidence: h.evidence ? JSON.parse(h.evidence) : null,
          })),
        },
      });
    }

    // List all cohorts
    const cohorts = await prisma.cohort.findMany({
      where: { projectId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { analyses: true, interviews: true },
        },
      },
    });

    return NextResponse.json({
      cohorts: cohorts.map(c => ({
        ...c,
        criteria: c.criteria ? JSON.parse(c.criteria) : null,
      })),
    });
  } catch (error: any) {
    console.error('[Cohorts API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch cohorts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cohorts - Create cohort or run analysis
 * Body:
 * - action: 'create' | 'analyze'
 * - For 'create': projectId, name, description, userIds
 * - For 'analyze': cohortId, analysisType, dateRange
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const { projectId, name, description, userIds, size, criteria } = body;

      if (!projectId || !name) {
        return NextResponse.json(
          { error: 'projectId and name are required' },
          { status: 400 }
        );
      }

      // Verify user has access to this project
      const projectAccess = await getProjectWithAccess(projectId);
      if (!projectAccess) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Determine criteria to store
      // If criteria is provided directly (as string), use it
      // Otherwise, if userIds provided, create criteria from that
      let criteriaToStore: string | null = null;
      if (criteria) {
        // criteria might already be stringified or an object
        criteriaToStore = typeof criteria === 'string' ? criteria : JSON.stringify(criteria);
      } else if (userIds) {
        criteriaToStore = JSON.stringify({ userIds });
      }

      // Create cohort in database
      const cohort = await prisma.cohort.create({
        data: {
          projectId,
          name,
          description,
          size: size || (userIds ? userIds.length : 0),
          criteria: criteriaToStore,
          status: 'active',
        },
      });

      // Optionally create in PostHog (if needed)
      // const project = await prisma.project.findUnique({ where: { id: projectId } });
      // const posthogClient = createPostHogClient({...});
      // await posthogClient.createCohort(name, userIds);

      return NextResponse.json({ cohort });
    }

    if (action === 'analyze') {
      const { cohortId, analysisType = 'behavior', dateRange } = body;

      if (!cohortId) {
        return NextResponse.json(
          { error: 'cohortId is required' },
          { status: 400 }
        );
      }

      const cohort = await prisma.cohort.findUnique({
        where: { id: cohortId },
        include: { project: true },
      });

      if (!cohort) {
        return NextResponse.json(
          { error: 'Cohort not found' },
          { status: 404 }
        );
      }

      // Create PostHog client
      const posthogClient = createPostHogClient({
        apiKey: cohort.project.posthogKey,
        projectId: cohort.project.posthogProjId,
        host: cohort.project.posthogHost,
      });

      // Run analysis
      const { metrics, insights } = await analyzeCohortBehavior(
        cohortId,
        posthogClient,
        dateRange
      );

      // Store analysis
      const analysis = await storeCohortAnalysis(
        cohortId,
        analysisType,
        metrics,
        insights,
        dateRange || { from: '-30d', to: 'now' }
      );

      return NextResponse.json({
        analysis: {
          ...analysis,
          metrics,
          insights,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be "create" or "analyze"' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[Cohorts API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cohorts - Archive a cohort
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get('cohortId');

    if (!cohortId) {
      return NextResponse.json(
        { error: 'cohortId is required' },
        { status: 400 }
      );
    }

    const cohort = await prisma.cohort.update({
      where: { id: cohortId },
      data: { status: 'archived' },
    });

    return NextResponse.json({ cohort });
  } catch (error: any) {
    console.error('[Cohorts API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive cohort' },
      { status: 500 }
    );
  }
}
