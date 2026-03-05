import { NextRequest, NextResponse } from 'next/server';
import { generateArchetypes } from '@/lib/archetype-generator';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { projectId, churnType } = await request.json();
  if (!projectId || !churnType) return NextResponse.json({ error: 'projectId and churnType required' }, { status: 400 });
  if (churnType !== 'unpaid' && churnType !== 'paid') return NextResponse.json({ error: 'churnType must be "unpaid" or "paid"' }, { status: 400 });
  const archetypes = await generateArchetypes(projectId, churnType);
  return NextResponse.json({ archetypes });
}
