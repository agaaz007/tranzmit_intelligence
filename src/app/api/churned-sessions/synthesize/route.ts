import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { EnhancedCriticalIssue, SynthesizedInsightData } from '@/types/session';

const ChurnedInsightsSchema = z.object({
  critical_issues: z.array(z.object({
    title: z.string().describe("Short title for the issue"),
    description: z.string().describe("Detailed explanation of why this is critical for churned users"),
    frequency: z.string().describe("How often this occurs, e.g., 'Affects 3 out of 5 sessions'"),
    severity: z.enum(["critical", "high", "medium"]).describe("Severity level"),
    recommendation: z.string().describe("Actionable recommendation to fix this issue"),
    sessionIds: z.array(z.string()).describe("The exact session IDs that relate to this issue. Only use IDs from the provided data."),
  })).describe("Top 3-5 most critical issues found in churned user sessions, prioritized by impact"),

  pattern_summary: z.string().describe("2-3 sentence summary of the overall UX patterns observed across churned user sessions. Focus on what drove users away."),

  top_user_goals: z.array(z.object({
    goal: z.string().describe("What churned users were trying to accomplish"),
    success_rate: z.string().describe("Estimated success rate or observation"),
  })).describe("Top 3 user goals identified across churned user sessions"),

  immediate_actions: z.array(z.string()).describe("3-5 immediate actionable items to reduce churn based on session evidence"),
});

interface FrictionEntry {
  issue: string;
  count: number;
  sessionIds: string[];
  sessionNames: string[];
}

// POST: Synthesize insights from churned sessions only
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const completedSessions = await prisma.session.findMany({
      where: { projectId, source: 'churned', analysisStatus: 'completed' },
      select: { id: true, name: true, analysis: true, metadata: true },
      orderBy: { createdAt: 'desc' },
    });

    if (completedSessions.length === 0) {
      return NextResponse.json({ error: 'No analyzed churned sessions found' }, { status: 404 });
    }

    // Build friction map with session tracking
    const frictionMap = new Map<string, FrictionEntry>();
    const intentMap = new Map<string, { count: number; sessionIds: string[] }>();
    const tagMap = new Map<string, number>();

    for (const session of completedSessions) {
      if (!session.analysis) continue;

      let analysis;
      try {
        analysis = JSON.parse(session.analysis);
      } catch {
        continue;
      }

      for (const fp of analysis.frustration_points || []) {
        const key = fp.issue;
        const existing: FrictionEntry = frictionMap.get(key) || { issue: key, count: 0, sessionIds: [], sessionNames: [] };
        existing.count++;
        if (!existing.sessionIds.includes(session.id)) {
          existing.sessionIds.push(session.id);
          existing.sessionNames.push(session.name);
        }
        frictionMap.set(key, existing);
      }

      const intent = analysis.user_intent;
      if (intent) {
        const existing = intentMap.get(intent) || { count: 0, sessionIds: [] };
        existing.count++;
        existing.sessionIds.push(session.id);
        intentMap.set(intent, existing);
      }

      for (const tag of analysis.tags || []) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }

    const frictionEntries = Array.from(frictionMap.values()).sort((a, b) => b.count - a.count);
    const intentEntries = Array.from(intentMap.entries()).sort((a, b) => b[1].count - a[1].count);
    const tagEntries = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);

    const frictionPrompt = frictionEntries.slice(0, 15).map(f =>
      `- "${f.issue}" (occurred ${f.count}x, sessions: [${f.sessionIds.join(', ')}])`
    ).join('\n');

    const intentPrompt = intentEntries.slice(0, 10).map(([intent, data]) =>
      `- "${intent}" (${data.count} sessions)`
    ).join('\n');

    const tagPrompt = tagEntries.slice(0, 10).map(([tag, count]) =>
      `- ${tag} (${count}x)`
    ).join('\n');

    // Get email info from metadata
    const emailSummary = completedSessions.slice(0, 20).map(s => {
      let meta;
      try { meta = s.metadata ? JSON.parse(s.metadata) : null; } catch { meta = null; }
      return meta?.email || 'unknown';
    });
    const uniqueEmails = [...new Set(emailSummary)];

    const systemPrompt = `You are a senior UX Research Lead analyzing session recordings from CHURNED USERS — people who have stopped using the product.
Your job is to identify the MOST CRITICAL issues that likely contributed to user churn.

Prioritize issues by:
1. Frequency (how many churned users experienced this)
2. Severity (how much it impacted user success and satisfaction)
3. Churn signal strength (issues that most likely drove users away)
4. Actionability (can it be fixed to reduce future churn?)

IMPORTANT: For each critical issue, include the exact session IDs from the friction points. Only use session IDs that appear in the provided data.

Focus your analysis on understanding WHY these users churned — what frustrated them, what goals they couldn't achieve, and what the product team should fix immediately to reduce churn.`;

    const userPrompt = `Analyze these aggregated findings from ${completedSessions.length} CHURNED USER sessions (${uniqueEmails.length} unique users):

FRICTION POINTS (with frequency and session IDs):
${frictionPrompt || 'None detected'}

USER INTENTS (with frequency):
${intentPrompt || 'None detected'}

COMMON TAGS/ISSUES:
${tagPrompt || 'None detected'}

Identify the most serious issues that likely drove these users to churn and provide actionable recommendations to reduce future churn.`;

    const { object } = await generateObject({
      model: openai('gpt-5.2-chat-latest'),
      schema: ChurnedInsightsSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    // Post-process: validate session IDs and attach session names
    const allSessionIds = new Set(completedSessions.map(s => s.id));
    const sessionNameMap = new Map(completedSessions.map(s => [s.id, s.name]));

    const enhancedIssues: EnhancedCriticalIssue[] = object.critical_issues.map(issue => {
      let validSessionIds = issue.sessionIds.filter(id => allSessionIds.has(id));

      if (validSessionIds.length === 0) {
        const titleLower = issue.title.toLowerCase();
        const descLower = issue.description.toLowerCase();
        for (const entry of frictionEntries) {
          const issueLower = entry.issue.toLowerCase();
          if (titleLower.includes(issueLower.substring(0, 20)) ||
              descLower.includes(issueLower.substring(0, 20)) ||
              issueLower.includes(titleLower.substring(0, 20))) {
            validSessionIds.push(...entry.sessionIds);
          }
        }
        validSessionIds = [...new Set(validSessionIds)];
      }

      return {
        title: issue.title,
        description: issue.description,
        frequency: issue.frequency,
        severity: issue.severity,
        recommendation: issue.recommendation,
        sessionIds: validSessionIds,
        sessionNames: validSessionIds.map(id => sessionNameMap.get(id) || id),
      };
    });

    enhancedIssues.sort((a, b) => {
      const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.sessionIds.length - a.sessionIds.length;
    });

    const result: SynthesizedInsightData = {
      id: 'churned-' + projectId,
      projectId,
      sessionCount: completedSessions.length,
      criticalIssues: enhancedIssues,
      patternSummary: object.pattern_summary,
      topUserGoals: object.top_user_goals,
      immediateActions: object.immediate_actions,
      lastSyncedAt: null,
      lastAnalyzedAt: null,
      lastSynthesizedAt: new Date().toISOString(),
      syncStatus: 'complete',
      syncError: null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[ChurnedSynthesize] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Synthesis failed' },
      { status: 500 }
    );
  }
}

// GET: Fetch cached churned insights (from last synthesis)
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  // Count analyzed churned sessions
  const count = await prisma.session.count({
    where: { projectId, source: 'churned', analysisStatus: 'completed' },
  });

  if (count === 0) {
    return NextResponse.json(null);
  }

  return NextResponse.json({ sessionCount: count, needsSynthesis: true });
}
