import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';
import { getElevenLabsClient } from '@/lib/elevenlabs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, agentId } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use provided agentId or fall back to project config
    const resolvedAgentId = agentId || projectAccess.project.elevenlabsAgentId;
    if (!resolvedAgentId) {
      return NextResponse.json(
        { error: 'No agent ID provided. Set it in project settings or pass it in the request.' },
        { status: 400 }
      );
    }

    // Save agent ID to project if not already set
    if (!projectAccess.project.elevenlabsAgentId && agentId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { elevenlabsAgentId: agentId },
      });
    }

    const client = getElevenLabsClient();

    // Fetch successful conversations from ElevenLabs
    const { conversations } = await client.listConversations(resolvedAgentId, 'success');

    // Get existing external IDs for dedup
    const existingIds = new Set(
      (
        await prisma.conversation.findMany({
          where: { projectId, source: 'elevenlabs' },
          select: { externalId: true },
        })
      )
        .map((c) => c.externalId)
        .filter(Boolean)
    );

    let synced = 0;

    for (const conv of conversations) {
      if (existingIds.has(conv.conversation_id)) {
        continue;
      }

      try {
        // Fetch full detail
        const detail = await client.getConversation(conv.conversation_id);

        await prisma.conversation.create({
          data: {
            projectId,
            source: 'elevenlabs',
            externalId: conv.conversation_id,
            status: detail.status === 'done' ? 'completed' : detail.status,
            duration: detail.duration_seconds ?? conv.duration_seconds,
            transcript: detail.transcript ? JSON.stringify(detail.transcript) : null,
            analysis: detail.analysis ? JSON.stringify(detail.analysis) : null,
            analysisStatus: detail.analysis ? 'completed' : 'pending',
            metadata: JSON.stringify({
              agent_id: resolvedAgentId,
              call_successful: conv.call_successful,
              ...conv.metadata,
            }),
            conversedAt: conv.start_time ? new Date(conv.start_time) : new Date(),
          },
        });

        synced++;
      } catch (err) {
        console.error(`[Conversations] Failed to sync ${conv.conversation_id}:`, err);
      }
    }

    return NextResponse.json({
      synced,
      total: conversations.length,
      alreadyExists: conversations.length - synced,
    });
  } catch (error) {
    console.error('[Conversations] Sync error:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync conversations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
