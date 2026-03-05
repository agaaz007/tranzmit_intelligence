import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

export const PatternSchema = z.object({
  patterns: z.array(z.object({
    title: z.string(),
    description: z.string(),
    patternType: z.enum(['conversion_blocker', 'behavioral_cluster', 'feature_suggestion', 'risk_indicator']),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.object({
      source: z.enum(['session', 'interview', 'error', 'archetype']),
      sourceId: z.string().optional(),
      detail: z.string(),
    })),
    suggestion: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    affectedUserCount: z.number(),
  })),
});

export type AnalyzedPattern = z.infer<typeof PatternSchema>['patterns'][number];

export interface PatternAnalysisInput {
  frictionPoints: Array<{ issue: string; count: number; sessionIds: string[] }>;
  interviewThemes: Array<{ theme: string; count: number; sentiment: string }>;
  errorClusters: Array<{ message: string; count: number; userCount: number }>;
  archetypeSummaries: Array<{ name: string; id: string; userCount: number; triggerEvents: string[] }>;
  totalUsers: number;
  churnType?: 'unpaid' | 'paid' | null;
}

export async function analyzePatterns(input: PatternAnalysisInput): Promise<AnalyzedPattern[]> {
  const sections: string[] = [];

  if (input.frictionPoints.length > 0) {
    sections.push('FRICTION POINTS:\n' + input.frictionPoints.slice(0, 20).map(f =>
      `- "${f.issue}" (${f.count}x, ${f.sessionIds.length} sessions)`
    ).join('\n'));
  }

  if (input.interviewThemes.length > 0) {
    sections.push('INTERVIEW THEMES:\n' + input.interviewThemes.slice(0, 15).map(t =>
      `- "${t.theme}" (${t.count}x, sentiment: ${t.sentiment})`
    ).join('\n'));
  }

  if (input.errorClusters.length > 0) {
    sections.push('ERROR CLUSTERS:\n' + input.errorClusters.slice(0, 15).map(e =>
      `- "${e.message}" (${e.count} occurrences, ${e.userCount} users)`
    ).join('\n'));
  }

  if (input.archetypeSummaries.length > 0) {
    sections.push('ARCHETYPE CONTEXT:\n' + input.archetypeSummaries.map(a =>
      `- "${a.name}" (${a.userCount} users): triggers=[${a.triggerEvents.join(', ')}]`
    ).join('\n'));
  }

  if (sections.length === 0) return [];

  const churnContext = input.churnType
    ? `Focus on ${input.churnType === 'unpaid' ? 'trial users who never converted' : 'paying customers who cancelled'}.`
    : 'Analyze across all user types.';

  const { object } = await generateObject({
    model: openai('gpt-5.2-chat-latest'),
    schema: PatternSchema,
    system: `You are a senior product analyst discovering cross-source patterns from user behavior data. Identify patterns that appear across multiple data sources (sessions, interviews, errors). Prioritize actionable insights. ${churnContext}`,
    prompt: `Analyze data from ${input.totalUsers} users and discover non-obvious patterns:\n\n${sections.join('\n\n')}\n\nIdentify 3-7 distinct patterns. Each must have evidence from at least one source. Confidence should reflect how strongly the data supports the pattern.`,
  });

  return object.patterns;
}
