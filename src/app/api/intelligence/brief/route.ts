import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const BriefSchema = z.object({
  headline: z.string().describe("One-sentence summary of the biggest conversion insight"),
  unpaid_summary: z.string().describe("2-3 sentences on trial user churn patterns"),
  paid_summary: z.string().describe("2-3 sentences on paid user churn patterns"),
  top_actions: z.array(z.object({
    action: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
    effort: z.enum(['low', 'medium', 'high']),
    rationale: z.string(),
  })).describe("Top 3-5 recommended actions"),
  risk_outlook: z.string().describe("Brief forward-looking risk assessment"),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await getProjectWithAccess(projectId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [archetypes, patterns, profileStats] = await Promise.all([
    prisma.churnArchetype.findMany({ where: { projectId, isActive: true }, orderBy: { userCount: 'desc' } }),
    prisma.discoveredPattern.findMany({ where: { projectId, status: { not: 'dismissed' } }, orderBy: { confidence: 'desc' }, take: 10 }),
    prisma.userProfile.groupBy({ by: ['riskLevel'], where: { projectId }, _count: { id: true } }),
  ]);

  if (archetypes.length === 0 && patterns.length === 0) {
    return NextResponse.json({ error: 'No intelligence data yet. Generate archetypes or discover patterns first.' }, { status: 404 });
  }

  const archetypeDesc = archetypes.map(a =>
    `- ${a.name} (${a.churnType}, ${a.userCount} users): ${a.tagline}`
  ).join('\n');

  const patternDesc = patterns.map(p =>
    `- [${p.priority}] ${p.title} (${p.patternType}, confidence: ${(p.confidence * 100).toFixed(0)}%): ${p.description.substring(0, 200)}`
  ).join('\n');

  const riskBreakdown = profileStats.map(s => `${s.riskLevel}: ${s._count.id}`).join(', ');

  const { object } = await generateObject({
    model: openai('gpt-5.2-chat-latest'),
    schema: BriefSchema,
    system: 'You are a conversion intelligence analyst creating an executive brief. Be concise and actionable.',
    prompt: `Generate a conversion intelligence brief from this data:\n\nARCHETYPES:\n${archetypeDesc}\n\nDISCOVERED PATTERNS:\n${patternDesc}\n\nRISK DISTRIBUTION: ${riskBreakdown}`,
  });

  return NextResponse.json({ brief: object, generatedAt: new Date().toISOString() });
}
