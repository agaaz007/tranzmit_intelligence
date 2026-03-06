import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDailyChurnScoring } from '@/lib/churn-scoring/scorer';

export const maxDuration = 60;

/**
 * GET /api/cron/compute-churn-scores
 *
 * Daily cron job (4 AM UTC) that computes churn risk scores
 * for all users across all projects with PostHog configured.
 */
export async function GET() {
  try {
    // Find all projects with PostHog configured
    const projects = await prisma.project.findMany({
      where: {
        posthogKey: { not: null },
        posthogProjId: { not: null },
      },
      select: { id: true, name: true },
    });

    if (projects.length === 0) {
      return NextResponse.json({ message: 'No projects with PostHog configured' });
    }

    console.log(`[Cron] Computing churn scores for ${projects.length} projects`);

    const results = [];

    for (const project of projects) {
      try {
        const summary = await runDailyChurnScoring(project.id);
        results.push({ projectId: project.id, name: project.name, ...summary });
      } catch (err) {
        console.error(`[Cron] Error scoring project ${project.id}:`, err);
        results.push({
          projectId: project.id,
          name: project.name,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({ projects: results.length, results });
  } catch (error) {
    console.error('[Cron] compute-churn-scores error:', error);
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    );
  }
}
