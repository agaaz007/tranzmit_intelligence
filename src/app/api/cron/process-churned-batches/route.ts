import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  processNextEmails,
  analyzePendingSessions,
  runSynthesis,
} from '@/lib/churned-batch-processor';

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/**
 * GET /api/cron/process-churned-batches
 *
 * Cron job that picks up stalled or rate-limit-recovered batches.
 * Runs every 2 minutes via Vercel Cron.
 *
 * Handles:
 * - Batches stuck in 'processing' with no recent progress (stalled/crashed)
 * - Batches whose rate limit cooldown has expired
 * - Batches still in 'pending' that were never started
 */
export async function GET() {
  try {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

    // Find batches that need processing
    const batchesToProcess = await prisma.churnedSessionBatch.findMany({
      where: {
        OR: [
          // Never started
          { status: 'pending' },
          // Stalled: processing but no progress for 3+ minutes
          {
            status: 'processing',
            lastProcessedAt: { lt: staleThreshold },
          },
          // Stalled: processing but never had lastProcessedAt set
          {
            status: 'processing',
            lastProcessedAt: null,
            updatedAt: { lt: staleThreshold },
          },
          // Rate limit cooldown expired
          {
            status: 'processing',
            rateLimitedUntil: { lt: now },
          },
        ],
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        rateLimitedUntil: true,
        lastProcessedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (batchesToProcess.length === 0) {
      // Also check for unanalyzed sessions across all projects with churned batches
      const projectsWithBatches = await prisma.churnedSessionBatch.findMany({
        where: { status: 'completed' },
        select: { projectId: true },
        distinct: ['projectId'],
      });

      let totalAnalyzed = 0;
      for (const { projectId } of projectsWithBatches) {
        const result = await analyzePendingSessions(projectId, 5);
        totalAnalyzed += result.analyzed;
      }

      return NextResponse.json({
        message: 'No batches to process',
        analyzedSessions: totalAnalyzed,
      });
    }

    console.log(`[Cron] Found ${batchesToProcess.length} batches to process`);

    const results = [];

    for (const batch of batchesToProcess) {
      // Skip if still within rate limit cooldown
      if (batch.rateLimitedUntil && batch.rateLimitedUntil > now) {
        console.log(`[Cron] Skipping batch ${batch.id}: rate limited until ${batch.rateLimitedUntil.toISOString()}`);
        results.push({ batchId: batch.id, action: 'skipped_rate_limited' });
        continue;
      }

      // Clear expired rate limit
      if (batch.rateLimitedUntil && batch.rateLimitedUntil <= now) {
        await prisma.churnedSessionBatch.update({
          where: { id: batch.id },
          data: { rateLimitedUntil: null },
        });
      }

      console.log(`[Cron] Processing batch ${batch.id} (status: ${batch.status})`);

      try {
        // Import phase
        const importResult = await processNextEmails(batch.id);

        // Analysis phase
        const analysisResult = await analyzePendingSessions(batch.projectId);

        // Synthesis if complete
        if (importResult.batchCompleted) {
          await runSynthesis(batch.projectId);
        }

        results.push({
          batchId: batch.id,
          imported: importResult.processed,
          hasMore: importResult.hasMore,
          rateLimitedUntil: importResult.rateLimitedUntil?.toISOString() || null,
          analyzed: analysisResult.analyzed,
          completed: importResult.batchCompleted,
        });
      } catch (err) {
        console.error(`[Cron] Error processing batch ${batch.id}:`, err);
        results.push({
          batchId: batch.id,
          action: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[Cron] process-churned-batches error:', error);
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    );
  }
}
