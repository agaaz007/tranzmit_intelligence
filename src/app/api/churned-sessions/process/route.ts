import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  processNextEmails,
  analyzePendingSessions,
  runSynthesis,
} from '@/lib/churned-batch-processor';

/**
 * POST /api/churned-sessions/process
 *
 * Triggers background processing for a churned session batch.
 * Returns immediately with batch status; actual processing runs via after().
 *
 * Also supports resume: if a batch is paused, calling this will resume it.
 */
export async function POST(request: NextRequest) {
  try {
    const { batchId } = await request.json();

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await prisma.churnedSessionBatch.findUnique({
      where: { id: batchId },
      include: {
        project: {
          select: {
            id: true,
            posthogKey: true,
            posthogProjId: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (!batch.project.posthogKey || !batch.project.posthogProjId) {
      return NextResponse.json(
        { error: 'PostHog API key or Project ID not configured' },
        { status: 400 }
      );
    }

    // If batch was paused, resume it
    if (batch.status === 'paused') {
      await prisma.churnedSessionBatch.update({
        where: { id: batchId },
        data: { status: 'processing' },
      });
    }

    // If already completed, just return status
    if (batch.status === 'completed') {
      return NextResponse.json({
        status: 'completed',
        processedEmails: batch.processedEmails,
        totalEmails: batch.totalEmails,
        emailsFound: batch.emailsFound,
        emailsNotFound: batch.emailsNotFound,
        sessionsImported: batch.sessionsImported,
      });
    }

    const projectId = batch.project.id;

    // Kick off background processing after response is sent
    after(async () => {
      try {
        console.log(`[ProcessRoute] Starting background processing for batch ${batchId}`);

        // Import phase: process emails until done, rate-limited, or time limit
        const startTime = Date.now();
        const TIME_LIMIT_MS = 50_000; // 50s safety margin for Vercel function timeout

        let result = await processNextEmails(batchId);

        while (result.hasMore && !result.rateLimitedUntil) {
          if (Date.now() - startTime > TIME_LIMIT_MS) {
            console.log(`[ProcessRoute] Approaching time limit, stopping. Cron will continue.`);
            break;
          }
          result = await processNextEmails(batchId);
        }

        // Analysis phase: analyze any pending sessions
        await analyzePendingSessions(projectId);

        // Synthesis: run if batch completed
        if (result.batchCompleted) {
          await runSynthesis(projectId);
        }

        console.log(`[ProcessRoute] Background processing done for batch ${batchId}`);
      } catch (err) {
        console.error(`[ProcessRoute] Background processing error:`, err);
      }
    });

    // Return immediately with current batch status
    return NextResponse.json({
      status: batch.status === 'pending' ? 'started' : batch.status,
      processedEmails: batch.processedEmails,
      totalEmails: batch.totalEmails,
      emailsFound: batch.emailsFound,
      emailsNotFound: batch.emailsNotFound,
      sessionsImported: batch.sessionsImported,
    });
  } catch (error) {
    console.error('Churned session process error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}
