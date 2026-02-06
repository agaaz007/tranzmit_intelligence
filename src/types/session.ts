// Types for session storage and replay

export interface SessionListItem {
  id: string;
  projectId: string;
  name: string;
  source: 'upload' | 'posthog';
  posthogSessionId?: string;
  distinctId?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  eventCount: number;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  analysis?: SessionAnalysis;
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
  source: 'upload' | 'posthog';
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
