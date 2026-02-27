import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { analyzePendingSessions, runSynthesis } from '@/lib/churned-batch-processor';

/**
 * POST /api/churned-sessions/analyze
 *
 * Triggers analysis of all pending churned sessions for a project.
 * Runs in background via after(), returns immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    after(async () => {
      const BATCH_SIZE = 10;
      const TIME_LIMIT_MS = 50_000;
      const startTime = Date.now();
      let totalAnalyzed = 0;
      let totalFailed = 0;

      // Keep analyzing in batches until none are left or time runs out
      while (Date.now() - startTime < TIME_LIMIT_MS) {
        const result = await analyzePendingSessions(projectId, BATCH_SIZE);
        totalAnalyzed += result.analyzed;
        totalFailed += result.failed;

        // No more pending sessions
        if (result.analyzed + result.failed === 0) break;
      }

      console.log(`[Analyze] Completed: ${totalAnalyzed} analyzed, ${totalFailed} failed for project ${projectId}`);

      // Re-synthesize if we analyzed anything
      if (totalAnalyzed > 0) {
        await runSynthesis(projectId);
      }
    });

    return NextResponse.json({ status: 'started' });
  } catch (error) {
    console.error('[Analyze] Error:', error);
    return NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 });
  }
}
