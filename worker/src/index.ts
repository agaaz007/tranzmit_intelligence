/**
 * Multimodal Analysis Worker
 *
 * Cron-style loop that polls the database for sessions needing multimodal analysis.
 * For each: replay rrweb events in Playwright, capture keyframes with 4-layer selection,
 * call GPT-5.4 mini, and write results back to the DB.
 */

import http from 'http';
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

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute hard cap per session

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
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

    let events: any[];
    try {
      events = JSON.parse(session.events);
    } catch {
      throw new Error('Failed to parse session events JSON — data may be corrupted');
    }

    if (!Array.isArray(events) || events.length < 2) {
      throw new Error(`Invalid events data: expected array with 2+ items, got ${typeof events}`);
    }

    const semanticSession = parseRRWebSession(events);
    if (semanticSession.logs.length === 0) {
      throw new Error('No meaningful user interactions found');
    }

    const domTimestamps = extractDomEventTimestamps(semanticSession.logs);

    // Launch a fresh browser per session to avoid stale process issues
    let b: Browser;
    try {
      b = await withTimeout(launchBrowser(), 30_000, 'Browser launch');
    } catch (err) {
      throw new Error(`Browser launch failed: ${err instanceof Error ? err.message : err}`);
    }

    let keyframes;
    try {
      keyframes = await withTimeout(
        captureKeyframesWithBrowser(b, events, domTimestamps),
        SESSION_TIMEOUT_MS,
        'Keyframe capture',
      );
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

const TRIGGER_PORT = parseInt(process.env.TRIGGER_PORT || '3001', 10);

// Track whether we're currently processing to avoid overlapping runs
let processing = false;

async function safePollAndProcess(): Promise<void> {
  if (processing) {
    console.log('[Worker] Already processing, skipping trigger');
    return;
  }
  processing = true;
  try {
    await pollAndProcess();
  } finally {
    processing = false;
  }
}

function startTriggerServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/trigger') {
      console.log('[Worker] Received trigger — running immediate poll');
      // Fire-and-forget: start processing, respond immediately
      safePollAndProcess().catch(err => console.error('[Worker] Triggered poll failed:', err));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'triggered' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(TRIGGER_PORT, () => {
    console.log(`[Worker] Trigger server listening on port ${TRIGGER_PORT}`);
  });
}

async function main(): Promise<void> {
  console.log('[Worker] Multimodal analysis worker started');
  console.log(`[Worker] Polling every ${POLL_INTERVAL / 1000}s`);

  // Ensure Prisma can connect before starting the loop
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('[Worker] Failed to connect to database:', err);
    process.exit(1);
  }

  startTriggerServer();

  await safePollAndProcess();
  setInterval(safePollAndProcess, POLL_INTERVAL);
}

// Prevent unhandled rejections from killing the worker
process.on('unhandledRejection', (err) => {
  console.error('[Worker] Unhandled rejection:', err);
});

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
