import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';
import { resolveOrCreateProfile } from '@/lib/identity-resolver';
import { aggregateProfile } from '@/lib/profile-aggregator';

export async function POST(request: NextRequest) {
  const { projectId } = await request.json();
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await getProjectWithAccess(projectId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Gather all distinct IDs from sessions
  const sessions = await prisma.session.findMany({
    where: { projectId, distinctId: { not: null } },
    select: { distinctId: true, name: true, userType: true },
    distinct: ['distinctId'],
  });

  let profilesCreated = 0;
  let profilesUpdated = 0;
  const errors: string[] = [];

  for (const session of sessions) {
    if (!session.distinctId) continue;
    try {
      const profile = await resolveOrCreateProfile(projectId, {
        distinctId: session.distinctId,
        source: 'session',
      });
      if (!profile) continue;

      const isNew = profile.totalSessions === 0;
      await aggregateProfile(profile.id);
      if (isNew) profilesCreated++;
      else profilesUpdated++;
    } catch (e) {
      errors.push(`${session.distinctId}: ${e}`);
    }
  }

  // Also process interview-only users via userEmail
  const interviews = await prisma.interview.findMany({
    where: { projectId, userEmail: { not: null } },
    select: { userEmail: true },
    distinct: ['userEmail'],
  });

  for (const interview of interviews) {
    if (!interview.userEmail) continue;
    try {
      const existing = await prisma.userProfile.findFirst({
        where: { projectId, canonicalEmail: interview.userEmail.toLowerCase() },
      });
      if (existing) continue;

      const profile = await resolveOrCreateProfile(projectId, {
        email: interview.userEmail,
        source: 'interview',
      });
      if (!profile) continue;
      await aggregateProfile(profile.id);
      profilesCreated++;
    } catch (e) {
      errors.push(`${interview.userEmail}: ${e}`);
    }
  }

  return NextResponse.json({ profilesCreated, profilesUpdated, errors: errors.slice(0, 20) });
}
