import { NextRequest, NextResponse } from 'next/server';
import { createPostHogClient, processFunnelData, type PostHogConfig } from '@/lib/posthog';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, getProjectWithAccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
                const dateFrom = searchParams.get('date_from') || undefined;
                const insights = await client.getInsights(dateFrom);
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
    // Verify user is authenticated
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;
    let { apiKey, projectId, host } = body;

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
                } catch {
                    console.log('Insight access unavailable');
                }

                try {
                    // Simple HogQL query to test Query API
                    await client.executeHogQL('SELECT 1');
                    results.query = true;
                } catch {
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

            case 'cohort-events': {
                const { funnelId, stepIndex, cohortType } = body;
                console.log('[API] Fetching cohort events for:', { funnelId, stepIndex, cohortType });

                if (!funnelId || stepIndex === undefined || !cohortType) {
                    return NextResponse.json({ error: 'Funnel ID, Step Index, and Cohort Type required' }, { status: 400 });
                }

                // Handle Demo or Custom funnels
                if (String(funnelId).startsWith('demo-') || String(funnelId).startsWith('custom-')) {
                    console.log('[API] Custom/Demo funnel detected, returning mock events');
                    return NextResponse.json({
                        topEvents: [
                            { name: 'button_click', count: 45, percentage: 32 },
                            { name: 'page_scroll', count: 38, percentage: 27 },
                            { name: 'form_focus', count: 25, percentage: 18 },
                            { name: 'link_hover', count: 18, percentage: 13 },
                            { name: 'menu_open', count: 14, percentage: 10 },
                        ]
                    });
                }

                const numericalId = Number(funnelId);
                if (isNaN(numericalId)) {
                    return NextResponse.json({ error: 'Invalid Funnel ID' }, { status: 400 });
                }

                const topEvents = await client.getCohortTopEvents(
                    numericalId,
                    Number(stepIndex),
                    cohortType as 'converted' | 'dropped'
                );
                return NextResponse.json({ topEvents });
            }

            case 'get-funnel-user-ids': {
                const { funnelId, stepIndex, cohortType } = body;
                console.log('[API] Fetching user IDs for:', { funnelId, stepIndex, cohortType });

                if (!funnelId || stepIndex === undefined || !cohortType) {
                    return NextResponse.json({ error: 'Funnel ID, Step Index, and Cohort Type required' }, { status: 400 });
                }

                // Handle Demo or Custom funnels
                if (String(funnelId).startsWith('demo-') || String(funnelId).startsWith('custom-')) {
                    console.log('[API] Custom/Demo funnel detected, returning mock user IDs');
                    return NextResponse.json({
                        userIds: [
                            'user-demo-001',
                            'user-demo-002',
                            'user-demo-003',
                            'user-demo-004',
                            'user-demo-005',
                        ]
                    });
                }

                const numericalId = Number(funnelId);
                if (isNaN(numericalId)) {
                    return NextResponse.json({ error: 'Invalid Funnel ID' }, { status: 400 });
                }

                const userIds = await client.getCohortUserIds(
                    numericalId,
                    Number(stepIndex),
                    cohortType as 'converted' | 'dropped'
                );

                return NextResponse.json({ userIds });
            }

            case 'funnel-correlation': {
                const { funnelId, stepIndex } = body;
                console.log('[API] Fetching funnel correlation for:', { funnelId, stepIndex });

                if (!funnelId || stepIndex === undefined) {
                    return NextResponse.json({ error: 'Funnel ID and Step Index required' }, { status: 400 });
                }

                // Handle Demo or Custom funnels
                if (String(funnelId).startsWith('demo-') || String(funnelId).startsWith('custom-')) {
                    console.log('[API] Custom/Demo funnel detected, returning mock correlation data');
                    return NextResponse.json({
                        correlations: [
                            // Events that correlate with DROP-OFF (odds_ratio > 1)
                            { event: 'error_displayed', success_count: 12, failure_count: 85, odds_ratio: 7.08, correlation_type: 'failure', success_percentage: 12, failure_percentage: 88 },
                            { event: 'form_validation_error', success_count: 8, failure_count: 62, odds_ratio: 7.75, correlation_type: 'failure', success_percentage: 11, failure_percentage: 89 },
                            { event: 'page_scroll_50', success_count: 45, failure_count: 120, odds_ratio: 2.67, correlation_type: 'failure', success_percentage: 27, failure_percentage: 73 },
                            { event: 'help_clicked', success_count: 25, failure_count: 48, odds_ratio: 1.92, correlation_type: 'failure', success_percentage: 34, failure_percentage: 66 },
                            { event: 'session_timeout', success_count: 5, failure_count: 35, odds_ratio: 7.0, correlation_type: 'failure', success_percentage: 13, failure_percentage: 87 },
                            // Events that correlate with SUCCESS (odds_ratio <= 1)
                            { event: 'video_watched', success_count: 78, failure_count: 22, odds_ratio: 0.28, correlation_type: 'success', success_percentage: 78, failure_percentage: 22 },
                            { event: 'page_viewed', success_count: 88, failure_count: 12, odds_ratio: 0.14, correlation_type: 'success', success_percentage: 88, failure_percentage: 12 },
                            { event: '$web_vitals', success_count: 74, failure_count: 26, odds_ratio: 0.35, correlation_type: 'success', success_percentage: 74, failure_percentage: 26 },
                            { event: 'feature_tour_completed', success_count: 65, failure_count: 15, odds_ratio: 0.23, correlation_type: 'success', success_percentage: 81, failure_percentage: 19 },
                            { event: 'onboarding_step_completed', success_count: 82, failure_count: 18, odds_ratio: 0.22, correlation_type: 'success', success_percentage: 82, failure_percentage: 18 },
                        ]
                    });
                }

                const numericalId = Number(funnelId);
                if (isNaN(numericalId)) {
                    return NextResponse.json({ error: 'Invalid Funnel ID' }, { status: 400 });
                }

                try {
                    const correlations = await client.getFunnelCorrelation(
                        numericalId,
                        Number(stepIndex)
                    );
                    return NextResponse.json({ correlations });
                } catch (error) {
                    console.error('[API] Funnel correlation error:', error);
                    return NextResponse.json({ 
                        correlations: [],
                        error: 'Correlation analysis requires more data or is not available for this funnel'
                    });
                }
            }

            case 'create-funnel-cohort': {
                const { funnelId, stepIndex, cohortType, cohortName, localProjectId, correlations, analysis, stepName, conversionRate, dropOffRate } = body;
                console.log('[API] Creating cohort from funnel:', { funnelId, stepIndex, cohortType, cohortName, localProjectId, correlationsCount: correlations?.length || 0, hasAnalysis: !!analysis });

                if (!funnelId || stepIndex === undefined || !cohortType) {
                    return NextResponse.json({ error: 'Funnel ID, Step Index, and Cohort Type required' }, { status: 400 });
                }

                // Verify project access if localProjectId is provided
                if (localProjectId) {
                    const projectAccess = await getProjectWithAccess(localProjectId);
                    if (!projectAccess) {
                        return NextResponse.json({ error: 'Unauthorized - no access to project' }, { status: 401 });
                    }
                }

                // Handle Demo or Custom funnels
                if (String(funnelId).startsWith('demo-') || String(funnelId).startsWith('custom-')) {
                    return NextResponse.json({
                        success: true,
                        cohortId: 'demo-cohort-123',
                        message: 'Demo cohort created (mock)'
                    });
                }

                const numericalId = Number(funnelId);
                if (isNaN(numericalId)) {
                    return NextResponse.json({ error: 'Invalid Funnel ID' }, { status: 400 });
                }

                // Get user IDs from the funnel step
                const userIds = await client.getCohortUserIds(
                    numericalId,
                    Number(stepIndex),
                    cohortType as 'converted' | 'dropped'
                );

                if (userIds.length === 0) {
                    return NextResponse.json({ error: 'No users found in this cohort' }, { status: 400 });
                }

                // Create the cohort with these users in PostHog
                const name = cohortName || `Funnel ${cohortType} - Step ${stepIndex + 1} - ${new Date().toLocaleDateString()}`;
                const posthogCohort = await client.createCohort(name, userIds);

                // Also save to local database so it appears in Smart Cohorts tab
                // Use localProjectId if provided, otherwise fall back to looking up by PostHog project ID
                let localCohort = null;
                try {
                    let dbProjectId = localProjectId;

                    // If no localProjectId provided, look up by PostHog project ID
                    if (!dbProjectId) {
                        const project = await prisma.project.findFirst({
                            where: { posthogProjId: projectId }
                        });
                        dbProjectId = project?.id;
                        if (!dbProjectId) {
                            console.log('[API] No local project found for PostHog project:', projectId);
                        }
                    }

                    if (dbProjectId) {
                        localCohort = await prisma.cohort.create({
                            data: {
                                projectId: dbProjectId,
                                name,
                                description: `${cohortType === 'converted' ? 'Users who converted' : 'Users who dropped off'} at funnel step ${stepIndex + 1}${stepName ? ` (${stepName})` : ''}. Created from PostHog funnel analysis.`,
                                size: userIds.length,
                                criteria: JSON.stringify({
                                    source: 'funnel',
                                    funnelId: numericalId,
                                    stepIndex,
                                    stepName,
                                    cohortType,
                                    posthogCohortId: posthogCohort.id,
                                    userIds,
                                    conversionRate,
                                    dropOffRate,
                                    // Store correlation data with the cohort
                                    correlations: correlations || [],
                                    // Store deep analysis data with the cohort
                                    analysis: analysis || null,
                                }),
                                status: 'active',
                            },
                        });
                        console.log('[API] Created local cohort:', localCohort.id, 'for project:', dbProjectId, 'with', correlations?.length || 0, 'correlations and analysis:', !!analysis);
                    }
                } catch (dbError) {
                    console.error('[API] Failed to save cohort to local database:', dbError);
                    // Continue anyway - PostHog cohort was created successfully
                }

                return NextResponse.json({
                    success: true,
                    cohortId: posthogCohort.id,
                    localCohortId: localCohort?.id,
                    userCount: userIds.length,
                    message: `Created cohort "${name}" with ${userIds.length} users`
                });
            }

            case 'deep-analysis': {
                const { userIds: analysisUserIds } = body;
                console.log('[API] Running deep analysis for', analysisUserIds?.length || 0, 'users');

                if (!analysisUserIds || analysisUserIds.length === 0) {
                    return NextResponse.json({ error: 'User IDs required' }, { status: 400 });
                }

                // Limit to first 20 users for performance
                const limitedUserIds = analysisUserIds.slice(0, 20);
                const userIdList = limitedUserIds.map((id: string) => `'${id.replace(/'/g, "''")}'`).join(', ');

                // Run all three queries in parallel for speed
                const [lastEventsResult, errorsResult, deviceResult] = await Promise.all([
                    // 1. Last events before drop-off (most important)
                    client.executeHogQL(`
                        SELECT 
                            distinct_id,
                            event,
                            timestamp,
                            properties.$current_url as current_url,
                            properties.$pathname as pathname
                        FROM events
                        WHERE distinct_id IN (${userIdList})
                        AND timestamp > now() - INTERVAL 7 DAY
                        AND event NOT IN ('$feature_flag_called', '$set')
                        ORDER BY distinct_id, timestamp DESC
                        LIMIT 100
                    `).catch(() => ({ results: [] })),

                    // 2. Errors and frustration signals
                    client.executeHogQL(`
                        SELECT 
                            distinct_id,
                            event,
                            properties.$exception_message as exception_message,
                            properties.$el_text as element_text,
                            timestamp
                        FROM events
                        WHERE distinct_id IN (${userIdList})
                        AND event IN ('$exception', '$rageclick', '$dead_click', '$error')
                        AND timestamp > now() - INTERVAL 7 DAY
                        ORDER BY timestamp DESC
                        LIMIT 50
                    `).catch(() => ({ results: [] })),

                    // 3. Device/browser patterns
                    client.executeHogQL(`
                        SELECT 
                            properties.$browser as browser,
                            properties.$device_type as device_type,
                            properties.$os as os,
                            count(distinct distinct_id) as user_count
                        FROM events
                        WHERE distinct_id IN (${userIdList})
                        AND timestamp > now() - INTERVAL 7 DAY
                        GROUP BY browser, device_type, os
                        ORDER BY user_count DESC
                        LIMIT 10
                    `).catch(() => ({ results: [] }))
                ]);

                // Process last events - group by user and get their journey
                const userJourneys: Record<string, Array<{ event: string; timestamp: string; url?: string; pathname?: string }>> = {};
                for (const row of (lastEventsResult.results || [])) {
                    const userId = row[0];
                    if (!userJourneys[userId]) userJourneys[userId] = [];
                    if (userJourneys[userId].length < 10) { // Keep last 10 events per user
                        userJourneys[userId].push({
                            event: row[1],
                            timestamp: row[2],
                            url: row[3],
                            pathname: row[4]
                        });
                    }
                }

                // Find common last events
                const lastEventCounts: Record<string, number> = {};
                const lastPageCounts: Record<string, number> = {};
                for (const userId of Object.keys(userJourneys)) {
                    const journey = userJourneys[userId];
                    if (journey.length > 0) {
                        const lastEvent = journey[0].event;
                        lastEventCounts[lastEvent] = (lastEventCounts[lastEvent] || 0) + 1;
                        const lastPage = journey[0].pathname || journey[0].url;
                        if (lastPage) {
                            lastPageCounts[lastPage] = (lastPageCounts[lastPage] || 0) + 1;
                        }
                    }
                }

                // Process errors
                const errors = (errorsResult.results || []).map((row: any[]) => ({
                    userId: row[0],
                    event: row[1],
                    message: row[2],
                    elementText: row[3],
                    timestamp: row[4]
                }));

                // Process device distribution
                const devices = (deviceResult.results || []).map((row: any[]) => ({
                    browser: row[0] || 'Unknown',
                    deviceType: row[1] || 'Unknown',
                    os: row[2] || 'Unknown',
                    userCount: row[3] || 0
                }));

                return NextResponse.json({
                    lastEvents: Object.entries(lastEventCounts)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 10)
                        .map(([event, count]) => ({ event, count })),
                    lastPages: Object.entries(lastPageCounts)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 10)
                        .map(([page, count]) => ({ page, count })),
                    userJourneys: Object.fromEntries(
                        Object.entries(userJourneys).slice(0, 5) // Sample of 5 user journeys
                    ),
                    errors,
                    devices,
                    analyzedUsers: limitedUserIds.length
                });
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
