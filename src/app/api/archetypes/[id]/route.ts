import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const archetype = await prisma.churnArchetype.findUnique({ where: { id } });
  if (!archetype) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const users = await prisma.userProfile.findMany({ where: { archetypeId: id }, orderBy: { frustrationScore: 'desc' } });
  return NextResponse.json({ archetype, users });
}
