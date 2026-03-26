/**
 * Multimodal Analysis Worker
 *
 * Cron-style loop that polls the database for sessions needing multimodal analysis.
 * For each: replay rrweb events in Playwright, capture keyframes with 4-layer selection,
 * call GPT-5.4 mini, and write results back to the DB.
 */

import { PrismaClient } from '@prisma/client';
import { captureKeyframes } from './capture';
import { callVLM, type MultimodalAnalysis } from './analysis';
import { buildFusedPrompt, buildSessionLog, buildSessionContext } from './prompt';
import { parseRRWebSession } from './rrweb-parser';
import { extractDomEventTimestamps } from './selection';

const prisma = new PrismaClient();
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '120', 10) * 1000; // default 2 min

async function processSession(sessionId: string): Promise<void> {
  console.log(`[Worker] Processing session ${sessionId}`);

  // Mark as analyzing
  await prisma.session.update({
    where: { id: sessionId },
    data: { multimodalStatus: 'analyzing' },
  });

  try {
    // Load events
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, events: true },
    });

    if (!session?.events) {
      throw new Error('No events stored for this session');
    }

    const events = JSON.parse(session.events);

    // Parse events for DOM log and behavioral signals
    const semanticSession = parseRRWebSession(events);
    if (semanticSession.logs.length === 0) {
      throw new Error('No meaningful user interactions found');
    }

    // Extract DOM event timestamps for Layer 4
    const domTimestamps = extractDomEventTimestamps(semanticSession.logs);

    // Capture keyframes via Playwright (2-pass with 4-layer selection)
    const keyframes = await captureKeyframes(events, domTimestamps);
    console.log(`[Worker] Session ${sessionId}: ${keyframes.length} keyframes captured`);

    if (keyframes.length === 0) {
      throw new Error('No frames captured');
    }

    // Build prompt
    const sessionLog = buildSessionLog(semanticSession as any);
    const sessionContext = buildSessionContext(semanticSession as any);
    const { system, content } = buildFusedPrompt(sessionLog, sessionContext, keyframes);

    // Call GPT-5.4 mini
    const analysis = await callVLM(system, content);
    analysis.frames_analyzed = keyframes.length;

    // Save results
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        multimodalAnalysis: JSON.stringify(analysis),
        multimodalStatus: 'completed',
        multimodalAt: new Date(),
      },
    });

    console.log(`[Worker] Session ${sessionId}: analysis complete (UX rating: ${analysis.ux_rating}/10)`);
  } catch (error) {
    console.error(`[Worker] Session ${sessionId} failed:`, error);
    await prisma.session.update({
      where: { id: sessionId },
      data: { multimodalStatus: 'failed' },
    });
  }
}

async function pollAndProcess(): Promise<void> {
  try {
    // Find sessions that need multimodal analysis
    const pendingSessions = await prisma.session.findMany({
      where: {
        analysisStatus: 'completed',
        multimodalStatus: 'pending',
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 5, // process up to 5 per cycle
    });

    if (pendingSessions.length === 0) {
      return;
    }

    console.log(`[Worker] Found ${pendingSessions.length} sessions to process`);

    // Process one at a time to control memory
    for (const session of pendingSessions) {
      await processSession(session.id);
    }
  } catch (error) {
    console.error('[Worker] Poll cycle failed:', error);
  }
}

async function main(): Promise<void> {
  console.log('[Worker] Multimodal analysis worker started');
  console.log(`[Worker] Polling every ${POLL_INTERVAL / 1000}s`);

  // Run immediately on startup
  await pollAndProcess();

  // Then poll on interval
  setInterval(pollAndProcess, POLL_INTERVAL);
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
