import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { projectId, emails, fileName } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: 'emails array is required' }, { status: 400 });
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Deduplicate emails
    const uniqueEmails = [...new Set(emails.map((e: string) => e.trim().toLowerCase()))].filter(Boolean);

    // Create batch
    const batch = await prisma.churnedSessionBatch.create({
      data: {
        projectId,
        fileName: fileName || null,
        totalEmails: uniqueEmails.length,
        status: 'pending',
        emailResults: JSON.stringify(
          uniqueEmails.map((email: string) => ({
            email,
            status: 'pending',
            recordingCount: 0,
            personName: null,
          }))
        ),
      },
    });

    return NextResponse.json({
      batchId: batch.id,
      totalEmails: uniqueEmails.length,
    });
  } catch (error) {
    console.error('Churned session upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
