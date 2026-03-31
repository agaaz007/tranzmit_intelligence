import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST: Queue a session for multimodal analysis (picked up by the Railway worker)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, analysisStatus: true, multimodalStatus: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.analysisStatus !== 'completed') {
      return NextResponse.json(
        { error: 'Session must be analyzed first' },
        { status: 400 }
      );
    }

    if (session.multimodalStatus === 'analyzing') {
      return NextResponse.json(
        { error: 'Multimodal analysis already in progress' },
        { status: 409 }
      );
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: { multimodalStatus: 'pending' },
    });

    return NextResponse.json({ status: 'queued' });
  } catch (error) {
    console.error('Error queuing multimodal analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
