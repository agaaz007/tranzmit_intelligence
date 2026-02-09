import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const projectAccess = await getProjectWithAccess(conversation.projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      conversation: {
        ...conversation,
        transcript: conversation.transcript ? JSON.parse(conversation.transcript) : null,
        analysis: conversation.analysis ? JSON.parse(conversation.analysis) : null,
        metadata: conversation.metadata ? JSON.parse(conversation.metadata) : null,
      },
    });
  } catch (error) {
    console.error('[Conversations] Failed to get detail:', error);
    return NextResponse.json({ error: 'Failed to get conversation' }, { status: 500 });
  }
}
