import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pattern = await prisma.discoveredPattern.findUnique({ where: { id } });
  if (!pattern) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...pattern,
    evidence: JSON.parse(pattern.evidence),
    sourceTypes: JSON.parse(pattern.sourceTypes),
    affectedArchetypes: pattern.affectedArchetypes ? JSON.parse(pattern.affectedArchetypes) : null,
    interviewValidation: pattern.interviewValidation ? JSON.parse(pattern.interviewValidation) : null,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const allowedFields = ['status', 'priority'];
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  const pattern = await prisma.discoveredPattern.update({ where: { id }, data });
  return NextResponse.json(pattern);
}
