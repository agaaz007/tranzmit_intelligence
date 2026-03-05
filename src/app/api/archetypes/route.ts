import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const churnType = request.nextUrl.searchParams.get('churnType');
  const where: Record<string, unknown> = { projectId, isActive: true };
  if (churnType === 'unpaid' || churnType === 'paid') where.churnType = churnType;

  const archetypes = await prisma.churnArchetype.findMany({ where, orderBy: { userCount: 'desc' } });
  return NextResponse.json({ archetypes });
}
