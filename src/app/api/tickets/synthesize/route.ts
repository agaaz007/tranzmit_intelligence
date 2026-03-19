import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  aggregateSessionEvidence,
  aggregateConversationEvidence,
  buildNumberedPromptEntries,
  resolveEntryNumbers,
  type ParsedSession,
  type ParsedConversation,
} from '@/lib/evidence-aggregation';
import {
  computeCompositeScore,
  computeFrequencyScore,
  computeRecencyScore,
  mapSeverityToScore,
  deduplicateTickets,
  enrichWithChurnData,
  computeTrending,
  generateJiraMarkdown,
  type ScoreBreakdown,
  type RawTicket,
  type ChurnScoreRow,
  type UserInfo,
  type ExistingTicketTrending,
} from '@/lib/ticket-scoring';

// ---------------------------------------------------------------------------
// Zod schema for LLM output
// ---------------------------------------------------------------------------

const TicketSynthesisSchema = z.object({
  tickets: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      severity: z.enum(['critical', 'high', 'medium']),
      category: z.enum([
        'ux_friction',
        'feature_gap',
        'bug',
        'confusion',
        'performance',
        'onboarding',
        'retention',
      ]),
      effort: z.enum(['low', 'medium', 'high']),
      recommendation: z.string(),
      entry_numbers: z
        .array(z.number())
        .describe('The numbered entries from the evidence list that support this ticket'),
      quotes: z
        .array(z.string())
        .describe('Verbatim user quotes from conversations, copied exactly'),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Types for parsed analysis JSON
// ---------------------------------------------------------------------------

interface SessionAnalysis {
  summary?: string;
  user_intent?: string;
  tags?: string[];
  frustration_points?: Array<{ timestamp: string; issue: string }>;
  went_well?: string[];
  ux_rating?: number;
}

interface ConversationAnalysis {
  summary?: string;
  sentiment?: string;
  pain_points?: string[];
  feature_requests?: string[];
  satisfaction_score?: number;
  key_quotes?: string[];
}

// ---------------------------------------------------------------------------
// POST /api/tickets/synthesize
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let projectId: string | undefined;

  try {
    const body = await request.json();
    projectId = body.projectId;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    // Auth
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // -----------------------------------------------------------------------
    // 5-minute cooldown
    // -----------------------------------------------------------------------
    const lastTicket = await prisma.ticket.findFirst({
      where: { projectId },
      orderBy: { synthesizedAt: 'desc' },
      select: { synthesizedAt: true },
    });

    if (lastTicket?.synthesizedAt) {
      const elapsed = Date.now() - lastTicket.synthesizedAt.getTime();
      const cooldownMs = 5 * 60 * 1000;
      if (elapsed < cooldownMs) {
        const retryAfter = Math.ceil((cooldownMs - elapsed) / 1000);
        return NextResponse.json(
          { error: 'Synthesis ran recently. Please wait before re-running.', retryAfter },
          { status: 429 },
        );
      }
    }

    // -----------------------------------------------------------------------
    // Concurrent guard
    // -----------------------------------------------------------------------
    const insight = await prisma.synthesizedInsight.findUnique({
      where: { projectId },
      select: { syncStatus: true },
    });

    if (insight?.syncStatus === 'synthesizing') {
      return NextResponse.json(
        { error: 'Synthesis already in progress' },
        { status: 409 },
      );
    }

    // Mark as synthesizing
    await prisma.synthesizedInsight.upsert({
      where: { projectId },
      create: { projectId, syncStatus: 'synthesizing' },
      update: { syncStatus: 'synthesizing' },
    });

    // -----------------------------------------------------------------------
    // Fetch sessions & conversations in parallel
    // -----------------------------------------------------------------------
    const [sessions, conversations] = await Promise.all([
      prisma.session.findMany({
        where: { projectId, analysisStatus: 'completed' },
        select: {
          id: true,
          name: true,
          distinctId: true,
          analysis: true,
          startTime: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.conversation.findMany({
        where: { projectId, analysisStatus: 'completed' },
        select: {
          id: true,
          participantName: true,
          participantEmail: true,
          analysis: true,
          conversedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    // Empty state — nothing to synthesize
    if (sessions.length === 0 && conversations.length === 0) {
      await prisma.synthesizedInsight.update({
        where: { projectId },
        data: { syncStatus: 'complete', lastSynthesizedAt: new Date() },
      });
      return NextResponse.json({ tickets: [] });
    }

    // -----------------------------------------------------------------------
    // Parse JSON analysis fields
    // -----------------------------------------------------------------------
    const parsedSessions: ParsedSession[] = [];
    for (const s of sessions) {
      if (s.analysis) {
        try {
          const parsed = JSON.parse(s.analysis) as SessionAnalysis;
          parsedSessions.push({
            id: s.id,
            name: s.name,
            distinctId: s.distinctId || undefined,
            startTime: s.startTime || undefined,
            analysis: parsed,
          });
        } catch { /* skip invalid JSON */ }
      }
    }

    const parsedConversations: ParsedConversation[] = [];
    for (const c of conversations) {
      if (c.analysis) {
        try {
          const parsed = JSON.parse(c.analysis) as ConversationAnalysis;
          parsedConversations.push({
            id: c.id,
            name: c.participantName || 'Anonymous',
            participantEmail: c.participantEmail || undefined,
            conversedAt: c.conversedAt || undefined,
            analysis: parsed,
          });
        } catch { /* skip invalid JSON */ }
      }
    }

    // -----------------------------------------------------------------------
    // Aggregate evidence and build numbered prompt
    // -----------------------------------------------------------------------
    const sessionEvidence = aggregateSessionEvidence(parsedSessions);
    const conversationEvidence = aggregateConversationEvidence(parsedConversations);

    const { promptText, entryIndex } = buildNumberedPromptEntries(
      sessionEvidence.frictionMap,
      conversationEvidence.painPointMap,
      parsedSessions,
      parsedConversations,
    );

    // -----------------------------------------------------------------------
    // Call GPT-5.2 via generateObject
    // -----------------------------------------------------------------------
    const systemPrompt = `You are a senior product analyst synthesizing user research data into actionable tickets.
Create tickets that combine evidence from both session replays and user conversations.

CRITICAL RULES:
1. Each ticket must reference specific entry numbers from the evidence list
2. Quotes must be VERBATIM from conversations — copy the exact words shown after "Quotes:" in the evidence list
3. If a ticket references any conversation entries that contain quotes, you MUST copy those quotes into the ticket's quotes array
4. Group related issues into single tickets (don't create duplicates)
5. Prioritize by: frequency of occurrence, severity of impact, breadth of evidence
6. Category should reflect the root cause, not the symptom
7. Recommendations must be specific and actionable
8. Create 5-15 tickets depending on evidence volume`;

    const userPrompt = `Here is the numbered evidence list from ${parsedSessions.length} session replays and ${parsedConversations.length} user conversations:

${promptText}

Based on this evidence, create actionable product tickets. Reference the entry numbers that support each ticket.`;

    const { object: synthesisResult } = await generateObject({
      model: openai('gpt-5.2-chat-latest'),
      schema: TicketSynthesisSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    // -----------------------------------------------------------------------
    // Score each ticket
    // -----------------------------------------------------------------------
    const totalSessions = parsedSessions.length;
    const totalConversations = parsedConversations.length;

    const rawTickets: RawTicket[] = synthesisResult.tickets.map((llmTicket, idx) => {
      // Resolve entry numbers to actual IDs
      const resolved = resolveEntryNumbers(llmTicket.entry_numbers, entryIndex);

      // Collect timestamps for recency
      const recencyDates: Date[] = [];
      for (const sid of resolved.sessionIds) {
        const sess = parsedSessions.find((s) => s.id === sid);
        if (sess?.startTime) recencyDates.push(sess.startTime);
      }
      for (const cid of resolved.conversationIds) {
        const conv = parsedConversations.find((c) => c.id === cid);
        if (conv?.conversedAt) recencyDates.push(conv.conversedAt);
      }

      const frequency = computeFrequencyScore(
        resolved.sessionIds.length,
        resolved.conversationIds.length,
        totalSessions,
        totalConversations,
      );
      const severity = mapSeverityToScore(llmTicket.severity);
      const recency = computeRecencyScore(recencyDates);

      const scoreBreakdown: ScoreBreakdown = {
        frequency: Math.round(frequency),
        churn: 0, // enriched later
        severity,
        recency,
      };

      const composite = computeCompositeScore(scoreBreakdown);

      return {
        id: `synth-${idx}`,
        title: llmTicket.title,
        description: llmTicket.description,
        severity: llmTicket.severity,
        category: llmTicket.category,
        effort: llmTicket.effort,
        recommendation: llmTicket.recommendation,
        evidence: {
          sessionIds: resolved.sessionIds,
          conversationIds: resolved.conversationIds,
          quotes: llmTicket.quotes,
        },
        scoreBreakdown,
        compositeScore: composite,
      };
    });

    // -----------------------------------------------------------------------
    // Deduplicate
    // -----------------------------------------------------------------------
    const dedupedTickets = deduplicateTickets(rawTickets);

    // -----------------------------------------------------------------------
    // Enrich with churn data
    // -----------------------------------------------------------------------
    const churnScores: ChurnScoreRow[] = await prisma.dailyChurnScore.findMany({
      where: { projectId },
      orderBy: { date: 'desc' },
      distinct: ['distinctId'],
      select: { distinctId: true, email: true, riskScore: true },
    });

    // Build user lookup: sessionId/conversationId -> user info
    const userMap = new Map<string, UserInfo>();
    for (const s of parsedSessions) {
      if (s.distinctId) {
        userMap.set(s.id, { distinctId: s.distinctId });
      }
    }
    for (const c of parsedConversations) {
      if (c.participantEmail) {
        userMap.set(c.id, { email: c.participantEmail });
      }
    }

    const enrichedTickets = enrichWithChurnData(dedupedTickets, churnScores, userMap);

    // Recompute composite scores with churn data
    for (const ticket of enrichedTickets) {
      if (ticket.churnImpact.atRiskUsers > 0) {
        const breakdown = ticket.scoreBreakdown as ScoreBreakdown;
        breakdown.churn = Math.min(100, ticket.churnImpact.atRiskUsers * 20);
        ticket.compositeScore = computeCompositeScore(breakdown);
      }
    }

    // -----------------------------------------------------------------------
    // Compute trending for each ticket
    // -----------------------------------------------------------------------
    const existingTickets = await prisma.ticket.findMany({
      where: { projectId },
      select: { title: true, trending: true },
    });

    const ticketsWithTrending = enrichedTickets.map((ticket) => {
      const previous = existingTickets.find(
        (et) => et.title.toLowerCase() === ticket.title.toLowerCase(),
      );
      const existingTrending = previous?.trending as ExistingTicketTrending | null;
      const evidenceCount = ticket.evidence.sessionIds.length + ticket.evidence.conversationIds.length;
      const trending = computeTrending(existingTrending, evidenceCount);

      return { ...ticket, trending };
    });

    // -----------------------------------------------------------------------
    // Generate Jira markdown
    // -----------------------------------------------------------------------
    const finalTickets = ticketsWithTrending.map((ticket) => ({
      ...ticket,
      jiraMarkdown: generateJiraMarkdown({
        title: ticket.title,
        severity: ticket.severity as string,
        category: ticket.category as string,
        compositeScore: ticket.compositeScore,
        effort: ticket.effort as string,
        description: ticket.description as string,
        evidence: ticket.evidence,
        churnImpact: ticket.churnImpact,
        recommendation: ticket.recommendation as string,
      }),
    }));

    // -----------------------------------------------------------------------
    // Persist: delete old tickets, create new ones
    // -----------------------------------------------------------------------
    const now = new Date();

    await prisma.ticket.deleteMany({ where: { projectId } });

    await prisma.ticket.createMany({
      data: finalTickets.map((t) => ({
        projectId: projectId!,
        title: t.title,
        description: t.description as string,
        severity: t.severity as string,
        category: t.category as string,
        effort: (t.effort as string) || 'medium',
        recommendation: (t.recommendation as string) || '',
        evidence: t.evidence as object,
        scoreBreakdown: (t.scoreBreakdown as ScoreBreakdown) as object,
        churnImpact: t.churnImpact as object,
        trending: t.trending as object,
        compositeScore: t.compositeScore,
        jiraMarkdown: t.jiraMarkdown,
        synthesizedAt: now,
      })),
    });

    // -----------------------------------------------------------------------
    // Mark complete
    // -----------------------------------------------------------------------
    await prisma.synthesizedInsight.update({
      where: { projectId },
      data: {
        syncStatus: 'complete',
        lastSynthesizedAt: now,
      },
    });

    // Return freshly created tickets
    const createdTickets = await prisma.ticket.findMany({
      where: { projectId },
      orderBy: { compositeScore: 'desc' },
    });

    return NextResponse.json({ tickets: createdTickets });
  } catch (error) {
    console.error('[Tickets Synthesize] Error:', error);

    // Reset sync status on failure
    if (projectId) {
      try {
        await prisma.synthesizedInsight.update({
          where: { projectId },
          data: { syncStatus: 'error', syncError: String(error) },
        });
      } catch { /* best effort */ }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ticket synthesis failed' },
      { status: 500 },
    );
  }
}
