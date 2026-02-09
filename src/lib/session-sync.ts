import { prisma } from '@/lib/prisma';
import zlib from 'zlib';
import type { SyncResult } from '@/types/session';

interface PostHogSession {
  id: string;
  distinct_id: string;
  start_time: string;
  end_time: string;
  recording_duration: number;
  click_count: number;
  keypress_count: number;
  active_seconds: number;
}

interface RRWebEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
  windowId?: string;
}

// Helper to try fetching from PostHog with both API patterns
export async function fetchFromPostHog(
  host: string,
  projectId: string,
  endpoint: string,
  headers: Record<string, string>
): Promise<{ response: Response | null; error?: string }> {
  const urlPatterns = [
    `${host}/api/environments/${projectId}${endpoint}`,
    `${host}/api/projects/${projectId}${endpoint}`,
  ];

  for (const url of urlPatterns) {
    try {
      console.log(`[PostHog] Trying: ${url}`);
      const response = await fetch(url, { headers });

      if (response.ok) {
        console.log(`[PostHog] Success with: ${url}`);
        return { response };
      }

      const errorText = await response.text().catch(() => 'No error body');
      console.log(`[PostHog] Failed (${response.status}): ${url} - ${errorText.substring(0, 200)}`);
    } catch (err) {
      console.log(`[PostHog] Network error for ${url}:`, err);
    }
  }

  return { response: null, error: 'All PostHog API patterns failed' };
}

// Decompression helpers
function tryDecompressString(str: string): unknown | null {
  if (str.length < 2) return null;
  const firstTwo = str.charCodeAt(0) === 0x1f && str.charCodeAt(1) === 0x8b;
  if (!firstTwo) return null;

  try {
    const buf = Buffer.from(str, 'binary');
    const decompressed = zlib.gunzipSync(buf).toString('utf8');
    return JSON.parse(decompressed);
  } catch {
    try {
      const buf = Buffer.from(str, 'base64');
      const decompressed = zlib.gunzipSync(buf).toString('utf8');
      return JSON.parse(decompressed);
    } catch {
      return null;
    }
  }
}

function decompressNestedFields(obj: unknown): unknown {
  if (typeof obj === 'string') {
    const decompressed = tryDecompressString(obj);
    return decompressed !== null ? decompressed : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => decompressNestedFields(item));
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = decompressNestedFields(value);
    }
    return result;
  }
  return obj;
}

function decompressEvent(event: unknown): RRWebEvent | null {
  if (typeof event === 'string') {
    try {
      return JSON.parse(event);
    } catch {
      return null;
    }
  }

  if (event && typeof event === 'object') {
    const evt = event as Record<string, unknown>;
    if (evt.cv && typeof evt.data === 'string') {
      try {
        const buf = Buffer.from(evt.data, 'base64');
        const parsedData = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
        const fullyDecompressed = decompressNestedFields(parsedData);
        return {
          type: evt.type as number,
          timestamp: evt.timestamp as number,
          data: fullyDecompressed as Record<string, unknown>,
        };
      } catch {
        try {
          const buf = Buffer.from(evt.data as string, 'binary');
          const parsedData = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
          const fullyDecompressed = decompressNestedFields(parsedData);
          return {
            type: evt.type as number,
            timestamp: evt.timestamp as number,
            data: fullyDecompressed as Record<string, unknown>,
          };
        } catch {
          return evt as unknown as RRWebEvent;
        }
      }
    }
    if (evt.data && typeof evt.data === 'object') {
      const decompressedData = decompressNestedFields(evt.data);
      return {
        ...evt,
        data: decompressedData as Record<string, unknown>,
      } as RRWebEvent;
    }
    return evt as unknown as RRWebEvent;
  }
  return null;
}

export function parseEncodedSnapshots(items: unknown[]): RRWebEvent[] {
  const parsedLines: RRWebEvent[] = [];
  let lastWindowId: string | null = null;

  for (const item of items) {
    if (!item) continue;
    try {
      const snapshotLine = typeof item === 'string' ? JSON.parse(item) : item;
      let resolvedWindowId: string | null = null;
      let eventData: unknown = null;

      if (Array.isArray(snapshotLine)) {
        resolvedWindowId = snapshotLine[0] as string;
        eventData = snapshotLine[1];
      } else if (typeof snapshotLine === 'object' && snapshotLine !== null) {
        const line = snapshotLine as Record<string, unknown>;
        if (line.type !== undefined) {
          eventData = snapshotLine;
          resolvedWindowId = (line.windowId as string) || null;
        } else if (line.data) {
          resolvedWindowId = (line.window_id as string) || (line.windowId as string) || null;
          eventData = line.data;
        }
      }

      if (!eventData) continue;

      if (resolvedWindowId) {
        lastWindowId = resolvedWindowId;
      } else if (lastWindowId) {
        resolvedWindowId = lastWindowId;
      } else {
        resolvedWindowId = 'default';
      }

      const events = Array.isArray(eventData) ? eventData : [eventData];
      for (const evt of events) {
        const decompressed = decompressEvent(evt);
        if (decompressed && decompressed.type !== undefined) {
          parsedLines.push({ ...decompressed, windowId: resolvedWindowId });
        }
      }
    } catch {
      continue;
    }
  }
  return parsedLines;
}

// Fetch rrweb events for a single PostHog session
async function fetchSessionEvents(
  sessionId: string,
  headers: Record<string, string>,
  host: string,
  projectId: string
): Promise<RRWebEvent[]> {
  const { response: sourcesRes, error: sourcesError } = await fetchFromPostHog(
    host,
    projectId,
    `/session_recordings/${sessionId}/snapshots?blob_v2=true`,
    headers
  );

  if (!sourcesRes || sourcesError) {
    console.log(`[Session Events] Failed to get sources for ${sessionId}: ${sourcesError}`);
    return [];
  }

  const sourcesData = await sourcesRes.json();
  const sources = sourcesData.sources || [];

  if (sources.length === 0) {
    return [];
  }

  const allSnapshots: unknown[] = [];
  const blobKeys = sources.map((s: { blob_key: string }) => s.blob_key);

  for (const blobKey of blobKeys) {
    const { response: blobRes } = await fetchFromPostHog(
      host,
      projectId,
      `/session_recordings/${sessionId}/snapshots?source=blob_v2&start_blob_key=${blobKey}&end_blob_key=${blobKey}`,
      headers
    );

    if (!blobRes) continue;

    const text = await blobRes.text();
    const lines = text.trim().split('\n').filter(line => line.trim());
    const snapshots = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    allSnapshots.push(...snapshots);
  }

  return parseEncodedSnapshots(allSnapshots);
}

/**
 * Sync sessions from PostHog to database for a given project.
 * Returns a SyncResult with imported/skipped/failed counts.
 */
export async function syncSessionsFromPostHog(projectId: string, count: number = 10): Promise<SyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      posthogKey: true,
      posthogHost: true,
      posthogProjId: true,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const apiKey = project.posthogKey;
  const host = (project.posthogHost || 'https://us.posthog.com').replace(/\/$/, '');
  const posthogProjectId = project.posthogProjId;

  if (!apiKey) {
    throw new Error('PostHog API key not configured for this project');
  }

  if (!posthogProjectId) {
    throw new Error('PostHog Project ID not configured for this project');
  }

  console.log(`[Session Sync] Project: ${project.name}, PostHog Project: ${posthogProjectId}, Host: ${host}`);

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  // Fetch session list from PostHog
  const { response: listRes, error: listError } = await fetchFromPostHog(
    host,
    posthogProjectId,
    `/session_recordings?limit=${Math.min(count, 50)}`,
    headers
  );

  if (!listRes || listError) {
    throw new Error(`Failed to fetch sessions from PostHog: ${listError}`);
  }

  const listData = await listRes.json();
  const posthogSessions: PostHogSession[] = listData.results || [];

  console.log(`[Session Sync] Found ${posthogSessions.length} sessions to process`);

  if (posthogSessions.length === 0) {
    return { imported: 0, skipped: 0, failed: 0, errors: [] };
  }

  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const phSession of posthogSessions) {
    try {
      // Check if already exists
      const existing = await prisma.session.findUnique({
        where: { projectId_posthogSessionId: { projectId, posthogSessionId: phSession.id } },
        select: { id: true },
      });

      if (existing) {
        console.log(`[Session Sync] Skipping existing session: ${phSession.id}`);
        result.skipped++;
        continue;
      }

      // Fetch events
      console.log(`[Session Sync] Fetching events for: ${phSession.id}`);
      const events = await fetchSessionEvents(phSession.id, headers, host, posthogProjectId);

      if (events.length === 0) {
        console.log(`[Session Sync] No events for session: ${phSession.id}`);
        result.failed++;
        result.errors?.push(`No events for session ${phSession.id}`);
        continue;
      }

      // Create session record
      const sessionName = `PostHog ${new Date(phSession.start_time).toLocaleDateString()} ${new Date(phSession.start_time).toLocaleTimeString()}`;

      await prisma.session.create({
        data: {
          projectId,
          source: 'posthog',
          posthogSessionId: phSession.id,
          name: sessionName,
          distinctId: phSession.distinct_id,
          startTime: new Date(phSession.start_time),
          endTime: new Date(phSession.end_time),
          duration: Math.round(phSession.recording_duration),
          events: JSON.stringify(events),
          eventCount: events.length,
          analysisStatus: 'pending',
          metadata: JSON.stringify({
            clickCount: phSession.click_count,
            keypressCount: phSession.keypress_count,
            activeSeconds: phSession.active_seconds,
          }),
        },
      });

      console.log(`[Session Sync] Imported session: ${phSession.id} (${events.length} events)`);
      result.imported++;
    } catch (err) {
      console.error(`[Session Sync] Failed to import session ${phSession.id}:`, err);
      result.failed++;
      result.errors?.push(`Failed: ${phSession.id} - ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  console.log(`[Session Sync] Complete: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed`);
  return result;
}
