/**
 * Multimodal Analysis Worker
 *
 * Cron-style loop that polls the database for sessions needing multimodal analysis.
 * For each: replay rrweb events in Playwright, capture keyframes with 4-layer selection,
 * call GPT-5.4 mini, and write results back to the DB.
 */

import { PrismaClient } from '@prisma/client';
import { chromium, Browser } from 'playwright';
import { captureKeyframesWithBrowser } from './capture';
import { callVLM, type MultimodalAnalysis } from './analysis';
import { buildFusedPrompt, buildSessionLog, buildSessionContext } from './prompt';
import { parseRRWebSession } from './rrweb-parser';
import { extractDomEventTimestamps } from './selection';

const prisma = new PrismaClient();
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '120', 10) * 1000;

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

async function processSession(sessionId: string): Promise<void> {
  console.log(`[Worker] Processing session ${sessionId}`);

  await prisma.session.update({
    where: { id: sessionId },
    data: { multimodalStatus: 'analyzing' },
  });

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, events: true },
    });

    if (!session?.events) {
      throw new Error('No events stored for this session');
    }

    const events = JSON.parse(session.events);

    const semanticSession = parseRRWebSession(events);
    if (semanticSession.logs.length === 0) {
      throw new Error('No meaningful user interactions found');
    }

    const domTimestamps = extractDomEventTimestamps(semanticSession.logs);

    // Launch a fresh browser per session to avoid stale process issues
    const b = await launchBrowser();
    let keyframes;
    try {
      keyframes = await captureKeyframesWithBrowser(b, events, domTimestamps);
    } finally {
      await b.close().catch(() => {});
    }
    console.log(`[Worker] Session ${sessionId}: ${keyframes.length} keyframes captured`);

    if (keyframes.length === 0) {
      throw new Error('No frames captured');
    }

    const sessionLog = buildSessionLog(semanticSession as any);
    const sessionContext = buildSessionContext(semanticSession as any);
    const { system, content } = buildFusedPrompt(sessionLog, sessionContext, keyframes);

    const analysis = await callVLM(system, content);
    analysis.frames_analyzed = keyframes.length;

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
    const pendingSessions = await prisma.session.findMany({
      where: {
        analysisStatus: 'completed',
        multimodalStatus: 'pending',
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 1, // process one at a time to stay within Railway memory limits
    });

    if (pendingSessions.length === 0) return;

    console.log(`[Worker] Found ${pendingSessions.length} session(s) to process`);

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

  await pollAndProcess();
  setInterval(pollAndProcess, POLL_INTERVAL);
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
