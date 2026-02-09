import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, participantName, participantEmail, transcript, notes, conversedAt } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // transcript can be a JSON array or plain text string
    let transcriptStr: string;
    if (typeof transcript === 'string') {
      // Check if it's valid JSON array
      try {
        const parsed = JSON.parse(transcript);
        if (Array.isArray(parsed)) {
          transcriptStr = transcript;
        } else {
          transcriptStr = transcript;
        }
      } catch {
        // Plain text, store as-is
        transcriptStr = transcript;
      }
    } else if (Array.isArray(transcript)) {
      transcriptStr = JSON.stringify(transcript);
    } else {
      return NextResponse.json({ error: 'transcript must be a string or JSON array' }, { status: 400 });
    }

    const conversation = await prisma.conversation.create({
      data: {
        projectId,
        source: 'manual',
        participantName: participantName || null,
        participantEmail: participantEmail || null,
        status: 'completed',
        transcript: transcriptStr,
        metadata: notes ? JSON.stringify({ notes }) : null,
        conversedAt: conversedAt ? new Date(conversedAt) : new Date(),
      },
    });

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error('[Conversations] Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload conversation' }, { status: 500 });
  }
}
