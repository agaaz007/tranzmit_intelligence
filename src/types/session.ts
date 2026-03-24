// Types for session storage and replay

export interface SessionListItem {
  id: string;
  projectId: string;
  name: string;
  source: 'upload' | 'posthog' | 'mixpanel' | 'amplitude';
  posthogSessionId?: string;
  distinctId?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  eventCount: number;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  analysis?: SessionAnalysis;
  multimodalStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  multimodalAnalysis?: MultimodalAnalysis;
  hasEvents: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionAnalysis {
  summary: string;
  user_intent: string;
  tags: string[];
  went_well: string[];
  frustration_points: FrustrationPoint[];
  ux_rating: number;
  description: string;
}

export interface FrustrationPoint {
  timestamp: string;
  issue: string;
}

export interface MultimodalFrictionPoint {
  timestamp: string;
  dom_evidence: string;
  visual_evidence: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  product_fix: string;
}

export interface MultimodalAnalysis {
  summary: string;
  user_intent: string;
  tags: string[];
  went_well: string[];
  friction_points: MultimodalFrictionPoint[];
  ux_rating: number;
  description: string;
  visual_insights: string[];
  frames_analyzed: number;
}

export interface SessionWithEvents extends SessionListItem {
  events: RRWebEvent[];
}

export interface RRWebEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  failed: number;
  errors?: string[];
}

export interface CreateSessionInput {
  projectId: string;
  name: string;
  events: RRWebEvent[];
  source: 'upload' | 'posthog' | 'mixpanel' | 'amplitude';
  posthogSessionId?: string;
  distinctId?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionsListResponse {
  sessions: SessionListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface EnhancedCriticalIssue {
  title: string;
  description: string;
  frequency: string;
  severity: 'critical' | 'high' | 'medium';
  recommendation: string;
  sessionIds: string[];
  sessionNames: string[];
  evidenceSessionCount?: number;
}

export interface SynthesizedInsightData {
  id: string;
  projectId: string;
  sessionCount: number;
  criticalIssues: EnhancedCriticalIssue[];
  patternSummary: string;
  topUserGoals: Array<{ goal: string; success_rate: string }>;
  immediateActions: string[];
  lastSyncedAt: string | null;
  lastAnalyzedAt: string | null;
  lastSynthesizedAt: string | null;
  syncStatus: string;
  syncError: string | null;
}

export interface AutoSyncResponse {
  synced: number;
  analyzed: number;
  synthesized: boolean;
  insight: SynthesizedInsightData | null;
  error?: string;
}
