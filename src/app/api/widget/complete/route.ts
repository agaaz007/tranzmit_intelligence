import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triggerId, outcome } = body;

    if (!triggerId || !['clicked', 'dismissed'].includes(outcome)) {
      return NextResponse.json({ error: 'triggerId and valid outcome are required' }, { status: 400, headers: CORS_HEADERS });
    }

    await prisma.widgetTrigger.update({
      where: { id: triggerId },
      data: { status: outcome },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS });
  } catch (error) {
    console.error('[Widget Complete] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS });
  }
}
