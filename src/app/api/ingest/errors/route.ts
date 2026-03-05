import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectFromRequest } from '@/lib/auth';
import { resolveOrCreateProfile } from '@/lib/identity-resolver';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-tranzmit-api-key' };

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function POST(request: NextRequest) {
  const project = await getProjectFromRequest(request);
  if (!project) return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: CORS });

  const { errors, distinctId } = await request.json();
  if (!Array.isArray(errors) || errors.length === 0) return NextResponse.json({ error: 'errors required' }, { status: 400, headers: CORS });

  let profile = distinctId ? await resolveOrCreateProfile(project.id, { distinctId, source: 'error-bridge' }) : null;
  let received = 0;

  for (const e of errors.slice(0, 50)) {
    if (!e.errorMessage) continue;
    if (!profile && e.sessionId) profile = await resolveOrCreateProfile(project.id, { distinctId: e.sessionId, source: 'error-bridge' });
    if (!profile) continue;

    const validTypes = ['javascript', 'api', 'crash', 'unhandled_rejection'];
    await prisma.userErrorEvent.create({
      data: {
        projectId: project.id, userProfileId: profile.id,
        errorType: validTypes.includes(e.errorType) ? e.errorType : 'javascript',
        errorMessage: String(e.errorMessage).substring(0, 4096),
        stackTrace: e.stackTrace ? String(e.stackTrace).substring(0, 8192) : null,
        url: e.url ? String(e.url).substring(0, 2048) : null,
        sessionId: e.sessionId || null,
        occurredAt: e.timestamp ? new Date(e.timestamp) : new Date(),
      },
    });
    await prisma.userProfile.update({ where: { id: profile.id }, data: { totalErrors: { increment: 1 } } });
    received++;
  }
  return NextResponse.json({ received }, { headers: CORS });
}
