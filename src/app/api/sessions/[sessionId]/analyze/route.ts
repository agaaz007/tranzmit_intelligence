import { NextRequest, NextResponse } from 'next/server';
import { analyzeSession } from '@/lib/session-analysis';

// POST: Trigger analysis for a session
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;

    const analysis = await analyzeSession(id);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error analyzing session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
