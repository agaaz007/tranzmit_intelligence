import { prisma } from '@/lib/prisma';
import zlib from 'zlib';
import type { SyncResult } from '@/types/session';
import type { AmplitudeEvent, AmplitudeSession } from './types';
import { amplitudeToRRWebEvents } from './event-mapper';

// ── Fetch raw events from Amplitude Export API ──
// Docs: https://www.docs.developers.amplitude.com/analytics/apis/export-api/
// Returns gzipped newline-delimited JSON
async function fetchAmplitudeEvents(
  apiKey: string,
  secretKey: string,
  start: string, // YYYYMMDDTHH
  end: string     // YYYYMMDDTHH
): Promise<AmplitudeEvent[]> {
  const authString = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');

  const url = `https://amplitude.com/api/2/export?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  console.log(`[Amplitude] Fetching events from ${start} to ${end}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${authString}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Amplitude] API error (${response.status}):`, errorText);

    if (response.status === 401 || response.status === 403) {
      throw new Error('Amplitude authentication failed. Check your API Key and Secret Key.');
    }
    if (response.status === 404) {
      throw new Error('No data found for the given time range.');
    }
    if (response.status === 429) {
      throw new Error('Amplitude rate limit exceeded. Try again later.');
    }
    throw new Error(`Amplitude API error: ${response.status} - ${errorText}`);
  }

  // Response is gzipped — decompress it
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let text: string;
  try {
    text = zlib.gunzipSync(buffer).toString('utf8');
  } catch {
    // Might not be gzipped in some edge cases
    text = buffer.toString('utf8');
  }

  const lines = text.trim().split('\n').filter(line => line.trim());
  const events: AmplitudeEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch {
      console.warn('[Amplitude] Failed to parse event line:', line.substring(0, 100));
    }
  }

  console.log(`[Amplitude] Fetched ${events.length} events`);
  return events;
}

// ── Group events into sessions by session_id ──
function groupEventsIntoSessions(events: AmplitudeEvent[]): AmplitudeSession[] {
  const sessionMap = new Map<string, AmplitudeSession>();

  for (const event of events) {
    // Amplitude session_id is an epoch ms timestamp, or -1 if no session
    const sessionId = event.session_id;
    if (!sessionId || sessionId === -1) continue;

    const key = `${event.user_id || event.device_id}_${sessionId}`;
    const eventTime = new Date(event.event_time.replace(' ', 'T') + 'Z').getTime();

    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        sessionId,
        userId: event.user_id || event.device_id,
        deviceId: event.device_id,
        events: [],
        startTime: eventTime,
        endTime: eventTime,
        platform: event.platform || '',
        osName: event.os_name || '',
        deviceType: event.device_type || '',
        country: event.country || '',
      });
    }

    const session = sessionMap.get(key)!;
    session.events.push(event);
    session.startTime = Math.min(session.startTime, eventTime);
    session.endTime = Math.max(session.endTime, eventTime);
  }

  return Array.from(sessionMap.values());
}

// ── Format date for Amplitude Export API (YYYYMMDDTHH) ──
function formatAmplitudeDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}`;
}

/**
 * Sync sessions from Amplitude to database for a given project.
 * Returns a SyncResult with imported/skipped/failed counts.
 */
export async function syncSessionsFromAmplitude(
  projectId: string,
  daysBack: number = 7
): Promise<SyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      amplitudeKey: true,
      amplitudeSecret: true,
      amplitudeProjId: true,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const apiKey = project.amplitudeKey;
  const secretKey = project.amplitudeSecret;

  const amplitudeProjId = project.amplitudeProjId;

  if (!apiKey || !secretKey) {
    throw new Error('Amplitude API Key and Secret Key are required. Find them in Amplitude → Settings → Projects → <your project>.');
  }

  if (!amplitudeProjId) {
    throw new Error('Amplitude Project ID is required. Find it in Amplitude → Settings → Projects.');
  }

  console.log(`[Amplitude Sync] Project: ${project.name}, Amplitude Project: ${amplitudeProjId}`);

  // Calculate date range
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  // Fetch events from Amplitude Export API
  const events = await fetchAmplitudeEvents(
    apiKey,
    secretKey,
    formatAmplitudeDate(start),
    formatAmplitudeDate(end)
  );

  if (events.length === 0) {
    console.log('[Amplitude Sync] No events found');
    return { imported: 0, skipped: 0, failed: 0, errors: [] };
  }

  // Group events into sessions
  const sessions = groupEventsIntoSessions(events);
  console.log(`[Amplitude Sync] Found ${sessions.length} sessions to process`);

  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const session of sessions) {
    try {
      // Dedupe key: amp_{userId}_{sessionId}
      const amplitudeSessionId = `amp_${session.userId}_${session.sessionId}`;

      // Check if already imported
      const existing = await prisma.session.findUnique({
        where: {
          projectId_posthogSessionId: {
            projectId,
            posthogSessionId: amplitudeSessionId,
          },
        },
        select: { id: true },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      // Convert to rrweb format
      const rrwebEvents = amplitudeToRRWebEvents(session.events);

      if (rrwebEvents.length === 0) {
        result.failed++;
        result.errors?.push(`No convertible events for session ${session.sessionId}`);
        continue;
      }

      // Compute click count from original events
      const clickCount = session.events.filter(e =>
        e.event_type === '[Amplitude] Element Clicked' ||
        e.event_type.toLowerCase().includes('click')
      ).length;

      const sessionName = `Amplitude ${new Date(session.startTime).toLocaleDateString()} ${new Date(session.startTime).toLocaleTimeString()}`;

      await prisma.session.create({
        data: {
          projectId,
          source: 'amplitude',
          posthogSessionId: amplitudeSessionId, // Reusing field for dedup (same pattern as Mixpanel)
          name: sessionName,
          distinctId: session.userId,
          startTime: new Date(session.startTime),
          endTime: new Date(session.endTime),
          duration: Math.round((session.endTime - session.startTime) / 1000),
          events: JSON.stringify(rrwebEvents),
          eventCount: rrwebEvents.length,
          analysisStatus: 'pending',
          metadata: JSON.stringify({
            source: 'amplitude',
            amplitudeSessionId: session.sessionId,
            originalEventCount: session.events.length,
            clickCount,
            platform: session.platform,
            osName: session.osName,
            deviceType: session.deviceType,
            country: session.country,
          }),
        },
      });

      console.log(`[Amplitude Sync] Imported session: ${session.sessionId} (${rrwebEvents.length} events)`);
      result.imported++;
    } catch (err) {
      console.error(`[Amplitude Sync] Failed to import session ${session.sessionId}:`, err);
      result.failed++;
      result.errors?.push(`Failed: ${session.sessionId} - ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  console.log(`[Amplitude Sync] Complete: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed`);
  return result;
}

/**
 * Fetch sessions for a specific user from Amplitude.
 * Useful for churn analysis — get all sessions for a churned user.
 */
export async function fetchAmplitudeUserSessions(
  projectId: string,
  userId: string,
  daysBack: number = 30
): Promise<AmplitudeSession[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      amplitudeKey: true,
      amplitudeSecret: true,
      amplitudeProjId: true,
    },
  });

  if (!project?.amplitudeKey || !project?.amplitudeSecret) {
    throw new Error('Amplitude not configured for this project');
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);

  const events = await fetchAmplitudeEvents(
    project.amplitudeKey,
    project.amplitudeSecret,
    formatAmplitudeDate(start),
    formatAmplitudeDate(end)
  );

  // Filter to just this user, then group into sessions
  const userEvents = events.filter(
    e => e.user_id === userId || e.device_id === userId
  );

  return groupEventsIntoSessions(userEvents);
}
