// PostHog Types
export interface PostHogFunnel {
    id: string;
    name: string;
    steps: FunnelStep[];
}

export interface FunnelStep {
    id: string;
    name: string;
    eventName: string;
    conversionRate: number;
    dropOffRate: number;
    userCount: number;
}

export interface DropOffUser {
    id: string;
    email?: string;
    name?: string;
    distinctId: string;
    lastStep: FunnelStep;
    droppedAt: Date;
    properties: Record<string, unknown>;
    interviewStatus: 'pending' | 'scheduled' | 'completed' | 'declined';
}

// Interview Types
export interface Interview {
    id: string;
    userId: string;
    funnelId: string;
    dropOffStep: string;
    status: 'scheduled' | 'in-progress' | 'completed' | 'failed' | 'declined';
    scheduledAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    transcript?: TranscriptEntry[];
    insights?: InterviewInsights;
}

export interface TranscriptEntry {
    speaker: 'ai' | 'user';
    content: string;
    timestamp: Date;
    sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface InterviewInsights {
    summary: string;
    painPoints: string[];
    suggestions: string[];
    themes: Theme[];
    sentiment: 'positive' | 'neutral' | 'negative';
    recoveryPotential: 'high' | 'medium' | 'low';
}

export interface Theme {
    name: string;
    count: number;
    sentiment: 'positive' | 'neutral' | 'negative';
    quotes: string[];
}

// Dashboard Types
export interface DashboardStats {
    totalFunnels: number;
    totalDropOffs: number;
    interviewsCompleted: number;
    recoveryRate: number;
}

export interface AggregatedInsights {
    topPainPoints: Array<{ issue: string; count: number; severity: 'high' | 'medium' | 'low' }>;
    topThemes: Theme[];
    overallSentiment: {
        positive: number;
        neutral: number;
        negative: number;
    };
    recoveryActions: Array<{
        action: string;
        priority: 'urgent' | 'high' | 'medium' | 'low';
        estimatedImpact: string;
    }>;
}
