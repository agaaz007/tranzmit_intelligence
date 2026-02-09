import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { EnhancedCriticalIssue, SynthesizedInsightData } from '@/types/session';

// Enhanced schema with sessionIds per issue
const SynthesizedInsightsSchema = z.object({
  critical_issues: z.array(z.object({
    title: z.string().describe("Short title for the issue"),
    description: z.string().describe("Detailed explanation of why this is critical"),
    frequency: z.string().describe("How often this occurs, e.g., 'Affects 3 out of 5 sessions'"),
    severity: z.enum(["critical", "high", "medium"]).describe("Severity level"),
    recommendation: z.string().describe("Actionable recommendation to fix this issue"),
    sessionIds: z.array(z.string()).describe("The exact session IDs from the friction points that relate to this issue. Only use IDs from the provided data."),
  })).describe("Top 3-5 most critical and common issues, prioritized by impact"),

  pattern_summary: z.string().describe("2-3 sentence summary of the overall UX patterns observed across all sessions"),

  top_user_goals: z.array(z.object({
    goal: z.string().describe("What users are trying to accomplish"),
    success_rate: z.string().describe("Estimated success rate or observation"),
  })).describe("Top 3 user goals identified across sessions"),

  immediate_actions: z.array(z.string()).describe("3-5 immediate actionable items to improve UX"),
});

interface FrictionEntry {
  issue: string;
  count: number;
  sessionIds: string[];
  sessionNames: string[];
}

/**
 * Synthesize insights across all analyzed sessions for a project,
 * with session ID linkage so each issue maps back to source sessions.
 */
export async function synthesizeInsightsWithSessionLinkage(projectId: string): Promise<SynthesizedInsightData> {
  // Fetch all completed sessions
  const completedSessions = await prisma.session.findMany({
    where: { projectId, analysisStatus: 'completed' },
    select: { id: true, name: true, analysis: true },
    orderBy: { createdAt: 'desc' },
  });

  if (completedSessions.length === 0) {
    throw new Error('No analyzed sessions found');
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

    // Track friction points with session IDs
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

    // Track intents
    const intent = analysis.user_intent;
    if (intent) {
      const existing: { count: number; sessionIds: string[] } = intentMap.get(intent) || { count: 0, sessionIds: [] };
      existing.count++;
      existing.sessionIds.push(session.id);
      intentMap.set(intent, existing);
    }

    // Track tags
    for (const tag of analysis.tags || []) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
  }

  const frictionEntries = Array.from(frictionMap.values()).sort((a, b) => b.count - a.count);
  const intentEntries = Array.from(intentMap.entries()).sort((a, b) => b[1].count - a[1].count);
  const tagEntries = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);

  // Build prompt with session IDs included
  const frictionPrompt = frictionEntries.slice(0, 15).map(f =>
    `- "${f.issue}" (occurred ${f.count}x, sessions: [${f.sessionIds.join(', ')}])`
  ).join('\n');

  const intentPrompt = intentEntries.slice(0, 10).map(([intent, data]) =>
    `- "${intent}" (${data.count} sessions)`
  ).join('\n');

  const tagPrompt = tagEntries.slice(0, 10).map(([tag, count]) =>
    `- ${tag} (${count}x)`
  ).join('\n');

  const systemPrompt = `You are a senior UX Research Lead synthesizing findings from multiple user session analyses.
Your job is to identify the MOST CRITICAL and COMMON issues that need immediate attention.
Prioritize issues by:
1. Frequency (how many sessions are affected)
2. Severity (how much it impacts user success)
3. Actionability (can it be fixed?)

IMPORTANT: For each critical issue, include the exact session IDs from the friction points that map to this issue. Combine session IDs from related friction points. Only use session IDs that appear in the provided data.

Be specific and actionable in your recommendations. Don't be generic.`;

  const userPrompt = `Analyze these aggregated findings from ${completedSessions.length} user sessions:

FRICTION POINTS (with frequency and session IDs):
${frictionPrompt}

USER INTENTS (with frequency):
${intentPrompt}

COMMON TAGS/ISSUES:
${tagPrompt}

Identify the most serious issues that need immediate attention and provide actionable recommendations.`;

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: SynthesizedInsightsSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  // Post-process: validate session IDs and attach session names
  const allSessionIds = new Set(completedSessions.map(s => s.id));
  const sessionNameMap = new Map(completedSessions.map(s => [s.id, s.name]));

  const enhancedIssues: EnhancedCriticalIssue[] = object.critical_issues.map(issue => {
    // Validate returned session IDs
    let validSessionIds = issue.sessionIds.filter(id => allSessionIds.has(id));

    // If LLM returned no valid IDs, try to match by finding related friction points
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

  // Sort: critical first, then by session count
  enhancedIssues.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return b.sessionIds.length - a.sessionIds.length;
  });

  // Persist to database
  const insight = await prisma.synthesizedInsight.upsert({
    where: { projectId },
    create: {
      projectId,
      sessionCount: completedSessions.length,
      criticalIssues: JSON.stringify(enhancedIssues),
      patternSummary: object.pattern_summary,
      topUserGoals: JSON.stringify(object.top_user_goals),
      immediateActions: JSON.stringify(object.immediate_actions),
      lastSynthesizedAt: new Date(),
      syncStatus: 'complete',
    },
    update: {
      sessionCount: completedSessions.length,
      criticalIssues: JSON.stringify(enhancedIssues),
      patternSummary: object.pattern_summary,
      topUserGoals: JSON.stringify(object.top_user_goals),
      immediateActions: JSON.stringify(object.immediate_actions),
      lastSynthesizedAt: new Date(),
      syncStatus: 'complete',
    },
  });

  return {
    id: insight.id,
    projectId: insight.projectId,
    sessionCount: insight.sessionCount,
    criticalIssues: enhancedIssues,
    patternSummary: object.pattern_summary,
    topUserGoals: object.top_user_goals,
    immediateActions: object.immediate_actions,
    lastSyncedAt: insight.lastSyncedAt?.toISOString() || null,
    lastAnalyzedAt: insight.lastAnalyzedAt?.toISOString() || null,
    lastSynthesizedAt: insight.lastSynthesizedAt?.toISOString() || null,
    syncStatus: insight.syncStatus,
    syncError: insight.syncError,
  };
}
