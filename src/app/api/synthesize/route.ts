import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Define the schema for synthesized insights
const SynthesizedInsightsSchema = z.object({
    critical_issues: z.array(z.object({
        title: z.string().describe("Short title for the issue"),
        description: z.string().describe("Detailed explanation of why this is critical, dont hallucinate"),
        frequency: z.string().describe("How often this occurs, e.g., 'Affects 3 out of 5 sessions', dont hallucinate"),
        severity: z.enum(["critical", "high", "medium"]).describe("Severity level"),
        recommendation: z.string().describe("Actionable recommendation to fix this issue, dont hallucinate"),
    })).describe("Top 3-5 most critical and common issues, prioritized by impact, dont hallucinate"),
    
    pattern_summary: z.string().describe("2-3 sentence summary of the overall UX patterns observed across all sessions, dont hallucinate"),
    
    top_user_goals: z.array(z.object({
        goal: z.string().describe("What users are trying to accomplish, dont hallucinate"),
        success_rate: z.string().describe("Estimated success rate or observation, dont hallucinate"),
    })).describe("Top 3 user goals identified across sessions"),
    
    immediate_actions: z.array(z.string()).describe("3-5 immediate actionable items to improve UX, dont hallucinate"),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { frictionPoints, userIntents, tags, sessionCount } = body;

        if (!frictionPoints || !userIntents) {
            return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
        }

        const systemPrompt = `You are a senior UX Research Lead synthesizing findings from multiple user session analyses. Dont Hallucinate.
Your job is to identify the MOST CRITICAL and COMMON issues that need immediate attention.
Prioritize issues by:
1. Frequency (how many sessions are affected)
2. Severity (how much it impacts user success)
3. Actionability (can it be fixed?)

Be specific and actionable in your recommendations. Don't be generic.`;

        const userPrompt = `Analyze these aggregated findings from ${sessionCount} user sessions:

FRICTION POINTS (with frequency):
${frictionPoints.map((f: [string, number]) => `- "${f[0]}" (occurred ${f[1]}x)`).join('\n')}

USER INTENTS (with frequency):
${userIntents.map((i: [string, number]) => `- "${i[0]}" (${i[1]} sessions)`).join('\n')}

COMMON TAGS/ISSUES:
${tags.map((t: [string, number]) => `- ${t[0]} (${t[1]}x)`).join('\n')}
Dont hallucinate.
Identify the most serious issues that need immediate attention and provide actionable recommendations.`;

        const { object } = await generateObject({
            model: openai('gpt-5.2-chat-latest'),
            schema: SynthesizedInsightsSchema,
            system: systemPrompt,
            prompt: userPrompt,
        });

        return NextResponse.json(object);

    } catch (error) {
        console.error('Error synthesizing insights:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
