import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { parseRRWebSession, type SemanticSession } from '@/lib/rrweb-parser';
import zlib from 'zlib';

interface RRWebEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
  windowId?: string;
}

// Recovery-focused analysis schema (optimized for churn recovery context)
const RecoveryAnalysisSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of the user's overall experience across sessions. Focus on what they tried to do and what problems they faced."),
  frustrationPoints: z.array(z.object({
    issue: z.string().describe("Specific description of what went wrong"),
    severity: z.enum(['high', 'medium', 'low']).describe("How severe this issue was"),
    occurrences: z.number().describe("How many times this happened (estimate 1 if unknown)"),
  })).describe("Key friction points that caused user frustration. Look for rage clicks, dead clicks, errors, abandoned inputs."),
  behaviorPatterns: z.array(z.string()).describe("Notable behavior patterns like exploring, confusion, or low engagement"),
  dropOffPoints: z.array(z.string()).describe("Where/why the user likely dropped off or churned"),
  recoveryInsight: z.string().describe("One key insight for the recovery call - what should we address to win them back?"),
});

// Decompression helpers (same as sessions/sync)
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

function parseEncodedSnapshots(items: unknown[]): RRWebEvent[] {
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

// Fetch RRWeb events for a PostHog session
async function fetchSessionEvents(
  sessionId: string,
  headers: Record<string, string>,
  host: string,
  projectId: string
): Promise<RRWebEvent[]> {
  // Try projects endpoint first (newer), then environments endpoint (older)
  const endpoints = [
    `${host}/api/projects/${projectId}/session_recordings/${sessionId}/snapshots?blob_v2=true`,
    `${host}/api/environments/${projectId}/session_recordings/${sessionId}/snapshots?blob_v2=true`,
  ];

  let sources: Array<{ blob_key: string }> = [];
  let workingEndpointBase = '';

  for (const sourcesUrl of endpoints) {
    try {
      const sourcesRes = await fetch(sourcesUrl, { headers });
      if (sourcesRes.ok) {
        const sourcesData = await sourcesRes.json();
        if (sourcesData.sources && sourcesData.sources.length > 0) {
          sources = sourcesData.sources;
          workingEndpointBase = sourcesUrl.replace('/snapshots?blob_v2=true', '');
          console.log(`[Recovery Analysis] Found ${sources.length} blob sources for session ${sessionId}`);
          break;
        }
      }
    } catch {
      continue;
    }
  }

  if (sources.length === 0) {
    console.error(`[Recovery Analysis] No snapshot sources found for session ${sessionId}`);
    return [];
  }

  const allSnapshots: unknown[] = [];
  const blobKeys = sources.map(s => s.blob_key);

  for (const blobKey of blobKeys) {
    const blobUrl = `${workingEndpointBase}/snapshots?source=blob_v2&start_blob_key=${blobKey}&end_blob_key=${blobKey}`;
    try {
      const blobRes = await fetch(blobUrl, { headers });
      if (!blobRes.ok) continue;

      const text = await blobRes.text();
      const lines = text.trim().split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          allSnapshots.push(JSON.parse(line));
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  console.log(`[Recovery Analysis] Fetched ${allSnapshots.length} raw snapshots for session ${sessionId}`);
  return parseEncodedSnapshots(allSnapshots);
}

// First, look up the person UUID from distinct_id
async function getPersonUUID(
  distinctId: string,
  headers: Record<string, string>,
  host: string,
  projectId: string
): Promise<string | null> {
  // Try to find the person by distinct_id
  const url = `${host}/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`;
  console.log(`[Recovery Analysis] Looking up person UUID: ${url}`);

  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log(`[Recovery Analysis] Person lookup status: ${res.status}`);

    if (res.ok) {
      const data = JSON.parse(text);
      if (data.results && data.results.length > 0) {
        const personUUID = data.results[0].uuid || data.results[0].id;
        console.log(`[Recovery Analysis] Found person UUID: ${personUUID}`);
        return personUUID;
      }
    }
    console.log(`[Recovery Analysis] Person lookup response: ${text.substring(0, 300)}`);
  } catch (err) {
    console.log(`[Recovery Analysis] Person lookup failed: ${err}`);
  }

  return null;
}

// Get session recordings list for a user by distinct_id
async function getUserSessions(
  distinctId: string,
  headers: Record<string, string>,
  host: string,
  projectId: string,
  limit: number = 5
): Promise<Array<{ id: string; start_time: string; recording_duration: number }>> {
  console.log(`[Recovery Analysis] Looking for sessions with distinct_id: "${distinctId}"`);
  console.log(`[Recovery Analysis] Host: ${host}, Project ID: ${projectId}`);

  // Step 1: Get the person UUID from distinct_id
  const personUUID = await getPersonUUID(distinctId, headers, host, projectId);

  if (personUUID) {
    // Step 2: Use person_uuid to filter session recordings
    try {
      const url = `${host}/api/projects/${projectId}/session_recordings/?person_uuid=${encodeURIComponent(personUUID)}&limit=${limit}`;
      console.log(`[Recovery Analysis] Fetching sessions with person_uuid: ${url}`);
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(`[Recovery Analysis] Sessions by person_uuid status: ${res.status}`);

      if (res.ok) {
        const data = JSON.parse(text);
        if (data.results && data.results.length > 0) {
          console.log(`[Recovery Analysis] Found ${data.results.length} sessions via person_uuid`);
          return data.results;
        }
        console.log(`[Recovery Analysis] No sessions in response`);
      } else {
        console.log(`[Recovery Analysis] Sessions response: ${text.substring(0, 300)}`);
      }
    } catch (err) {
      console.log(`[Recovery Analysis] Sessions by person_uuid failed: ${err}`);
    }

    // Also try environments endpoint with person_uuid
    try {
      const url = `${host}/api/environments/${projectId}/session_recordings/?person_uuid=${encodeURIComponent(personUUID)}&limit=${limit}`;
      console.log(`[Recovery Analysis] Trying environments with person_uuid: ${url}`);
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(`[Recovery Analysis] Environments person_uuid status: ${res.status}`);

      if (res.ok) {
        const data = JSON.parse(text);
        if (data.results && data.results.length > 0) {
          console.log(`[Recovery Analysis] Found ${data.results.length} sessions via environments person_uuid`);
          return data.results;
        }
      } else {
        console.log(`[Recovery Analysis] Environments response: ${text.substring(0, 300)}`);
      }
    } catch (err) {
      console.log(`[Recovery Analysis] Environments person_uuid failed: ${err}`);
    }
  }

  // Fallback: Fetch all recent sessions and filter by distinct_id
  console.log(`[Recovery Analysis] Fallback: Fetching all sessions and filtering by distinct_id`);
  try {
    const url = `${host}/api/projects/${projectId}/session_recordings/?limit=50`;
    console.log(`[Recovery Analysis] Fetching all recent sessions: ${url}`);
    const res = await fetch(url, { headers });

    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        // Filter by distinct_id
        const filtered = data.results.filter(
          (s: { distinct_id?: string }) => s.distinct_id === distinctId
        );
        if (filtered.length > 0) {
          console.log(`[Recovery Analysis] Found ${filtered.length} sessions by filtering (out of ${data.results.length})`);
          return filtered.slice(0, limit);
        }
        console.log(`[Recovery Analysis] No sessions match distinct_id in ${data.results.length} total sessions`);
        // Log some distinct_ids to help debug
        const sampleIds = data.results.slice(0, 5).map((s: { distinct_id?: string }) => s.distinct_id);
        console.log(`[Recovery Analysis] Sample distinct_ids in results: ${JSON.stringify(sampleIds)}`);
      }
    }
  } catch (err) {
    console.log(`[Recovery Analysis] Fallback fetch failed: ${err}`);
  }

  console.log(`[Recovery Analysis] No sessions found for distinct_id: ${distinctId}`);
  return [];
}

// Build session context string from parsed semantic session
function buildSessionContext(session: SemanticSession, sessionIndex: number): string {
  const s = session.summary;
  const signals = session.behavioralSignals;

  const lines = [
    `=== SESSION ${sessionIndex + 1} ===`,
    `Page: ${session.pageUrl || 'Unknown'}`,
    session.pageTitle ? `Title: "${session.pageTitle}"` : null,
    `Duration: ${session.totalDuration}`,
    `Events: ${session.eventCount}`,
    '',
    'METRICS:',
    `- Clicks: ${s.totalClicks} (rage: ${s.rageClicks}, dead: ${s.deadClicks})`,
    `- Inputs: ${s.totalInputs} (abandoned: ${s.abandonedInputs})`,
    `- Scrolls: ${s.totalScrolls} (rapid: ${s.rapidScrolls})`,
    `- Errors: Console=${s.consoleErrors}, Network=${s.networkErrors}`,
    `- Form Submissions: ${s.formSubmissions}`,
    '',
    'SIGNALS:',
    signals.isFrustrated ? '- FRUSTRATED (rage clicks, dead clicks, or errors)' : null,
    signals.isConfused ? '- CONFUSED (hesitations, back-and-forth)' : null,
    signals.isExploring ? '- EXPLORING (lots of scrolling, few clicks)' : null,
    signals.isEngaged ? '- ENGAGED (good interaction patterns)' : null,
    signals.completedGoal ? '- COMPLETED GOAL (form submission)' : null,
  ].filter(Boolean);

  return lines.join('\n');
}

// Build session log string from semantic logs (limited for efficiency)
function buildSessionLog(session: SemanticSession, maxLogs: number = 50): string {
  // Prioritize logs with flags (frustration indicators)
  const flaggedLogs = session.logs.filter(log => log.flags.length > 0);
  const regularLogs = session.logs.filter(log => log.flags.length === 0);

  // Take all flagged logs + fill remaining with regular logs
  const selectedLogs = [
    ...flaggedLogs,
    ...regularLogs.slice(0, Math.max(0, maxLogs - flaggedLogs.length))
  ].sort((a, b) => (a.rawTimestamp || 0) - (b.rawTimestamp || 0));

  return selectedLogs
    .map(log => {
      const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
      return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
    })
    .join('\n');
}

// Run AI analysis on combined session data
async function runAIAnalysis(
  sessions: SemanticSession[],
  totalEvents: number
): Promise<z.infer<typeof RecoveryAnalysisSchema>> {
  // Build combined context
  const sessionContexts = sessions.map((s, i) => buildSessionContext(s, i)).join('\n\n');

  // Build combined logs (limit total to avoid token overflow)
  const logsPerSession = Math.floor(100 / sessions.length);
  const sessionLogs = sessions.map((s, i) =>
    `--- Session ${i + 1} Activity ---\n${buildSessionLog(s, logsPerSession)}`
  ).join('\n\n');

  // Aggregate behavioral signals
  const aggregatedSignals = {
    totalRageClicks: sessions.reduce((sum, s) => sum + s.summary.rageClicks, 0),
    totalDeadClicks: sessions.reduce((sum, s) => sum + s.summary.deadClicks, 0),
    totalAbandonedInputs: sessions.reduce((sum, s) => sum + s.summary.abandonedInputs, 0),
    totalConsoleErrors: sessions.reduce((sum, s) => sum + s.summary.consoleErrors, 0),
    totalNetworkErrors: sessions.reduce((sum, s) => sum + s.summary.networkErrors, 0),
    anyFrustrated: sessions.some(s => s.behavioralSignals.isFrustrated),
    anyConfused: sessions.some(s => s.behavioralSignals.isConfused),
    anyCompletedGoal: sessions.some(s => s.behavioralSignals.completedGoal),
  };

  const systemPrompt = `You are a UX analyst helping a customer success team understand why a user churned.
Analyze the session recordings to identify:
1. What frustrated the user
2. Where they got stuck or confused
3. Why they likely stopped using the product

IMPORTANT: Only reference events that actually appear in the logs. Be specific and actionable.

AGGREGATED METRICS ACROSS ${sessions.length} SESSIONS:
- Total Events: ${totalEvents}
- Rage Clicks: ${aggregatedSignals.totalRageClicks}
- Dead/Unresponsive Clicks: ${aggregatedSignals.totalDeadClicks}
- Abandoned Inputs: ${aggregatedSignals.totalAbandonedInputs}
- Console Errors: ${aggregatedSignals.totalConsoleErrors}
- Network Errors: ${aggregatedSignals.totalNetworkErrors}
- Any session showed frustration: ${aggregatedSignals.anyFrustrated}
- Any session showed confusion: ${aggregatedSignals.anyConfused}
- Any session completed a goal: ${aggregatedSignals.anyCompletedGoal}`;

  const userPrompt = `Analyze these ${sessions.length} session(s) from a churned user:

SESSION CONTEXTS:
${sessionContexts}

SESSION ACTIVITY LOGS:
${sessionLogs}

Provide insights for the recovery team to use when reaching out to win this user back.`;

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'), // Use faster model for efficiency
    schema: RecoveryAnalysisSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  return object;
}

// POST - Analyze PostHog sessions for a churned user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Get the churned user with project
    const churnedUser = await prisma.churnedUser.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    if (!churnedUser) {
      return NextResponse.json({ error: 'Churned user not found' }, { status: 404 });
    }

    if (!churnedUser.posthogDistinctId) {
      return NextResponse.json({
        error: 'No PostHog distinct ID for this user. Cannot analyze sessions.'
      }, { status: 400 });
    }

    // Update status to analyzing
    await prisma.churnedUser.update({
      where: { id: userId },
      data: { analysisStatus: 'analyzing' },
    });

    try {
      const project = churnedUser.project;
      const apiKey = project.posthogKey;
      const host = project.posthogHost || 'https://us.posthog.com';
      const projectId = project.posthogProjId;

      if (!apiKey || !projectId) {
        throw new Error('PostHog credentials not configured for project');
      }

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      // Get user's sessions
      console.log(`[Recovery Analysis] Fetching sessions for user ${churnedUser.posthogDistinctId}`);
      const sessions = await getUserSessions(
        churnedUser.posthogDistinctId,
        headers,
        host,
        projectId,
        5 // Analyze up to 5 most recent sessions
      );

      if (sessions.length === 0) {
        await prisma.churnedUser.update({
          where: { id: userId },
          data: {
            analysisStatus: 'completed',
            sessionCount: 0,
            analysisResult: JSON.stringify({
              summary: 'No session recordings found for this user in PostHog.',
              frustrationPoints: [],
              behaviorPatterns: [],
              dropOffPoints: [],
            }),
            analyzedAt: new Date(),
          },
        });

        return NextResponse.json({
          message: 'No sessions found for this user',
          sessionCount: 0,
        });
      }

      console.log(`[Recovery Analysis] Found ${sessions.length} sessions, fetching RRWeb events...`);

      // Parse all sessions with the semantic parser
      const parsedSessions: SemanticSession[] = [];
      let totalEvents = 0;

      for (const session of sessions) {
        try {
          console.log(`[Recovery Analysis] Fetching events for session ${session.id}`);
          const events = await fetchSessionEvents(session.id, headers, host, projectId);

          if (events.length === 0) {
            console.log(`[Recovery Analysis] No events for session ${session.id}`);
            continue;
          }

          // Use the same semantic parser as Session Insights
          const parsed = parseRRWebSession(events as any);
          parsedSessions.push(parsed);
          totalEvents += events.length;

          console.log(`[Recovery Analysis] Parsed session ${session.id}: ${parsed.logs.length} semantic logs, rage=${parsed.summary.rageClicks}, dead=${parsed.summary.deadClicks}`);
        } catch (err) {
          console.error(`[Recovery Analysis] Error parsing session ${session.id}:`, err);
        }
      }

      if (parsedSessions.length === 0) {
        await prisma.churnedUser.update({
          where: { id: userId },
          data: {
            analysisStatus: 'completed',
            sessionCount: sessions.length,
            analysisResult: JSON.stringify({
              summary: 'Sessions found but no RRWeb events could be parsed.',
              frustrationPoints: [],
              behaviorPatterns: [],
              dropOffPoints: [],
            }),
            analyzedAt: new Date(),
          },
        });

        return NextResponse.json({
          message: 'No parseable session data',
          sessionCount: sessions.length,
        });
      }

      // Run AI analysis on all sessions (single API call)
      console.log(`[Recovery Analysis] Running AI analysis on ${parsedSessions.length} parsed sessions...`);
      const aiAnalysis = await runAIAnalysis(parsedSessions, totalEvents);

      const analysisResult = {
        summary: aiAnalysis.summary,
        frustrationPoints: aiAnalysis.frustrationPoints,
        behaviorPatterns: aiAnalysis.behaviorPatterns,
        dropOffPoints: aiAnalysis.dropOffPoints,
        recoveryInsight: aiAnalysis.recoveryInsight,
        sessionCount: sessions.length,
        analyzedSessions: parsedSessions.length,
        totalEvents,
      };

      // Save analysis result
      await prisma.churnedUser.update({
        where: { id: userId },
        data: {
          analysisStatus: 'completed',
          sessionCount: sessions.length,
          analysisResult: JSON.stringify(analysisResult),
          analyzedAt: new Date(),
        },
      });

      console.log(`[Recovery Analysis] Completed analysis for user ${userId}`);
      return NextResponse.json({
        message: 'Analysis completed',
        analysis: analysisResult,
      });
    } catch (analysisError) {
      console.error('Analysis error:', analysisError);

      await prisma.churnedUser.update({
        where: { id: userId },
        data: { analysisStatus: 'failed' },
      });

      throw analysisError;
    }
  } catch (error) {
    console.error('Failed to analyze churned user sessions:', error);
    return NextResponse.json({ error: 'Failed to analyze sessions' }, { status: 500 });
  }
}
