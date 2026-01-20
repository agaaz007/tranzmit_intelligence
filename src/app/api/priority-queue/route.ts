import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPostHogClient } from '@/lib/posthog';
import {
  buildPriorityQueue,
  storePriorityQueue,
  getPriorityQueue,
  updateMemberStatus,
  PrioritizedUser,
} from '@/lib/prioritization-engine';
import {
  generateHypothesesFromSignals,
  storeHypotheses,
} from '@/lib/hypothesis-generator';

/**
 * GET /api/priority-queue - Get prioritized interview candidates
 * Query params:
 * - projectId: required
 * - cohortId: optional, get queue for specific cohort
 * - status: optional filter by interview status
 * - limit: optional, default 50
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const cohortId = searchParams.get('cohortId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // If cohortId provided, get queue from that specific cohort
    if (cohortId) {
      const queue = await getPriorityQueue(cohortId, {
        limit,
        status: status || undefined,
      });

      const cohort = await prisma.cohort.findUnique({
        where: { id: cohortId },
        select: { name: true, type: true, size: true },
      });

      return NextResponse.json({
        queue,
        cohort,
        total: queue.length,
      });
    }

    // Otherwise, get all cohort members across project cohorts
    const cohorts = await prisma.cohort.findMany({
      where: { projectId, status: 'active' },
      include: {
        members: {
          where: status ? { interviewStatus: status } : {},
          orderBy: { priorityScore: 'desc' },
          take: limit,
        },
      },
    });

    const allMembers: PrioritizedUser[] = [];
    for (const cohort of cohorts) {
      for (const member of cohort.members) {
        allMembers.push({
          distinctId: member.distinctId,
          email: member.email || undefined,
          name: member.name || undefined,
          properties: member.properties ? JSON.parse(member.properties) : {},
          signals: member.signals ? JSON.parse(member.signals) : [],
          priorityScore: member.priorityScore,
          signalSummary: member.signalSummary || '',
          cohortId: cohort.id,
          cohortName: cohort.name,
        });
      }
    }

    // Sort by priority and limit
    const sortedMembers = allMembers
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);

    return NextResponse.json({
      queue: sortedMembers,
      total: sortedMembers.length,
    });
  } catch (error: any) {
    console.error('[Priority Queue API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get priority queue' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/priority-queue - Build or refresh priority queue
 * Body:
 * - action: 'build' | 'refresh' | 'generate_hypotheses'
 * - projectId: required
 * - cohortId: optional (for refresh/hypotheses)
 * - cohortType: optional filter for building queue
 * - autoCreateCohort: optional, auto-create cohort from results
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, projectId, cohortId, cohortType, autoCreateCohort } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    if (action === 'build') {
      // Build priority queue from PostHog data
      const queue = await buildPriorityQueue(projectId, {
        cohortType,
        limit: 100,
      });

      if (queue.length === 0) {
        return NextResponse.json({
          queue: [],
          message: 'No users found matching criteria',
        });
      }

      // Auto-create cohort if requested
      let createdCohort = null;
      if (autoCreateCohort && queue.length > 0) {
        const cohortName = cohortType
          ? `${cohortType.replace('_', ' ')} cohort - ${new Date().toLocaleDateString()}`
          : `Priority interviews - ${new Date().toLocaleDateString()}`;

        createdCohort = await prisma.cohort.create({
          data: {
            projectId,
            name: cohortName,
            type: cohortType || 'manual',
            size: queue.length,
            status: 'active',
          },
        });

        // Store members
        await storePriorityQueue(createdCohort.id, queue);

        // Generate hypotheses based on signals
        const allSignals = queue.flatMap(u => u.signals);
        const hypotheses = generateHypothesesFromSignals(allSignals, {
          name: cohortName,
          type: cohortType || 'manual',
          size: queue.length,
        });

        if (hypotheses.length > 0) {
          await storeHypotheses(createdCohort.id, hypotheses.slice(0, 10)); // Limit to top 10
        }
      }

      return NextResponse.json({
        queue: queue.slice(0, 50),
        total: queue.length,
        cohort: createdCohort,
      });
    }

    if (action === 'refresh' && cohortId) {
      // Refresh existing cohort's priority queue
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

      const queue = await buildPriorityQueue(cohort.projectId, {
        cohortType: cohort.type !== 'manual' ? cohort.type : undefined,
        limit: 100,
      });

      await storePriorityQueue(cohortId, queue);

      return NextResponse.json({
        queue: queue.slice(0, 50),
        total: queue.length,
        refreshed: true,
      });
    }

    if (action === 'generate_hypotheses' && cohortId) {
      // Generate hypotheses for existing cohort
      const members = await prisma.cohortMember.findMany({
        where: { cohortId },
        orderBy: { priorityScore: 'desc' },
        take: 50,
      });

      const allSignals = members.flatMap(m =>
        m.signals ? JSON.parse(m.signals) : []
      );

      const hypotheses = generateHypothesesFromSignals(allSignals);

      if (hypotheses.length > 0) {
        const stored = await storeHypotheses(cohortId, hypotheses.slice(0, 10));
        return NextResponse.json({
          hypothesesGenerated: stored,
          hypotheses: hypotheses.slice(0, 10),
        });
      }

      return NextResponse.json({
        hypothesesGenerated: 0,
        message: 'No signals found to generate hypotheses',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Must be "build", "refresh", or "generate_hypotheses"' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[Priority Queue API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/priority-queue - Update member interview status
 * Body:
 * - cohortId: required
 * - distinctId: required
 * - status: 'pending' | 'scheduled' | 'completed' | 'skipped'
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { cohortId, distinctId, status } = body;

    if (!cohortId || !distinctId || !status) {
      return NextResponse.json(
        { error: 'cohortId, distinctId, and status are required' },
        { status: 400 }
      );
    }

    await updateMemberStatus(cohortId, distinctId, status);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Priority Queue API] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update status' },
      { status: 500 }
    );
  }
}
