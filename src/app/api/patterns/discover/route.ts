import { NextRequest, NextResponse } from 'next/server';
import { getProjectWithAccess } from '@/lib/auth';
import { discoverPatterns } from '@/lib/pattern-discovery';

export async function POST(request: NextRequest) {
  const { projectId, churnType } = await request.json();
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await getProjectWithAccess(projectId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await discoverPatterns(projectId, churnType || null);
  return NextResponse.json(result);
}
