import { RawUserMetrics, Segment, RiskLevel, SubScores, ScoredUser } from './types';

// ==================== SEGMENT CLASSIFICATION ====================

export function classifySegment(metrics: RawUserMetrics): Segment {
  const isPro = metrics.is_pro === true;
  const hasActiveSubscription =
    metrics.subscription_status === 'active' ||
    metrics.subscription_status === 'trialing';

  if (isPro || hasActiveSubscription) {
    return 'paid_user';
  }

  // New user: first seen < 7 days ago
  if (metrics.person_created_at) {
    const createdAt = new Date(metrics.person_created_at);
    const daysSinceCreation = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCreation < 7) {
      return 'new_user';
    }
  }

  return 'active_user';
}

// ==================== RECENCY SCORE (max 35) ====================

export function computeRecencyScore(
  metrics: RawUserMetrics,
  segment: Segment
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const daysEvent = metrics.days_since_last_event ?? 999;
  const daysChat = metrics.days_since_last_chat_started ?? 999;
  const daysMsg = metrics.days_since_last_message_sent ?? 999;

  if (segment === 'new_user') {
    // New users: activation-risk focus
    if (daysEvent >= 3) {
      score += 20;
      reasons.push('new_user_inactive_3d');
    } else if (daysEvent >= 1) {
      score += 10;
    }

    if (daysChat >= 999) {
      score += 15;
      reasons.push('new_user_no_chat');
    } else if (daysChat >= 2) {
      score += 8;
      reasons.push('new_user_no_recent_chat');
    }

    return { score: Math.min(score, 35), reasons };
  }

  if (segment === 'paid_user') {
    // Paid users: trigger sooner
    if (daysEvent >= 14) {
      score += 35;
      reasons.push('paid_user_gone_14d');
    } else if (daysEvent >= 7) {
      score += 25;
      reasons.push('paid_user_inactive_7d');
    } else if (daysEvent >= 3) {
      score += 15;
      reasons.push('paid_user_quiet_3d');
    }

    if (daysChat >= 7 && score < 35) {
      score += 10;
      reasons.push('paid_no_chat_7d');
    }

    return { score: Math.min(score, 35), reasons };
  }

  // active_user
  if (daysEvent >= 21) {
    score += 35;
    reasons.push('inactive_21d');
  } else if (daysEvent >= 14) {
    score += 25;
    reasons.push('inactive_14d');
  } else if (daysEvent >= 7) {
    score += 15;
    reasons.push('inactive_7d');
  } else if (daysEvent >= 3) {
    score += 8;
  }

  if (daysMsg >= 14 && score < 35) {
    score += 10;
    reasons.push('no_messages_14d');
  }

  return { score: Math.min(score, 35), reasons };
}

// ==================== USAGE DROP SCORE (max 30) ====================

function dropPct(prev: number, current: number): number {
  return Math.max(0, (prev - current) / Math.max(prev, 1));
}

export function computeUsageDropScore(
  metrics: RawUserMetrics
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const sessionDrop = dropPct(metrics.sessions_prev_7d, metrics.sessions_last_7d);
  const messageDrop = dropPct(metrics.message_sent_prev_7d, metrics.message_sent_last_7d);

  // Session drop (max 15)
  if (sessionDrop >= 0.8) {
    score += 15;
    reasons.push('sessions_dropped_80pct');
  } else if (sessionDrop >= 0.5) {
    score += 10;
    reasons.push('sessions_dropped_50pct');
  } else if (sessionDrop >= 0.3) {
    score += 5;
  }

  // Message drop (max 15)
  if (messageDrop >= 0.8) {
    score += 15;
    reasons.push('messages_dropped_80pct');
  } else if (messageDrop >= 0.5) {
    score += 10;
    reasons.push('messages_dropped_50pct');
  } else if (messageDrop >= 0.3) {
    score += 5;
  }

  return { score: Math.min(score, 30), reasons };
}

// ==================== ENGAGEMENT QUALITY SCORE (max 20) ====================

export function computeEngagementQualityScore(
  metrics: RawUserMetrics
): { score: number; reasons: string[]; chatCompletionRate: number | null; avgMessagesPerChat: number | null } {
  let score = 0;
  const reasons: string[] = [];

  // Chat completion rate = chat_ended / chat_started
  let chatCompletionRate: number | null = null;
  if (metrics.chat_started_last_7d > 0) {
    chatCompletionRate = metrics.chat_ended_last_7d / metrics.chat_started_last_7d;

    if (chatCompletionRate < 0.3) {
      score += 12;
      reasons.push('low_chat_completion_rate');
    } else if (chatCompletionRate < 0.5) {
      score += 7;
      reasons.push('moderate_chat_completion_rate');
    }
  }

  // Avg messages per chat
  let avgMessagesPerChat: number | null = null;
  if (metrics.chat_started_last_7d > 0) {
    avgMessagesPerChat = metrics.message_sent_last_7d / metrics.chat_started_last_7d;

    if (avgMessagesPerChat < 2) {
      score += 8;
      reasons.push('short_chats');
    } else if (avgMessagesPerChat < 4) {
      score += 4;
    }
  }

  return { score: Math.min(score, 20), reasons, chatCompletionRate, avgMessagesPerChat };
}

// ==================== FRICTION SCORE (max 10) ====================

export function computeFrictionScore(
  metrics: RawUserMetrics,
  segment: Segment
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (segment === 'paid_user') {
    // Paid users: manage subscription taps signal cancellation intent
    if (metrics.manage_sub_tapped_last_30d >= 3) {
      score += 10;
      reasons.push('repeated_manage_subscription');
    } else if (metrics.manage_sub_tapped_last_30d >= 1) {
      score += 5;
      reasons.push('manage_subscription_tapped');
    }
  } else {
    // Free users: paywall views signal blocked value
    if (metrics.paywall_viewed_last_7d >= 3) {
      score += 10;
      reasons.push('frequent_paywall_hits');
    } else if (metrics.paywall_viewed_last_7d >= 1) {
      score += 5;
      reasons.push('paywall_viewed');
    }
  }

  return { score: Math.min(score, 10), reasons };
}

// ==================== FEATURE ADOPTION LOSS (max 5) ====================

export function computeFeatureAdoptionLossScore(
  metrics: RawUserMetrics
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const drop = dropPct(metrics.feature_used_prev_7d, metrics.feature_used_last_7d);

  if (drop >= 0.8 && metrics.feature_used_prev_7d >= 3) {
    score = 5;
    reasons.push('feature_usage_collapsed');
  } else if (drop >= 0.5 && metrics.feature_used_prev_7d >= 2) {
    score = 3;
    reasons.push('feature_usage_declining');
  }

  return { score: Math.min(score, 5), reasons };
}

// ==================== RISK LEVEL ====================

export function classifyRiskLevel(riskScore: number): RiskLevel {
  if (riskScore >= 75) return 'critical';
  if (riskScore >= 50) return 'high';
  if (riskScore >= 25) return 'medium';
  return 'low';
}

// ==================== MAIN SCORER ====================

export function scoreUser(metrics: RawUserMetrics): ScoredUser {
  const segment = classifySegment(metrics);
  const isPro = metrics.is_pro === true;

  const recency = computeRecencyScore(metrics, segment);
  const usageDrop = computeUsageDropScore(metrics);
  const engagement = computeEngagementQualityScore(metrics);
  const friction = computeFrictionScore(metrics, segment);
  const featureAdoption = computeFeatureAdoptionLossScore(metrics);

  const subScores: SubScores = {
    recencyScore: recency.score,
    usageDropScore: usageDrop.score,
    engagementQualityScore: engagement.score,
    frictionScore: friction.score,
    featureAdoptionLossScore: featureAdoption.score,
  };

  const riskScore = Math.min(
    100,
    subScores.recencyScore +
      subScores.usageDropScore +
      subScores.engagementQualityScore +
      subScores.frictionScore +
      subScores.featureAdoptionLossScore
  );

  const riskReasons = [
    ...recency.reasons,
    ...usageDrop.reasons,
    ...engagement.reasons,
    ...friction.reasons,
    ...featureAdoption.reasons,
  ];

  return {
    distinctId: metrics.distinct_id,
    email: metrics.email,
    segment,
    isPro,
    subscriptionStatus: metrics.subscription_status,

    daysSinceLastEvent: metrics.days_since_last_event,
    daysSinceLastChatStarted: metrics.days_since_last_chat_started,
    daysSinceLastMessageSent: metrics.days_since_last_message_sent,

    sessionsLast7d: metrics.sessions_last_7d,
    sessionsPrev7d: metrics.sessions_prev_7d,
    messageSentLast7d: metrics.message_sent_last_7d,
    messageSentPrev7d: metrics.message_sent_prev_7d,
    chatStartedLast7d: metrics.chat_started_last_7d,
    chatStartedPrev7d: metrics.chat_started_prev_7d,
    chatEndedLast7d: metrics.chat_ended_last_7d,
    featureUsedLast7d: metrics.feature_used_last_7d,
    featureUsedPrev7d: metrics.feature_used_prev_7d,

    chatCompletionRateLast7d: engagement.chatCompletionRate,
    avgMessagesPerChatLast7d: engagement.avgMessagesPerChat,

    paywallViewedLast7d: metrics.paywall_viewed_last_7d,
    manageSubTappedLast30d: metrics.manage_sub_tapped_last_30d,

    riskScore,
    riskLevel: classifyRiskLevel(riskScore),
    riskReasons,
    subScores,
  };
}
