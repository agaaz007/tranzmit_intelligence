import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: Lazy load events only (for replay)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;

    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        events: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session.events) {
      return NextResponse.json({ error: 'No events stored for this session' }, { status: 404 });
    }

    const events = JSON.parse(session.events);
    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching session events:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
