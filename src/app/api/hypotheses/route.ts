import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getCohortHypotheses,
  updateHypothesisStatus,
  generateInterviewScript,
  generateHypothesesFromSignals,
  storeHypotheses,
} from '@/lib/hypothesis-generator';

/**
 * GET /api/hypotheses - Get hypotheses
 * Query params:
 * - cohortId: required
 * - status: optional filter
 * - includeScript: optional, include generated interview script
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get('cohortId');
    const status = searchParams.get('status');
    const includeScript = searchParams.get('includeScript') === 'true';

    if (!cohortId) {
      return NextResponse.json(
        { error: 'cohortId is required' },
        { status: 400 }
      );
    }

    const hypotheses = await getCohortHypotheses(cohortId, {
      status: status || undefined,
    });

    const response: any = {
      hypotheses,
      total: hypotheses.length,
    };

    // Generate interview script if requested
    if (includeScript && hypotheses.length > 0) {
      response.interviewScript = generateInterviewScript(
        hypotheses.map(h => ({
          ...h,
          behaviorPattern: h.behaviorPattern || 'unknown',
          evidence: h.evidence,
          questions: h.questions,
        }))
      );
    }

    // Get cohort info
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { name: true, type: true, size: true },
    });

    response.cohort = cohort;

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Hypotheses API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get hypotheses' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hypotheses - Generate hypotheses for a cohort
 * Body:
 * - cohortId: required
 * - regenerate: optional, delete existing and regenerate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cohortId, regenerate } = body;

    if (!cohortId) {
      return NextResponse.json(
        { error: 'cohortId is required' },
        { status: 400 }
      );
    }

    // If regenerate, delete existing hypotheses first
    if (regenerate) {
      await prisma.interviewQuestion.deleteMany({
        where: { hypothesis: { cohortId } },
      });
      await prisma.hypothesis.deleteMany({
        where: { cohortId },
      });
    }

    // Get cohort members' signals
    const members = await prisma.cohortMember.findMany({
      where: { cohortId },
      orderBy: { priorityScore: 'desc' },
      take: 50,
    });

    if (members.length === 0) {
      return NextResponse.json({
        hypothesesGenerated: 0,
        message: 'No cohort members found. Build priority queue first.',
      });
    }

    // Collect all signals
    const allSignals = members.flatMap(m =>
      m.signals ? JSON.parse(m.signals) : []
    );

    if (allSignals.length === 0) {
      return NextResponse.json({
        hypothesesGenerated: 0,
        message: 'No behavioral signals found in cohort members.',
      });
    }

    // Get cohort context
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { name: true, type: true, size: true },
    });

    // Generate hypotheses
    const hypotheses = generateHypothesesFromSignals(allSignals, {
      name: cohort?.name || 'Unknown',
      type: cohort?.type || 'manual',
      size: cohort?.size || members.length,
    });

    // Store top 10 hypotheses
    const stored = await storeHypotheses(cohortId, hypotheses.slice(0, 10));

    return NextResponse.json({
      hypothesesGenerated: stored,
      hypotheses: hypotheses.slice(0, 10),
    });
  } catch (error: any) {
    console.error('[Hypotheses API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate hypotheses' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/hypotheses - Update hypothesis status
 * Body:
 * - hypothesisId: required
 * - status: 'active' | 'validated' | 'invalidated'
 * - validationNotes: optional notes
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { hypothesisId, status, validationNotes } = body;

    if (!hypothesisId || !status) {
      return NextResponse.json(
        { error: 'hypothesisId and status are required' },
        { status: 400 }
      );
    }

    await updateHypothesisStatus(hypothesisId, status, validationNotes);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Hypotheses API] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update hypothesis' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/hypotheses - Delete a hypothesis
 * Query params:
 * - hypothesisId: required
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hypothesisId = searchParams.get('hypothesisId');

    if (!hypothesisId) {
      return NextResponse.json(
        { error: 'hypothesisId is required' },
        { status: 400 }
      );
    }

    // Delete questions first (cascade should handle this, but being explicit)
    await prisma.interviewQuestion.deleteMany({
      where: { hypothesisId },
    });

    await prisma.hypothesis.delete({
      where: { id: hypothesisId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Hypotheses API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete hypothesis' },
      { status: 500 }
    );
  }
}
