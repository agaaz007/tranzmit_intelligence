import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { parseRRWebSession } from '@/lib/rrweb-parser';

// Define the schema for the LLM response (same as /api/analyze)
const UXAnalysisSchema = z.object({
  summary: z.string().describe("A 2-3 sentence executive summary of what happened in this session."),
  user_intent: z.string().describe("What the user was trying to accomplish based on their actions."),
  tags: z.array(z.string()).describe("3-5 relevant tags based ONLY on evidence in the logs."),
  went_well: z.array(z.string()).describe("List of things that worked smoothly for the user."),
  frustration_points: z.array(z.object({
    timestamp: z.string().describe("The exact timestamp from the log in [MM:SS] format"),
    issue: z.string().describe("Specific description of what went wrong")
  })).describe("Friction points that caused user frustration."),
  ux_rating: z.number().min(1).max(10).describe("1-10 rating where 10 is perfect UX."),
  description: z.string().describe("A detailed narrative paragraph explaining the user's journey chronologically.")
});

// POST: Trigger analysis for a session
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId: id } = await params;

    // Get session with events
    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        events: true,
        analysisStatus: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session.events) {
      return NextResponse.json({ error: 'No events stored for this session' }, { status: 400 });
    }

    // Mark as analyzing
    await prisma.session.update({
      where: { id },
      data: { analysisStatus: 'analyzing' },
    });

    try {
      const events = JSON.parse(session.events);

      // Parse and analyze the session
      const semanticSession = parseRRWebSession(events);

      if (semanticSession.logs.length === 0) {
        await prisma.session.update({
          where: { id },
          data: { analysisStatus: 'failed' },
        });
        return NextResponse.json({ error: 'No meaningful user interactions found' }, { status: 400 });
      }

      // Build the session log string
      const sessionLog = semanticSession.logs
        .map(log => {
          const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
          return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
        })
        .join('\n');

      // Build context
      const s = semanticSession.summary;
      const signals = semanticSession.behavioralSignals;

      const sessionContext = [
        `Page: ${semanticSession.pageUrl || 'Unknown'}`,
        semanticSession.pageTitle ? `Title: "${semanticSession.pageTitle}"` : null,
        `Duration: ${semanticSession.totalDuration}`,
        `Total Events: ${semanticSession.eventCount}`,
        `Viewport: ${semanticSession.viewportSize.width}x${semanticSession.viewportSize.height}`,
        '',
        '=== CLICK METRICS ===',
        `- Total Clicks: ${s.totalClicks}`,
        `- Rage Clicks: ${s.rageClicks}`,
        `- Dead/Unresponsive Clicks: ${s.deadClicks}`,
        '',
        '=== INPUT METRICS ===',
        `- Total Input Events: ${s.totalInputs}`,
        `- Abandoned Inputs: ${s.abandonedInputs}`,
        '',
        '=== SCROLL METRICS ===',
        `- Total Scrolls: ${s.totalScrolls}`,
        `- Max Scroll Depth: ${s.scrollDepthMax}%`,
        `- Rapid Scrolls: ${s.rapidScrolls}`,
        '',
        '=== BEHAVIORAL SIGNALS ===',
        signals.isExploring ? '- User appears to be EXPLORING' : null,
        signals.isFrustrated ? '- User appears FRUSTRATED' : null,
        signals.isEngaged ? '- User appears ENGAGED' : null,
        signals.isConfused ? '- User appears CONFUSED' : null,
        signals.isMobile ? '- User is on MOBILE device' : null,
        signals.completedGoal ? '- User COMPLETED GOAL' : null,
      ].filter(Boolean).join('\n');

      const systemPrompt = `You are an expert UX Researcher analyzing a recorded user session. Your job is to identify what the user was trying to do, what problems they encountered, and rate the overall experience.

IMPORTANT RULES:
1. ONLY reference events that actually appear in the session log
2. Use the EXACT timestamps from the logs when referencing events
3. Pay special attention to friction indicators like [RAGE CLICK], [NO RESPONSE], [CONSOLE ERROR], etc.
4. Be specific about element names from the logs

SESSION CONTEXT:
${sessionContext}`;

      const userPrompt = `Analyze this user session log and provide insights:

SESSION LOG:
${sessionLog}

Based on this log, analyze:
1. What was the user trying to accomplish?
2. What friction points did they encounter?
3. What worked well?
4. Overall UX rating (1-10)`;

      // Call LLM
      const { object } = await generateObject({
        model: google('gemini-2.5-flash-lite'),
        schema: UXAnalysisSchema,
        system: systemPrompt,
        prompt: userPrompt,
      });

      // Save analysis results
      await prisma.session.update({
        where: { id },
        data: {
          analysis: JSON.stringify(object),
          analysisStatus: 'completed',
          analyzedAt: new Date(),
        },
      });

      return NextResponse.json({ analysis: object });
    } catch (analysisError) {
      console.error('Analysis failed:', analysisError);
      await prisma.session.update({
        where: { id },
        data: { analysisStatus: 'failed' },
      });
      throw analysisError;
    }
  } catch (error) {
    console.error('Error analyzing session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
