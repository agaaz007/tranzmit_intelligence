import { NextRequest, NextResponse } from 'next/server';
import zlib from 'zlib';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.posthog.com';
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '291254';
// Default API key for development - should be set via env var in production
const API_KEY = process.env.POSTHOG_API_KEY || 'phx_4KTJ8qIDpnr2U9NUwLAvbol6WeDaXaxKE0Og4DgzBs7gIqU';

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

// Decompress event data (handles multiple PostHog compression formats)
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
        // Check if event has cv (compression version) field - indicates compressed data
        if (evt.cv && typeof evt.data === 'string') {
            try {
                const buf = Buffer.from(evt.data, 'base64');
                const parsedData = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
                return {
                    type: evt.type as number,
                    timestamp: evt.timestamp as number,
                    data: parsedData,
                };
            } catch {
                try {
                    const buf = Buffer.from(evt.data as string, 'binary');
                    const parsedData = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
                    return {
                        type: evt.type as number,
                        timestamp: evt.timestamp as number,
                        data: parsedData,
                    };
                } catch {
                    return evt as unknown as RRWebEvent;
                }
            }
        }
        return evt as unknown as RRWebEvent;
    }

    return null;
}

// Parse encoded snapshots - preserves ingestion order, carries forward windowId
function parseEncodedSnapshots(items: unknown[]): RRWebEvent[] {
    const parsedLines: RRWebEvent[] = [];
    let lastWindowId: string | null = null;

    for (const item of items) {
        if (!item) continue;

        try {
            const snapshotLine = typeof item === 'string' ? JSON.parse(item) : item;
            let resolvedWindowId: string | null = null;
            let eventData: unknown = null;

            // Handle array format [windowId, eventObject]
            if (Array.isArray(snapshotLine)) {
                resolvedWindowId = snapshotLine[0] as string;
                eventData = snapshotLine[1];
            } else if (typeof snapshotLine === 'object' && snapshotLine !== null) {
                const line = snapshotLine as Record<string, unknown>;
                if (line.type !== undefined) {
                    // Already a valid rrweb event
                    eventData = snapshotLine;
                    resolvedWindowId = (line.windowId as string) || null;
                } else if (line.data) {
                    // Wrapped format { windowId, data }
                    resolvedWindowId = (line.window_id as string) || (line.windowId as string) || null;
                    eventData = line.data;
                }
            }

            if (!eventData) continue;

            // Carry forward last known windowId if none resolved
            if (resolvedWindowId) {
                lastWindowId = resolvedWindowId;
            } else if (lastWindowId) {
                resolvedWindowId = lastWindowId;
            } else {
                // No windowId available - use a default
                resolvedWindowId = 'default';
            }

            // Handle batched events - preserve order within batch
            const events = Array.isArray(eventData) ? eventData : [eventData];

            // Process events in order, preserving batch boundaries
            for (const evt of events) {
                const decompressed = decompressEvent(evt);
                if (decompressed && decompressed.type !== undefined) {
                    parsedLines.push({
                        ...decompressed,
                        windowId: resolvedWindowId,
                    });
                }
            }
        } catch {
            continue;
        }
    }

    return parsedLines;
}

// GET - List recent session recordings
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    // Get credentials from headers first, then fall back to env/defaults
    const apiKey = request.headers.get('x-posthog-key') || API_KEY;
    const projectId = request.headers.get('x-posthog-project') || PROJECT_ID;
    const host = request.headers.get('x-posthog-host') || POSTHOG_HOST;

    if (!apiKey) {
        return NextResponse.json(
            { error: 'PostHog API key is required' },
            { status: 400 }
        );
    }

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    try {
        // Fetch recent session recordings (sessions are returned in descending order by default)
        const url = `${host}/api/environments/${projectId}/session_recordings?limit=${limit}`;
        console.log('[PostHog Sessions] Fetching:', url);

        const res = await fetch(url, { headers });

        if (!res.ok) {
            const text = await res.text();
            console.error('[PostHog Sessions] Error:', res.status, text);
            return NextResponse.json(
                { error: `Failed to fetch sessions: ${res.status}` },
                { status: res.status }
            );
        }

        const data = await res.json();
        const sessions: PostHogSession[] = data.results || [];

        return NextResponse.json({
            sessions: sessions.map(s => ({
                id: s.id,
                distinctId: s.distinct_id,
                startTime: s.start_time,
                endTime: s.end_time,
                duration: s.recording_duration,
                clickCount: s.click_count,
                keypressCount: s.keypress_count,
                activeSeconds: s.active_seconds,
            })),
            count: sessions.length,
        });
    } catch (error) {
        console.error('[PostHog Sessions] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch sessions' },
            { status: 500 }
        );
    }
}

// POST - Fetch rrweb data for a specific session
export async function POST(request: NextRequest) {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
        return NextResponse.json(
            { error: 'Session ID is required' },
            { status: 400 }
        );
    }

    // Get credentials from headers first, then fall back to env/defaults
    const apiKey = request.headers.get('x-posthog-key') || API_KEY;
    const projectId = request.headers.get('x-posthog-project') || PROJECT_ID;
    const host = request.headers.get('x-posthog-host') || POSTHOG_HOST;

    if (!apiKey) {
        return NextResponse.json(
            { error: 'PostHog API key is required' },
            { status: 400 }
        );
    }

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    try {
        // Step 1: Get snapshot sources (blob keys)
        const sourcesUrl = `${host}/api/environments/${projectId}/session_recordings/${sessionId}/snapshots?blob_v2=true`;
        console.log('[PostHog Sessions] Fetching sources:', sourcesUrl);

        const sourcesRes = await fetch(sourcesUrl, { headers });

        if (!sourcesRes.ok) {
            const text = await sourcesRes.text();
            console.error('[PostHog Sessions] Sources error:', sourcesRes.status, text);
            return NextResponse.json(
                { error: `Failed to fetch session sources: ${sourcesRes.status}` },
                { status: sourcesRes.status }
            );
        }

        const sourcesData = await sourcesRes.json();
        const sources = sourcesData.sources || [];

        if (sources.length === 0) {
            return NextResponse.json(
                { error: 'No snapshot data found for this session' },
                { status: 404 }
            );
        }

        console.log(`[PostHog Sessions] Found ${sources.length} blob(s)`);

        // Step 2: Fetch each blob individually
        const allSnapshots: unknown[] = [];
        const blobKeys = sources.map((s: { blob_key: string }) => s.blob_key);

        for (let i = 0; i < blobKeys.length; i++) {
            const blobKey = blobKeys[i];
            const blobUrl = `${host}/api/environments/${projectId}/session_recordings/${sessionId}/snapshots?source=blob_v2&start_blob_key=${blobKey}&end_blob_key=${blobKey}`;

            const blobRes = await fetch(blobUrl, { headers });

            if (!blobRes.ok) {
                console.error(`[PostHog Sessions] Blob ${blobKey} error:`, blobRes.status);
                continue;
            }

            const text = await blobRes.text();
            const lines = text.trim().split('\n').filter(line => line.trim());
            const snapshots = lines.map(line => JSON.parse(line));
            allSnapshots.push(...snapshots);

            console.log(`[PostHog Sessions] Blob ${i + 1}/${blobKeys.length}: ${snapshots.length} snapshots`);
        }

        if (allSnapshots.length === 0) {
            return NextResponse.json(
                { error: 'No snapshot data retrieved' },
                { status: 404 }
            );
        }

        // Step 3: Parse and process snapshots
        console.log(`[PostHog Sessions] Processing ${allSnapshots.length} raw snapshots`);
        const processedEvents = parseEncodedSnapshots(allSnapshots);
        console.log(`[PostHog Sessions] Parsed ${processedEvents.length} events`);

        // Step 4: Save files locally for inspection
        const outputDir = join(process.cwd(), 'posthog-sessions');
        const shortId = sessionId.substring(0, 8);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        try {
            await mkdir(outputDir, { recursive: true });

            // Save raw snapshots (as received from PostHog, before parsing)
            await writeFile(
                join(outputDir, `${shortId}_${timestamp}_raw.json`),
                JSON.stringify(allSnapshots, null, 2),
                'utf-8'
            );

            // Save processed events (after decompression and parsing)
            await writeFile(
                join(outputDir, `${shortId}_${timestamp}_processed.json`),
                JSON.stringify(processedEvents, null, 2),
                'utf-8'
            );

            // Save metadata about the session
            await writeFile(
                join(outputDir, `${shortId}_${timestamp}_meta.json`),
                JSON.stringify({
                    sessionId,
                    fetchedAt: new Date().toISOString(),
                    rawSnapshotCount: allSnapshots.length,
                    processedEventCount: processedEvents.length,
                    blobKeys,
                    sources: sourcesData,
                }, null, 2),
                'utf-8'
            );

            console.log(`[PostHog Sessions] Saved files to ${outputDir}/${shortId}_${timestamp}_*.json`);
        } catch (saveError) {
            console.error('[PostHog Sessions] Failed to save files:', saveError);
            // Continue even if save fails
        }

        return NextResponse.json({
            sessionId,
            events: processedEvents,
            eventCount: processedEvents.length,
        });
    } catch (error) {
        console.error('[PostHog Sessions] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch session data' },
            { status: 500 }
        );
    }
}
