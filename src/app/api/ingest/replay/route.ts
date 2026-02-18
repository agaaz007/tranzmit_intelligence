import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectFromRequest } from '@/lib/auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-tranzmit-api-key',
  'Access-Control-Max-Age': '86400',
};

const MAX_BODY_SIZE = 500 * 1024; // 500KB
const MAX_CHUNKS_PER_SESSION = 200;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    // Check body size
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Payload too large (max 500KB)' },
        { status: 413, headers: CORS_HEADERS }
      );
    }

    // Authenticate via header or query param (for sendBeacon)
    const project = await getProjectFromRequest(request);

    if (!project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const body = await request.json();
    const { sessionId, distinctId, chunkIndex, events } = body;

    // Validate required fields
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'sessionId is required and must be a string' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (typeof chunkIndex !== 'number' || chunkIndex < 0) {
      return NextResponse.json(
        { error: 'chunkIndex is required and must be a non-negative number' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'events is required and must be a non-empty array' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Check chunk limit per session
    if (chunkIndex >= MAX_CHUNKS_PER_SESSION) {
      return NextResponse.json(
        { error: `Max ${MAX_CHUNKS_PER_SESSION} chunks per session` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Upsert chunk (idempotent)
    await prisma.replayChunk.upsert({
      where: {
        projectId_sessionId_chunkIndex: {
          projectId: project.id,
          sessionId,
          chunkIndex,
        },
      },
      update: {
        events: JSON.stringify(events),
        distinctId: distinctId || null,
      },
      create: {
        projectId: project.id,
        sessionId,
        distinctId: distinctId || null,
        chunkIndex,
        events: JSON.stringify(events),
      },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[Replay Ingest] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
