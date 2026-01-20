import { NextRequest, NextResponse } from 'next/server';
import {
  detectAndCreateCohorts,
  getAutoCohorts,
  refreshAutoCohort,
} from '@/lib/auto-cohort-generator';

/**
 * GET /api/auto-cohorts - Get auto-generated cohorts for a project
 * Query params:
 * - projectId: required
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const cohorts = await getAutoCohorts(projectId);

    return NextResponse.json({
      cohorts,
      total: cohorts.length,
    });
  } catch (error: any) {
    console.error('[Auto Cohorts API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch auto-cohorts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auto-cohorts - Generate auto-cohorts from behavioral patterns
 * Body:
 * - projectId: required
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const generatedCohorts = await detectAndCreateCohorts(projectId);

    return NextResponse.json({
      success: true,
      cohorts: generatedCohorts,
      total: generatedCohorts.length,
      message: generatedCohorts.length > 0
        ? `Created ${generatedCohorts.length} auto-cohort(s)`
        : 'No new patterns detected that meet the minimum threshold',
    });
  } catch (error: any) {
    console.error('[Auto Cohorts API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate auto-cohorts' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auto-cohorts - Refresh an auto-cohort with latest data
 * Body:
 * - cohortId: required
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { cohortId } = body;

    if (!cohortId) {
      return NextResponse.json(
        { error: 'cohortId is required' },
        { status: 400 }
      );
    }

    const result = await refreshAutoCohort(cohortId);

    return NextResponse.json({
      success: true,
      ...result,
      message: `Refreshed cohort: added ${result.added}, removed ${result.removed}`,
    });
  } catch (error: any) {
    console.error('[Auto Cohorts API] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh auto-cohort' },
      { status: 500 }
    );
  }
}
