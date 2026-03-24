import { NextRequest, NextResponse } from 'next/server';
import { runMultimodalAnalysis } from '@/lib/multimodal-analysis';

// POST: Trigger multimodal (DOM + vision) analysis for a session
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;

    const analysis = await runMultimodalAnalysis(id);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error running multimodal analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
