import { prisma } from '@/lib/prisma';
import type { SyncResult } from '@/types/session';
import type { MixpanelEvent, MixpanelSession } from './types';
import { mixpanelToRRWebEvents } from './event-mapper';

// Fetch events from Mixpanel Export API
async function fetchMixpanelEvents(
  projectToken: string,
  apiKey: string,
  apiSecret: string | null,
  fromDate: string,
  toDate: string,
  host: string
): Promise<MixpanelEvent[]> {
  // Service Account auth: username:secret. API Secret auth: secret with empty username.
  const isServiceAccount = !!apiSecret;
  const authString = isServiceAccount
    ? Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    : Buffer.from(`${apiKey}:`).toString('base64');

  const baseUrl = host.replace(/\/$/, '');

  // Export API lives on data.mixpanel.com, not mixpanel.com
  let dataHost: string;
  if (baseUrl.includes('eu.mixpanel.com')) {
    dataHost = 'https://data-eu.mixpanel.com';
  } else {
    dataHost = 'https://data.mixpanel.com';
  }
  const exportUrl = `${dataHost}/api/2.0/export`;

  // Always include project_id - required by Mixpanel Export API
  const params = new URLSearchParams({
    from_date: fromDate,
    to_date: toDate,
    project_id: projectToken, // Use the numeric project ID directly
  });

  console.log(`[Mixpanel] Fetching events from ${fromDate} to ${toDate} (project: ${projectToken})`);

  try {
    const response = await fetch(`${exportUrl}?${params}`, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Mixpanel] API error (${response.status}):`, errorText);

      if (response.status === 401 || response.status === 403) {
        throw new Error('Mixpanel authentication failed. Check your API Secret.');
      }
      if (errorText.includes('Invalid project_id') || errorText.includes('unknown project')) {
        throw new Error('Invalid Mixpanel Project ID. Note: You need the numeric Project ID (found in Project Settings → Overview), not the Project Token.');
      }
      throw new Error(`Mixpanel API error: ${response.status} - ${errorText}`);
    }

    // Stream the response line-by-line to avoid memory limits on large exports
    const MAX_EVENTS = 50000;
    const events: MixpanelEvent[] = [];
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('No response body from Mixpanel');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      // Keep the last partial line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // skip malformed lines
        }
        if (events.length >= MAX_EVENTS) break;
      }

      if (events.length >= MAX_EVENTS) {
        reader.cancel();
        console.log(`[Mixpanel] Hit ${MAX_EVENTS} event cap, stopping early`);
        break;
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim() && events.length < MAX_EVENTS) {
      try {
        events.push(JSON.parse(buffer.trim()));
      } catch {
        // skip
      }
    }

    console.log(`[Mixpanel] Fetched ${events.length} events`);
    return events;
  } catch (error) {
    console.error('[Mixpanel] Failed to fetch events:', error);
    throw error;
  }
}

// Group events into sessions
function groupEventsIntoSessions(events: MixpanelEvent[]): MixpanelSession[] {
  const sessionMap = new Map<string, MixpanelSession>();

  for (const event of events) {
    const sessionId = event.properties.$session_id ||
                      `${event.properties.distinct_id}-${Math.floor(event.properties.time / 1800)}`;

    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        sessionId,
        distinctId: event.properties.distinct_id,
        events: [],
        startTime: event.properties.time * 1000,
        endTime: event.properties.time * 1000,
      });
    }

    const session = sessionMap.get(sessionId)!;
    session.events.push(event);
    session.startTime = Math.min(session.startTime, event.properties.time * 1000);
    session.endTime = Math.max(session.endTime, event.properties.time * 1000);
  }

  return Array.from(sessionMap.values());
}

/**
 * Sync sessions from Mixpanel to database for a given project.
 * Returns a SyncResult with imported/skipped/failed counts.
 */
export async function syncSessionsFromMixpanel(
  projectId: string,
  daysBack: number = 3,
  maxSessions: number = 5
): Promise<SyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      mixpanelKey: true,
      mixpanelSecret: true,
      mixpanelProjId: true,
      mixpanelHost: true,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const apiKey = project.mixpanelKey;
  const apiSecret = project.mixpanelSecret;
  const mixpanelProjectId = project.mixpanelProjId;
  const host = project.mixpanelHost || 'https://mixpanel.com';

  if (!apiKey) {
    throw new Error('Mixpanel API key not configured for this project');
  }

  if (!mixpanelProjectId) {
    throw new Error('Mixpanel Project ID not configured for this project');
  }

  console.log(`[Mixpanel Sync] Project: ${project.name}, Mixpanel Project: ${mixpanelProjectId}`);

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const events = await fetchMixpanelEvents(
    mixpanelProjectId,
    apiKey,
    apiSecret,
    formatDate(fromDate),
    formatDate(toDate),
    host
  );

  if (events.length === 0) {
    console.log('[Mixpanel Sync] No events found');
    return { imported: 0, skipped: 0, failed: 0, errors: [] };
  }

  const allSessions = groupEventsIntoSessions(events);
  // Take only the most recent N sessions
  const sessions = allSessions
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, maxSessions);
  console.log(`[Mixpanel Sync] Found ${allSessions.length} sessions, processing latest ${sessions.length}`);

  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const session of sessions) {
    try {
      const mixpanelSessionId = `mp_${session.sessionId}`;

      const existing = await prisma.session.findUnique({
        where: {
          projectId_posthogSessionId: {
            projectId,
            posthogSessionId: mixpanelSessionId
          }
        },
        select: { id: true },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      const rrwebEvents = mixpanelToRRWebEvents(session.events);

      if (rrwebEvents.length === 0) {
        result.failed++;
        result.errors?.push(`No events for session ${session.sessionId}`);
        continue;
      }

      const sessionName = `Mixpanel ${new Date(session.startTime).toLocaleDateString()} ${new Date(session.startTime).toLocaleTimeString()}`;

      await prisma.session.create({
        data: {
          projectId,
          source: 'mixpanel',
          posthogSessionId: mixpanelSessionId,
          name: sessionName,
          distinctId: session.distinctId,
          startTime: new Date(session.startTime),
          endTime: new Date(session.endTime),
          duration: Math.round((session.endTime - session.startTime) / 1000),
          events: JSON.stringify(rrwebEvents),
          eventCount: rrwebEvents.length,
          analysisStatus: 'pending',
          metadata: JSON.stringify({
            originalEventCount: session.events.length,
            source: 'mixpanel',
            mixpanelSessionId: session.sessionId,
          }),
        },
      });

      console.log(`[Mixpanel Sync] Imported session: ${session.sessionId} (${rrwebEvents.length} events)`);
      result.imported++;
    } catch (err) {
      console.error(`[Mixpanel Sync] Failed to import session ${session.sessionId}:`, err);
      result.failed++;
      result.errors?.push(`Failed: ${session.sessionId} - ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  console.log(`[Mixpanel Sync] Complete: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed`);
  return result;
}

/**
 * Fetch user sessions from Mixpanel by distinct_id
 */
export async function fetchMixpanelUserSessions(
  projectId: string,
  distinctId: string,
  daysBack: number = 30
): Promise<MixpanelSession[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      mixpanelKey: true,
      mixpanelSecret: true,
      mixpanelProjId: true,
      mixpanelHost: true,
    },
  });

  if (!project?.mixpanelKey || !project?.mixpanelProjId) {
    throw new Error('Mixpanel not configured for this project');
  }

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const events = await fetchMixpanelEvents(
    project.mixpanelProjId,
    project.mixpanelKey,
    project.mixpanelSecret,
    formatDate(fromDate),
    formatDate(toDate),
    project.mixpanelHost || 'https://mixpanel.com'
  );

  const userEvents = events.filter(e => e.properties.distinct_id === distinctId);
  return groupEventsIntoSessions(userEvents);
}
