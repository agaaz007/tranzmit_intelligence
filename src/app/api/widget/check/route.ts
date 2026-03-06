import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectFromRequest } from '@/lib/auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-tranzmit-api-key',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  try {
    const project = await getProjectFromRequest(request);
    if (!project) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: CORS_HEADERS });
    }

    const distinctId = request.nextUrl.searchParams.get('distinctId');
    if (!distinctId) {
      return NextResponse.json({ show: false }, { status: 200, headers: CORS_HEADERS });
    }

    const trigger = await prisma.widgetTrigger.findFirst({
      where: {
        projectId: project.id,
        distinctId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!trigger) {
      return NextResponse.json({ show: false }, { status: 200, headers: CORS_HEADERS });
    }

    // Mark as shown
    await prisma.widgetTrigger.update({
      where: { id: trigger.id },
      data: { status: 'shown', shownAt: new Date() },
    });

    return NextResponse.json(
      {
        show: true,
        triggerId: trigger.id,
        userName: trigger.userName,
        interviewApiKey: trigger.interviewApiKey,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[Widget Check] Error:', error);
    return NextResponse.json({ show: false }, { status: 500, headers: CORS_HEADERS });
  }
}
