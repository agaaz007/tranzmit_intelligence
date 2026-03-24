import { NextRequest, NextResponse } from 'next/server';
import { runMultimodalAnalysis } from '@/lib/multimodal-analysis';

// POST: Trigger multimodal (DOM + vision) analysis for a session
// Expects { keyframes: [{ timestamp, base64, reason }] } in the body
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;
    const body = await req.json();

    if (!body.keyframes || !Array.isArray(body.keyframes) || body.keyframes.length === 0) {
      return NextResponse.json(
        { error: 'keyframes array is required in request body' },
        { status: 400 }
      );
    }

    const analysis = await runMultimodalAnalysis(id, body.keyframes);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error running multimodal analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
