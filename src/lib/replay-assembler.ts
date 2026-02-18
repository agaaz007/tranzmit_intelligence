import { prisma } from '@/lib/prisma';

/**
 * Check if real replay data exists for a given session.
 */
export async function hasReplayData(
  projectId: string,
  sessionId: string
): Promise<boolean> {
  const count = await prisma.replayChunk.count({
    where: { projectId, sessionId },
  });
  return count > 0;
}

/**
 * Assemble all replay chunks into a sorted array of rrweb events.
 */
export async function assembleReplayEvents(
  projectId: string,
  sessionId: string
): Promise<unknown[]> {
  const chunks = await prisma.replayChunk.findMany({
    where: { projectId, sessionId },
    orderBy: { chunkIndex: 'asc' },
    select: { events: true },
  });

  const allEvents: unknown[] = [];

  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk.events);
      if (Array.isArray(parsed)) {
        allEvents.push(...parsed);
      }
    } catch {
      // Skip malformed chunks
    }
  }

  // Sort by timestamp
  allEvents.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));

  return allEvents;
}

/**
 * Delete replay chunks for a session after successful import.
 */
export async function cleanupOldChunks(
  projectId: string,
  sessionId: string
): Promise<void> {
  await prisma.replayChunk.deleteMany({
    where: { projectId, sessionId },
  });
}
