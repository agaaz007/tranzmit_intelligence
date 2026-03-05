import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const archetype = await prisma.churnArchetype.findUnique({
    where: { id },
    include: { users: { select: { identifiers: { select: { identifier: true } } } } },
  });
  if (!archetype) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const distinctIds = archetype.users.flatMap(u => u.identifiers.map(i => i.identifier));
  if (distinctIds.length === 0) return NextResponse.json({ sessions: [] });

  const sessions = await prisma.session.findMany({
    where: { projectId: archetype.projectId, distinctId: { in: distinctIds } },
    select: { id: true, name: true, source: true, distinctId: true, startTime: true, duration: true, analysisStatus: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ sessions });
}
