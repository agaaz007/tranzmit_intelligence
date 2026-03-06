export type Segment = 'new_user' | 'active_user' | 'paid_user';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RawUserMetrics {
  distinct_id: string;
  email: string | null;
  is_pro: boolean | null;
  subscription_status: string | null;
  person_created_at: string | null;

  // Recency
  days_since_last_event: number | null;
  days_since_last_chat_started: number | null;
  days_since_last_message_sent: number | null;

  // Volume: last_7d / prev_7d
  sessions_last_7d: number;
  sessions_prev_7d: number;
  message_sent_last_7d: number;
  message_sent_prev_7d: number;
  chat_started_last_7d: number;
  chat_started_prev_7d: number;
  chat_ended_last_7d: number;
  feature_used_last_7d: number;
  feature_used_prev_7d: number;

  // Friction
  paywall_viewed_last_7d: number;
  manage_sub_tapped_last_30d: number;
}

export interface SubScores {
  recencyScore: number;       // max 35
  usageDropScore: number;     // max 30
  engagementQualityScore: number; // max 20
  frictionScore: number;      // max 10
  featureAdoptionLossScore: number; // max 5
}

export interface ScoredUser {
  distinctId: string;
  email: string | null;
  segment: Segment;
  isPro: boolean;
  subscriptionStatus: string | null;

  // Recency
  daysSinceLastEvent: number | null;
  daysSinceLastChatStarted: number | null;
  daysSinceLastMessageSent: number | null;

  // Volume
  sessionsLast7d: number;
  sessionsPrev7d: number;
  messageSentLast7d: number;
  messageSentPrev7d: number;
  chatStartedLast7d: number;
  chatStartedPrev7d: number;
  chatEndedLast7d: number;
  featureUsedLast7d: number;
  featureUsedPrev7d: number;

  // Quality (computed)
  chatCompletionRateLast7d: number | null;
  avgMessagesPerChatLast7d: number | null;

  // Friction
  paywallViewedLast7d: number;
  manageSubTappedLast30d: number;

  // Scores
  riskScore: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  subScores: SubScores;
}

export interface ScoringSummary {
  date: string;
  usersScored: number;
  byRiskLevel: Record<RiskLevel, number>;
  durationMs: number;
}
