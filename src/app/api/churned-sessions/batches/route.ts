import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const batches = await prisma.churnedSessionBatch.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ batches });
  } catch (error) {
    console.error('Churned session batches error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}
