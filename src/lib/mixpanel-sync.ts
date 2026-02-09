import { prisma } from '@/lib/prisma';
import type { SyncResult } from '@/types/session';

interface MixpanelEvent {
  event: string;
  properties: {
    time: number;
    distinct_id: string;
    $insert_id?: string;
    $session_id?: string;
    $current_url?: string;
    $screen_width?: number;
    $screen_height?: number;
    mp_lib?: string;
    [key: string]: unknown;
  };
}

interface MixpanelSession {
  sessionId: string;
  distinctId: string;
  events: MixpanelEvent[];
  startTime: number;
  endTime: number;
}

// Convert Mixpanel events to rrweb-compatible format for the parser
function mixpanelToRRWebEvents(events: MixpanelEvent[]): Array<{
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
}> {
  const rrwebEvents: Array<{
    type: number;
    data: Record<string, unknown>;
    timestamp: number;
  }> = [];

  // Sort events by time
  const sortedEvents = [...events].sort((a, b) => a.properties.time - b.properties.time);

  if (sortedEvents.length === 0) return rrwebEvents;

  const firstEvent = sortedEvents[0];
  const baseTimestamp = firstEvent.properties.time * 1000;

  // Add a Meta event (Type 4) for session context
  rrwebEvents.push({
    type: 4, // Meta
    data: {
      href: firstEvent.properties.$current_url || '',
      width: firstEvent.properties.$screen_width || 1920,
      height: firstEvent.properties.$screen_height || 1080,
    },
    timestamp: baseTimestamp,
  });

  // Convert each Mixpanel event to an rrweb-style event
  for (const event of sortedEvents) {
    const timestamp = event.properties.time * 1000;
    const eventName = event.event;
    const props = event.properties;

    // Map common Mixpanel events to rrweb IncrementalSnapshot events
    if (eventName === '$mp_web_page_view' || eventName === 'Page View' || eventName === '$pageview') {
      // Custom event for page view
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: '$pageview',
          payload: {
            $current_url: props.$current_url || props.url || props.$url,
            $referrer: props.$referrer,
            $initial_referrer: props.$initial_referrer,
          },
        },
        timestamp,
      });
    } else if (eventName === '$click' || eventName === 'Click' || eventName.includes('click')) {
      // Mouse interaction - Click
      rrwebEvents.push({
        type: 3, // IncrementalSnapshot
        data: {
          source: 2, // MouseInteraction
          type: 2, // Click
          id: generateNodeId(props),
          x: props.$click_x || props.x || 0,
          y: props.$click_y || props.y || 0,
          // Include element info in the node data
          _elementInfo: {
            tagName: props.$element_tag || props.tag_name || 'div',
            textContent: props.$element_text || props.element_text || '',
            className: props.$element_class || props.element_class || '',
            id: props.$element_id || props.element_id || '',
          },
        },
        timestamp,
      });
    } else if (eventName === '$form_submit' || eventName === 'Form Submit' || eventName === 'submit') {
      // Form submission
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: 'form_submit',
          payload: {
            type: 'submit',
            formId: props.form_id || props.$form_id,
            formAction: props.form_action || props.$form_action,
          },
        },
        timestamp,
      });
    } else if (eventName === '$input' || eventName === 'Input' || eventName.includes('input')) {
      // Input event
      rrwebEvents.push({
        type: 3, // IncrementalSnapshot
        data: {
          source: 5, // Input
          id: generateNodeId(props),
          text: '[REDACTED]', // Don't expose actual input values
          isChecked: props.checked,
        },
        timestamp,
      });
    } else if (eventName === '$scroll' || eventName === 'Scroll') {
      // Scroll event
      rrwebEvents.push({
        type: 3, // IncrementalSnapshot
        data: {
          source: 3, // Scroll
          id: 1, // Document
          x: props.scroll_x || props.$scroll_x || 0,
          y: props.scroll_y || props.$scroll_y || props.scroll_depth || 0,
        },
        timestamp,
      });
    } else if (eventName === '$exception' || eventName === 'Error' || eventName.includes('error')) {
      // Console error
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: 'console_error',
          payload: {
            level: 'error',
            message: props.error_message || props.$exception_message || props.message || 'Unknown error',
            type: 'error',
          },
        },
        timestamp,
      });
    } else if (eventName === '$session_start') {
      // Session start - add as custom event
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: 'session_start',
          payload: {
            sessionId: props.$session_id,
            userId: props.distinct_id,
          },
        },
        timestamp,
      });
    } else if (eventName === '$session_end') {
      // Session end
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: 'session_end',
          payload: {
            sessionId: props.$session_id,
          },
        },
        timestamp,
      });
    } else {
      // Generic event - convert to custom event
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: eventName,
          payload: {
            ...props,
            // Clean up internal Mixpanel properties
            time: undefined,
            distinct_id: undefined,
            $insert_id: undefined,
          },
        },
        timestamp,
      });
    }
  }

  return rrwebEvents;
}

// Generate a pseudo node ID for element tracking
function generateNodeId(props: Record<string, unknown>): number {
  const elementId = props.$element_id || props.element_id || '';
  const elementClass = props.$element_class || props.element_class || '';
  const tagName = props.$element_tag || props.tag_name || '';

  // Simple hash to generate consistent IDs
  const str = `${tagName}-${elementId}-${elementClass}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

// Lookup numeric Project ID from Project Token using Mixpanel API
async function lookupProjectId(
  projectToken: string,
  apiSecret: string,
  host: string
): Promise<string> {
  // Try to get project info - the API Secret is scoped to a project
  // We can use the /api/app/me endpoint to get project details
  const baseUrl = host.replace(/\/$/, '');

  // If it looks like a numeric ID already, just return it
  if (/^\d+$/.test(projectToken)) {
    return projectToken;
  }

  // Try the organization projects endpoint
  const authString = Buffer.from(`${apiSecret}:`).toString('base64');

  try {
    // First try /api/app/me which returns current project info
    const meResponse = await fetch(`${baseUrl}/api/app/me`, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Accept': 'application/json',
      },
    });

    if (meResponse.ok) {
      const data = await meResponse.json();
      if (data.results?.project_id) {
        console.log(`[Mixpanel] Found project ID: ${data.results.project_id}`);
        return String(data.results.project_id);
      }
    }
  } catch (e) {
    console.log('[Mixpanel] /api/app/me lookup failed, trying alternative');
  }

  // If lookup fails, assume the token might work as project_id for some API versions
  console.log(`[Mixpanel] Using provided token as project identifier: ${projectToken}`);
  return projectToken;
}

// Fetch events from Mixpanel Export API
async function fetchMixpanelEvents(
  projectToken: string,
  apiKey: string,
  apiSecret: string | null,
  fromDate: string,
  toDate: string,
  host: string
): Promise<MixpanelEvent[]> {
  // Mixpanel uses different auth methods:
  // - Service Account: Basic auth with username:secret
  // - API Secret: Just the secret as password with empty username

  const authString = apiSecret
    ? Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    : Buffer.from(`${apiKey}:`).toString('base64');

  const baseUrl = host.replace(/\/$/, '');

  // Try to get the numeric project ID
  const projectId = await lookupProjectId(projectToken, apiKey, host);

  const exportUrl = `${baseUrl}/api/2.0/export`;

  const params = new URLSearchParams({
    project_id: projectId,
    from_date: fromDate,
    to_date: toDate,
  });

  console.log(`[Mixpanel] Fetching events from ${fromDate} to ${toDate} (project: ${projectId})`);

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
      if (errorText.includes('project_id')) {
        throw new Error('Invalid Mixpanel Project ID. Note: You need the numeric Project ID (found in Project Settings → Overview), not the Project Token.');
      }
      throw new Error(`Mixpanel API error: ${response.status} - ${errorText}`);
    }

    // Mixpanel export API returns newline-delimited JSON
    const text = await response.text();
    const lines = text.trim().split('\n').filter(line => line.trim());

    const events: MixpanelEvent[] = [];
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        events.push(event);
      } catch {
        console.warn('[Mixpanel] Failed to parse event line:', line.substring(0, 100));
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

  // First, try to group by explicit session ID
  for (const event of events) {
    const sessionId = event.properties.$session_id ||
                      `${event.properties.distinct_id}-${Math.floor(event.properties.time / 1800)}`; // 30-min windows

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
  daysBack: number = 7
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

  // Calculate date range
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Fetch events from Mixpanel
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

  // Group events into sessions
  const sessions = groupEventsIntoSessions(events);
  console.log(`[Mixpanel Sync] Found ${sessions.length} sessions to process`);

  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const session of sessions) {
    try {
      // Create a unique session ID for deduplication
      const mixpanelSessionId = `mp_${session.sessionId}`;

      // Check if already exists
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
        console.log(`[Mixpanel Sync] Skipping existing session: ${session.sessionId}`);
        result.skipped++;
        continue;
      }

      // Convert to rrweb format
      const rrwebEvents = mixpanelToRRWebEvents(session.events);

      if (rrwebEvents.length === 0) {
        console.log(`[Mixpanel Sync] No events for session: ${session.sessionId}`);
        result.failed++;
        result.errors?.push(`No events for session ${session.sessionId}`);
        continue;
      }

      // Create session record
      const sessionName = `Mixpanel ${new Date(session.startTime).toLocaleDateString()} ${new Date(session.startTime).toLocaleTimeString()}`;

      await prisma.session.create({
        data: {
          projectId,
          source: 'mixpanel',
          posthogSessionId: mixpanelSessionId, // Reusing field for dedup
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

  // Filter by distinct_id and group into sessions
  const userEvents = events.filter(e => e.properties.distinct_id === distinctId);
  return groupEventsIntoSessions(userEvents);
}
