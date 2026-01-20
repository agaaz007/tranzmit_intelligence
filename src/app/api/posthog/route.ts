import { NextRequest, NextResponse } from 'next/server';
import { createPostHogClient, processFunnelData, type PostHogConfig } from '@/lib/posthog';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Get config from headers or env
    const apiKey = request.headers.get('x-posthog-key') || process.env.POSTHOG_API_KEY;
    const projectId = request.headers.get('x-posthog-project') || process.env.POSTHOG_PROJECT_ID;
    const host = request.headers.get('x-posthog-host') || process.env.POSTHOG_HOST;

    if (!apiKey || !projectId) {
        return NextResponse.json(
            { error: 'PostHog API key and project ID are required' },
            { status: 400 }
        );
    }

    const config: PostHogConfig = { apiKey, projectId, host };
    const client = createPostHogClient(config);

    try {
        switch (action) {
            case 'funnels': {
                const insights = await client.getInsights();
                const funnels = insights.map(insight => processFunnelData(insight));
                return NextResponse.json({ funnels });
            }

            case 'funnel': {
                const insightId = searchParams.get('id');
                if (!insightId) {
                    return NextResponse.json({ error: 'Insight ID required' }, { status: 400 });
                }
                const insight = await client.getFunnelWithResults(parseInt(insightId));
                const funnel = processFunnelData(insight);
                return NextResponse.json({ funnel });
            }

            case 'events': {
                const events = await client.getTopEvents();
                return NextResponse.json({ events });
            }



            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        console.error('PostHog API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'PostHog API request failed' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    let { action, apiKey, projectId, host } = body;

    // Fallback to headers
    if (!apiKey) apiKey = request.headers.get('x-posthog-key') || process.env.POSTHOG_API_KEY;
    if (!projectId) projectId = request.headers.get('x-posthog-project') || process.env.POSTHOG_PROJECT_ID;
    if (!host) host = request.headers.get('x-posthog-host') || process.env.POSTHOG_HOST;

    if (!apiKey || !projectId) {
        return NextResponse.json(
            { error: 'PostHog API key and project ID are required' },
            { status: 400 }
        );
    }

    const config: PostHogConfig = { apiKey, projectId, host };
    const client = createPostHogClient(config);

    try {
        switch (action) {
            case 'connect': {
                // Test multiple endpoints to see what scopes are available
                const results = {
                    insights: false,
                    query: false,
                    persons: false,
                    funnelsCount: 0
                };

                try {
                    const insights = await client.getInsights();
                    results.insights = true;
                    results.funnelsCount = insights.length;
                } catch (e) {
                    console.log('Insight access unavailable');
                }

                try {
                    // Simple HogQL query to test Query API
                    await client.executeHogQL('SELECT 1');
                    results.query = true;
                } catch (e) {
                    console.log('Query access unavailable');
                }

                if (!results.insights && !results.query) {
                    return NextResponse.json(
                        { error: 'API key needs at least insight:read or query:read permissions' },
                        { status: 403 }
                    );
                }

                return NextResponse.json({
                    success: true,
                    ...results,
                    message: results.insights
                        ? `Connected! Found ${results.funnelsCount} funnels.`
                        : 'Connected via Query API! Visual Funnel Builder enabled.'
                });
            }

            case 'calculate-funnel': {
                const { events } = body;
                if (!events || !Array.isArray(events)) {
                    return NextResponse.json({ error: 'Events array required' }, { status: 400 });
                }
                const result = await client.getFunnelResults(events);
                return NextResponse.json({ result });
            }

            case 'paths': {
                const { startPoint, endPoint, dateFrom } = body;
                const result = await client.getPaths({ startPoint, endPoint, dateFrom });
                return NextResponse.json({ result });
            }

            case 'recordings': {
                const { personId } = body;
                if (!personId) return NextResponse.json({ error: 'Person ID required' }, { status: 400 });
                const recordings = await client.getPersonRecordings(personId);
                return NextResponse.json({ recordings });
            }

            case 'dropped-people': {
                const { funnelId, stepOrder } = body;
                console.log('[API] Fetching dropped people for:', { funnelId, stepOrder });

                if (!funnelId || stepOrder === undefined) {
                    return NextResponse.json({ error: 'Funnel ID and Step Order required' }, { status: 400 });
                }

                // Handle Demo or Custom funnels
                if (String(funnelId).startsWith('demo-') || String(funnelId).startsWith('custom-')) {
                    console.log('[API] Custom/Demo funnel detected, returning empty/mock people');
                    // In a real app, we'd run a FunnelActorsQuery for custom funnels here.
                    // For now, return empty to prevent crash.
                    return NextResponse.json({ people: [] });
                }

                const numericalId = Number(funnelId);
                if (isNaN(numericalId)) {
                    return NextResponse.json({ error: 'Invalid Funnel ID' }, { status: 400 });
                }

                const people = await client.getDroppedPersons(numericalId, Number(stepOrder));
                return NextResponse.json({ people });
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error) {
        console.error('PostHog API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Connection failed' },
            { status: 500 }
        );
    }
}
