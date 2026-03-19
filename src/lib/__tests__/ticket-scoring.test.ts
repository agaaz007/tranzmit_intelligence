import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeCompositeScore,
  deduplicateTickets,
  enrichWithChurnData,
  computeTrending,
  generateJiraMarkdown,
  mapSeverityToScore,
  computeRecencyScore,
  computeFrequencyScore,
  type ScoreBreakdown,
  type RawTicket,
  type TicketWithEvidence,
  type ChurnScoreRow,
  type UserInfo,
  type ExistingTicketTrending,
  type TicketForJira,
} from "@/lib/ticket-scoring";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTicket(
  overrides: Partial<RawTicket> & { id: string }
): RawTicket {
  return {
    title: "Test ticket",
    description: "desc",
    severity: "high",
    category: "ux",
    effort: "medium",
    recommendation: "fix it",
    compositeScore: 50,
    evidence: {
      sessionIds: [],
      conversationIds: [],
      quotes: [],
    },
    scoreBreakdown: { frequency: 0, churn: 0, severity: 0, recency: 0 },
    ...overrides,
  };
}

// ─── 1. computeCompositeScore ─────────────────────────────────────────────────

describe("computeCompositeScore", () => {
  it("returns 0 when all inputs are 0", () => {
    expect(
      computeCompositeScore({ frequency: 0, churn: 0, severity: 0, recency: 0 })
    ).toBe(0);
  });

  it("returns 100 when all inputs are 100", () => {
    expect(
      computeCompositeScore({
        frequency: 100,
        churn: 100,
        severity: 100,
        recency: 100,
      })
    ).toBe(100);
  });

  it("applies correct weights: frequency 30%, churn 30%, severity 20%, recency 20%", () => {
    // Only frequency = 100, rest 0 => 100 * 0.3 = 30
    expect(
      computeCompositeScore({ frequency: 100, churn: 0, severity: 0, recency: 0 })
    ).toBe(30);

    // Only churn = 100 => 30
    expect(
      computeCompositeScore({ frequency: 0, churn: 100, severity: 0, recency: 0 })
    ).toBe(30);

    // Only severity = 100 => 20
    expect(
      computeCompositeScore({ frequency: 0, churn: 0, severity: 100, recency: 0 })
    ).toBe(20);

    // Only recency = 100 => 20
    expect(
      computeCompositeScore({ frequency: 0, churn: 0, severity: 0, recency: 100 })
    ).toBe(20);
  });

  it("rounds to nearest integer", () => {
    // 33 * 0.3 + 33 * 0.3 + 33 * 0.2 + 33 * 0.2 = 9.9 + 9.9 + 6.6 + 6.6 = 33
    expect(
      computeCompositeScore({
        frequency: 33,
        churn: 33,
        severity: 33,
        recency: 33,
      })
    ).toBe(33);

    // 10 * 0.3 + 20 * 0.3 + 30 * 0.2 + 40 * 0.2 = 3 + 6 + 6 + 8 = 23
    expect(
      computeCompositeScore({
        frequency: 10,
        churn: 20,
        severity: 30,
        recency: 40,
      })
    ).toBe(23);
  });

  it("handles mixed values correctly", () => {
    // 50*0.3 + 80*0.3 + 60*0.2 + 40*0.2 = 15 + 24 + 12 + 8 = 59
    expect(
      computeCompositeScore({
        frequency: 50,
        churn: 80,
        severity: 60,
        recency: 40,
      })
    ).toBe(59);
  });
});

// ─── 2. deduplicateTickets ────────────────────────────────────────────────────

describe("deduplicateTickets", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateTickets([])).toEqual([]);
  });

  it("returns single ticket unchanged", () => {
    const t = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1"], conversationIds: [], quotes: ["q"] },
    });
    const result = deduplicateTickets([t]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("keeps all tickets when there is no overlap", () => {
    const t1 = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1"], conversationIds: ["c1"], quotes: [] },
    });
    const t2 = makeTicket({
      id: "2",
      evidence: { sessionIds: ["s2"], conversationIds: ["c2"], quotes: [] },
    });
    const result = deduplicateTickets([t1, t2]);
    expect(result).toHaveLength(2);
  });

  it("merges tickets with >50% overlap and keeps higher score", () => {
    const t1 = makeTicket({
      id: "1",
      compositeScore: 80,
      evidence: {
        sessionIds: ["s1", "s2", "s3"],
        conversationIds: [],
        quotes: ["q1"],
      },
    });
    const t2 = makeTicket({
      id: "2",
      compositeScore: 60,
      evidence: {
        sessionIds: ["s1", "s2", "s3"],
        conversationIds: [],
        quotes: ["q2"],
      },
    });
    const result = deduplicateTickets([t1, t2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1"); // higher score kept
    expect(result[0].evidence.quotes).toContain("q1");
    expect(result[0].evidence.quotes).toContain("q2");
  });

  it("does NOT merge tickets at exactly 50% overlap", () => {
    // 2 shared out of 4 unique = 50% exactly, which is NOT > 50%
    const t1 = makeTicket({
      id: "1",
      evidence: {
        sessionIds: ["s1", "s2"],
        conversationIds: [],
        quotes: [],
      },
    });
    const t2 = makeTicket({
      id: "2",
      evidence: {
        sessionIds: ["s1", "s3"],
        conversationIds: [],
        quotes: [],
      },
    });
    // shared = {s1} = 1, combined = {s1, s2, s3} = 3, ratio = 1/3 ~= 0.33 < 0.5
    const result = deduplicateTickets([t1, t2]);
    expect(result).toHaveLength(2);
  });

  it("merges 2 overlapping tickets while keeping a third distinct", () => {
    const t1 = makeTicket({
      id: "1",
      compositeScore: 70,
      evidence: { sessionIds: ["s1", "s2"], conversationIds: [], quotes: [] },
    });
    const t2 = makeTicket({
      id: "2",
      compositeScore: 90,
      evidence: { sessionIds: ["s1", "s2"], conversationIds: [], quotes: [] },
    });
    const t3 = makeTicket({
      id: "3",
      compositeScore: 50,
      evidence: { sessionIds: ["s9", "s10"], conversationIds: [], quotes: [] },
    });

    const result = deduplicateTickets([t1, t2, t3]);
    expect(result).toHaveLength(2);
    // The merged ticket should keep id "2" (higher score when j wins)
    // Actually the code picks base as current vs tickets[j] by compositeScore
    // t1 is current (score 70), t2 is tickets[j] (score 90) => t2 wins
    expect(result[0].id).toBe("2");
    expect(result[1].id).toBe("3");
  });

  it("unions evidence arrays when merging", () => {
    const t1 = makeTicket({
      id: "1",
      compositeScore: 50,
      evidence: {
        sessionIds: ["s1", "s2"],
        conversationIds: ["c1"],
        quotes: ["q1"],
      },
    });
    const t2 = makeTicket({
      id: "2",
      compositeScore: 50,
      evidence: {
        sessionIds: ["s1", "s3"],
        conversationIds: ["c1"],
        quotes: ["q2"],
      },
    });
    // shared: s1, c1 = 2 ids shared; combined unique: s1,s2,s3,c1 = 4; ratio = 2/4 = 0.5 NOT > 0.5
    // Need more overlap. Let's make it obvious:
    const t3 = makeTicket({
      id: "3",
      compositeScore: 60,
      evidence: {
        sessionIds: ["s1", "s2"],
        conversationIds: ["c1"],
        quotes: ["q3"],
      },
    });
    const t4 = makeTicket({
      id: "4",
      compositeScore: 40,
      evidence: {
        sessionIds: ["s1", "s2"],
        conversationIds: ["c1"],
        quotes: ["q4"],
      },
    });
    // shared = 3 (s1,s2,c1), combined = 3, ratio = 1.0 > 0.5
    const result = deduplicateTickets([t3, t4]);
    expect(result).toHaveLength(1);
    expect(result[0].evidence.sessionIds).toEqual(
      expect.arrayContaining(["s1", "s2"])
    );
    expect(result[0].evidence.conversationIds).toContain("c1");
    expect(result[0].evidence.quotes).toEqual(
      expect.arrayContaining(["q3", "q4"])
    );
  });
});

// ─── 3. enrichWithChurnData ───────────────────────────────────────────────────

describe("enrichWithChurnData", () => {
  it("returns churnImpact with 0 atRiskUsers when no churn scores exist", () => {
    const ticket = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1"], conversationIds: [], quotes: [] },
    });
    const userMap = new Map<string, UserInfo>([
      ["s1", { distinctId: "u1" }],
    ]);
    const result = enrichWithChurnData([ticket], [], userMap);
    expect(result[0].churnImpact.atRiskUsers).toBe(0);
    expect(result[0].churnImpact.avgRiskScore).toBe(0);
    expect(result[0].churnImpact.userIds).toEqual([]);
  });

  it("matches by distinctId", () => {
    const ticket = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1"], conversationIds: [], quotes: [] },
    });
    const userMap = new Map<string, UserInfo>([
      ["s1", { distinctId: "u1" }],
    ]);
    const churnScores: ChurnScoreRow[] = [
      { distinctId: "u1", email: null, riskScore: 80 },
    ];
    const result = enrichWithChurnData([ticket], churnScores, userMap);
    expect(result[0].churnImpact.atRiskUsers).toBe(1);
    expect(result[0].churnImpact.avgRiskScore).toBe(80);
    expect(result[0].churnImpact.userIds).toEqual(["u1"]);
  });

  it("matches by email", () => {
    const ticket = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1"], conversationIds: [], quotes: [] },
    });
    const userMap = new Map<string, UserInfo>([
      ["s1", { email: "a@b.com" }],
    ]);
    const churnScores: ChurnScoreRow[] = [
      { distinctId: "u1", email: "a@b.com", riskScore: 60 },
    ];
    const result = enrichWithChurnData([ticket], churnScores, userMap);
    expect(result[0].churnImpact.atRiskUsers).toBe(1);
    expect(result[0].churnImpact.avgRiskScore).toBe(60);
  });

  it("returns 0 atRiskUsers when no user in the map matches churn scores", () => {
    const ticket = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1"], conversationIds: [], quotes: [] },
    });
    const userMap = new Map<string, UserInfo>([
      ["s1", { distinctId: "no-match" }],
    ]);
    const churnScores: ChurnScoreRow[] = [
      { distinctId: "u1", email: null, riskScore: 90 },
    ];
    const result = enrichWithChurnData([ticket], churnScores, userMap);
    expect(result[0].churnImpact.atRiskUsers).toBe(0);
  });

  it("averages risk scores for multiple matched users", () => {
    const ticket = makeTicket({
      id: "1",
      evidence: { sessionIds: ["s1", "s2"], conversationIds: [], quotes: [] },
    });
    const userMap = new Map<string, UserInfo>([
      ["s1", { distinctId: "u1" }],
      ["s2", { distinctId: "u2" }],
    ]);
    const churnScores: ChurnScoreRow[] = [
      { distinctId: "u1", email: null, riskScore: 80 },
      { distinctId: "u2", email: null, riskScore: 40 },
    ];
    const result = enrichWithChurnData([ticket], churnScores, userMap);
    expect(result[0].churnImpact.atRiskUsers).toBe(2);
    expect(result[0].churnImpact.avgRiskScore).toBe(60); // (80+40)/2
  });
});

// ─── 4. computeTrending ───────────────────────────────────────────────────────

describe("computeTrending", () => {
  it("returns direction 'new' when existing ticket is null", () => {
    const result = computeTrending(null, 5);
    expect(result.direction).toBe("new");
    expect(result.weeklyCounts).toEqual([5]);
  });

  it("returns 'rising' when latest count exceeds previous", () => {
    const existing: ExistingTicketTrending = {
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-03-01T00:00:00.000Z",
      weeklyCounts: [3, 5],
      direction: "stable",
    };
    const result = computeTrending(existing, 10);
    expect(result.direction).toBe("rising");
  });

  it("returns 'declining' when latest count is lower than previous", () => {
    const existing: ExistingTicketTrending = {
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-03-01T00:00:00.000Z",
      weeklyCounts: [10, 8],
      direction: "rising",
    };
    const result = computeTrending(existing, 2);
    expect(result.direction).toBe("declining");
  });

  it("returns 'stable' when latest count equals previous", () => {
    const existing: ExistingTicketTrending = {
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-03-01T00:00:00.000Z",
      weeklyCounts: [5],
      direction: "new",
    };
    const result = computeTrending(existing, 5);
    expect(result.direction).toBe("stable");
  });

  it("caps weeklyCounts at 4 entries", () => {
    const existing: ExistingTicketTrending = {
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-03-01T00:00:00.000Z",
      weeklyCounts: [1, 2, 3, 4],
      direction: "rising",
    };
    const result = computeTrending(existing, 5);
    expect(result.weeklyCounts).toHaveLength(4);
    expect(result.weeklyCounts).toEqual([2, 3, 4, 5]);
  });

  it("preserves firstSeen from existing ticket", () => {
    const existing: ExistingTicketTrending = {
      firstSeen: "2025-06-01T00:00:00.000Z",
      lastSeen: "2026-03-01T00:00:00.000Z",
      weeklyCounts: [1],
      direction: "new",
    };
    const result = computeTrending(existing, 3);
    expect(result.firstSeen).toBe("2025-06-01T00:00:00.000Z");
  });
});

// ─── 5. generateJiraMarkdown ──────────────────────────────────────────────────

describe("generateJiraMarkdown", () => {
  const baseTicket: TicketForJira = {
    title: "Login bug",
    severity: "high",
    category: "auth",
    compositeScore: 85,
    effort: "low",
    description: "Users cannot log in.",
    evidence: {
      sessionIds: ["s1", "s2"],
      conversationIds: ["c1"],
      quotes: ["It keeps crashing", "I can't sign in"],
    },
    churnImpact: { atRiskUsers: 3, avgRiskScore: 72, userIds: ["u1", "u2", "u3"] },
    recommendation: "Fix the auth flow",
  };

  it("contains the title", () => {
    const md = generateJiraMarkdown(baseTicket);
    expect(md).toContain("**Title:** Login bug");
  });

  it("contains severity, category, and score", () => {
    const md = generateJiraMarkdown(baseTicket);
    expect(md).toContain("**Severity:** high");
    expect(md).toContain("**Category:** auth");
    expect(md).toContain("**Score:** 85/100");
  });

  it("renders quotes as blockquotes", () => {
    const md = generateJiraMarkdown(baseTicket);
    expect(md).toContain("> It keeps crashing");
    expect(md).toContain("> I can't sign in");
  });

  it("includes churn line when churnImpact is present", () => {
    const md = generateJiraMarkdown(baseTicket);
    expect(md).toContain("3 at-risk user(s) (avg risk: 72)");
  });

  it("omits churn line when churnImpact is null", () => {
    const md = generateJiraMarkdown({ ...baseTicket, churnImpact: null });
    expect(md).not.toContain("at-risk user");
  });

  it("omits churn line when atRiskUsers is 0", () => {
    const md = generateJiraMarkdown({
      ...baseTicket,
      churnImpact: { atRiskUsers: 0, avgRiskScore: 0, userIds: [] },
    });
    expect(md).not.toContain("at-risk user");
  });

  it("contains the 'Generated by Tranzmit' footer", () => {
    const md = generateJiraMarkdown(baseTicket);
    expect(md).toContain("Generated by Tranzmit");
  });
});

// ─── 6. mapSeverityToScore ────────────────────────────────────────────────────

describe("mapSeverityToScore", () => {
  it("returns 90 for critical", () => {
    expect(mapSeverityToScore("critical")).toBe(90);
  });

  it("returns 70 for high", () => {
    expect(mapSeverityToScore("high")).toBe(70);
  });

  it("returns 40 for medium", () => {
    expect(mapSeverityToScore("medium")).toBe(40);
  });
});

// ─── 7. computeRecencyScore ──────────────────────────────────────────────────

describe("computeRecencyScore", () => {
  it("returns 20 for empty array", () => {
    expect(computeRecencyScore([])).toBe(20);
  });

  it("returns 100 when most recent date is within 7 days", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 3);
    expect(computeRecencyScore([recent])).toBe(100);
  });

  it("returns 80 when most recent date is within 14 days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 10);
    expect(computeRecencyScore([date])).toBe(80);
  });

  it("returns 50 when most recent date is within 30 days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 20);
    expect(computeRecencyScore([date])).toBe(50);
  });

  it("returns 20 when most recent date is older than 30 days", () => {
    const date = new Date();
    date.setDate(date.getDate() - 60);
    expect(computeRecencyScore([date])).toBe(20);
  });

  it("picks the most recent date from multiple entries", () => {
    const old = new Date();
    old.setDate(old.getDate() - 60);
    const recent = new Date();
    recent.setDate(recent.getDate() - 2);
    expect(computeRecencyScore([old, recent])).toBe(100);
  });
});

// ─── 8. computeFrequencyScore ────────────────────────────────────────────────

describe("computeFrequencyScore", () => {
  it("returns 0 when both totals are 0", () => {
    expect(computeFrequencyScore(0, 0, 0, 0)).toBe(0);
  });

  it("returns 100 when all sessions and conversations are affected", () => {
    expect(computeFrequencyScore(10, 10, 10, 10)).toBe(100);
  });

  it("computes the average ratio correctly", () => {
    // sessionRatio = 5/10 = 0.5, conversationRatio = 2/10 = 0.2
    // avg = (0.5 + 0.2) / 2 = 0.35, * 100 = 35
    expect(computeFrequencyScore(5, 2, 10, 10)).toBe(35);
  });

  it("handles zero totalSessions gracefully", () => {
    // sessionRatio = 0, conversationRatio = 5/10 = 0.5
    // avg = 0.25, * 100 = 25
    expect(computeFrequencyScore(5, 5, 0, 10)).toBe(25);
  });

  it("handles zero totalConversations gracefully", () => {
    // sessionRatio = 5/10 = 0.5, conversationRatio = 0
    // avg = 0.25, * 100 = 25
    expect(computeFrequencyScore(5, 5, 10, 0)).toBe(25);
  });
});
