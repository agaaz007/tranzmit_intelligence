import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Schema for unified AI Product Team insights
const UnifiedInsightsSchema = z.object({
  prioritized_issues: z.array(z.object({
    id: z.string().describe("Unique identifier for this issue"),
    title: z.string().describe("Clear, actionable issue title"),
    description: z.string().describe("What's happening and why it matters"),
    severity: z.enum(["critical", "high", "medium"]).describe("Impact level"),
    priority_score: z.number().describe("0-100 score based on frequency + severity + evidence strength"),
    category: z.enum(["ux_friction", "feature_gap", "bug", "confusion", "performance", "onboarding", "retention"]),
    evidence: z.object({
      session_count: z.number().describe("Number of sessions showing this issue"),
      conversation_count: z.number().describe("Number of conversations mentioning this"),
      sample_quotes: z.array(z.string()).describe("1-3 direct quotes from users"),
    }),
    recommendation: z.string().describe("Specific, actionable fix"),
    effort: z.enum(["low", "medium", "high"]).describe("Implementation effort estimate"),
  })).describe("Top issues sorted by priority score"),

  user_goals: z.array(z.object({
    goal: z.string().describe("What users are trying to accomplish"),
    success_rate: z.string().describe("How often they succeed"),
    blockers: z.array(z.string()).describe("What's preventing success"),
  })).describe("Top 5 user goals"),

  quick_wins: z.array(z.object({
    action: z.string().describe("Specific action to take"),
    impact: z.string().describe("Expected improvement"),
    effort: z.enum(["low", "medium"]),
  })).describe("3-5 low-effort, high-impact fixes"),

  product_health: z.object({
    overall_score: z.number().describe("1-10 product health score"),
    sentiment_trend: z.enum(["improving", "stable", "declining"]),
    top_strength: z.string().describe("What's working well"),
    top_risk: z.string().describe("Biggest risk to address"),
  }),

  executive_summary: z.string().describe("2-3 sentence summary for stakeholders"),
});

export type UnifiedInsights = z.infer<typeof UnifiedInsightsSchema>;

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    // Verify access
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data sources in parallel
    const [sessions, conversations] = await Promise.all([
      // Sessions with completed analysis
      prisma.session.findMany({
        where: { projectId, analysisStatus: 'completed' },
        select: { id: true, name: true, analysis: true, startTime: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      // Conversations with completed analysis
      prisma.conversation.findMany({
        where: { projectId, analysisStatus: 'completed' },
        select: { id: true, participantName: true, analysis: true, transcript: true, conversedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    // Parse session analyses
    const sessionData: Array<{ id: string; name: string; analysis: SessionAnalysis }> = [];
    for (const session of sessions) {
      if (session.analysis) {
        try {
          const parsed = JSON.parse(session.analysis) as SessionAnalysis;
          sessionData.push({ id: session.id, name: session.name, analysis: parsed });
        } catch { /* skip invalid */ }
      }
    }

    // Parse conversation analyses
    const conversationData: Array<{ id: string; name: string; analysis: ConversationAnalysis; transcript?: string }> = [];
    for (const convo of conversations) {
      if (convo.analysis) {
        try {
          const parsed = JSON.parse(convo.analysis) as ConversationAnalysis;
          conversationData.push({
            id: convo.id,
            name: convo.participantName || 'Anonymous',
            analysis: parsed,
            transcript: convo.transcript || undefined,
          });
        } catch { /* skip invalid */ }
      }
    }

    // If no data, return empty state
    if (sessionData.length === 0 && conversationData.length === 0) {
      return NextResponse.json({
        insights: null,
        stats: {
          sessions_analyzed: 0,
          conversations_analyzed: 0,
          last_updated: null,
        },
      });
    }

    // Aggregate friction points from sessions
    const frictionPoints: Map<string, { count: number; sessionIds: string[] }> = new Map();
    const userIntents: Map<string, number> = new Map();
    const tags: Map<string, number> = new Map();
    const sessionQuotes: string[] = [];

    for (const { id, analysis } of sessionData) {
      // Friction points
      if (analysis.frustration_points) {
        for (const fp of analysis.frustration_points) {
          const key = fp.issue.toLowerCase().trim();
          const existing = frictionPoints.get(key) || { count: 0, sessionIds: [] };
          existing.count++;
          existing.sessionIds.push(id);
          frictionPoints.set(key, existing);
          if (sessionQuotes.length < 10) sessionQuotes.push(fp.issue);
        }
      }
      // User intents
      if (analysis.user_intent) {
        const intent = analysis.user_intent.toLowerCase().trim();
        userIntents.set(intent, (userIntents.get(intent) || 0) + 1);
      }
      // Tags
      if (analysis.tags) {
        for (const tag of analysis.tags) {
          tags.set(tag, (tags.get(tag) || 0) + 1);
        }
      }
    }

    // Aggregate from conversations
    const painPoints: Map<string, { count: number; convoIds: string[] }> = new Map();
    const featureRequests: Map<string, number> = new Map();
    const convoQuotes: string[] = [];

    for (const { id, analysis } of conversationData) {
      // Pain points
      if (analysis.pain_points) {
        for (const pp of analysis.pain_points) {
          const key = pp.toLowerCase().trim();
          const existing = painPoints.get(key) || { count: 0, convoIds: [] };
          existing.count++;
          existing.convoIds.push(id);
          painPoints.set(key, existing);
        }
      }
      // Feature requests
      if (analysis.feature_requests) {
        for (const fr of analysis.feature_requests) {
          featureRequests.set(fr, (featureRequests.get(fr) || 0) + 1);
        }
      }
      // Quotes
      if (analysis.key_quotes) {
        convoQuotes.push(...analysis.key_quotes.slice(0, 3));
      }
    }

    // Calculate average ratings
    const sessionRatings = sessionData
      .map(s => s.analysis.ux_rating)
      .filter((r): r is number => r !== undefined);
    const avgSessionRating = sessionRatings.length > 0
      ? sessionRatings.reduce((a, b) => a + b, 0) / sessionRatings.length
      : null;

    const convoSatisfaction = conversationData
      .map(c => c.analysis.satisfaction_score)
      .filter((s): s is number => s !== undefined);
    const avgConvoSatisfaction = convoSatisfaction.length > 0
      ? convoSatisfaction.reduce((a, b) => a + b, 0) / convoSatisfaction.length
      : null;

    // Build prompt for AI synthesis
    const systemPrompt = `You are an AI Product Team Lead synthesizing user research data.
Your job is to identify the MOST IMPORTANT issues and opportunities from both quantitative (session replays) and qualitative (user conversations) data.

Think like a PM: prioritize by impact, be specific, and give actionable recommendations.
DO NOT hallucinate - only reference patterns that appear in the data provided.`;

    const userPrompt = `Synthesize these findings into a unified product insight report:

=== QUANTITATIVE DATA (${sessionData.length} sessions analyzed) ===

TOP FRICTION POINTS (from session replays):
${Array.from(frictionPoints.entries())
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 15)
  .map(([issue, data]) => `- "${issue}" (${data.count} sessions)`)
  .join('\n') || 'None detected'}

USER INTENTS:
${Array.from(userIntents.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([intent, count]) => `- "${intent}" (${count}x)`)
  .join('\n') || 'None detected'}

COMMON TAGS:
${Array.from(tags.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([tag, count]) => `- ${tag} (${count}x)`)
  .join('\n') || 'None'}

Average UX Rating: ${avgSessionRating?.toFixed(1) || 'N/A'}/10

=== QUALITATIVE DATA (${conversationData.length} conversations) ===

PAIN POINTS FROM USERS:
${Array.from(painPoints.entries())
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 15)
  .map(([pain, data]) => `- "${pain}" (${data.count} mentions)`)
  .join('\n') || 'None collected'}

FEATURE REQUESTS:
${Array.from(featureRequests.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([fr, count]) => `- "${fr}" (${count}x)`)
  .join('\n') || 'None'}

DIRECT USER QUOTES:
${convoQuotes.slice(0, 5).map(q => `- "${q}"`).join('\n') || 'None available'}

Average Satisfaction: ${avgConvoSatisfaction?.toFixed(1) || 'N/A'}/10

=== TASK ===
Create a unified product insight report that:
1. Identifies the TOP issues (combining both data sources when they point to the same problem)
2. Prioritizes by impact (frequency × severity × evidence strength)
3. Provides specific, actionable recommendations
4. Identifies quick wins (low effort, high impact)

Be specific and reference the actual data. Don't be generic.`;

    const { object: insights } = await generateObject({
      model: openai('gpt-5.2-chat-latest'),
      schema: UnifiedInsightsSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    // Enhance issues with actual session/conversation IDs
    const enhancedIssues = insights.prioritized_issues.map((issue, idx) => {
      // Find matching sessions by looking for similar friction points
      const matchingSessions: string[] = [];
      const matchingConvos: string[] = [];

      // Simple matching: look for keywords in friction points
      const issueKeywords = issue.title.toLowerCase().split(' ');
      for (const [fp, data] of frictionPoints.entries()) {
        if (issueKeywords.some(kw => kw.length > 3 && fp.includes(kw))) {
          matchingSessions.push(...data.sessionIds.slice(0, 3));
        }
      }
      for (const [pp, data] of painPoints.entries()) {
        if (issueKeywords.some(kw => kw.length > 3 && pp.includes(kw))) {
          matchingConvos.push(...data.convoIds.slice(0, 3));
        }
      }

      return {
        ...issue,
        id: `issue-${idx}`,
        linked_sessions: [...new Set(matchingSessions)].slice(0, 5),
        linked_conversations: [...new Set(matchingConvos)].slice(0, 5),
      };
    });

    // Save to database
    await prisma.synthesizedInsight.upsert({
      where: { projectId },
      create: {
        projectId,
        sessionCount: sessionData.length,
        criticalIssues: JSON.stringify(enhancedIssues),
        patternSummary: insights.executive_summary,
        topUserGoals: JSON.stringify(insights.user_goals),
        immediateActions: JSON.stringify(insights.quick_wins),
        lastSynthesizedAt: new Date(),
        syncStatus: 'complete',
      },
      update: {
        sessionCount: sessionData.length,
        criticalIssues: JSON.stringify(enhancedIssues),
        patternSummary: insights.executive_summary,
        topUserGoals: JSON.stringify(insights.user_goals),
        immediateActions: JSON.stringify(insights.quick_wins),
        lastSynthesizedAt: new Date(),
        syncStatus: 'complete',
      },
    });

    return NextResponse.json({
      insights: {
        ...insights,
        prioritized_issues: enhancedIssues,
      },
      stats: {
        sessions_analyzed: sessionData.length,
        conversations_analyzed: conversationData.length,
        avg_session_rating: avgSessionRating,
        avg_conversation_satisfaction: avgConvoSatisfaction,
        last_updated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[Dashboard Synthesize] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Synthesis failed' },
      { status: 500 }
    );
  }
}
