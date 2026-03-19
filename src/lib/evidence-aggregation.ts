// evidence-aggregation.ts
// Shared aggregation functions for synthesizing session and conversation evidence.
// Extracted from session-synthesize.ts and api/dashboard/synthesize/route.ts.

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedSession {
  id: string;
  name: string;
  distinctId?: string;
  startTime?: Date;
  analysis: {
    frustration_points?: Array<{ timestamp: string; issue: string }>;
    user_intent?: string;
    tags?: string[];
    ux_rating?: number;
    went_well?: string[];
  };
}

export interface ParsedConversation {
  id: string;
  name: string;
  participantEmail?: string;
  conversedAt?: Date;
  analysis: {
    pain_points?: string[];
    feature_requests?: string[];
    key_quotes?: string[];
    satisfaction_score?: number;
    sentiment?: string;
  };
}

export interface FrictionEntry {
  issue: string;
  count: number;
  sessionIds: string[];
  sessionNames: string[];
  latestDate?: Date;
}

export interface SessionEvidenceAggregation {
  frictionMap: Map<string, FrictionEntry>;
  intentMap: Map<string, { count: number; sessionIds: string[] }>;
  tagMap: Map<string, number>;
  avgRating: number | null;
}

export interface ConversationEvidenceAggregation {
  painPointMap: Map<string, { count: number; convoIds: string[] }>;
  featureRequestMap: Map<string, number>;
  quotes: string[];
  avgSatisfaction: number | null;
  sentimentCounts: Record<string, number>;
}

export interface EntryReference {
  type: 'session' | 'conversation';
  id: string;
}

// ── Session aggregation ────────────────────────────────────────────────────────

export function aggregateSessionEvidence(
  sessions: ParsedSession[],
): SessionEvidenceAggregation {
  const frictionMap = new Map<string, FrictionEntry>();
  const intentMap = new Map<string, { count: number; sessionIds: string[] }>();
  const tagMap = new Map<string, number>();
  const ratings: number[] = [];

  for (const session of sessions) {
    const { analysis } = session;
    if (!analysis) continue;

    // Friction points
    if (analysis.frustration_points) {
      for (const fp of analysis.frustration_points) {
        const key = fp.issue;
        const existing: FrictionEntry = frictionMap.get(key) || {
          issue: key,
          count: 0,
          sessionIds: [],
          sessionNames: [],
          latestDate: undefined,
        };
        existing.count++;

        // Dedupe sessionIds
        if (!existing.sessionIds.includes(session.id)) {
          existing.sessionIds.push(session.id);
          existing.sessionNames.push(session.name);
        }

        // Track recency
        if (session.startTime) {
          if (!existing.latestDate || session.startTime > existing.latestDate) {
            existing.latestDate = session.startTime;
          }
        }

        frictionMap.set(key, existing);
      }
    }

    // Intents
    if (analysis.user_intent) {
      const intent = analysis.user_intent;
      const existing = intentMap.get(intent) || { count: 0, sessionIds: [] };
      existing.count++;
      if (!existing.sessionIds.includes(session.id)) {
        existing.sessionIds.push(session.id);
      }
      intentMap.set(intent, existing);
    }

    // Tags
    if (analysis.tags) {
      for (const tag of analysis.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }

    // Rating
    if (analysis.ux_rating !== undefined && analysis.ux_rating !== null) {
      ratings.push(analysis.ux_rating);
    }
  }

  const avgRating =
    ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;

  return { frictionMap, intentMap, tagMap, avgRating };
}

// ── Conversation aggregation ───────────────────────────────────────────────────

export function aggregateConversationEvidence(
  conversations: ParsedConversation[],
): ConversationEvidenceAggregation {
  const painPointMap = new Map<string, { count: number; convoIds: string[] }>();
  const featureRequestMap = new Map<string, number>();
  const quotes: string[] = [];
  const satisfactionScores: number[] = [];
  const sentimentCounts: Record<string, number> = {};

  for (const convo of conversations) {
    const { analysis } = convo;
    if (!analysis) continue;

    // Pain points
    if (analysis.pain_points) {
      for (const pp of analysis.pain_points) {
        const key = pp;
        const existing = painPointMap.get(key) || { count: 0, convoIds: [] };
        existing.count++;
        if (!existing.convoIds.includes(convo.id)) {
          existing.convoIds.push(convo.id);
        }
        painPointMap.set(key, existing);
      }
    }

    // Feature requests
    if (analysis.feature_requests) {
      for (const fr of analysis.feature_requests) {
        featureRequestMap.set(fr, (featureRequestMap.get(fr) || 0) + 1);
      }
    }

    // Quotes
    if (analysis.key_quotes) {
      quotes.push(...analysis.key_quotes);
    }

    // Satisfaction
    if (
      analysis.satisfaction_score !== undefined &&
      analysis.satisfaction_score !== null
    ) {
      satisfactionScores.push(analysis.satisfaction_score);
    }

    // Sentiment
    if (analysis.sentiment) {
      sentimentCounts[analysis.sentiment] =
        (sentimentCounts[analysis.sentiment] || 0) + 1;
    }
  }

  const avgSatisfaction =
    satisfactionScores.length > 0
      ? satisfactionScores.reduce((a, b) => a + b, 0) /
        satisfactionScores.length
      : null;

  return {
    painPointMap,
    featureRequestMap,
    quotes,
    avgSatisfaction,
    sentimentCounts,
  };
}

// ── Numbered prompt builder ────────────────────────────────────────────────────

export function buildNumberedPromptEntries(
  frictionMap: Map<string, FrictionEntry>,
  painPointMap: Map<string, { count: number; convoIds: string[] }>,
  sessions: ParsedSession[],
  conversations: ParsedConversation[],
): { promptText: string; entryIndex: Map<number, EntryReference> } {
  const entryIndex = new Map<number, EntryReference>();
  const lines: string[] = [];
  let entryNum = 1;

  // Pre-compute per-session friction summaries and total friction count
  const sessionFrictionSummary = new Map<
    string,
    { frictionItems: string[]; totalFriction: number }
  >();

  for (const session of sessions) {
    const items: string[] = [];
    let total = 0;
    for (const [, entry] of frictionMap) {
      if (entry.sessionIds.includes(session.id)) {
        items.push(`"${entry.issue}" (${entry.count}x)`);
        total += entry.count;
      }
    }
    sessionFrictionSummary.set(session.id, {
      frictionItems: items,
      totalFriction: total,
    });
  }

  // Sort sessions by total friction count (desc)
  const sortedSessions = [...sessions].sort((a, b) => {
    const aFriction =
      sessionFrictionSummary.get(a.id)?.totalFriction ?? 0;
    const bFriction =
      sessionFrictionSummary.get(b.id)?.totalFriction ?? 0;
    return bFriction - aFriction;
  });

  // Pre-compute per-conversation pain point count
  const convoPainPointSummary = new Map<
    string,
    { painItems: string[]; totalPain: number }
  >();

  for (const convo of conversations) {
    const items: string[] = [];
    let total = 0;
    if (convo.analysis?.pain_points) {
      for (const pp of convo.analysis.pain_points) {
        items.push(`"${pp}"`);
        total++;
      }
    }
    convoPainPointSummary.set(convo.id, {
      painItems: items,
      totalPain: total,
    });
  }

  // Sort conversations by pain point count (desc)
  const sortedConversations = [...conversations].sort((a, b) => {
    const aPain = convoPainPointSummary.get(a.id)?.totalPain ?? 0;
    const bPain = convoPainPointSummary.get(b.id)?.totalPain ?? 0;
    return bPain - aPain;
  });

  // Build session entries (top 30)
  const topSessions = sortedSessions.slice(0, 30);
  if (topSessions.length > 0) {
    lines.push('=== SESSIONS ===');
    for (const session of topSessions) {
      const summary = sessionFrictionSummary.get(session.id);
      const frictionPart =
        summary && summary.frictionItems.length > 0
          ? `Friction: ${summary.frictionItems.join(', ')}`
          : 'Friction: none';
      const intentPart = session.analysis?.user_intent
        ? `Intent: "${session.analysis.user_intent}"`
        : '';

      const parts = [frictionPart, intentPart].filter(Boolean).join(', ');

      lines.push(
        `[${entryNum}] Session "${session.name}" (ID: ${session.id}): ${parts}`,
      );
      entryIndex.set(entryNum, { type: 'session', id: session.id });
      entryNum++;
    }
  }

  // Build conversation entries (top 20)
  const topConversations = sortedConversations.slice(0, 20);
  if (topConversations.length > 0) {
    lines.push('');
    lines.push('=== CONVERSATIONS ===');
    for (const convo of topConversations) {
      const summary = convoPainPointSummary.get(convo.id);
      const painPart =
        summary && summary.painItems.length > 0
          ? `Pain points: ${summary.painItems.join(', ')}`
          : 'Pain points: none';

      const quotePart =
        convo.analysis?.key_quotes && convo.analysis.key_quotes.length > 0
          ? `Quotes: ${convo.analysis.key_quotes.slice(0, 3).map((q) => `"${q}"`).join('; ')}`
          : '';

      const parts = [painPart, quotePart].filter(Boolean).join(', ');

      lines.push(
        `[${entryNum}] Conversation with "${convo.name}" (ID: ${convo.id}): ${parts}`,
      );
      entryIndex.set(entryNum, { type: 'conversation', id: convo.id });
      entryNum++;
    }
  }

  return { promptText: lines.join('\n'), entryIndex };
}

// ── Entry number resolver ──────────────────────────────────────────────────────

export function resolveEntryNumbers(
  entryNumbers: number[],
  entryIndex: Map<number, EntryReference>,
): { sessionIds: string[]; conversationIds: string[] } {
  const sessionIds: string[] = [];
  const conversationIds: string[] = [];

  for (const num of entryNumbers) {
    const ref = entryIndex.get(num);
    if (!ref) continue;

    if (ref.type === 'session') {
      if (!sessionIds.includes(ref.id)) {
        sessionIds.push(ref.id);
      }
    } else if (ref.type === 'conversation') {
      if (!conversationIds.includes(ref.id)) {
        conversationIds.push(ref.id);
      }
    }
  }

  return { sessionIds, conversationIds };
}
