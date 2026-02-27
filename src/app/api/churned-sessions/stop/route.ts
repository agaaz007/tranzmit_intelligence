import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/churned-sessions/stop
 *
 * Pauses processing for a batch. The processor checks batch status
 * between emails and will stop when it sees 'paused'.
 *
 * Resume by calling POST /api/churned-sessions/process with the same batchId.
 */
export async function POST(request: NextRequest) {
  try {
    const { batchId } = await request.json();

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await prisma.churnedSessionBatch.findUnique({
      where: { id: batchId },
      select: { id: true, status: true },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    if (batch.status === 'completed') {
      return NextResponse.json({ error: 'Batch is already completed' }, { status: 400 });
    }

    if (batch.status === 'paused') {
      return NextResponse.json({ status: 'already_paused' });
    }

    await prisma.churnedSessionBatch.update({
      where: { id: batchId },
      data: { status: 'paused' },
    });

    console.log(`[Stop] Batch ${batchId} paused`);

    return NextResponse.json({ status: 'paused', batchId });
  } catch (error) {
    console.error('Churned session stop error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stop failed' },
      { status: 500 }
    );
  }
}
