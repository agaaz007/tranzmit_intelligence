import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await getProjectWithAccess(projectId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const churnType = searchParams.get('churnType');
  const status = searchParams.get('status');
  const where: Record<string, unknown> = { projectId };
  if (churnType) where.churnType = churnType;
  if (status) where.status = status;

  const patterns = await prisma.discoveredPattern.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({
    patterns: patterns.map(p => ({
      ...p,
      evidence: JSON.parse(p.evidence),
      sourceTypes: JSON.parse(p.sourceTypes),
      affectedArchetypes: p.affectedArchetypes ? JSON.parse(p.affectedArchetypes) : [],
    })),
  });
}
