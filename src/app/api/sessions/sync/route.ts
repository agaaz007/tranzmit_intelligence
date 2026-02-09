import { NextRequest, NextResponse } from 'next/server';
import { syncSessionsFromPostHog } from '@/lib/session-sync';

// POST: Batch import sessions from PostHog
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, count = 10 } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const result = await syncSessionsFromPostHog(projectId, count);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Session Sync] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal Server Error',
    }, { status: 500 });
  }
}
