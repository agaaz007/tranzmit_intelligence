import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/cron/cleanup-chunks
 * Deletes ReplayChunk records older than 35 days.
 * Can be called via Vercel Cron or manually.
 */
export async function GET() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 35);

    const result = await prisma.replayChunk.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    console.log(`[Cleanup] Deleted ${result.count} old replay chunks (before ${cutoff.toISOString()})`);

    return NextResponse.json({
      deleted: result.count,
      cutoff: cutoff.toISOString(),
    });
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}
