/**
 * Churned Batch Processor — Core engine for importing and analyzing
 * churned user sessions from PostHog.
 *
 * Two decoupled phases:
 * 1. Import: Fetch PostHog data → save Session records to DB
 * 2. Analyze: Run LLM analysis on pending sessions
 *
 * Each phase is independently callable, rate-limit-aware, and crash-safe
 * (progress is written to DB after each email/session).
 */

import { prisma } from '@/lib/prisma';
import { PostHogRateLimiter, type RateLimitedResult } from '@/lib/posthog-rate-limiter';
import { fetchSessionEvents } from '@/lib/session-sync';
import { analyzeSession } from '@/lib/session-analysis';
import { synthesizeInsightsWithSessionLinkage } from '@/lib/session-synthesize';

// Re-export for testing
export { PostHogRateLimiter };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface EmailResult {
  email: string;
  status: string; // pending | found | not_found | rate_limited | error
  recordingCount: number;
  personName: string | null;
}

export interface ImportResult {
  processed: number;
  hasMore: boolean;
  rateLimitedUntil: Date | null;
  batchCompleted: boolean;
}

export interface AnalysisResult {
  analyzed: number;
  failed: number;
  pending: number;
}

// Delay between recordings to respect PostHog API (ms)
const INTER_RECORDING_DELAY = 2000;
// Max recordings per person
const MAX_RECORDINGS_PER_PERSON = 2;

/**
 * Find a PostHog person by email using the rate limiter.
 * Returns discriminated result so callers can distinguish rate_limited from not_found.
 */
async function findPersonByEmailRateLimited(
  email: string,
  rateLimiter: PostHogRateLimiter,
  host: string,
  projectId: string,
  headers: Record<string, string>,
): Promise<
  | { found: true; personUuid: string; distinctIds: string[]; name: string | null }
  | { found: false; reason: 'not_found' }
  | { found: false; reason: 'rate_limited'; retryAfter: Date }
  | { found: false; reason: 'error'; detail: string }
> {
  const propsFilter = JSON.stringify([{ key: '$email', value: email, type: 'person' }]);
  const result = await rateLimiter.fetch(
    host,
    projectId,
    `/persons?properties=${encodeURIComponent(propsFilter)}`,
    headers,
  );

  if (!result.ok) {
    if (result.reason === 'rate_limited') {
      return { found: false, reason: 'rate_limited', retryAfter: result.retryAfter };
    }
    return { found: false, reason: 'error', detail: result.detail };
  }

  const data = await result.response.json();
  const results = data.results || [];

  if (results.length === 0) {
    return { found: false, reason: 'not_found' };
  }

  const person = results[0];
  return {
    found: true,
    personUuid: person.uuid,
    distinctIds: person.distinct_ids || [],
    name: person.properties?.name || person.properties?.$name || null,
  };
}

/**
 * Get recordings for a person using the rate limiter.
 */
async function getRecordingsRateLimited(
  personUuid: string,
  rateLimiter: PostHogRateLimiter,
  host: string,
  projectId: string,
  headers: Record<string, string>,
  limit: number = MAX_RECORDINGS_PER_PERSON,
): Promise<
  | { ok: true; recordings: Array<{
      id: string; distinct_id: string; start_time: string; end_time: string;
      recording_duration: number; click_count: number; keypress_count: number;
      active_seconds: number;
    }> }
  | { ok: false; reason: 'rate_limited'; retryAfter: Date }
  | { ok: false; reason: 'error'; detail: string }
> {
  const result = await rateLimiter.fetch(
    host,
    projectId,
    `/session_recordings?person_uuid=${personUuid}&limit=${limit}`,
    headers,
  );

  if (!result.ok) {
    if (result.reason === 'rate_limited') {
      return { ok: false, reason: 'rate_limited', retryAfter: result.retryAfter };
    }
    return { ok: false, reason: 'error', detail: result.detail };
  }

  const data = await result.response.json();
  return { ok: true, recordings: data.results || [] };
}

/**
 * Phase 1: Import — Process pending emails from a batch.
 *
 * Processes one email at a time, writing progress to DB after each.
 * Stops immediately if rate-limited, paused, or limit reached.
 *
 * @param batchId - The batch to process
 * @param limit - Max emails to process in this invocation (default: all remaining)
 */
export async function processNextEmails(
  batchId: string,
  limit: number = Infinity,
): Promise<ImportResult> {
  const batch = await prisma.churnedSessionBatch.findUnique({
    where: { id: batchId },
    include: {
      project: {
        select: {
          id: true,
          posthogKey: true,
          posthogHost: true,
          posthogProjId: true,
        },
      },
    },
  });

  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // Check if batch is paused or already completed
  if (batch.status === 'paused') {
    return { processed: 0, hasMore: true, rateLimitedUntil: null, batchCompleted: false };
  }
  if (batch.status === 'completed') {
    return { processed: 0, hasMore: false, rateLimitedUntil: null, batchCompleted: true };
  }

  const project = batch.project;
  if (!project.posthogKey || !project.posthogProjId) {
    throw new Error('PostHog API key or Project ID not configured');
  }

  const host = (project.posthogHost || 'https://us.posthog.com').replace(/\/$/, '');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${project.posthogKey}`,
    'Content-Type': 'application/json',
  };

  // Parse email results
  let emailResults: EmailResult[] = [];
  try {
    emailResults = JSON.parse(batch.emailResults || '[]');
  } catch {
    emailResults = [];
  }

  // Find emails that need processing (pending or rate_limited)
  const retryableEmails = emailResults.filter(
    (r) => r.status === 'pending' || r.status === 'rate_limited'
  );

  if (retryableEmails.length === 0) {
    // All done
    if (batch.status !== 'completed') {
      await prisma.churnedSessionBatch.update({
        where: { id: batchId },
        data: { status: 'completed', lastProcessedAt: new Date() },
      });
    }
    return { processed: 0, hasMore: false, rateLimitedUntil: null, batchCompleted: true };
  }

  // Mark as processing
  if (batch.status === 'pending') {
    await prisma.churnedSessionBatch.update({
      where: { id: batchId },
      data: { status: 'processing', lastProcessedAt: new Date() },
    });
  }

  const rateLimiter = new PostHogRateLimiter();
  let processed = 0;
  let emailsFoundDelta = 0;
  let emailsNotFoundDelta = 0;
  let sessionsImportedDelta = 0;

  for (const emailEntry of retryableEmails) {
    if (processed >= limit) break;

    // Re-check batch status for pause support
    if (processed > 0 && processed % 5 === 0) {
      const freshBatch = await prisma.churnedSessionBatch.findUnique({
        where: { id: batchId },
        select: { status: true },
      });
      if (freshBatch?.status === 'paused') {
        console.log(`[BatchProcessor] Batch ${batchId} was paused, stopping`);
        break;
      }
    }

    const { email } = emailEntry;
    const wasPreviouslyRateLimited = emailEntry.status === 'rate_limited';
    console.log(`[BatchProcessor] Processing email: ${email}${wasPreviouslyRateLimited ? ' (retry after rate limit)' : ''}`);

    try {
      // 1. Find person by email
      const personResult = await findPersonByEmailRateLimited(
        email, rateLimiter, host, project.posthogProjId!, headers,
      );

      if (!personResult.found) {
        if (personResult.reason === 'rate_limited') {
          emailEntry.status = 'rate_limited';
          // Save progress and stop — we'll be picked up by cron after cooldown
          await saveBatchProgress(
            batchId, emailResults, emailsFoundDelta, emailsNotFoundDelta,
            sessionsImportedDelta, batch, personResult.retryAfter,
          );
          console.log(`[BatchProcessor] Rate limited at email ${email}, pausing until ${personResult.retryAfter.toISOString()}`);
          return {
            processed,
            hasMore: true,
            rateLimitedUntil: personResult.retryAfter,
            batchCompleted: false,
          };
        }

        if (personResult.reason === 'not_found') {
          emailEntry.status = 'not_found';
          emailsNotFoundDelta++;
        } else {
          emailEntry.status = 'error';
        }
      } else {
        // Person found — fetch recordings and import sessions
        // Only skip increment if person was already counted as found in a prior invocation
        // (rate-limited on recordings step — personName was set and persisted).
        // If rate-limited on person-lookup step, personName is still null, so we must count now.
        const alreadyCountedAsFound = !!emailEntry.personName;
        emailEntry.personName = personResult.name;
        emailEntry.status = 'found';
        if (!alreadyCountedAsFound) {
          emailsFoundDelta++;
        }

        // 2. Get recordings
        const recordingsResult = await getRecordingsRateLimited(
          personResult.personUuid, rateLimiter, host, project.posthogProjId!, headers,
        );

        if (!recordingsResult.ok) {
          if (recordingsResult.reason === 'rate_limited') {
            emailEntry.status = 'rate_limited';
            await saveBatchProgress(
              batchId, emailResults, emailsFoundDelta, emailsNotFoundDelta,
              sessionsImportedDelta, batch, recordingsResult.retryAfter,
            );
            console.log(`[BatchProcessor] Rate limited fetching recordings for ${email}`);
            return {
              processed,
              hasMore: true,
              rateLimitedUntil: recordingsResult.retryAfter,
              batchCompleted: false,
            };
          }
          emailEntry.status = 'error';
        } else {
          const recordings = recordingsResult.recordings;
          emailEntry.recordingCount = recordings.length;

          // 3. Import each recording as a session
          for (let ri = 0; ri < recordings.length; ri++) {
            const recording = recordings[ri];
            if (ri > 0) await sleep(INTER_RECORDING_DELAY);

            try {
              // Dedup check
              const existing = await prisma.session.findUnique({
                where: {
                  projectId_posthogSessionId: {
                    projectId: project.id,
                    posthogSessionId: recording.id,
                  },
                },
                select: { id: true },
              });

              if (existing) {
                console.log(`[BatchProcessor] Session already exists: ${recording.id}`);
                continue;
              }

              // Fetch rrweb events (uses existing fetchSessionEvents which has its own retry)
              const events = await fetchSessionEvents(
                recording.id, headers, host, project.posthogProjId!,
              );

              if (events.length === 0) {
                console.log(`[BatchProcessor] No events for recording: ${recording.id}`);
                continue;
              }

              // Create session — analysis will happen in Phase 2
              const sessionName = `Churned: ${email} - ${new Date(recording.start_time).toLocaleDateString()} ${new Date(recording.start_time).toLocaleTimeString()}`;

              await prisma.session.create({
                data: {
                  projectId: project.id,
                  source: 'churned',
                  posthogSessionId: recording.id,
                  name: sessionName,
                  distinctId: recording.distinct_id,
                  startTime: new Date(recording.start_time),
                  endTime: new Date(recording.end_time),
                  duration: Math.round(recording.recording_duration),
                  events: JSON.stringify(events),
                  eventCount: events.length,
                  analysisStatus: 'pending',
                  metadata: JSON.stringify({
                    batchId,
                    email,
                    personName: personResult.name,
                    clickCount: recording.click_count,
                    keypressCount: recording.keypress_count,
                    activeSeconds: recording.active_seconds,
                  }),
                },
              });

              sessionsImportedDelta++;
              console.log(`[BatchProcessor] Imported session: ${recording.id} for ${email}`);
            } catch (err) {
              console.error(`[BatchProcessor] Failed to import recording ${recording.id}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[BatchProcessor] Error processing email ${email}:`, err);
      emailEntry.status = 'error';
    }

    processed++;

    // Write progress after each email (crash-safe)
    await saveBatchProgress(
      batchId, emailResults, emailsFoundDelta, emailsNotFoundDelta,
      sessionsImportedDelta, batch, null,
    );
  }

  // Check if batch is now complete
  const remaining = emailResults.filter(
    (r) => r.status === 'pending' || r.status === 'rate_limited'
  );
  const batchCompleted = remaining.length === 0;

  if (batchCompleted) {
    await prisma.churnedSessionBatch.update({
      where: { id: batchId },
      data: { status: 'completed', lastProcessedAt: new Date() },
    });
  }

  return {
    processed,
    hasMore: !batchCompleted,
    rateLimitedUntil: null,
    batchCompleted,
  };
}

/**
 * Phase 2: Analyze — Run LLM analysis on imported but unanalyzed sessions.
 *
 * Independent of import phase. Can run even if import is paused.
 *
 * @param projectId - The project to analyze sessions for
 * @param limit - Max sessions to analyze in this invocation
 */
export async function analyzePendingSessions(
  projectId: string,
  limit: number = 10,
): Promise<AnalysisResult> {
  const pendingSessions = await prisma.session.findMany({
    where: {
      projectId,
      source: 'churned',
      analysisStatus: 'pending',
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const result: AnalysisResult = {
    analyzed: 0,
    failed: 0,
    pending: pendingSessions.length,
  };

  // Process in small batches of 3 for concurrency
  const CONCURRENCY = 3;
  for (let i = 0; i < pendingSessions.length; i += CONCURRENCY) {
    const chunk = pendingSessions.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (session) => {
        try {
          await analyzeSession(session.id);
          console.log(`[BatchProcessor] Analyzed session: ${session.id}`);
          return true;
        } catch (err) {
          console.error(`[BatchProcessor] Analysis failed for session ${session.id}:`, err);
          return false;
        }
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        result.analyzed++;
      } else {
        result.failed++;
      }
    }
  }

  return result;
}

/**
 * Run synthesis for a project's churned sessions.
 * Safe to call — will no-op if no analyzed sessions exist.
 */
export async function runSynthesis(projectId: string): Promise<void> {
  try {
    const analyzedCount = await prisma.session.count({
      where: {
        projectId,
        source: 'churned',
        analysisStatus: 'completed',
      },
    });

    if (analyzedCount > 0) {
      await synthesizeInsightsWithSessionLinkage(projectId);
      console.log(`[BatchProcessor] Synthesis complete for project ${projectId}`);
    }
  } catch (err) {
    console.error(`[BatchProcessor] Synthesis failed for project ${projectId}:`, err);
  }
}

/**
 * Save batch progress to DB. Called after each email for crash safety.
 */
async function saveBatchProgress(
  batchId: string,
  emailResults: EmailResult[],
  emailsFoundDelta: number,
  emailsNotFoundDelta: number,
  sessionsImportedDelta: number,
  batch: { emailsFound: number; emailsNotFound: number; sessionsImported: number },
  rateLimitedUntil: Date | null,
): Promise<void> {
  const processedCount = emailResults.filter(
    (r) => r.status !== 'pending' && r.status !== 'rate_limited'
  ).length;

  await prisma.churnedSessionBatch.update({
    where: { id: batchId },
    data: {
      processedEmails: processedCount,
      emailsFound: batch.emailsFound + emailsFoundDelta,
      emailsNotFound: batch.emailsNotFound + emailsNotFoundDelta,
      sessionsImported: batch.sessionsImported + sessionsImportedDelta,
      emailResults: JSON.stringify(emailResults),
      lastProcessedAt: new Date(),
      ...(rateLimitedUntil ? { rateLimitedUntil } : {}),
    },
  });
}
