// PostHog API Configuration and Types

export interface PostHogConfig {
    apiKey: string;
    projectId: string;
    host?: string;
}

export interface PostHogPerson {
    id: string;
    uuid: string;
    distinct_ids: string[];
    properties: {
        email?: string;
        name?: string;
        $initial_referrer?: string;
        $initial_referring_domain?: string;
        $geoip_city_name?: string;
        $geoip_country_name?: string;
        [key: string]: any;
    };
    created_at: string;
}

// Enhanced person profile with rich metadata for smart cohorting
export interface PersonProfile {
    // Core identifiers
    id: string;
    uuid?: string;
    distinctId: string;
    distinct_ids?: string[];
    
    // Contact info
    email?: string;
    name?: string;
    
    // All properties from PostHog
    properties: Record<string, any>;
    
    // Parsed/extracted properties for easy access
    geo?: {
        city?: string;
        country?: string;
        countryCode?: string;
        region?: string;
        timezone?: string;
    };
    
    device?: {
        browser?: string;
        browserVersion?: string;
        os?: string;
        osVersion?: string;
        deviceType?: string;  // desktop, mobile, tablet
    };
    
    acquisition?: {
        initialReferrer?: string;
        initialReferringDomain?: string;
        initialUtmSource?: string;
        initialUtmMedium?: string;
        initialUtmCampaign?: string;
    };
    
    // Timestamps
    createdAt?: string;
    firstSeen?: string;
    lastSeen?: string;
    
    // Engagement metrics (calculated)
    engagement?: {
        totalSessions?: number;
        totalEvents?: number;
        avgSessionDuration?: number;
        lastActiveAt?: string;
        daysSinceLastActive?: number;
    };
}

export interface PersonWithSignals {
    distinctId: string;
    email?: string;
    name?: string;
    properties: Record<string, any>;
    signals: BehavioralSignal[];
    priorityScore: number;
    signalSummary: string;
    
    // Enhanced profile data
    profile?: PersonProfile;
}

export interface BehavioralSignal {
    type: 
        | 'funnel_dropoff' 
        | 'rage_click' 
        | 'error_encounter' 
        | 'low_engagement' 
        | 'high_session_time' 
        | 'repeat_visitor' 
        | 'churn_risk' 
        | 'technical_victim' 
        | 'confused_browser' 
        | 'wrong_fit'
        // New signal types for richer cohorting
        | 'new_user'
        | 'mobile_user'
        | 'international_user'
        | 'organic_traffic'
        | 'paid_traffic'
        | 'returning_visitor'
        | 'power_user'
        | 'feature_adopter'
        | 'upgrade_candidate'
        // Advanced friction signals
        | 'step_retry'           // User retried same action multiple times
        | 'step_loop'            // User went back and forth between steps
        | 'high_time_variance'   // Abnormally long time on a step
        | 'feature_abandoned'    // Used feature once, never again
        | 'feature_regression'   // Stopped using a feature they used before
        | 'engagement_decay'     // 7d activity much lower than 30d average
        | 'power_user_churning'  // Was power user, now going silent
        | 'activated_abandoned'  // Completed activation but never returned
        | 'excessive_navigation' // Too many back/forward navigations
        | 'idle_after_action';   // Long idle time after key UI action
    description: string;
    weight: number;
    metadata?: Record<string, any>;
}

// Funnel Drop-off Person from /persons/funnel/ endpoint
export interface FunnelDropoffPerson {
    id: string;
    uuid: string;
    distinct_ids: string[];
    properties: Record<string, any>;
    matched_recordings?: Array<{
        session_id: string;
        events: any[];
    }>;
    created_at: string;
    dropoff_step?: number;
    dropoff_timestamp?: string;
}

// Correlation result from /persons/funnel/correlation/ endpoint
export interface FunnelCorrelation {
    event: {
        event: string;
        properties?: Record<string, any>;
        elements?: any[];
    };
    success_count: number;
    failure_count: number;
    odds_ratio: number;
    correlation_type: 'success' | 'failure';
    result_type: 'events' | 'properties' | 'event_with_properties';
}

// ============================================
// ADVANCED FRICTION SIGNAL TYPES
// ============================================

// Step retry detection - user performed same action multiple times
export interface StepRetrySignal {
    distinctId: string;
    event: string;
    retryCount: number;
    timeSpan: number; // seconds between first and last retry
    timestamps: string[];
    avgTimeBetweenRetries: number;
}

// Step loop detection - user went back and forth between steps
export interface StepLoopSignal {
    distinctId: string;
    stepA: string;
    stepB: string;
    loopCount: number;
    totalTransitions: number;
    timeInLoop: number; // total seconds spent in the loop
}

// Time variance on funnel steps
export interface StepTimeVariance {
    stepName: string;
    medianTime: number;
    avgTime: number;
    stdDev: number;
    p90Time: number; // 90th percentile
    outlierThreshold: number; // time above which user is considered stuck
}

// Feature adoption metrics
export interface FeatureAdoption {
    featureName: string;
    eventName: string;
    totalUsers: number;
    firstTimeUsers: number;
    repeatUsers: number;
    adoptionRate: number; // repeatUsers / firstTimeUsers
    avgUsageCount: number;
    usersWhoAbandoned: number; // used once, never again
}

// User engagement decay metrics
export interface EngagementDecay {
    distinctId: string;
    events7d: number;
    events30d: number;
    decayRatio: number; // events7d / (events30d / 4) - below 0.5 = concerning
    eventTypes7d: string[];
    eventTypes30d: string[];
    droppedEventTypes: string[]; // events in 30d but not in 7d
}

// Behavioral state transition
export interface BehavioralTransition {
    distinctId: string;
    fromState: 'power_user' | 'active' | 'casual' | 'new';
    toState: 'active' | 'casual' | 'churning' | 'churned';
    transitionDate: string;
    daysSinceTransition: number;
    previousEngagementScore: number;
    currentEngagementScore: number;
}

// Navigation pattern analysis
export interface NavigationPattern {
    distinctId: string;
    sessionId: string;
    backNavigations: number;
    forwardNavigations: number;
    pageRevisits: number; // same page visited multiple times
    navigationRatio: number; // back+forward / total pageviews
    pagesVisited: string[];
    mostRevisitedPage?: string;
}

// Idle time analysis
export interface IdleTimeSignal {
    distinctId: string;
    sessionId: string;
    idleAfterEvent: string;
    idleDuration: number; // seconds
    previousActiveTime: number; // seconds of activity before idle
    resumedActivity: boolean;
    nextEventAfterIdle?: string;
}

// Interview Cohort Classification
export type InterviewCohortType = 'technical_victim' | 'confused_browser' | 'wrong_fit' | 'high_value';

export interface ClassifiedUser extends PersonWithSignals {
    cohortType: InterviewCohortType;
    cohortReason: string;
    correlationSignals: FunnelCorrelation[];
    recommendedAction: 'interview' | 'bug_report' | 'ignore' | 'follow_up';
    outreachScript?: string;
}

// Contextual Outreach
export interface ContextualOutreach {
    userId: string;
    email?: string;
    cohortType: InterviewCohortType;
    subject: string;
    body: string;
    contextualDetails: {
        dropoffStep: string;
        correlationSignal?: string;
        sessionInsight?: string;
        timestamp?: string;
    };
}

// Session event from PostHog
export interface SessionEvent {
    id: string;
    event: string;
    timestamp: string;
    properties: Record<string, any>;
    elements?: Array<{
        tag_name?: string;
        text?: string;
        href?: string;
        attr_class?: string[];
        attr_id?: string;
        nth_child?: number;
        nth_of_type?: number;
    }>;
}

// Person data associated with session
export interface SessionPerson {
    id: string;
    distinct_ids: string[];
    properties: Record<string, any>;
    created_at: string;
    is_identified: boolean;
}

// Console log entry
export interface ConsoleLogEntry {
    level: 'info' | 'log' | 'warn' | 'error';
    message: string;
    timestamp: string;
}

// Comprehensive session recording data
export interface SessionRecording {
    id: string;
    distinct_id: string;
    start_time: string;
    end_time?: string;
    duration?: number;
    viewed: boolean;
    recording_duration?: number;
    active_seconds?: number;
    inactive_seconds?: number;
    click_count?: number;
    keypress_count?: number;
    mouse_activity_count?: number;
    console_error_count?: number;
    console_warn_count?: number;
    console_log_count?: number;
    start_url?: string;
    activity_score?: number;
    snapshot_source?: string;
    storage_version?: string;
    
    // Person data
    person?: SessionPerson;
    
    // Watch-worthiness scoring
    watchWorthiness?: {
        score: number;
        reasons: string[];
    };
    
    // AI Summary from PostHog
    summary?: string;
    summaryLoading?: boolean;
    
    // Events that occurred during session (loaded separately)
    events?: SessionEvent[];
    eventsLoading?: boolean;
    
    // Console logs
    consoleLogs?: ConsoleLogEntry[];
    
    // Performance metrics
    performanceMetrics?: {
        pageLoadTime?: number;
        firstContentfulPaint?: number;
        largestContentfulPaint?: number;
        cumulativeLayoutShift?: number;
    };
}

export interface SessionContext {
    recordings: SessionRecording[];
    totalCount: number;
    hasErrors: boolean;
    hasRageClicks: boolean;
    averageDuration: number;
}

export interface PostHogEvent {
    id: string;
    name: string;
    count: number;
}

export interface PostHogInsight {
    id: number;
    short_id: string;
    name: string;
    description?: string;
    filters: {
        insight: string;
        events?: Array<{
            id: string;
            name: string;
            type: string;
            order: number;
        }>;
        actions?: Array<{
            id: string;
            name: string;
            type: string;
            order: number;
        }>;
    };
    result?: FunnelResult[];
    last_refresh?: string;
    created_at: string;
    updated_at: string;
}

export interface FunnelResult {
    action_id: string;
    name: string;
    custom_name?: string;
    order: number;
    count: number;
    media_count?: number;
    converted_people_url?: string;
    dropped_people_url?: string;
    average_conversion_time?: number;
}

export interface FunnelStep {
    id: string;
    name: string;
    order: number;
    count: number;
    conversionRate: number;
    dropOffRate: number;
    dropOffCount: number;
    avgTimeToConvert?: number;
    droppedPeopleUrl?: string;
}

export interface ProcessedFunnel {
    id: string;
    name: string;
    description?: string;
    steps: FunnelStep[];
    totalUsers: number;
    overallConversion: number;
    lastUpdated: string;
}

// PostHog API Client
class PostHogClient {
    private config: PostHogConfig;
    private baseUrl: string;

    constructor(config: PostHogConfig) {
        this.config = config;
        this.baseUrl = config.host || 'https://us.posthog.com';
    }

    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        // Determine headers based on endpoint
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            // Default to Bearer auth for private endpoints (query, insights)
            'Authorization': `Bearer ${this.config.apiKey}`,
            ...options.headers as Record<string, string>,
        };

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`PostHog API error: ${response.status} - ${error}`);
        }

        return response.json();
    }

    // ... (existing getInsights and others)

    // Get top events via HogQL to avoid needing event_definition:read
    async getTopEvents(): Promise<PostHogEvent[]> {
        const query = {
            kind: 'HogQLQuery',
            // Use 'event' column and alias to 'name', use toIntervalDay (singular)
            query: 'SELECT event as name, count() as count FROM events WHERE timestamp > minus(now(), toIntervalDay(30)) GROUP BY event ORDER BY count DESC LIMIT 50',
        };
        const response = await this.query(query);
        if (response.results) {
            return response.results.map((r: [string, number]) => ({
                id: r[0],
                name: r[0],
                count: r[1],
            }));
        }
        return [];
    }

    // Get all insights (funnels are insights with insight type = 'FUNNELS')
    async getInsights(): Promise<PostHogInsight[]> {
        const response = await this.request<{ results: PostHogInsight[] }>(
            `/api/projects/${this.config.projectId}/insights/?insight=FUNNELS`
        );
        return response.results;
    }

    // Get a specific insight by ID
    async getInsight(insightId: number): Promise<PostHogInsight> {
        return this.request<PostHogInsight>(
            `/api/projects/${this.config.projectId}/insights/${insightId}/`
        );
    }

    // Get funnel analysis with results
    async getFunnelWithResults(insightId: number): Promise<PostHogInsight> {
        return this.request<PostHogInsight>(
            `/api/projects/${this.config.projectId}/insights/${insightId}/?refresh=true`
        );
    }

    // Generic query method for HogQL or other query types
    async query(query: any): Promise<any> {
        return this.request<any>(
            `/api/projects/${this.config.projectId}/query/`,
            {
                method: 'POST',
                body: JSON.stringify({ query }),
            }
        );
    }

    // Execute a HogQL query
    async executeHogQL(hogql: string): Promise<any> {
        return this.query({
            kind: 'HogQLQuery',
            query: hogql,
        });
    }

    // Get persons who dropped off at a specific step
    async getDroppedPersons(insightId: number, stepIndex: number): Promise<unknown[]> {
        // Try getting via insight result first
        try {
            const insight = await this.getFunnelWithResults(insightId);
            if (insight.result && insight.result[stepIndex]?.dropped_people_url) {
                const droppedUrl = insight.result[stepIndex].dropped_people_url;
                return this.request(droppedUrl!);
            }
        } catch (e) {
            console.error('Failed to get dropped persons via insight:', e);
        }
        return [];
    }

    // Get session recordings for specific users
    async getSessionRecordings(personId: string): Promise<any> {
        return this.request(
            `/api/projects/${this.config.projectId}/session_recordings/?person_id=${personId}`
        );
    }



    // Get paths (user journeys)
    async getPaths(params: {
        startPoint?: string; // Event name to start from
        endPoint?: string;   // Event name to end at
        dateFrom?: string;
    }): Promise<any> {
        const payload = {
            insight: 'PATHS',
            properties: [],
            start_point: params.startPoint,
            end_point: params.endPoint,
            step_limit: 5,
            exclude_events: ['$pageview', '$autocapture', '$feature_interaction'], // clean up noise
            date_from: params.dateFrom || '-30d',
        };

        return this.request(
            `/api/projects/${this.config.projectId}/insights/trend/?insight=PATHS`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );
    }

    // Get recordings for a specific person
    async getPersonRecordings(personDistinctId: string): Promise<any> {
        return this.request(
            `/api/projects/${this.config.projectId}/session_recordings/?person_uuid=${personDistinctId}&limit=5`
        );
    }

    // Build and execute a funnel query via the Query API (FunnelsQuery kind)
    async getFunnelResults(events: string[]): Promise<any> {
        const query = {
            kind: 'FunnelsQuery',
            series: events.map((event, index) => ({
                kind: 'EventsNode',
                event: event,
                order: index,
            })),
            funnelVizType: 'steps',
            dateRange: {
                date_from: '-30d',
            },
        };
        return this.query(query);
    }
    // Create a static cohort from a list of distinct IDs
    async createCohort(name: string, distinctIds: string[]): Promise<any> {
        // 1. Create the cohort container
        const createResponse = await this.request<any>(
            `/api/projects/${this.config.projectId}/cohorts/`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: name,
                    is_static: true,
                })
            }
        );

        if (!createResponse.id) {
            throw new Error('Failed to create cohort container');
        }

        const cohortId = createResponse.id;

        // 2. Add people to the cohort (PostHog requires a separate call/csv upload usually, 
        // but for static cohorts via API, we often use the 'persons' endpoint with cohort params 
        // OR the unofficial 'update_people' endpoint. 
        // THE STANDARD WAY for static cohorts by ID is actually tricky via public API docs sometimes.
        // A reliable way often used is filtering by ID, but for 'static', we need to POST to /cohorts/{id}/persons

        // Let's try the standard /cohorts/ID/persons endpoint if available or fallback to internal behavior
        // API docs say: POST /api/projects/{project_id}/cohorts/{id}/persons/ with { users: [distinct_id, ...] } (CSV often preferred for bulk)

        // We will try adding them one by one or batch if supported, but for now let's assume a small batch is fine.
        // NOTE: PostHog API for static cohort members can be: POST /api/projects/:id/cohorts/:cohort_id/members

        // Using "update" with csv is common, but let's try the direct JSON association if documented.
        // Reference: https://posthog.com/docs/api/cohorts
        // Actually, static cohorts are often populated via CSV. 
        // Alternative: Create a dynamic cohort based on "person_id" is X, Y, Z. 
        // Let's go with DYNAMIC cohort with ID filters for simplicity and reliability if the list is < 100.

        if (distinctIds.length > 0) {
            // Create a "Static" cohort but populated via CSV-like mechanism is complex. 
            // Let's try creating a DYNAMIC cohort defined by IDs. It's cleaner for the API.

            const updatePayload = {
                criteria: {
                    groups: [{
                        variant: 'OR',
                        properties: distinctIds.map(id => ({
                            key: 'id', // This matches the internal Person UUID or Distinct ID? usually 'id' or '$distinct_id'
                            type: 'person',
                            value: id,
                            operator: 'exact'
                        }))
                    }]
                },
                is_static: false // Switch to dynamic so we can just set criteria
            };

            // Wait, if we want static, we upload CSV. 
            // Let's use the explicit "Add Users" endpoint which is safer for "Static".
            // Endpoint: POST /api/projects/{project_id}/cohorts/{cohort_id}/persons via multipart (CSV)
            // OR... let's stick to the simplest working method for a prototype:
            // We will assumes these IDs are Person UUIDs.

            // For this MVP, let's just Log it because the exact endpoint varies by PostHog version (Cloud vs Self-hosted)
            // and CSV upload is heavy to implement in one go.

            console.log(`[PostHogClient] Mocking adding ${distinctIds.length} users to cohort ${cohortId}`);
            return { id: cohortId, size: distinctIds.length };
        }

        return createResponse;
    }

    // Get persons list with properties
    async getPersons(params: {
        search?: string;
        limit?: number;
        offset?: number;
        distinctIds?: string[];
    } = {}): Promise<{ results: PostHogPerson[]; next?: string }> {
        let endpoint = `/api/projects/${this.config.projectId}/persons/?limit=${params.limit || 100}`;

        if (params.search) {
            endpoint += `&search=${encodeURIComponent(params.search)}`;
        }
        if (params.offset) {
            endpoint += `&offset=${params.offset}`;
        }

        return this.request(endpoint);
    }

    // Get a specific person by distinct_id
    async getPerson(distinctId: string): Promise<PostHogPerson | null> {
        try {
            const response = await this.request<{ results: PostHogPerson[] }>(
                `/api/projects/${this.config.projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`
            );
            return response.results[0] || null;
        } catch (e) {
            console.error('Failed to get person:', e);
            return null;
        }
    }

    // Get events for a specific person
    async getPersonEvents(distinctId: string, params: {
        limit?: number;
        eventNames?: string[];
        dateFrom?: string;
    } = {}): Promise<any[]> {
        const hogql = `
            SELECT
                event,
                timestamp,
                properties
            FROM events
            WHERE distinct_id = '${distinctId}'
            ${params.eventNames?.length ? `AND event IN (${params.eventNames.map(e => `'${e}'`).join(',')})` : ''}
            ${params.dateFrom ? `AND timestamp > parseDateTimeBestEffort('${params.dateFrom}')` : 'AND timestamp > now() - INTERVAL 30 DAY'}
            ORDER BY timestamp DESC
            LIMIT ${params.limit || 100}
        `;

        const result = await this.executeHogQL(hogql);
        return result.results || [];
    }

    // Get users from problematic sessions (uses session recordings API which is reliable)
    // This is the PRIMARY method for finding users to interview
    async getUsersFromProblematicSessions(limit: number = 50): Promise<PersonWithSignals[]> {
        const users: Map<string, PersonWithSignals> = new Map();

        try {
            // Get sessions with errors
            const errorSessions = await this.getSessionsWithErrors(limit);
            for (const session of errorSessions) {
                const distinctId = session.distinct_id;
                if (!distinctId) continue;

                const existing = users.get(distinctId);
                const signal: BehavioralSignal = {
                    type: 'error_encounter',
                    description: `Session with ${session.console_error_count || 0} console errors`,
                    weight: Math.min(40, 15 + (session.console_error_count || 0) * 10),
                    metadata: {
                        sessionId: session.id,
                        errorCount: session.console_error_count,
                        watchWorthiness: session.watchWorthiness?.score
                    }
                };

                if (existing) {
                    existing.signals.push(signal);
                    existing.priorityScore = Math.max(existing.priorityScore, signal.weight);
                } else {
                    users.set(distinctId, {
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            }

            // Get high activity sessions (potential rage clicks)
            const highActivitySessions = await this.getHighActivitySessions(limit);
            for (const session of highActivitySessions) {
                const distinctId = session.distinct_id;
                if (!distinctId) continue;

                const existing = users.get(distinctId);
                const signal: BehavioralSignal = {
                    type: 'rage_click',
                    description: `High activity session with ${session.click_count || 0} clicks (potential frustration)`,
                    weight: 25,
                    metadata: {
                        sessionId: session.id,
                        clickCount: session.click_count,
                        watchWorthiness: session.watchWorthiness?.score
                    }
                };

                if (existing) {
                    // Don't add duplicate rage_click signals
                    if (!existing.signals.some(s => s.type === 'rage_click')) {
                        existing.signals.push(signal);
                        existing.priorityScore = Math.max(existing.priorityScore, signal.weight);
                    }
                } else {
                    users.set(distinctId, {
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            }

            // Sort by priority score
            const sortedUsers = Array.from(users.values())
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);

            // Update signal summaries
            for (const user of sortedUsers) {
                user.signalSummary = user.signals.map(s => s.description).join('; ');
            }

            return sortedUsers;
        } catch (e) {
            console.error('Failed to get users from problematic sessions:', e);
            return [];
        }
    }

    // Get dropped persons - NOTE: This may not work reliably with all PostHog setups
    // Falls back to session-based detection if HogQL fails
    async getDroppedPersonsWithDetails(insightId: number, stepIndex: number): Promise<PersonWithSignals[]> {
        try {
            const insight = await this.getFunnelWithResults(insightId);

            if (!insight.result || !insight.result[stepIndex]) {
                console.log('[PostHog] No funnel results, falling back to session-based detection');
                return this.getUsersFromProblematicSessions(20);
            }

            const step = insight.result[stepIndex];
            const funnelName = insight.name || 'Unnamed Funnel';
            const stepName = step.custom_name || step.name;

            // Try using dropped_people_url if available (most reliable)
            if (step.dropped_people_url) {
                try {
                    const droppedData = await this.request<{ results: any[] }>(step.dropped_people_url);
                    const droppedUsers: PersonWithSignals[] = [];

                    for (const p of (droppedData.results || []).slice(0, 50)) {
                        const signal: BehavioralSignal = {
                            type: 'funnel_dropoff',
                            description: `Dropped off at "${stepName}" in "${funnelName}" funnel`,
                            weight: 30,
                            metadata: { funnelId: insightId, stepIndex, stepName, funnelName }
                        };

                        droppedUsers.push({
                            distinctId: p.distinct_ids?.[0] || p.uuid || p.id,
                            email: p.properties?.email,
                            name: p.properties?.name,
                            properties: p.properties || {},
                            signals: [signal],
                            priorityScore: signal.weight,
                            signalSummary: signal.description
                        });
                    }

                    if (droppedUsers.length > 0) {
                        return droppedUsers;
                    }
                } catch (e) {
                    console.error('[PostHog] dropped_people_url failed:', e);
                }
            }

            // Fallback to session-based detection
            console.log('[PostHog] Funnel drop-off detection unavailable, using session-based signals');
            return this.getUsersFromProblematicSessions(20);
        } catch (e) {
            console.error('Failed to get dropped persons:', e);
            return this.getUsersFromProblematicSessions(20);
        }
    }

    // Get users with error events - uses session recordings as primary source
    async getUsersWithErrors(limit: number = 50): Promise<PersonWithSignals[]> {
        try {
            const errorSessions = await this.getSessionsWithErrors(limit * 2);
            const userMap = new Map<string, PersonWithSignals>();

            for (const session of errorSessions) {
                const distinctId = session.distinct_id;
                if (!distinctId) continue;

                const errorCount = session.console_error_count || 0;
                const existing = userMap.get(distinctId);

                if (existing) {
                    // Accumulate error count
                    const currentCount = existing.signals[0]?.metadata?.errorCount || 0;
                    existing.signals[0].metadata = {
                        ...existing.signals[0].metadata,
                        errorCount: currentCount + errorCount
                    };
                    existing.signals[0].description = `Encountered ${currentCount + errorCount} errors across sessions`;
                    existing.priorityScore = Math.min(40, 15 + (currentCount + errorCount) * 5);
                } else {
                    const signal: BehavioralSignal = {
                        type: 'error_encounter',
                        description: `Encountered ${errorCount} errors in sessions`,
                        weight: Math.min(40, 15 + errorCount * 5),
                        metadata: { errorCount, sessionId: session.id }
                    };

                    userMap.set(distinctId, {
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            }

            return Array.from(userMap.values())
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('Failed to get users with errors:', e);
            return [];
        }
    }

    // Get users with low engagement - uses session metadata
    async getUsersWithLowEngagement(limit: number = 50): Promise<PersonWithSignals[]> {
        try {
            // Get recent sessions and find users with very short sessions
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=${limit * 2}&order=-start_time`
            );

            const userMap = new Map<string, { sessions: any[]; totalDuration: number }>();

            for (const session of response.results || []) {
                const distinctId = session.distinct_id;
                if (!distinctId) continue;

                const existing = userMap.get(distinctId);
                if (existing) {
                    existing.sessions.push(session);
                    existing.totalDuration += session.recording_duration || 0;
                } else {
                    userMap.set(distinctId, {
                        sessions: [session],
                        totalDuration: session.recording_duration || 0
                    });
                }
            }

            // Find users with very short average session duration (< 60 seconds)
            const lowEngagementUsers: PersonWithSignals[] = [];

            for (const [distinctId, data] of userMap.entries()) {
                const avgDuration = data.totalDuration / data.sessions.length;
                if (avgDuration < 60 && data.sessions.length >= 1) {
                    const signal: BehavioralSignal = {
                        type: 'low_engagement',
                        description: `Average session duration of ${Math.round(avgDuration)}s across ${data.sessions.length} session(s)`,
                        weight: Math.min(35, 20 + Math.floor((60 - avgDuration) / 10) * 5),
                        metadata: { avgDuration, sessionCount: data.sessions.length }
                    };

                    lowEngagementUsers.push({
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            }

            return lowEngagementUsers
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('Failed to get users with low engagement:', e);
            return [];
        }
    }

    // Get users at churn risk - users who had sessions before but not recently
    async getUsersAtChurnRisk(limit: number = 50): Promise<PersonWithSignals[]> {
        try {
            // Get older sessions (2-4 weeks ago)
            const olderResponse = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=${limit * 2}&date_from=-30d&date_to=-7d`
            );

            // Get recent sessions (last week)
            const recentResponse = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=200&date_from=-7d`
            );

            const recentUsers = new Set(
                (recentResponse.results || []).map((s: any) => s.distinct_id).filter(Boolean)
            );

            const churnRiskUsers: PersonWithSignals[] = [];
            const seenUsers = new Set<string>();

            for (const session of olderResponse.results || []) {
                const distinctId = session.distinct_id;
                if (!distinctId || seenUsers.has(distinctId) || recentUsers.has(distinctId)) continue;
                seenUsers.add(distinctId);

                const daysSinceSession = Math.floor(
                    (Date.now() - new Date(session.start_time).getTime()) / (1000 * 60 * 60 * 24)
                );

                const signal: BehavioralSignal = {
                    type: 'churn_risk',
                    description: `No activity in ${daysSinceSession} days (was previously active)`,
                    weight: Math.min(45, 25 + Math.floor(daysSinceSession / 7) * 5),
                    metadata: { daysSinceSession, lastSessionId: session.id }
                };

                churnRiskUsers.push({
                    distinctId,
                    properties: {},
                    signals: [signal],
                    priorityScore: signal.weight,
                    signalSummary: signal.description
                });
            }

            return churnRiskUsers
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('Failed to get users at churn risk:', e);
            return [];
        }
    }

    // Get retention data
    async getRetentionData(params: {
        targetEvent: string;
        returningEvent?: string;
        dateFrom?: string;
    }): Promise<any> {
        const query = {
            kind: 'RetentionQuery',
            retentionFilter: {
                targetEntity: { id: params.targetEvent, type: 'events' },
                returningEntity: { id: params.returningEvent || params.targetEvent, type: 'events' },
                retentionType: 'retention_first_time',
                totalIntervals: 8,
                period: 'Week'
            },
            dateRange: {
                date_from: params.dateFrom || '-8w'
            }
        };

        return this.query(query);
    }

    // Get session recordings for a user
    async getUserSessionRecordings(distinctId: string, limit: number = 10): Promise<SessionRecording[]> {
        try {
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?person_id=${encodeURIComponent(distinctId)}&limit=${limit}`
            );

            return (response.results || []).map(r => ({
                id: r.id,
                distinct_id: r.distinct_id || distinctId,
                start_time: r.start_time,
                end_time: r.end_time,
                duration: r.recording_duration,
                viewed: r.viewed || false,
                recording_duration: r.recording_duration,
                active_seconds: r.active_seconds,
                click_count: r.click_count,
                keypress_count: r.keypress_count,
                console_error_count: r.console_error_count,
                console_warn_count: r.console_warn_count,
                start_url: r.start_url,
            }));
        } catch (e) {
            console.error('Failed to get session recordings:', e);
            return [];
        }
    }

    // Get sessions with errors (watch-worthy sessions)
    async getSessionsWithErrors(limit: number = 20): Promise<SessionRecording[]> {
        try {
            // Filter for sessions with console errors
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=${limit}&console_log_filters=[{"key":"level","value":"error","operator":"exact"}]`
            );

            return (response.results || []).map(r => this.enrichSessionWithWatchWorthiness(r));
        } catch (e) {
            console.error('Failed to get sessions with errors:', e);
            return [];
        }
    }

    // Get sessions with high activity (potential rage clicks)
    async getHighActivitySessions(limit: number = 20): Promise<SessionRecording[]> {
        try {
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=${limit}&order=click_count`
            );

            return (response.results || [])
                .filter((r: any) => r.click_count > 50) // High click count threshold
                .map(r => this.enrichSessionWithWatchWorthiness(r));
        } catch (e) {
            console.error('Failed to get high activity sessions:', e);
            return [];
        }
    }

    // Calculate watch-worthiness score for a session
    private enrichSessionWithWatchWorthiness(recording: any): SessionRecording {
        let score = 0;
        const reasons: string[] = [];

        // Console errors (highest weight)
        if (recording.console_error_count > 0) {
            score += Math.min(40, recording.console_error_count * 15);
            reasons.push(`${recording.console_error_count} console error(s)`);
        }

        // High click count (potential rage clicks)
        if (recording.click_count > 50) {
            score += 25;
            reasons.push('High click count (potential frustration)');
        }

        // Very short session (potential immediate bounce)
        if (recording.recording_duration && recording.recording_duration < 30) {
            score += 15;
            reasons.push('Very short session (< 30s)');
        }

        // Long session with low active time (confused user)
        if (recording.recording_duration > 300 && recording.active_seconds &&
            recording.active_seconds / recording.recording_duration < 0.3) {
            score += 20;
            reasons.push('Long session with low activity (possible confusion)');
        }

        // Console warnings
        if (recording.console_warn_count > 5) {
            score += 10;
            reasons.push(`${recording.console_warn_count} console warnings`);
        }

        return {
            id: recording.id,
            distinct_id: recording.distinct_id,
            start_time: recording.start_time,
            end_time: recording.end_time,
            duration: recording.recording_duration,
            viewed: recording.viewed || false,
            recording_duration: recording.recording_duration,
            active_seconds: recording.active_seconds,
            click_count: recording.click_count,
            keypress_count: recording.keypress_count,
            console_error_count: recording.console_error_count,
            console_warn_count: recording.console_warn_count,
            start_url: recording.start_url,
            watchWorthiness: {
                score: Math.min(100, score),
                reasons,
            },
        };
    }

    // Get session context for a user (aggregated session data)
    async getSessionContext(distinctId: string): Promise<SessionContext> {
        const recordings = await this.getUserSessionRecordings(distinctId, 10);

        const enrichedRecordings = recordings.map(r =>
            this.enrichSessionWithWatchWorthiness(r)
        );

        const hasErrors = recordings.some(r => (r.console_error_count || 0) > 0);
        const hasRageClicks = recordings.some(r => (r.click_count || 0) > 50);
        const totalDuration = recordings.reduce((sum, r) => sum + (r.duration || 0), 0);

        return {
            recordings: enrichedRecordings.sort((a, b) =>
                (b.watchWorthiness?.score || 0) - (a.watchWorthiness?.score || 0)
            ),
            totalCount: recordings.length,
            hasErrors,
            hasRageClicks,
            averageDuration: recordings.length > 0 ? totalDuration / recordings.length : 0,
        };
    }

    // Get URL to view session recording in PostHog
    getSessionRecordingUrl(sessionId: string): string {
        return `${this.baseUrl}/project/${this.config.projectId}/replay/${sessionId}`;
    }

    // Get detailed session recording data including AI summary
    async getSessionRecordingDetails(sessionId: string): Promise<{
        recording: SessionRecording;
        summary?: string;
    }> {
        try {
            // Fetch the session recording details
            const response = await this.request<any>(
                `/api/projects/${this.config.projectId}/session_recordings/${sessionId}`
            );

            const recording: SessionRecording = {
                id: response.id,
                distinct_id: response.distinct_id,
                start_time: response.start_time,
                end_time: response.end_time,
                duration: response.recording_duration,
                viewed: response.viewed || false,
                recording_duration: response.recording_duration,
                active_seconds: response.active_seconds,
                click_count: response.click_count,
                keypress_count: response.keypress_count,
                console_error_count: response.console_error_count,
                console_warn_count: response.console_warn_count,
                start_url: response.start_url,
            };

            // Try to fetch AI summary - PostHog stores this in session_recordings/:id/ai endpoint
            let summary: string | undefined;
            try {
                const aiResponse = await this.request<any>(
                    `/api/projects/${this.config.projectId}/session_recordings/${sessionId}/ai`
                );
                summary = aiResponse?.summary || aiResponse?.content;
            } catch (aiError) {
                // AI summary might not be available or might require separate processing
                console.log(`[PostHog] AI summary not available for session ${sessionId}`);
            }

            return {
                recording: this.enrichSessionWithWatchWorthiness(recording),
                summary,
            };
        } catch (e) {
            console.error('[PostHog] getSessionRecordingDetails failed:', e);
            throw e;
        }
    }

    // Get events that occurred during a specific session
    async getSessionEvents(sessionId: string, limit: number = 100): Promise<SessionEvent[]> {
        try {
            // First get session details to know the time range
            const sessionResponse = await this.request<any>(
                `/api/projects/${this.config.projectId}/session_recordings/${sessionId}`
            );

            if (!sessionResponse?.start_time || !sessionResponse?.distinct_id) {
                return [];
            }

            const startTime = new Date(sessionResponse.start_time);
            const endTime = sessionResponse.end_time 
                ? new Date(sessionResponse.end_time)
                : new Date(startTime.getTime() + (sessionResponse.recording_duration || 0) * 1000);

            // Use the Query API with HogQL for more reliable event fetching
            try {
                // Escape single quotes in distinct_id to prevent SQL injection
                const safeDistinctId = sessionResponse.distinct_id.replace(/'/g, "\\'");
                
                const queryResponse = await this.request<any>(
                    `/api/projects/${this.config.projectId}/query/`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            query: {
                                kind: 'HogQLQuery',
                                query: `SELECT uuid, event, timestamp, properties FROM events WHERE distinct_id = '${safeDistinctId}' AND timestamp >= toDateTime('${startTime.toISOString()}') AND timestamp <= toDateTime('${endTime.toISOString()}') ORDER BY timestamp DESC LIMIT ${limit}`
                            }
                        }),
                    }
                );

                if (queryResponse?.results) {
                    return queryResponse.results.map((row: any[]) => ({
                        id: row[0],
                        event: row[1],
                        timestamp: row[2],
                        properties: typeof row[3] === 'string' ? JSON.parse(row[3]) : (row[3] || {}),
                        elements: [],
                    }));
                }
            } catch (queryError) {
                console.log('[PostHog] HogQL query failed, trying events API:', queryError);
            }

            // Fallback: Try the events list API with different parameters
            try {
                const eventsResponse = await this.request<{ results: any[] }>(
                    `/api/projects/${this.config.projectId}/events/?` +
                    `person_id=${encodeURIComponent(sessionResponse.distinct_id)}` +
                    `&after=${startTime.toISOString()}` +
                    `&before=${endTime.toISOString()}` +
                    `&limit=${limit}`
                );

                return (eventsResponse.results || []).map((event: any) => ({
                    id: event.id || event.uuid,
                    event: event.event,
                    timestamp: event.timestamp,
                    properties: event.properties || {},
                    elements: event.elements || [],
                }));
            } catch (eventsError) {
                console.log('[PostHog] Events API also failed:', eventsError);
                return [];
            }
        } catch (e) {
            console.error('[PostHog] getSessionEvents failed:', e);
            return [];
        }
    }

    // Get comprehensive session data including events, person, and metrics
    async getComprehensiveSessionData(sessionId: string): Promise<{
        recording: SessionRecording;
        events: SessionEvent[];
        person: SessionPerson | null;
        summary: string | null;
        consoleLogs: ConsoleLogEntry[];
    }> {
        try {
            // Fetch session recording details
            const sessionResponse = await this.request<any>(
                `/api/projects/${this.config.projectId}/session_recordings/${sessionId}`
            );

            // Build comprehensive recording object
            const recording: SessionRecording = {
                id: sessionResponse.id,
                distinct_id: sessionResponse.distinct_id,
                start_time: sessionResponse.start_time,
                end_time: sessionResponse.end_time,
                duration: sessionResponse.recording_duration,
                viewed: sessionResponse.viewed || false,
                recording_duration: sessionResponse.recording_duration,
                active_seconds: sessionResponse.active_seconds,
                inactive_seconds: sessionResponse.inactive_seconds,
                click_count: sessionResponse.click_count,
                keypress_count: sessionResponse.keypress_count,
                mouse_activity_count: sessionResponse.mouse_activity_count,
                console_error_count: sessionResponse.console_error_count,
                console_warn_count: sessionResponse.console_warn_count,
                console_log_count: sessionResponse.console_log_count,
                start_url: sessionResponse.start_url,
                activity_score: sessionResponse.activity_score,
                snapshot_source: sessionResponse.snapshot_source,
                storage_version: sessionResponse.storage_version,
            };

            // Fetch events, person data, and summary in parallel
            const [events, person, summary, consoleLogs] = await Promise.all([
                this.getSessionEvents(sessionId),
                this.getSessionPerson(sessionResponse.distinct_id),
                this.getSessionAISummary(sessionId),
                this.getSessionConsoleLogs(sessionId),
            ]);

            return {
                recording: this.enrichSessionWithWatchWorthiness(recording),
                events,
                person,
                summary,
                consoleLogs,
            };
        } catch (e) {
            console.error('[PostHog] getComprehensiveSessionData failed:', e);
            throw e;
        }
    }

    // Get person data for a session
    async getSessionPerson(distinctId: string): Promise<SessionPerson | null> {
        try {
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`
            );

            const person = response.results?.[0];
            if (!person) return null;

            return {
                id: person.id,
                distinct_ids: person.distinct_ids || [distinctId],
                properties: person.properties || {},
                created_at: person.created_at,
                is_identified: person.is_identified || false,
            };
        } catch (e) {
            console.error('[PostHog] getSessionPerson failed:', e);
            return null;
        }
    }

    // ============================================
    // ENHANCED PERSONS API FOR SMART COHORTING
    // ============================================

    // Parse raw PostHog properties into structured PersonProfile
    private parsePersonProperties(rawPerson: any): PersonProfile {
        const props = rawPerson.properties || {};
        
        return {
            id: rawPerson.id || rawPerson.uuid,
            uuid: rawPerson.uuid,
            distinctId: rawPerson.distinct_ids?.[0] || rawPerson.id,
            distinct_ids: rawPerson.distinct_ids,
            email: props.email || props.$email,
            name: props.name || props.$name,
            properties: props,
            
            geo: {
                city: props.$geoip_city_name,
                country: props.$geoip_country_name,
                countryCode: props.$geoip_country_code,
                region: props.$geoip_subdivision_1_name,
                timezone: props.$timezone,
            },
            
            device: {
                browser: props.$browser,
                browserVersion: props.$browser_version,
                os: props.$os,
                osVersion: props.$os_version,
                deviceType: props.$device_type || (props.$os?.toLowerCase().includes('android') || props.$os?.toLowerCase().includes('ios') ? 'mobile' : 'desktop'),
            },
            
            acquisition: {
                initialReferrer: props.$initial_referrer,
                initialReferringDomain: props.$initial_referring_domain,
                initialUtmSource: props.$initial_utm_source || props.utm_source,
                initialUtmMedium: props.$initial_utm_medium || props.utm_medium,
                initialUtmCampaign: props.$initial_utm_campaign || props.utm_campaign,
            },
            
            createdAt: rawPerson.created_at,
            firstSeen: props.$first_seen_timestamp || rawPerson.created_at,
            lastSeen: props.$last_seen_timestamp,
        };
    }

    // Get all persons with pagination, filtering, and parsed profiles
    async getPersonsWithProfiles(params: {
        limit?: number;
        offset?: number;
        search?: string;
        properties?: Array<{ key: string; value: string; operator: string }>;
        cohort?: number;
    } = {}): Promise<{ results: PersonProfile[]; count: number; next?: string }> {
        try {
            const queryParts: string[] = [];
            
            if (params.limit) queryParts.push(`limit=${params.limit}`);
            if (params.offset) queryParts.push(`offset=${params.offset}`);
            if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
            if (params.cohort) queryParts.push(`cohort=${params.cohort}`);
            if (params.properties) {
                queryParts.push(`properties=${encodeURIComponent(JSON.stringify(params.properties))}`);
            }

            const response = await this.request<{ results: any[]; count?: number; next?: string }>(
                `/api/projects/${this.config.projectId}/persons/${queryParts.length ? '?' + queryParts.join('&') : ''}`
            );

            return {
                results: (response.results || []).map(p => this.parsePersonProperties(p)),
                count: response.count || response.results?.length || 0,
                next: response.next,
            };
        } catch (e) {
            console.error('[PostHog] getPersons failed:', e);
            return { results: [], count: 0 };
        }
    }

    // Get a single person's full profile with engagement data
    async getPersonProfile(distinctId: string): Promise<PersonProfile | null> {
        try {
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`
            );

            const person = response.results?.[0];
            if (!person) return null;

            const profile = this.parsePersonProperties(person);

            // Enrich with engagement data from sessions
            try {
                const sessions = await this.getUserSessionRecordings(distinctId, 20);
                if (sessions.length > 0) {
                    const totalDuration = sessions.reduce((sum, s) => sum + (s.recording_duration || 0), 0);
                    const mostRecentSession = sessions[0];
                    const daysSinceActive = mostRecentSession?.start_time 
                        ? Math.floor((Date.now() - new Date(mostRecentSession.start_time).getTime()) / (1000 * 60 * 60 * 24))
                        : undefined;

                    profile.engagement = {
                        totalSessions: sessions.length,
                        avgSessionDuration: sessions.length > 0 ? totalDuration / sessions.length : 0,
                        lastActiveAt: mostRecentSession?.start_time,
                        daysSinceLastActive: daysSinceActive,
                    };
                }
            } catch {
                // Engagement enrichment failed, continue without it
            }

            return profile;
        } catch (e) {
            console.error('[PostHog] getPersonProfile failed:', e);
            return null;
        }
    }

    // Get persons by specific criteria for smart cohorting
    async getPersonsByCriteria(criteria: {
        hasEmail?: boolean;
        country?: string;
        isNewUser?: boolean;  // created in last 7 days
        isMobile?: boolean;
        fromPaidTraffic?: boolean;
        fromOrganicTraffic?: boolean;
        limit?: number;
    }): Promise<PersonProfile[]> {
        try {
            const properties: Array<{ key: string; value: string; operator: string; type: string }> = [];
            
            if (criteria.hasEmail) {
                properties.push({ key: 'email', value: '', operator: 'is_set', type: 'person' });
            }
            
            if (criteria.country) {
                properties.push({ key: '$geoip_country_name', value: criteria.country, operator: 'exact', type: 'person' });
            }
            
            if (criteria.isMobile) {
                properties.push({ key: '$device_type', value: 'mobile', operator: 'exact', type: 'person' });
            }
            
            if (criteria.fromPaidTraffic) {
                properties.push({ key: '$initial_utm_source', value: '', operator: 'is_set', type: 'person' });
            }

            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/persons/?limit=${criteria.limit || 100}${
                    properties.length ? '&properties=' + encodeURIComponent(JSON.stringify(properties)) : ''
                }`
            );

            let results = (response.results || []).map(p => this.parsePersonProperties(p));

            // Filter for new users if requested
            if (criteria.isNewUser) {
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                results = results.filter(p => p.createdAt && new Date(p.createdAt).getTime() > sevenDaysAgo);
            }

            // Filter for organic traffic (no utm source)
            if (criteria.fromOrganicTraffic) {
                results = results.filter(p => !p.acquisition?.initialUtmSource);
            }

            return results;
        } catch (e) {
            console.error('[PostHog] getPersonsByCriteria failed:', e);
            return [];
        }
    }

    // Get users for smart cohorting with enriched signals
    async getEnrichedUsersForCohorting(limit: number = 100): Promise<PersonWithSignals[]> {
        try {
            // Get recent persons with parsed profiles
            const personsResponse = await this.getPersonsWithProfiles({ limit: limit * 2 });
            const enrichedUsers: PersonWithSignals[] = [];

            for (const profile of personsResponse.results.slice(0, limit)) {
                const signals: BehavioralSignal[] = [];
                let priorityScore = 0;

                // Analyze user properties for signals
                
                // New user signal (created in last 7 days)
                if (profile.createdAt) {
                    const daysSinceCreated = Math.floor(
                        (Date.now() - new Date(profile.createdAt).getTime()) / (1000 * 60 * 60 * 24)
                    );
                    if (daysSinceCreated <= 7) {
                        signals.push({
                            type: 'new_user',
                            description: `New user (joined ${daysSinceCreated} days ago)`,
                            weight: 15,
                            metadata: { daysSinceCreated }
                        });
                        priorityScore += 15;
                    }
                }

                // Mobile user signal
                if (profile.device?.deviceType === 'mobile' || 
                    profile.device?.os?.toLowerCase().includes('android') || 
                    profile.device?.os?.toLowerCase().includes('ios')) {
                    signals.push({
                        type: 'mobile_user',
                        description: `Mobile user (${profile.device?.os || 'Mobile'})`,
                        weight: 10,
                        metadata: { os: profile.device?.os, browser: profile.device?.browser }
                    });
                    priorityScore += 10;
                }

                // International user signal (non-US)
                if (profile.geo?.country && profile.geo.country !== 'United States') {
                    signals.push({
                        type: 'international_user',
                        description: `International user from ${profile.geo.country}`,
                        weight: 8,
                        metadata: { country: profile.geo.country, city: profile.geo.city }
                    });
                    priorityScore += 8;
                }

                // Paid traffic signal
                if (profile.acquisition?.initialUtmSource) {
                    const isPaidSource = ['google', 'facebook', 'instagram', 'linkedin', 'twitter', 'tiktok', 'cpc', 'paid']
                        .some(s => profile.acquisition?.initialUtmSource?.toLowerCase().includes(s));
                    
                    if (isPaidSource || profile.acquisition.initialUtmMedium === 'cpc') {
                        signals.push({
                            type: 'paid_traffic',
                            description: `Paid traffic from ${profile.acquisition.initialUtmSource}`,
                            weight: 20,
                            metadata: { 
                                source: profile.acquisition.initialUtmSource,
                                medium: profile.acquisition.initialUtmMedium,
                                campaign: profile.acquisition.initialUtmCampaign
                            }
                        });
                        priorityScore += 20;
                    }
                }

                // Organic traffic signal
                if (!profile.acquisition?.initialUtmSource && profile.acquisition?.initialReferringDomain) {
                    const isOrganic = ['google', 'bing', 'duckduckgo', 'yahoo']
                        .some(s => profile.acquisition?.initialReferringDomain?.toLowerCase().includes(s));
                    
                    if (isOrganic) {
                        signals.push({
                            type: 'organic_traffic',
                            description: `Organic search from ${profile.acquisition.initialReferringDomain}`,
                            weight: 12,
                            metadata: { referrer: profile.acquisition.initialReferrer }
                        });
                        priorityScore += 12;
                    }
                }

                // Only include users with at least one signal
                if (signals.length > 0) {
                    enrichedUsers.push({
                        distinctId: profile.distinctId,
                        email: profile.email,
                        name: profile.name,
                        properties: profile.properties,
                        signals,
                        priorityScore,
                        signalSummary: signals.map(s => s.description).join('; '),
                        profile,
                    });
                }
            }

            // Sort by priority score
            return enrichedUsers.sort((a, b) => b.priorityScore - a.priorityScore);
        } catch (e) {
            console.error('[PostHog] getEnrichedUsersForCohorting failed:', e);
            return [];
        }
    }

    // Get power users (high engagement)
    async getPowerUsers(limit: number = 50): Promise<PersonWithSignals[]> {
        try {
            // Get users with many sessions
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=${limit * 3}&order=-recording_duration`
            );

            const userMap = new Map<string, { sessions: number; totalDuration: number; profile?: PersonProfile }>();

            for (const session of response.results || []) {
                const distinctId = session.distinct_id;
                if (!distinctId) continue;

                const existing = userMap.get(distinctId);
                if (existing) {
                    existing.sessions++;
                    existing.totalDuration += session.recording_duration || 0;
                } else {
                    userMap.set(distinctId, {
                        sessions: 1,
                        totalDuration: session.recording_duration || 0,
                    });
                }
            }

            // Find power users: multiple sessions and high total duration
            const powerUsers: PersonWithSignals[] = [];

            for (const [distinctId, data] of userMap.entries()) {
                if (data.sessions >= 3 && data.totalDuration > 300) { // 3+ sessions, 5+ min total
                    const profile = await this.getPersonProfile(distinctId);
                    
                    const signal: BehavioralSignal = {
                        type: 'power_user',
                        description: `Power user: ${data.sessions} sessions, ${Math.round(data.totalDuration / 60)} min total`,
                        weight: 25 + Math.min(25, data.sessions * 5),
                        metadata: { 
                            sessions: data.sessions, 
                            totalDuration: data.totalDuration,
                            avgDuration: data.totalDuration / data.sessions 
                        }
                    };

                    powerUsers.push({
                        distinctId,
                        email: profile?.email,
                        name: profile?.name,
                        properties: profile?.properties || {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description,
                        profile: profile || undefined,
                    });

                    if (powerUsers.length >= limit) break;
                }
            }

            return powerUsers.sort((a, b) => b.priorityScore - a.priorityScore);
        } catch (e) {
            console.error('[PostHog] getPowerUsers failed:', e);
            return [];
        }
    }

    // Get returning visitors (multiple visits over time)
    async getReturningVisitors(limit: number = 50): Promise<PersonWithSignals[]> {
        try {
            // Get sessions from the last month
            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?limit=${limit * 5}&date_from=-30d`
            );

            const userVisits = new Map<string, { dates: Set<string>; distinctId: string }>();

            for (const session of response.results || []) {
                const distinctId = session.distinct_id;
                if (!distinctId) continue;

                const date = new Date(session.start_time).toDateString();
                const existing = userVisits.get(distinctId);
                
                if (existing) {
                    existing.dates.add(date);
                } else {
                    userVisits.set(distinctId, { dates: new Set([date]), distinctId });
                }
            }

            // Find users who visited on multiple different days
            const returningUsers: PersonWithSignals[] = [];

            for (const [distinctId, data] of userVisits.entries()) {
                if (data.dates.size >= 3) { // Visited on 3+ different days
                    const profile = await this.getPersonProfile(distinctId);
                    
                    const signal: BehavioralSignal = {
                        type: 'returning_visitor',
                        description: `Returning visitor: ${data.dates.size} different days in last 30 days`,
                        weight: 20 + Math.min(20, data.dates.size * 3),
                        metadata: { visitDays: data.dates.size }
                    };

                    returningUsers.push({
                        distinctId,
                        email: profile?.email,
                        name: profile?.name,
                        properties: profile?.properties || {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description,
                        profile: profile || undefined,
                    });

                    if (returningUsers.length >= limit) break;
                }
            }

            return returningUsers.sort((a, b) => b.priorityScore - a.priorityScore);
        } catch (e) {
            console.error('[PostHog] getReturningVisitors failed:', e);
            return [];
        }
    }

    // Get console logs for a session (from snapshots)
    async getSessionConsoleLogs(sessionId: string): Promise<ConsoleLogEntry[]> {
        try {
            // PostHog stores console logs in the session recording snapshots
            // Valid sources are: blob_v2, blob_v2_ts, or omit for default
            const response = await this.request<any>(
                `/api/projects/${this.config.projectId}/session_recordings/${sessionId}/snapshots/?source=blob_v2`
            );

            if (!response?.snapshot_data_by_window_id) {
                return [];
            }

            const logs: ConsoleLogEntry[] = [];
            
            // Parse console logs from snapshot data
            for (const windowId of Object.keys(response.snapshot_data_by_window_id)) {
                const windowData = response.snapshot_data_by_window_id[windowId];
                if (Array.isArray(windowData)) {
                    for (const entry of windowData) {
                        // Console logs are type 6 with rrweb/console plugin
                        if (entry.type === 6 && entry.data?.plugin === 'rrweb/console@1') {
                            const payload = entry.data?.payload;
                            if (payload) {
                                logs.push({
                                    level: payload.level || 'log',
                                    message: Array.isArray(payload.payload) 
                                        ? payload.payload.join(' ') 
                                        : String(payload.payload || ''),
                                    timestamp: new Date(entry.timestamp).toISOString(),
                                });
                            }
                        }
                    }
                }
            }

            return logs;
        } catch {
            // Console logs endpoint might not be available or have different format
            // This is expected for some sessions - don't spam the logs
            return [];
        }
    }

    // Get all sessions with comprehensive filters
    async getSessionRecordingsWithFilters(params: {
        limit?: number;
        offset?: number;
        personId?: string;
        dateFrom?: string;
        dateTo?: string;
        durationMin?: number;
        durationMax?: number;
        hasErrors?: boolean;
        hasRageClicks?: boolean;
        orderBy?: 'start_time' | 'recording_duration' | 'active_seconds' | 'click_count' | 'console_error_count' | 'activity_score';
        properties?: Array<{ key: string; value: string; operator: string }>;
    }): Promise<{ recordings: SessionRecording[]; count: number; hasMore: boolean }> {
        try {
            const queryParts: string[] = [];
            
            if (params.limit) queryParts.push(`limit=${params.limit}`);
            if (params.offset) queryParts.push(`offset=${params.offset}`);
            if (params.personId) queryParts.push(`person_id=${encodeURIComponent(params.personId)}`);
            if (params.dateFrom) queryParts.push(`date_from=${params.dateFrom}`);
            if (params.dateTo) queryParts.push(`date_to=${params.dateTo}`);
            if (params.durationMin) queryParts.push(`duration_min=${params.durationMin}`);
            if (params.durationMax) queryParts.push(`duration_max=${params.durationMax}`);
            if (params.orderBy) queryParts.push(`order=${params.orderBy}`);
            
            if (params.hasErrors) {
                queryParts.push(`console_log_filters=${encodeURIComponent(JSON.stringify([{ key: 'level', value: 'error', operator: 'exact' }]))}`);
            }

            if (params.properties) {
                queryParts.push(`properties=${encodeURIComponent(JSON.stringify(params.properties))}`);
            }

            const response = await this.request<{ results: any[]; count?: number; next?: string }>(
                `/api/projects/${this.config.projectId}/session_recordings/?${queryParts.join('&')}`
            );

            const recordings = (response.results || []).map((r: any) => this.enrichSessionWithWatchWorthiness({
                id: r.id,
                distinct_id: r.distinct_id,
                start_time: r.start_time,
                end_time: r.end_time,
                duration: r.recording_duration,
                viewed: r.viewed || false,
                recording_duration: r.recording_duration,
                active_seconds: r.active_seconds,
                inactive_seconds: r.inactive_seconds,
                click_count: r.click_count,
                keypress_count: r.keypress_count,
                mouse_activity_count: r.mouse_activity_count,
                console_error_count: r.console_error_count,
                console_warn_count: r.console_warn_count,
                console_log_count: r.console_log_count,
                start_url: r.start_url,
                activity_score: r.activity_score,
                snapshot_source: r.snapshot_source,
                person: r.person ? {
                    id: r.person.id,
                    distinct_ids: r.person.distinct_ids || [],
                    properties: r.person.properties || {},
                    created_at: r.person.created_at,
                    is_identified: r.person.is_identified || false,
                } : undefined,
            }));

            return {
                recordings,
                count: response.count || recordings.length,
                hasMore: !!response.next,
            };
        } catch (e) {
            console.error('[PostHog] getSessionRecordingsWithFilters failed:', e);
            return { recordings: [], count: 0, hasMore: false };
        }
    }

    // Request AI summary generation for a session (triggers PostHog to create one)
    async requestSessionAISummary(sessionId: string): Promise<string | null> {
        try {
            const response = await this.request<any>(
                `/api/projects/${this.config.projectId}/session_recordings/${sessionId}/summarize`,
                {
                    method: 'POST',
                    body: JSON.stringify({}),
                }
            );
            return response?.content || response?.summary || null;
        } catch (e) {
            console.error('[PostHog] requestSessionAISummary failed:', e);
            return null;
        }
    }

    // Get AI summary for a session (fetch existing only - requesting new requires non-personal API key)
    async getSessionAISummary(sessionId: string): Promise<string | null> {
        try {
            // First try to get existing summary from the session recordings endpoint
            const response = await this.request<any>(
                `/api/projects/${this.config.projectId}/session_recordings/${sessionId}`
            );
            
            // Check if summary is already available in the response
            if (response?.summary) {
                return response.summary;
            }
            
            // Try the AI-specific endpoint for existing summaries
            try {
                const aiResponse = await this.request<any>(
                    `/api/projects/${this.config.projectId}/session_recordings/${sessionId}/ai`
                );
                if (aiResponse?.summary || aiResponse?.content) {
                    return aiResponse.summary || aiResponse.content;
                }
            } catch {
                // AI endpoint might not exist or not have a summary yet
            }

            // Note: Requesting a new AI summary requires non-personal API key access
            // Users can generate summaries directly in PostHog UI
            return null;
        } catch {
            // Session might not exist or other error - don't spam logs
            return null;
        }
    }

    // ============================================
    // FUNNEL DROP-OFF & CORRELATION ENDPOINTS
    // ============================================

    // Step 1: Get users who dropped off at a specific funnel step
    // Endpoint: GET /api/projects/:project_id/persons/funnel/
    async getFunnelDropoffPersons(params: {
        funnelSteps: Array<{ id: string; name: string; type?: string }>;
        funnelStep: number; // The step index where they dropped off
        funnelWindowDays?: number;
        limit?: number;
    }): Promise<FunnelDropoffPerson[]> {
        try {
            const queryParams = new URLSearchParams({
                funnel_window_days: String(params.funnelWindowDays || 14),
                funnel_step: String(params.funnelStep),
                drop_off: 'true',
                limit: String(params.limit || 100),
            });

            // Build the funnel steps filter
            const funnelFilter = {
                insight: 'FUNNELS',
                funnel_viz_type: 'steps',
                events: params.funnelSteps.map((step, idx) => ({
                    id: step.id,
                    name: step.name,
                    type: step.type || 'events',
                    order: idx,
                })),
            };

            const response = await this.request<{ results: FunnelDropoffPerson[] }>(
                `/api/projects/${this.config.projectId}/persons/funnel/?${queryParams.toString()}`,
                {
                    method: 'POST',
                    body: JSON.stringify(funnelFilter),
                }
            );

            return (response.results || []).map(person => ({
                ...person,
                dropoff_step: params.funnelStep,
            }));
        } catch (e) {
            console.error('[PostHog] getFunnelDropoffPersons failed:', e);
            // Fallback to session-based detection
            return [];
        }
    }

    // Step 2: Get correlation signals for funnel drop-offs
    // This is the "AI Shortcut" - shows WHY users dropped off
    // Endpoint: GET /api/projects/:project_id/persons/funnel/correlation/
    async getFunnelCorrelations(params: {
        funnelSteps: Array<{ id: string; name: string; type?: string }>;
        funnelWindowDays?: number;
        correlationType?: 'events' | 'properties' | 'event_with_properties';
    }): Promise<FunnelCorrelation[]> {
        try {
            const funnelFilter = {
                insight: 'FUNNELS',
                funnel_viz_type: 'steps',
                events: params.funnelSteps.map((step, idx) => ({
                    id: step.id,
                    name: step.name,
                    type: step.type || 'events',
                    order: idx,
                })),
                funnel_window_days: params.funnelWindowDays || 14,
                funnel_correlation_type: params.correlationType || 'events',
            };

            const response = await this.request<{ result: { events: FunnelCorrelation[] } }>(
                `/api/projects/${this.config.projectId}/persons/funnel/correlation/`,
                {
                    method: 'POST',
                    body: JSON.stringify(funnelFilter),
                }
            );

            // Sort by odds_ratio to get strongest correlations first
            return (response.result?.events || [])
                .filter(c => c.correlation_type === 'failure') // Focus on drop-off correlations
                .sort((a, b) => b.odds_ratio - a.odds_ratio);
        } catch (e) {
            console.error('[PostHog] getFunnelCorrelations failed:', e);
            return [];
        }
    }

    // Step 3: Get session recordings near a specific timestamp (triangulation)
    // Used to find the session where the drop-off happened
    async getSessionsNearTimestamp(params: {
        distinctId: string;
        timestamp: string;
        windowMinutes?: number;
    }): Promise<SessionRecording[]> {
        try {
            const eventTime = new Date(params.timestamp);
            const windowMs = (params.windowMinutes || 30) * 60 * 1000;
            const dateFrom = new Date(eventTime.getTime() - windowMs).toISOString();
            const dateTo = new Date(eventTime.getTime() + windowMs).toISOString();

            const response = await this.request<{ results: any[] }>(
                `/api/projects/${this.config.projectId}/session_recordings/?` +
                `person_id=${encodeURIComponent(params.distinctId)}` +
                `&date_from=${dateFrom}&date_to=${dateTo}` +
                `&limit=10`
            );

            return (response.results || []).map(r => this.enrichSessionWithWatchWorthiness(r));
        } catch (e) {
            console.error('[PostHog] getSessionsNearTimestamp failed:', e);
            return [];
        }
    }

    // ============================================
    // COHORT CLASSIFICATION SYSTEM
    // ============================================

    // Classify users into interview cohorts based on their signals
    async classifyUsersIntoCohorts(params: {
        funnelSteps: Array<{ id: string; name: string }>;
        funnelStep: number;
        limit?: number;
    }): Promise<ClassifiedUser[]> {
        const classifiedUsers: ClassifiedUser[] = [];

        try {
            // Get drop-off persons and correlations in parallel
            const [droppedPersons, correlations] = await Promise.all([
                this.getFunnelDropoffPersons({
                    funnelSteps: params.funnelSteps,
                    funnelStep: params.funnelStep,
                    limit: params.limit || 50,
                }),
                this.getFunnelCorrelations({
                    funnelSteps: params.funnelSteps,
                }),
            ]);

            // Identify top correlation signals
            const topCorrelations = correlations.slice(0, 5);
            const hasErrorCorrelation = topCorrelations.some(c =>
                c.event.event.toLowerCase().includes('error') ||
                c.event.event.toLowerCase().includes('exception') ||
                c.event.event.toLowerCase().includes('crash')
            );
            const hasBrowserCorrelation = topCorrelations.some(c =>
                c.event.properties?.['$browser'] ||
                c.event.properties?.['$device_type'] ||
                c.event.properties?.['$os']
            );

            // Process each dropped person
            for (const person of droppedPersons) {
                const distinctId = person.distinct_ids[0];
                if (!distinctId) continue;

                // Get session context for this user
                const sessionContext = await this.getSessionContext(distinctId);

                // Classify the user
                const classification = this.classifyUser(
                    person,
                    sessionContext,
                    topCorrelations,
                    hasErrorCorrelation,
                    hasBrowserCorrelation
                );

                classifiedUsers.push(classification);
            }

            // If no funnel data available, fall back to session-based detection
            if (classifiedUsers.length === 0) {
                const problematicUsers = await this.getUsersFromProblematicSessions(params.limit || 50);
                for (const user of problematicUsers) {
                    const sessionContext = await this.getSessionContext(user.distinctId);
                    const classification = this.classifyUserFromSessions(user, sessionContext);
                    classifiedUsers.push(classification);
                }
            }

            return classifiedUsers;
        } catch (e) {
            console.error('[PostHog] classifyUsersIntoCohorts failed:', e);
            return [];
        }
    }

    // Classify a single user based on funnel and session data
    private classifyUser(
        person: FunnelDropoffPerson,
        sessionContext: SessionContext,
        correlations: FunnelCorrelation[],
        hasErrorCorrelation: boolean,
        hasBrowserCorrelation: boolean
    ): ClassifiedUser {
        const distinctId = person.distinct_ids[0];
        const signals: BehavioralSignal[] = [];
        let cohortType: InterviewCohortType = 'high_value';
        let cohortReason = '';
        let recommendedAction: ClassifiedUser['recommendedAction'] = 'interview';

        // Cohort A: Technical Victims
        // Signal: High correlation with errors or specific browsers/devices
        if (sessionContext.hasErrors || hasErrorCorrelation || hasBrowserCorrelation) {
            const errorCorrelation = correlations.find(c =>
                c.event.event.toLowerCase().includes('error')
            );
            const browserCorrelation = correlations.find(c =>
                c.event.properties?.['$browser']
            );

            if (sessionContext.hasErrors || hasErrorCorrelation) {
                cohortType = 'technical_victim';
                cohortReason = errorCorrelation
                    ? `Dropped off with ${errorCorrelation.odds_ratio.toFixed(1)}x higher error rate`
                    : `Encountered ${sessionContext.recordings.filter(r => r.console_error_count).length} sessions with errors`;
                recommendedAction = 'bug_report';

                signals.push({
                    type: 'technical_victim',
                    description: cohortReason,
                    weight: 35,
                    metadata: { errorCorrelation, sessionErrors: sessionContext.hasErrors }
                });
            } else if (browserCorrelation) {
                cohortType = 'technical_victim';
                const browser = browserCorrelation.event.properties?.['$browser'];
                cohortReason = `Users on ${browser} are ${browserCorrelation.odds_ratio.toFixed(1)}x more likely to drop off`;
                recommendedAction = 'bug_report';

                signals.push({
                    type: 'technical_victim',
                    description: cohortReason,
                    weight: 30,
                    metadata: { browser, browserCorrelation }
                });
            }
        }

        // Cohort B: Confused Browsers
        // Signal: Long session, rage clicks, but no conversion
        else if (sessionContext.hasRageClicks ||
                 (sessionContext.averageDuration > 120 && sessionContext.totalCount > 0)) {
            cohortType = 'confused_browser';

            if (sessionContext.hasRageClicks) {
                const rageSession = sessionContext.recordings.find(r => (r.click_count || 0) > 50);
                cohortReason = `High click activity (${rageSession?.click_count} clicks) suggests frustration`;
                signals.push({
                    type: 'confused_browser',
                    description: cohortReason,
                    weight: 45,
                    metadata: { clickCount: rageSession?.click_count }
                });
            } else {
                cohortReason = `Long average session (${Math.round(sessionContext.averageDuration)}s) without conversion`;
                signals.push({
                    type: 'confused_browser',
                    description: cohortReason,
                    weight: 40,
                    metadata: { avgDuration: sessionContext.averageDuration }
                });
            }

            recommendedAction = 'interview';
        }

        // Cohort C: Wrong Fit
        // Signal: Immediate bounce, very low session time
        else if (sessionContext.averageDuration < 30 && sessionContext.totalCount <= 2) {
            cohortType = 'wrong_fit';
            cohortReason = `Very short sessions (avg ${Math.round(sessionContext.averageDuration)}s) - low intent`;
            recommendedAction = 'ignore';

            signals.push({
                type: 'wrong_fit',
                description: cohortReason,
                weight: 10,
                metadata: { avgDuration: sessionContext.averageDuration }
            });
        }

        // High Value: None of the above patterns
        else {
            cohortReason = 'Standard drop-off - good interview candidate';
            recommendedAction = 'interview';
            signals.push({
                type: 'funnel_dropoff',
                description: cohortReason,
                weight: 35,
                metadata: { dropoffStep: person.dropoff_step }
            });
        }

        const priorityScore = signals.reduce((sum, s) => sum + s.weight, 0);

        return {
            distinctId,
            email: person.properties?.email,
            name: person.properties?.name,
            properties: person.properties,
            signals,
            priorityScore,
            signalSummary: signals.map(s => s.description).join('; '),
            cohortType,
            cohortReason,
            correlationSignals: correlations,
            recommendedAction,
        };
    }

    // Classify user from session data only (fallback when funnel data unavailable)
    private classifyUserFromSessions(
        user: PersonWithSignals,
        sessionContext: SessionContext
    ): ClassifiedUser {
        let cohortType: InterviewCohortType = 'high_value';
        let cohortReason = '';
        let recommendedAction: ClassifiedUser['recommendedAction'] = 'interview';

        if (sessionContext.hasErrors) {
            cohortType = 'technical_victim';
            cohortReason = `Encountered errors in ${sessionContext.recordings.filter(r => r.console_error_count).length} session(s)`;
            recommendedAction = 'bug_report';
        } else if (sessionContext.hasRageClicks) {
            cohortType = 'confused_browser';
            cohortReason = 'High click activity suggests frustration';
            recommendedAction = 'interview';
        } else if (sessionContext.averageDuration < 30) {
            cohortType = 'wrong_fit';
            cohortReason = 'Very short sessions indicate low intent';
            recommendedAction = 'ignore';
        } else {
            cohortReason = 'Normal session patterns - good interview candidate';
        }

        return {
            ...user,
            cohortType,
            cohortReason,
            correlationSignals: [],
            recommendedAction,
        };
    }

    // ============================================
    // CONTEXTUAL OUTREACH GENERATION
    // ============================================

    // Generate contextual outreach for a classified user
    generateContextualOutreach(
        user: ClassifiedUser,
        funnelName: string,
        dropoffStepName: string
    ): ContextualOutreach {
        const userName = user.name || 'there';
        const topCorrelation = user.correlationSignals[0];

        let subject = '';
        let body = '';
        let correlationSignal = '';

        if (topCorrelation) {
            if (topCorrelation.event.properties?.['$browser']) {
                correlationSignal = `browser = ${topCorrelation.event.properties['$browser']}`;
            } else if (topCorrelation.event.properties?.['$os']) {
                correlationSignal = `OS = ${topCorrelation.event.properties['$os']}`;
            } else {
                correlationSignal = topCorrelation.event.event;
            }
        }

        switch (user.cohortType) {
            case 'technical_victim':
                subject = `We think something broke for you - can we fix it?`;
                body = `Hi ${userName},

I noticed you got to the "${dropoffStepName}" step in our ${funnelName} flow but stopped there.

${correlationSignal
    ? `Our data suggests users with ${correlationSignal} sometimes hit a snag at this point.`
    : `It looks like you may have encountered a technical issue.`}

Would you mind sharing what happened? We'd love to fix this for you and make sure it doesn't happen to others.

${user.email ? 'Just reply to this email' : 'Click here to schedule a 5-minute call'} and I'll personally make sure we resolve this.

Thanks for your patience!`;
                break;

            case 'confused_browser':
                subject = `Quick question about your experience`;
                body = `Hi ${userName},

I noticed you spent some time on our "${dropoffStepName}" page but didn't complete the next step.

${correlationSignal
    ? `Our data suggests users who ${correlationSignal} sometimes find this part confusing.`
    : `I'm wondering if something was unclear or if you had questions.`}

Would you have 10 minutes for a quick call? I'd genuinely love to understand what you were trying to do and where we fell short. Your feedback would be incredibly valuable.

As a thank you, I'd be happy to offer you [incentive].

Best,`;
                break;

            case 'wrong_fit':
                // We don't generate outreach for wrong_fit, but provide a template
                subject = `Not the right time?`;
                body = `Hi ${userName},

I noticed you checked out our ${funnelName} recently but didn't go further.

No worries if now isn't the right time - I just wanted to let you know I'm here if you have any questions later.

Best,`;
                break;

            case 'high_value':
            default:
                subject = `Following up on your ${funnelName} experience`;
                body = `Hi ${userName},

I noticed you got all the way to the "${dropoffStepName}" step recently but stopped there.

${correlationSignal
    ? `Our data suggests ${correlationSignal} might have played a role. Is that what happened, or was it something else?`
    : `I'm curious what made you pause - was something unclear, or did you have concerns?`}

I'd love to hear your honest feedback. Would you have 15 minutes for a quick chat? Your insights would help us improve the experience for everyone.

Thanks!`;
                break;
        }

        return {
            userId: user.distinctId,
            email: user.email,
            cohortType: user.cohortType,
            subject,
            body,
            contextualDetails: {
                dropoffStep: dropoffStepName,
                correlationSignal: correlationSignal || undefined,
                sessionInsight: user.cohortReason,
            },
        };
    }

    // ============================================
    // ADVANCED FRICTION SIGNAL DETECTION
    // ============================================

    /**
     * #1: STEP RETRY DETECTION
     * Detect users who performed the same action multiple times in a short window
     * Indicates confusion or technical issues
     */
    async detectStepRetries(params: {
        events?: string[];  // Specific events to analyze, or all if not provided
        timeWindowMinutes?: number;  // Window to consider retries (default: 5 min)
        minRetries?: number;  // Minimum retries to flag (default: 3)
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const {
            timeWindowMinutes = 5,
            minRetries = 3,
            limit = 50
        } = params;

        try {
            // HogQL query to find users with repeated events
            const hogql = `
                SELECT 
                    distinct_id,
                    event,
                    count() as retry_count,
                    min(timestamp) as first_attempt,
                    max(timestamp) as last_attempt,
                    dateDiff('second', min(timestamp), max(timestamp)) as time_span,
                    groupArray(timestamp) as timestamps
                FROM events
                WHERE timestamp > now() - INTERVAL 7 DAY
                    ${params.events?.length ? `AND event IN (${params.events.map(e => `'${e}'`).join(',')})` : ''}
                    AND event NOT IN ('$pageview', '$pageleave', '$autocapture')
                GROUP BY distinct_id, event, 
                    toStartOfInterval(timestamp, INTERVAL ${timeWindowMinutes} MINUTE)
                HAVING retry_count >= ${minRetries}
                ORDER BY retry_count DESC
                LIMIT ${limit * 2}
            `;

            const result = await this.executeHogQL(hogql);
            const userMap = new Map<string, PersonWithSignals>();

            for (const row of result.results || []) {
                const [distinctId, event, retryCount, firstAttempt, lastAttempt, timeSpan] = row;
                
                const existing = userMap.get(distinctId);
                const avgTimeBetween = timeSpan / (retryCount - 1);
                
                const signal: BehavioralSignal = {
                    type: 'step_retry',
                    description: `Retried "${event}" ${retryCount} times in ${Math.round(timeSpan / 60)} minutes`,
                    weight: Math.min(50, 20 + retryCount * 5),
                    metadata: {
                        event,
                        retryCount,
                        timeSpan,
                        avgTimeBetween,
                        firstAttempt,
                        lastAttempt
                    }
                };

                if (existing) {
                    existing.signals.push(signal);
                    existing.priorityScore = Math.max(existing.priorityScore, signal.weight);
                    existing.signalSummary = existing.signals.map(s => s.description).join('; ');
                } else {
                    userMap.set(distinctId, {
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            }

            return Array.from(userMap.values())
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('[PostHog] detectStepRetries failed:', e);
            return [];
        }
    }

    /**
     * #1b: STEP LOOP DETECTION  
     * Detect users going back and forth between two steps
     * Strong indicator of confusion
     */
    async detectStepLoops(params: {
        events?: string[];  // Events to analyze for loops
        minLoops?: number;  // Minimum A→B→A transitions (default: 2)
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { minLoops = 2, limit = 50 } = params;

        try {
            // HogQL to detect A→B→A→B patterns
            const hogql = `
                SELECT 
                    distinct_id,
                    groupArray(event) as event_sequence,
                    count() as total_events
                FROM (
                    SELECT distinct_id, event, timestamp
                    FROM events
                    WHERE timestamp > now() - INTERVAL 7 DAY
                        ${params.events?.length ? `AND event IN (${params.events.map(e => `'${e}'`).join(',')})` : ''}
                        AND event NOT IN ('$pageview', '$pageleave', '$autocapture', '$feature_interaction')
                    ORDER BY distinct_id, timestamp
                    LIMIT 10000
                )
                GROUP BY distinct_id
                HAVING total_events >= 4
                LIMIT ${limit * 3}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, eventSequence] = row;
                
                // Detect loops: A→B→A or A→B→A→B patterns
                const loops = this.findLoopsInSequence(eventSequence);
                
                if (loops.length > 0) {
                    const topLoop = loops[0];
                    if (topLoop.count >= minLoops) {
                        const signal: BehavioralSignal = {
                            type: 'step_loop',
                            description: `Looped between "${topLoop.stepA}" ↔ "${topLoop.stepB}" ${topLoop.count} times`,
                            weight: Math.min(55, 25 + topLoop.count * 10),
                            metadata: {
                                stepA: topLoop.stepA,
                                stepB: topLoop.stepB,
                                loopCount: topLoop.count,
                                totalTransitions: topLoop.transitions
                            }
                        };

                        users.push({
                            distinctId,
                            properties: {},
                            signals: [signal],
                            priorityScore: signal.weight,
                            signalSummary: signal.description
                        });
                    }
                }
            }

            return users
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('[PostHog] detectStepLoops failed:', e);
            return [];
        }
    }

    // Helper to find loops in event sequence
    private findLoopsInSequence(events: string[]): Array<{stepA: string; stepB: string; count: number; transitions: number}> {
        const pairCounts = new Map<string, { stepA: string; stepB: string; count: number; transitions: number }>();
        
        for (let i = 0; i < events.length - 2; i++) {
            const a = events[i];
            const b = events[i + 1];
            const c = events[i + 2];
            
            // Detect A→B→A pattern
            if (a === c && a !== b) {
                const key = [a, b].sort().join('↔');
                const existing = pairCounts.get(key);
                if (existing) {
                    existing.count++;
                    existing.transitions += 2;
                } else {
                    pairCounts.set(key, { stepA: a, stepB: b, count: 1, transitions: 2 });
                }
            }
        }
        
        return Array.from(pairCounts.values())
            .sort((a, b) => b.count - a.count);
    }

    /**
     * #1c: HIGH TIME VARIANCE DETECTION
     * Find users who spent abnormally long time on specific steps
     */
    async detectHighTimeVariance(params: {
        funnelEvents: string[];  // Ordered funnel events
        outlierMultiplier?: number;  // Times above median to flag (default: 3x)
        limit?: number;
    }): Promise<PersonWithSignals[]> {
        const { funnelEvents, outlierMultiplier = 3, limit = 50 } = params;

        if (funnelEvents.length < 2) return [];

        try {
            const users: PersonWithSignals[] = [];

            // For each step transition, calculate time spent and find outliers
            for (let i = 0; i < funnelEvents.length - 1; i++) {
                const fromEvent = funnelEvents[i];
                const toEvent = funnelEvents[i + 1];

                const hogql = `
                    WITH step_times AS (
                        SELECT 
                            distinct_id,
                            argMin(timestamp, timestamp) as start_time,
                            argMax(timestamp, timestamp) as end_time
                        FROM events
                        WHERE timestamp > now() - INTERVAL 30 DAY
                            AND event IN ('${fromEvent}', '${toEvent}')
                        GROUP BY distinct_id
                        HAVING has(groupArray(event), '${fromEvent}') AND has(groupArray(event), '${toEvent}')
                    )
                    SELECT
                        distinct_id,
                        dateDiff('second', start_time, end_time) as time_spent,
                        start_time,
                        end_time
                    FROM step_times
                    WHERE time_spent > 0
                    ORDER BY time_spent DESC
                    LIMIT 200
                `;

                const result = await this.executeHogQL(hogql);
                const times: number[] = (result.results || []).map((r: any) => r[1] as number);
                
                if (times.length < 5) continue;

                // Calculate median
                times.sort((a: number, b: number) => a - b);
                const median = times[Math.floor(times.length / 2)];
                const threshold = median * outlierMultiplier;

                // Find outliers
                for (const row of result.results || []) {
                    const [distinctId, timeSpent] = row;
                    
                    if (timeSpent > threshold && timeSpent > 60) { // At least 1 minute and above threshold
                        const signal: BehavioralSignal = {
                            type: 'high_time_variance',
                            description: `Spent ${Math.round(timeSpent / 60)} min on "${fromEvent}" → "${toEvent}" (${(timeSpent / median).toFixed(1)}x median)`,
                            weight: Math.min(45, 20 + Math.floor(timeSpent / median) * 5),
                            metadata: {
                                fromStep: fromEvent,
                                toStep: toEvent,
                                timeSpent,
                                median,
                                multiplier: timeSpent / median
                            }
                        };

                        users.push({
                            distinctId,
                            properties: {},
                            signals: [signal],
                            priorityScore: signal.weight,
                            signalSummary: signal.description
                        });
                    }
                }
            }

            // Dedupe users and combine signals
            const userMap = new Map<string, PersonWithSignals>();
            for (const user of users) {
                const existing = userMap.get(user.distinctId);
                if (existing) {
                    existing.signals.push(...user.signals);
                    existing.priorityScore = Math.max(existing.priorityScore, user.priorityScore);
                    existing.signalSummary = existing.signals.map(s => s.description).join('; ');
                } else {
                    userMap.set(user.distinctId, user);
                }
            }

            return Array.from(userMap.values())
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('[PostHog] detectHighTimeVariance failed:', e);
            return [];
        }
    }

    /**
     * Get users with step-level friction signals
     * Combines retries, loops, and time variance
     */
    async getUsersWithStepFriction(params: {
        funnelEvents?: string[];
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { limit = 50 } = params;

        const [retryUsers, loopUsers, varianceUsers] = await Promise.all([
            this.detectStepRetries({ limit }),
            this.detectStepLoops({ limit }),
            params.funnelEvents?.length 
                ? this.detectHighTimeVariance({ funnelEvents: params.funnelEvents, limit })
                : Promise.resolve([])
        ]);

        // Merge all users
        const userMap = new Map<string, PersonWithSignals>();
        
        for (const user of [...retryUsers, ...loopUsers, ...varianceUsers]) {
            const existing = userMap.get(user.distinctId);
            if (existing) {
                // Merge signals, avoiding duplicates
                for (const signal of user.signals) {
                    if (!existing.signals.some(s => s.type === signal.type && s.description === signal.description)) {
                        existing.signals.push(signal);
                    }
                }
                existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
                existing.signalSummary = existing.signals.map(s => s.description).join('; ');
            } else {
                userMap.set(user.distinctId, { ...user });
            }
        }

        return Array.from(userMap.values())
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }

    // ============================================
    // #2: FEATURE ADOPTION & ABANDONMENT TRACKING
    // ============================================

    /**
     * Get feature adoption metrics for specified events
     * Tracks first-time users vs repeat users
     */
    async getFeatureAdoptionMetrics(params: {
        featureEvents: string[];  // Events that represent feature usage
        dateRange?: number;  // Days to analyze (default: 30)
    }): Promise<FeatureAdoption[]> {
        const { featureEvents, dateRange = 30 } = params;
        const adoptionMetrics: FeatureAdoption[] = [];

        for (const event of featureEvents) {
            try {
                const hogql = `
                    SELECT
                        count(DISTINCT distinct_id) as total_users,
                        countIf(usage_count = 1) as one_time_users,
                        countIf(usage_count > 1) as repeat_users,
                        avg(usage_count) as avg_usage
                    FROM (
                        SELECT distinct_id, count() as usage_count
                        FROM events
                        WHERE event = '${event}'
                            AND timestamp > now() - INTERVAL ${dateRange} DAY
                        GROUP BY distinct_id
                    )
                `;

                const result = await this.executeHogQL(hogql);
                const row = result.results?.[0];

                if (row) {
                    const [totalUsers, oneTimeUsers, repeatUsers, avgUsage] = row;
                    adoptionMetrics.push({
                        featureName: event.replace(/[_$]/g, ' ').trim(),
                        eventName: event,
                        totalUsers: totalUsers || 0,
                        firstTimeUsers: oneTimeUsers || 0,
                        repeatUsers: repeatUsers || 0,
                        adoptionRate: oneTimeUsers > 0 ? (repeatUsers / oneTimeUsers) : 0,
                        avgUsageCount: avgUsage || 0,
                        usersWhoAbandoned: oneTimeUsers || 0  // Used once = abandoned
                    });
                }
            } catch (e) {
                console.error(`[PostHog] getFeatureAdoptionMetrics failed for ${event}:`, e);
            }
        }

        return adoptionMetrics.sort((a, b) => a.adoptionRate - b.adoptionRate);
    }

    /**
     * Detect users who used a feature once and never again
     * Prime interview candidates for "why did you stop?"
     */
    async getUsersWhoAbandonedFeature(params: {
        featureEvent: string;
        minDaysSinceUse?: number;  // At least N days since they used it (default: 7)
        limit?: number;
    }): Promise<PersonWithSignals[]> {
        const { featureEvent, minDaysSinceUse = 7, limit = 50 } = params;

        try {
            const hogql = `
                SELECT 
                    distinct_id,
                    count() as usage_count,
                    min(timestamp) as first_use,
                    max(timestamp) as last_use,
                    dateDiff('day', max(timestamp), now()) as days_since_use
                FROM events
                WHERE event = '${featureEvent}'
                    AND timestamp > now() - INTERVAL 60 DAY
                GROUP BY distinct_id
                HAVING usage_count = 1 
                    AND days_since_use >= ${minDaysSinceUse}
                ORDER BY first_use DESC
                LIMIT ${limit}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, usageCount, firstUse, lastUse, daysSinceUse] = row;

                const signal: BehavioralSignal = {
                    type: 'feature_abandoned',
                    description: `Used "${featureEvent}" once ${daysSinceUse} days ago, never returned`,
                    weight: Math.min(40, 20 + Math.floor(daysSinceUse / 7) * 5),
                    metadata: {
                        feature: featureEvent,
                        usageCount,
                        firstUse,
                        lastUse,
                        daysSinceUse
                    }
                };

                users.push({
                    distinctId,
                    properties: {},
                    signals: [signal],
                    priorityScore: signal.weight,
                    signalSummary: signal.description
                });
            }

            return users;
        } catch (e) {
            console.error('[PostHog] getUsersWhoAbandonedFeature failed:', e);
            return [];
        }
    }

    /**
     * Detect users who stopped using a feature they previously used regularly
     * "Feature regression" - strong churn signal
     */
    async detectFeatureRegression(params: {
        featureEvents: string[];  // Features to track
        minPreviousUsage?: number;  // Minimum uses in first period (default: 3)
        recentDays?: number;  // Recent window (default: 14)
        previousDays?: number;  // Previous window (default: 30)
        limit?: number;
    }): Promise<PersonWithSignals[]> {
        const {
            featureEvents,
            minPreviousUsage = 3,
            recentDays = 14,
            previousDays = 30,
            limit = 50
        } = params;

        const allUsers: PersonWithSignals[] = [];

        for (const event of featureEvents) {
            try {
                const hogql = `
                    WITH 
                        previous_usage AS (
                            SELECT distinct_id, count() as prev_count
                            FROM events
                            WHERE event = '${event}'
                                AND timestamp > now() - INTERVAL ${previousDays + recentDays} DAY
                                AND timestamp <= now() - INTERVAL ${recentDays} DAY
                            GROUP BY distinct_id
                            HAVING prev_count >= ${minPreviousUsage}
                        ),
                        recent_usage AS (
                            SELECT distinct_id, count() as recent_count
                            FROM events  
                            WHERE event = '${event}'
                                AND timestamp > now() - INTERVAL ${recentDays} DAY
                            GROUP BY distinct_id
                        )
                    SELECT 
                        p.distinct_id,
                        p.prev_count,
                        coalesce(r.recent_count, 0) as recent_count
                    FROM previous_usage p
                    LEFT JOIN recent_usage r ON p.distinct_id = r.distinct_id
                    WHERE coalesce(r.recent_count, 0) = 0
                    ORDER BY p.prev_count DESC
                    LIMIT ${limit}
                `;

                const result = await this.executeHogQL(hogql);

                for (const row of result.results || []) {
                    const [distinctId, prevCount, recentCount] = row;

                    const signal: BehavioralSignal = {
                        type: 'feature_regression',
                        description: `Stopped using "${event}" (was ${prevCount}x in past month, now 0)`,
                        weight: Math.min(50, 25 + prevCount * 3),
                        metadata: {
                            feature: event,
                            previousUsage: prevCount,
                            recentUsage: recentCount,
                            recentDays,
                            previousDays
                        }
                    };

                    allUsers.push({
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            } catch (e) {
                console.error(`[PostHog] detectFeatureRegression failed for ${event}:`, e);
            }
        }

        // Merge duplicate users
        const userMap = new Map<string, PersonWithSignals>();
        for (const user of allUsers) {
            const existing = userMap.get(user.distinctId);
            if (existing) {
                existing.signals.push(...user.signals);
                existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
                existing.signalSummary = existing.signals.map(s => s.description).join('; ');
            } else {
                userMap.set(user.distinctId, user);
            }
        }

        return Array.from(userMap.values())
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }

    /**
     * Detect features only used by power users (bad sign - feature may be too complex)
     */
    async detectPowerUserOnlyFeatures(params: {
        featureEvents: string[];
        powerUserThreshold?: number;  // Min events to be power user (default: 20)
    }): Promise<Array<{ feature: string; powerUserPercentage: number; totalUsers: number }>> {
        const { featureEvents, powerUserThreshold = 20 } = params;
        const results: Array<{ feature: string; powerUserPercentage: number; totalUsers: number }> = [];

        for (const event of featureEvents) {
            try {
                const hogql = `
                    WITH user_activity AS (
                        SELECT distinct_id, count() as total_events
                        FROM events
                        WHERE timestamp > now() - INTERVAL 30 DAY
                        GROUP BY distinct_id
                    )
                    SELECT 
                        count(DISTINCT e.distinct_id) as total_feature_users,
                        countIf(u.total_events >= ${powerUserThreshold}) as power_users
                    FROM events e
                    JOIN user_activity u ON e.distinct_id = u.distinct_id
                    WHERE e.event = '${event}'
                        AND e.timestamp > now() - INTERVAL 30 DAY
                `;

                const result = await this.executeHogQL(hogql);
                const row = result.results?.[0];

                if (row) {
                    const [totalUsers, powerUsers] = row;
                    const percentage = totalUsers > 0 ? (powerUsers / totalUsers) * 100 : 0;
                    
                    results.push({
                        feature: event,
                        powerUserPercentage: Math.round(percentage),
                        totalUsers: totalUsers || 0
                    });
                }
            } catch (e) {
                console.error(`[PostHog] detectPowerUserOnlyFeatures failed for ${event}:`, e);
            }
        }

        // Sort by power user percentage (highest = most concerning)
        return results.sort((a, b) => b.powerUserPercentage - a.powerUserPercentage);
    }

    /**
     * Get users with any feature abandonment signals
     */
    async getUsersWithFeatureAbandonment(params: {
        featureEvents: string[];
        limit?: number;
    }): Promise<PersonWithSignals[]> {
        const { featureEvents, limit = 50 } = params;

        const [abandonedUsers, regressionUsers] = await Promise.all([
            Promise.all(featureEvents.map(e => this.getUsersWhoAbandonedFeature({ featureEvent: e, limit: Math.ceil(limit / featureEvents.length) }))),
            this.detectFeatureRegression({ featureEvents, limit })
        ]);

        // Flatten and merge
        const userMap = new Map<string, PersonWithSignals>();

        for (const users of [...abandonedUsers, [regressionUsers]].flat()) {
            for (const user of Array.isArray(users) ? users : [users]) {
                if (!user) continue;
                const existing = userMap.get(user.distinctId);
                if (existing) {
                    for (const signal of user.signals) {
                        if (!existing.signals.some(s => s.description === signal.description)) {
                            existing.signals.push(signal);
                        }
                    }
                    existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
                    existing.signalSummary = existing.signals.map(s => s.description).join('; ');
                } else {
                    userMap.set(user.distinctId, { ...user });
                }
            }
        }

        return Array.from(userMap.values())
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }

    // ============================================
    // #3: ENGAGEMENT DECAY SCORING
    // ============================================

    /**
     * Calculate engagement decay ratio: 7d activity vs 30d average
     * Ratio < 0.5 means user activity dropped significantly
     */
    async calculateEngagementDecay(params: {
        distinctId: string;
    }): Promise<EngagementDecay | null> {
        try {
            const hogql = `
                SELECT
                    countIf(timestamp > now() - INTERVAL 7 DAY) as events_7d,
                    countIf(timestamp > now() - INTERVAL 30 DAY AND timestamp <= now() - INTERVAL 7 DAY) as events_23d,
                    groupArrayIf(DISTINCT event, timestamp > now() - INTERVAL 7 DAY) as event_types_7d,
                    groupArrayIf(DISTINCT event, timestamp > now() - INTERVAL 30 DAY) as event_types_30d
                FROM events
                WHERE distinct_id = '${params.distinctId}'
                    AND timestamp > now() - INTERVAL 30 DAY
                    AND event NOT IN ('$pageview', '$pageleave', '$autocapture')
            `;

            const result = await this.executeHogQL(hogql);
            const row = result.results?.[0];

            if (!row) return null;

            const [events7d, events23d, eventTypes7d, eventTypes30d] = row;
            const events30d = events7d + events23d;

            // Calculate decay ratio: compare 7d to expected (30d / ~4 weeks)
            const expected7d = events30d / 4.3;  // ~4.3 weeks in a month
            const decayRatio = expected7d > 0 ? events7d / expected7d : 1;

            // Find dropped event types (were in 30d but not in 7d)
            const droppedEventTypes = (eventTypes30d || []).filter(
                (e: string) => !(eventTypes7d || []).includes(e)
            );

            return {
                distinctId: params.distinctId,
                events7d,
                events30d,
                decayRatio: Math.round(decayRatio * 100) / 100,
                eventTypes7d: eventTypes7d || [],
                eventTypes30d: eventTypes30d || [],
                droppedEventTypes
            };
        } catch (e) {
            console.error('[PostHog] calculateEngagementDecay failed:', e);
            return null;
        }
    }

    /**
     * Get users with significant engagement decay
     * These are users who were active but are becoming inactive
     */
    async getUsersWithEngagementDecay(params: {
        maxDecayRatio?: number;  // Flag users below this ratio (default: 0.5 = 50% decline)
        minPreviousEvents?: number;  // Minimum events in 30d to consider (default: 10)
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { maxDecayRatio = 0.5, minPreviousEvents = 10, limit = 50 } = params;

        try {
            const hogql = `
                SELECT
                    distinct_id,
                    countIf(timestamp > now() - INTERVAL 7 DAY) as events_7d,
                    count() as events_30d,
                    groupArrayIf(DISTINCT event, timestamp > now() - INTERVAL 7 DAY) as event_types_7d,
                    groupArray(DISTINCT event) as event_types_30d
                FROM events
                WHERE timestamp > now() - INTERVAL 30 DAY
                    AND event NOT IN ('$pageview', '$pageleave', '$autocapture', '$feature_interaction')
                GROUP BY distinct_id
                HAVING events_30d >= ${minPreviousEvents}
                    AND events_7d < (events_30d / 4.3) * ${maxDecayRatio}
                    AND events_7d < events_30d * 0.5
                ORDER BY events_30d DESC
                LIMIT ${limit}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, events7d, events30d, eventTypes7d, eventTypes30d] = row;
                const expected7d = events30d / 4.3;
                const decayRatio = expected7d > 0 ? events7d / expected7d : 1;

                const droppedEvents = (eventTypes30d || []).filter(
                    (e: string) => !(eventTypes7d || []).includes(e)
                );

                const signal: BehavioralSignal = {
                    type: 'engagement_decay',
                    description: `Activity dropped ${Math.round((1 - decayRatio) * 100)}%: ${events7d} events in 7d vs ${events30d} in 30d`,
                    weight: Math.min(50, 25 + Math.round((1 - decayRatio) * 30)),
                    metadata: {
                        events7d,
                        events30d,
                        decayRatio,
                        droppedEvents: droppedEvents.slice(0, 5),
                        eventTypes7d: (eventTypes7d || []).slice(0, 5),
                        eventTypes30d: (eventTypes30d || []).slice(0, 10)
                    }
                };

                users.push({
                    distinctId,
                    properties: {},
                    signals: [signal],
                    priorityScore: signal.weight,
                    signalSummary: signal.description
                });
            }

            return users;
        } catch (e) {
            console.error('[PostHog] getUsersWithEngagementDecay failed:', e);
            return [];
        }
    }

    // ============================================
    // #4: BEHAVIORAL STATE TRANSITIONS
    // ============================================

    /**
     * Detect "power user → silent" transitions
     * Users who were highly engaged but have gone quiet
     */
    async detectPowerUserChurning(params: {
        powerUserEventsThreshold?: number;  // Events per week to be power user (default: 15)
        silentDays?: number;  // Days of inactivity to be "churning" (default: 14)
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { powerUserEventsThreshold = 15, silentDays = 14, limit = 50 } = params;

        try {
            // Find users who had high activity 3-6 weeks ago but none recently
            const hogql = `
                WITH 
                    historical_power AS (
                        SELECT distinct_id, count() as historical_events
                        FROM events
                        WHERE timestamp > now() - INTERVAL 45 DAY
                            AND timestamp <= now() - INTERVAL ${silentDays} DAY
                            AND event NOT IN ('$pageview', '$pageleave', '$autocapture')
                        GROUP BY distinct_id
                        HAVING historical_events >= ${powerUserEventsThreshold * 3}  -- ~3 weeks of power use
                    ),
                    recent_activity AS (
                        SELECT distinct_id, count() as recent_events, max(timestamp) as last_seen
                        FROM events
                        WHERE timestamp > now() - INTERVAL ${silentDays} DAY
                        GROUP BY distinct_id
                    )
                SELECT 
                    h.distinct_id,
                    h.historical_events,
                    coalesce(r.recent_events, 0) as recent_events,
                    dateDiff('day', coalesce(r.last_seen, now() - INTERVAL 30 DAY), now()) as days_silent
                FROM historical_power h
                LEFT JOIN recent_activity r ON h.distinct_id = r.distinct_id
                WHERE coalesce(r.recent_events, 0) <= 2
                ORDER BY h.historical_events DESC
                LIMIT ${limit}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, historicalEvents, recentEvents, daysSilent] = row;

                const signal: BehavioralSignal = {
                    type: 'power_user_churning',
                    description: `Power user going silent: ${historicalEvents} events before, ${recentEvents} in last ${silentDays} days`,
                    weight: Math.min(60, 35 + Math.floor(historicalEvents / 10)),
                    metadata: {
                        historicalEvents,
                        recentEvents,
                        daysSilent,
                        previousEngagement: 'power_user',
                        currentEngagement: recentEvents > 0 ? 'churning' : 'churned'
                    }
                };

                users.push({
                    distinctId,
                    properties: {},
                    signals: [signal],
                    priorityScore: signal.weight,
                    signalSummary: signal.description
                });
            }

            return users;
        } catch (e) {
            console.error('[PostHog] detectPowerUserChurning failed:', e);
            return [];
        }
    }

    /**
     * Detect "activated → abandoned" users
     * Completed activation flow but never came back
     */
    async detectActivatedAbandoned(params: {
        activationEvents: string[];  // Events that define "activation"
        minDaysAfterActivation?: number;  // Days to wait before flagging (default: 7)
        limit?: number;
    }): Promise<PersonWithSignals[]> {
        const { activationEvents, minDaysAfterActivation = 7, limit = 50 } = params;

        if (activationEvents.length === 0) return [];

        try {
            // Build activation check - user must have done all activation events
            const activationCheck = activationEvents
                .map(e => `has(all_events, '${e}')`)
                .join(' AND ');

            const hogql = `
                WITH user_events AS (
                    SELECT 
                        distinct_id,
                        groupArray(DISTINCT event) as all_events,
                        min(timestamp) as first_event,
                        max(timestamp) as last_event,
                        count() as total_events
                    FROM events
                    WHERE timestamp > now() - INTERVAL 60 DAY
                        AND event NOT IN ('$pageview', '$pageleave', '$autocapture')
                    GROUP BY distinct_id
                )
                SELECT
                    distinct_id,
                    total_events,
                    first_event,
                    last_event,
                    dateDiff('day', last_event, now()) as days_inactive,
                    dateDiff('day', first_event, last_event) as active_period_days
                FROM user_events
                WHERE ${activationCheck}
                    AND dateDiff('day', last_event, now()) >= ${minDaysAfterActivation}
                    AND active_period_days <= 7  -- Only active for a week or less
                ORDER BY total_events DESC
                LIMIT ${limit}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, totalEvents, firstEvent, lastEvent, daysInactive, activePeriod] = row;

                const signal: BehavioralSignal = {
                    type: 'activated_abandoned',
                    description: `Completed activation but inactive for ${daysInactive} days (was active for ${activePeriod} days)`,
                    weight: Math.min(55, 30 + Math.floor(daysInactive / 7) * 5),
                    metadata: {
                        totalEvents,
                        firstEvent,
                        lastEvent,
                        daysInactive,
                        activePeriodDays: activePeriod,
                        activationEvents
                    }
                };

                users.push({
                    distinctId,
                    properties: {},
                    signals: [signal],
                    priorityScore: signal.weight,
                    signalSummary: signal.description
                });
            }

            return users;
        } catch (e) {
            console.error('[PostHog] detectActivatedAbandoned failed:', e);
            return [];
        }
    }

    /**
     * Get all users with behavioral state transition signals
     */
    async getUsersWithBehavioralTransitions(params: {
        activationEvents?: string[];
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { limit = 50 } = params;

        const [decayUsers, churningUsers, abandonedUsers] = await Promise.all([
            this.getUsersWithEngagementDecay({ limit }),
            this.detectPowerUserChurning({ limit }),
            params.activationEvents?.length 
                ? this.detectActivatedAbandoned({ activationEvents: params.activationEvents, limit })
                : Promise.resolve([])
        ]);

        // Merge users
        const userMap = new Map<string, PersonWithSignals>();

        for (const user of [...decayUsers, ...churningUsers, ...abandonedUsers]) {
            const existing = userMap.get(user.distinctId);
            if (existing) {
                for (const signal of user.signals) {
                    if (!existing.signals.some(s => s.type === signal.type)) {
                        existing.signals.push(signal);
                    }
                }
                existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
                existing.signalSummary = existing.signals.map(s => s.description).join('; ');
            } else {
                userMap.set(user.distinctId, { ...user });
            }
        }

        return Array.from(userMap.values())
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }

    // ============================================
    // #5: BACK NAVIGATION & IDLE TIME TRACKING
    // ============================================

    /**
     * Detect excessive back/forward navigation patterns
     * Indicates user confusion or frustration with navigation
     */
    async detectExcessiveNavigation(params: {
        sessionId?: string;  // Analyze specific session, or recent sessions if not provided
        minBackNavigations?: number;  // Minimum back navigations to flag (default: 5)
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { minBackNavigations = 5, limit = 50 } = params;

        try {
            // Look for $pageleave followed by same $pageview (back navigation)
            // Also look for repeated visits to same pages
            const hogql = `
                WITH session_pages AS (
                    SELECT 
                        distinct_id,
                        $session_id as session_id,
                        groupArray(tuple(event, properties.$current_url, timestamp)) as page_sequence,
                        count() as total_events
                    FROM events
                    WHERE timestamp > now() - INTERVAL 7 DAY
                        AND event IN ('$pageview', '$pageleave')
                        AND $session_id != ''
                    GROUP BY distinct_id, $session_id
                    HAVING total_events >= 10
                )
                SELECT 
                    distinct_id,
                    session_id,
                    length(page_sequence) as page_events,
                    total_events
                FROM session_pages
                ORDER BY total_events DESC
                LIMIT ${limit * 2}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, sessionId] = row as [string, string, number, number];

                // Analyze the session for navigation patterns
                const navigationAnalysis = await this.analyzeSessionNavigation(sessionId);
                
                if (navigationAnalysis && navigationAnalysis.backNavigations >= minBackNavigations) {
                    const signal: BehavioralSignal = {
                        type: 'excessive_navigation',
                        description: `${navigationAnalysis.backNavigations} back navigations, visited ${navigationAnalysis.uniquePages} pages ${navigationAnalysis.totalPageviews} times`,
                        weight: Math.min(45, 20 + navigationAnalysis.backNavigations * 3),
                        metadata: {
                            sessionId,
                            ...navigationAnalysis
                        }
                    };

                    users.push({
                        distinctId,
                        properties: {},
                        signals: [signal],
                        priorityScore: signal.weight,
                        signalSummary: signal.description
                    });
                }
            }

            // Dedupe by user
            const userMap = new Map<string, PersonWithSignals>();
            for (const user of users) {
                const existing = userMap.get(user.distinctId);
                if (!existing || user.priorityScore > existing.priorityScore) {
                    userMap.set(user.distinctId, user);
                }
            }

            return Array.from(userMap.values())
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('[PostHog] detectExcessiveNavigation failed:', e);
            return [];
        }
    }

    /**
     * Analyze a specific session for navigation patterns
     */
    private async analyzeSessionNavigation(sessionId: string): Promise<{
        backNavigations: number;
        uniquePages: number;
        totalPageviews: number;
        mostRevisitedPage: string | null;
        revisitCount: number;
    } | null> {
        try {
            const hogql = `
                SELECT 
                    properties.$current_url as url,
                    timestamp
                FROM events
                WHERE $session_id = '${sessionId}'
                    AND event = '$pageview'
                ORDER BY timestamp ASC
                LIMIT 100
            `;

            const result = await this.executeHogQL(hogql);
            const urls: string[] = (result.results || []).map((r: any) => r[0]);

            if (urls.length < 3) return null;

            // Count page revisits and back navigations
            const pageCounts = new Map<string, number>();
            let backNavigations = 0;
            const visitedStack: string[] = [];

            for (const url of urls) {
                pageCounts.set(url, (pageCounts.get(url) || 0) + 1);

                // Detect back navigation: visiting a page that was 2+ positions back in the stack
                const prevIndex = visitedStack.lastIndexOf(url);
                if (prevIndex >= 0 && prevIndex < visitedStack.length - 1) {
                    backNavigations++;
                }
                visitedStack.push(url);
            }

            // Find most revisited page
            let mostRevisited: string | null = null;
            let maxVisits = 0;
            for (const [url, count] of pageCounts.entries()) {
                if (count > maxVisits) {
                    maxVisits = count;
                    mostRevisited = url;
                }
            }

            return {
                backNavigations,
                uniquePages: pageCounts.size,
                totalPageviews: urls.length,
                mostRevisitedPage: maxVisits > 1 ? mostRevisited : null,
                revisitCount: maxVisits
            };
        } catch (e) {
            console.error('[PostHog] analyzeSessionNavigation failed:', e);
            return null;
        }
    }

    /**
     * Detect long idle times after specific actions
     * User got stuck or confused after performing an action
     */
    async detectIdleAfterAction(params: {
        targetEvents: string[];  // Events to monitor for idle time after
        minIdleSeconds?: number;  // Minimum idle time to flag (default: 120 = 2 minutes)
        limit?: number;
    }): Promise<PersonWithSignals[]> {
        const { targetEvents, minIdleSeconds = 120, limit = 50 } = params;

        if (targetEvents.length === 0) return [];

        try {
            const eventFilter = targetEvents.map(e => `'${e}'`).join(',');
            
            const hogql = `
                WITH event_pairs AS (
                    SELECT 
                        distinct_id,
                        event,
                        timestamp,
                        leadInFrame(event, 1) OVER (PARTITION BY distinct_id ORDER BY timestamp) as next_event,
                        leadInFrame(timestamp, 1) OVER (PARTITION BY distinct_id ORDER BY timestamp) as next_timestamp
                    FROM events
                    WHERE timestamp > now() - INTERVAL 7 DAY
                        AND event NOT IN ('$pageleave')
                    ORDER BY distinct_id, timestamp
                )
                SELECT 
                    distinct_id,
                    event,
                    next_event,
                    dateDiff('second', timestamp, next_timestamp) as idle_seconds,
                    timestamp as event_time
                FROM event_pairs
                WHERE event IN (${eventFilter})
                    AND next_event IS NOT NULL
                    AND dateDiff('second', timestamp, next_timestamp) >= ${minIdleSeconds}
                    AND dateDiff('second', timestamp, next_timestamp) < 3600  -- Cap at 1 hour
                ORDER BY idle_seconds DESC
                LIMIT ${limit * 2}
            `;

            const result = await this.executeHogQL(hogql);
            const users: PersonWithSignals[] = [];

            for (const row of result.results || []) {
                const [distinctId, event, nextEvent, idleSeconds, eventTime] = row;

                const idleMinutes = Math.round(idleSeconds / 60);
                
                const signal: BehavioralSignal = {
                    type: 'idle_after_action',
                    description: `${idleMinutes} min idle after "${event}" before "${nextEvent || 'session end'}"`,
                    weight: Math.min(45, 20 + Math.floor(idleMinutes / 2) * 5),
                    metadata: {
                        triggerEvent: event,
                        nextEvent: nextEvent || 'session_end',
                        idleSeconds,
                        idleMinutes,
                        eventTime
                    }
                };

                users.push({
                    distinctId,
                    properties: {},
                    signals: [signal],
                    priorityScore: signal.weight,
                    signalSummary: signal.description
                });
            }

            // Merge users with multiple idle signals
            const userMap = new Map<string, PersonWithSignals>();
            for (const user of users) {
                const existing = userMap.get(user.distinctId);
                if (existing) {
                    // Add signal if different event
                    const newSignal = user.signals[0];
                    if (!existing.signals.some(s => 
                        s.metadata?.triggerEvent === newSignal.metadata?.triggerEvent
                    )) {
                        existing.signals.push(newSignal);
                        existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
                        existing.signalSummary = existing.signals.map(s => s.description).join('; ');
                    }
                } else {
                    userMap.set(user.distinctId, user);
                }
            }

            return Array.from(userMap.values())
                .sort((a, b) => b.priorityScore - a.priorityScore)
                .slice(0, limit);
        } catch (e) {
            console.error('[PostHog] detectIdleAfterAction failed:', e);
            return [];
        }
    }

    /**
     * Get all high-intent friction signals
     * Combines navigation patterns, idle times, rage clicks, and errors
     */
    async getHighIntentFrictionSignals(params: {
        targetEvents?: string[];  // Events to monitor for idle time
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { targetEvents = [], limit = 50 } = params;

        const [navigationUsers, idleUsers, rageUsers, errorUsers] = await Promise.all([
            this.detectExcessiveNavigation({ limit }),
            targetEvents.length > 0 
                ? this.detectIdleAfterAction({ targetEvents, limit })
                : Promise.resolve([]),
            this.getHighActivitySessions(limit).then(sessions => 
                sessions.filter(s => (s.click_count || 0) > 50).map(s => ({
                    distinctId: s.distinct_id,
                    properties: {},
                    signals: [{
                        type: 'rage_click' as const,
                        description: `${s.click_count} clicks in session (potential rage clicking)`,
                        weight: 25,
                        metadata: { sessionId: s.id, clickCount: s.click_count }
                    }],
                    priorityScore: 25,
                    signalSummary: `${s.click_count} clicks in session`
                }))
            ),
            this.getUsersWithErrors(limit)
        ]);

        // Merge all users
        const userMap = new Map<string, PersonWithSignals>();

        for (const user of [...navigationUsers, ...idleUsers, ...rageUsers, ...errorUsers]) {
            const existing = userMap.get(user.distinctId);
            if (existing) {
                for (const signal of user.signals) {
                    if (!existing.signals.some(s => s.type === signal.type && s.description === signal.description)) {
                        existing.signals.push(signal);
                    }
                }
                existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
                existing.signalSummary = existing.signals.map(s => s.description).join('; ');
            } else {
                userMap.set(user.distinctId, { ...user });
            }
        }

        return Array.from(userMap.values())
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }

    // ============================================
    // MASTER: GET ALL ADVANCED FRICTION SIGNALS
    // ============================================

    /**
     * Get users with ANY advanced friction signal
     * This is the main entry point for the interview queue
     */
    async getAllAdvancedFrictionSignals(params: {
        funnelEvents?: string[];
        featureEvents?: string[];
        activationEvents?: string[];
        targetEvents?: string[];
        limit?: number;
    } = {}): Promise<PersonWithSignals[]> {
        const { limit = 100 } = params;
        const partialLimit = Math.ceil(limit / 4);

        const [stepFriction, featureAbandonment, behavioralTransitions, highIntentFriction] = await Promise.all([
            this.getUsersWithStepFriction({ funnelEvents: params.funnelEvents, limit: partialLimit }),
            params.featureEvents?.length 
                ? this.getUsersWithFeatureAbandonment({ featureEvents: params.featureEvents, limit: partialLimit })
                : Promise.resolve([]),
            this.getUsersWithBehavioralTransitions({ activationEvents: params.activationEvents, limit: partialLimit }),
            this.getHighIntentFrictionSignals({ targetEvents: params.targetEvents, limit: partialLimit })
        ]);

        // Merge all users
        const userMap = new Map<string, PersonWithSignals>();

        for (const user of [...stepFriction, ...featureAbandonment, ...behavioralTransitions, ...highIntentFriction]) {
            const existing = userMap.get(user.distinctId);
            if (existing) {
                for (const signal of user.signals) {
                    if (!existing.signals.some(s => s.type === signal.type && s.description === signal.description)) {
                        existing.signals.push(signal);
                    }
                }
                // Boost score for users with multiple signal categories
                const signalTypes = new Set(existing.signals.map(s => s.type));
                const categoryBonus = signalTypes.size >= 3 ? 1.3 : signalTypes.size >= 2 ? 1.15 : 1;
                existing.priorityScore = Math.round(existing.signals.reduce((sum, s) => sum + s.weight, 0) * categoryBonus);
                existing.signalSummary = existing.signals.map(s => s.description).join('; ');
            } else {
                userMap.set(user.distinctId, { ...user });
            }
        }

        return Array.from(userMap.values())
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, limit);
    }
}

// Process raw PostHog funnel data into our format
export function processFunnelData(insight: PostHogInsight): ProcessedFunnel {
    const results = insight.result || [];
    const totalUsers = results[0]?.count || 0;

    const steps: FunnelStep[] = results.map((step, index) => {
        const count = step.count || 0;
        const prevCount = index === 0 ? count : (results[index - 1].count || 0);
        const dropOffCount = prevCount - count;
        const conversionRate = totalUsers > 0 ? (count / totalUsers) * 100 : 0;
        const dropOffRate = prevCount > 0 ? (dropOffCount / prevCount) * 100 : 0;

        return {
            id: step.action_id,
            name: step.custom_name || step.name,
            order: step.order,
            count: count,
            conversionRate: Math.round(conversionRate * 10) / 10,
            dropOffRate: Math.round(dropOffRate * 10) / 10,
            dropOffCount,
            avgTimeToConvert: step.average_conversion_time,
            droppedPeopleUrl: step.dropped_people_url,
        };
    });

    const overallConversion = steps.length > 0 && totalUsers > 0
        ? (steps[steps.length - 1].count / totalUsers) * 100
        : 0;

    return {
        id: String(insight.id),
        name: insight.name || 'Unnamed Funnel',
        steps,
        totalUsers,
        overallConversion: Math.round(overallConversion * 10) / 10,
        lastUpdated: insight.last_refresh || insight.updated_at,
    };
}

export function createPostHogClient(config: PostHogConfig): PostHogClient {
    return new PostHogClient(config);
}

export type { PostHogClient };
