// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  frequency: number;
  churn: number;
  severity: number;
  recency: number;
}

export interface TicketEvidence {
  sessionIds: string[];
  conversationIds: string[];
  quotes: string[];
}

export interface RawTicket {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  effort: string;
  recommendation: string;
  compositeScore: number;
  evidence: TicketEvidence;
  scoreBreakdown: ScoreBreakdown;
}

export interface TicketWithEvidence extends RawTicket {}

export interface ChurnScoreRow {
  distinctId: string;
  email: string | null;
  riskScore: number;
}

export interface ChurnImpact {
  atRiskUsers: number;
  avgRiskScore: number;
  userIds: string[];
}

export interface TicketWithChurnImpact extends TicketWithEvidence {
  churnImpact: ChurnImpact;
}

export interface TrendingData {
  firstSeen: string;
  lastSeen: string;
  weeklyCounts: number[];
  direction: "new" | "rising" | "declining" | "stable";
}

export interface ExistingTicketTrending {
  firstSeen: string;
  lastSeen: string;
  weeklyCounts: number[];
  direction: "new" | "rising" | "declining" | "stable";
}

export interface TicketForJira {
  title: string;
  severity: string;
  category: string;
  compositeScore: number;
  effort: string;
  description: string;
  evidence: TicketEvidence;
  churnImpact?: ChurnImpact | null;
  recommendation: string;
}

export interface UserInfo {
  distinctId?: string;
  email?: string;
}

// ─── 1. computeCompositeScore ────────────────────────────────────────────────

/**
 * Weighted composite score: frequency 30% + churn 30% + severity 20% + recency 20%.
 * Each input value is 0-100. Returns integer 0-100.
 */
export function computeCompositeScore(breakdown: ScoreBreakdown): number {
  const raw =
    breakdown.frequency * 0.3 +
    breakdown.churn * 0.3 +
    breakdown.severity * 0.2 +
    breakdown.recency * 0.2;
  return Math.round(raw);
}

// ─── 2. deduplicateTickets ───────────────────────────────────────────────────

/**
 * Deduplicate tickets that share >50% of their combined sessionIds + conversationIds.
 * When merging, keep the ticket with higher compositeScore and union evidence arrays.
 */
export function deduplicateTickets(tickets: RawTicket[]): RawTicket[] {
  const merged = new Set<number>();
  const result: RawTicket[] = [];

  for (let i = 0; i < tickets.length; i++) {
    if (merged.has(i)) continue;

    let current: RawTicket = {
      ...tickets[i],
      evidence: {
        sessionIds: [...tickets[i].evidence.sessionIds],
        conversationIds: [...tickets[i].evidence.conversationIds],
        quotes: [...tickets[i].evidence.quotes],
      },
    };

    for (let j = i + 1; j < tickets.length; j++) {
      if (merged.has(j)) continue;

      const idsA = [
        ...current.evidence.sessionIds,
        ...current.evidence.conversationIds,
      ];
      const idsB = [
        ...tickets[j].evidence.sessionIds,
        ...tickets[j].evidence.conversationIds,
      ];

      const setA = new Set(idsA);
      const setB = new Set(idsB);
      const combinedSet = new Set([...idsA, ...idsB]);

      let sharedCount = 0;
      for (const id of setA) {
        if (setB.has(id)) sharedCount++;
      }

      const overlapRatio =
        combinedSet.size > 0 ? sharedCount / combinedSet.size : 0;

      if (overlapRatio > 0.5) {
        merged.add(j);

        const base =
          current.compositeScore >= tickets[j].compositeScore
            ? current
            : {
                ...tickets[j],
                evidence: {
                  sessionIds: [...tickets[j].evidence.sessionIds],
                  conversationIds: [...tickets[j].evidence.conversationIds],
                  quotes: [...tickets[j].evidence.quotes],
                },
              };
        const other =
          current.compositeScore >= tickets[j].compositeScore
            ? tickets[j]
            : current;

        const unionSessionIds = Array.from(
          new Set([...base.evidence.sessionIds, ...other.evidence.sessionIds])
        );
        const unionConversationIds = Array.from(
          new Set([
            ...base.evidence.conversationIds,
            ...other.evidence.conversationIds,
          ])
        );
        const unionQuotes = Array.from(
          new Set([...base.evidence.quotes, ...other.evidence.quotes])
        );

        current = {
          ...base,
          evidence: {
            sessionIds: unionSessionIds,
            conversationIds: unionConversationIds,
            quotes: unionQuotes,
          },
        };
      }
    }

    result.push(current);
  }

  return result;
}

// ─── 3. enrichWithChurnData ──────────────────────────────────────────────────

/**
 * Enrich tickets with churn impact data by matching session/conversation users
 * against churn score rows via the provided userMap.
 */
export function enrichWithChurnData(
  tickets: TicketWithEvidence[],
  churnScores: ChurnScoreRow[],
  userMap: Map<string, UserInfo>
): TicketWithChurnImpact[] {
  return tickets.map((ticket) => {
    const allIds = [
      ...ticket.evidence.sessionIds,
      ...ticket.evidence.conversationIds,
    ];

    const matchedUserIds = new Set<string>();
    const matchedScores: number[] = [];

    for (const id of allIds) {
      const user = userMap.get(id);
      if (!user) continue;

      for (const row of churnScores) {
        if (matchedUserIds.has(row.distinctId)) continue;

        const matchesDistinctId =
          user.distinctId !== undefined && user.distinctId === row.distinctId;
        const matchesEmail =
          user.email !== undefined &&
          row.email !== null &&
          user.email === row.email;

        if (matchesDistinctId || matchesEmail) {
          matchedUserIds.add(row.distinctId);
          matchedScores.push(row.riskScore);
        }
      }
    }

    const atRiskUsers = matchedUserIds.size;
    const avgRiskScore =
      matchedScores.length > 0
        ? Math.round(
            matchedScores.reduce((sum, s) => sum + s, 0) / matchedScores.length
          )
        : 0;

    return {
      ...ticket,
      churnImpact: {
        atRiskUsers,
        avgRiskScore,
        userIds: Array.from(matchedUserIds),
      },
    };
  });
}

// ─── 4. computeTrending ──────────────────────────────────────────────────────

/**
 * Compute trending data for a ticket. If no existing trending data, initialize.
 * Otherwise update with new evidence and determine direction.
 */
export function computeTrending(
  existingTicket: ExistingTicketTrending | null,
  newEvidenceCount: number
): TrendingData {
  const now = new Date().toISOString();

  if (!existingTicket) {
    return {
      firstSeen: now,
      lastSeen: now,
      weeklyCounts: [newEvidenceCount],
      direction: "new",
    };
  }

  const updatedCounts = [...existingTicket.weeklyCounts, newEvidenceCount];
  const trimmedCounts = updatedCounts.slice(-4);

  let direction: TrendingData["direction"];
  if (trimmedCounts.length < 2) {
    direction = "stable";
  } else {
    const latest = trimmedCounts[trimmedCounts.length - 1];
    const previous = trimmedCounts[trimmedCounts.length - 2];
    if (latest > previous) {
      direction = "rising";
    } else if (latest < previous) {
      direction = "declining";
    } else {
      direction = "stable";
    }
  }

  return {
    firstSeen: existingTicket.firstSeen,
    lastSeen: now,
    weeklyCounts: trimmedCounts,
    direction,
  };
}

// ─── 5. generateJiraMarkdown ─────────────────────────────────────────────────

/**
 * Generate Jira-compatible markdown for a ticket.
 */
export function generateJiraMarkdown(ticket: TicketForJira): string {
  const quotesBlock = ticket.evidence.quotes
    .map((q) => `> ${q}`)
    .join("\n");

  const churnLine =
    ticket.churnImpact && ticket.churnImpact.atRiskUsers > 0
      ? `\n- ${ticket.churnImpact.atRiskUsers} at-risk user(s) (avg risk: ${ticket.churnImpact.avgRiskScore})`
      : "";

  return `**Title:** ${ticket.title}
**Severity:** ${ticket.severity} | **Category:** ${ticket.category} | **Score:** ${ticket.compositeScore}/100
**Effort:** ${ticket.effort}

**Description:**
${ticket.description}

**Evidence:**
- ${ticket.evidence.sessionIds.length} session(s) affected
- ${ticket.evidence.conversationIds.length} conversation(s) mentioning this${churnLine}

**User Quotes:**
${quotesBlock}

**Recommendation:**
${ticket.recommendation}

---
_Generated by Tranzmit_`;
}

// ─── 6. mapSeverityToScore ───────────────────────────────────────────────────

/**
 * Map severity label to numeric score.
 */
export function mapSeverityToScore(
  severity: "critical" | "high" | "medium"
): number {
  switch (severity) {
    case "critical":
      return 90;
    case "high":
      return 70;
    case "medium":
      return 40;
  }
}

// ─── 7. computeRecencyScore ──────────────────────────────────────────────────

/**
 * Compute recency score based on how recent the most recent evidence date is.
 * Within 7 days = 100, 14 days = 80, 30 days = 50, older = 20.
 */
export function computeRecencyScore(evidenceDates: Date[]): number {
  if (evidenceDates.length === 0) return 20;

  const now = new Date();
  const mostRecent = evidenceDates.reduce((latest, date) =>
    date > latest ? date : latest
  );

  const diffMs = now.getTime() - mostRecent.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return 100;
  if (diffDays <= 14) return 80;
  if (diffDays <= 30) return 50;
  return 20;
}

// ─── 8. computeFrequencyScore ────────────────────────────────────────────────

/**
 * Compute frequency score as the average ratio of affected sources to total,
 * scaled 0-100.
 */
export function computeFrequencyScore(
  sessionCount: number,
  conversationCount: number,
  totalSessions: number,
  totalConversations: number
): number {
  const sessionRatio = totalSessions > 0 ? sessionCount / totalSessions : 0;
  const conversationRatio =
    totalConversations > 0 ? conversationCount / totalConversations : 0;

  return ((sessionRatio + conversationRatio) / 2) * 100;
}
