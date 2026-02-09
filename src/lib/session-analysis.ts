import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { parseRRWebSession } from '@/lib/rrweb-parser';

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

export type SessionAnalysisResult = z.infer<typeof UXAnalysisSchema>;

/**
 * Analyze a single session by ID. Loads events from DB, runs rrweb parser,
 * sends to LLM, and saves the result back to the session record.
 */
export async function analyzeSession(sessionId: string): Promise<SessionAnalysisResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, events: true, analysisStatus: true },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (!session.events) {
    throw new Error('No events stored for this session');
  }

  // Mark as analyzing
  await prisma.session.update({
    where: { id: sessionId },
    data: { analysisStatus: 'analyzing' },
  });

  try {
    const events = JSON.parse(session.events);
    const semanticSession = parseRRWebSession(events);

    if (semanticSession.logs.length === 0) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { analysisStatus: 'failed' },
      });
      throw new Error('No meaningful user interactions found');
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
      `- Double Clicks: ${s.doubleClicks}`,
      `- Right Clicks (Context Menu): ${s.rightClicks}`,
      '',
      '=== INPUT METRICS ===',
      `- Total Input Events: ${s.totalInputs}`,
      `- Abandoned Inputs: ${s.abandonedInputs}`,
      `- Cleared Inputs: ${s.clearedInputs}`,
      `- Form Submissions: ${s.formSubmissions}`,
      '',
      '=== SCROLL METRICS ===',
      `- Total Scrolls: ${s.totalScrolls}`,
      `- Max Scroll Depth: ${s.scrollDepthMax}%`,
      `- Rapid Scrolls (frustration): ${s.rapidScrolls}`,
      `- Scroll Reversals (searching behavior): ${s.scrollReversals}`,
      '',
      '=== HOVER & ATTENTION METRICS ===',
      `- Total Hovers: ${s.totalHovers}`,
      `- Hesitations (hover without action): ${s.hesitations}`,
      `- Hover Time on Interactive Elements: ${s.hoverTime}ms`,
      '',
      '=== TOUCH METRICS (MOBILE) ===',
      `- Total Touches: ${s.totalTouches}`,
      `- Swipes: ${s.swipes}`,
      `- Pinch Zooms: ${s.pinchZooms}`,
      '',
      '=== MEDIA METRICS ===',
      `- Total Media Interactions: ${s.totalMediaInteractions}`,
      `- Video Plays: ${s.videoPlays}`,
      `- Video Pauses: ${s.videoPauses}`,
      '',
      '=== SELECTION & CLIPBOARD ===',
      `- Text Selections: ${s.totalSelections}`,
      `- Copy Events: ${s.copyEvents}`,
      `- Paste Events: ${s.pasteEvents}`,
      '',
      '=== ERROR METRICS ===',
      `- Console Errors: ${s.consoleErrors}`,
      `- Network Errors: ${s.networkErrors}`,
      '',
      '=== ENGAGEMENT METRICS ===',
      `- Tab Switches (left page): ${s.tabSwitches}`,
      `- Idle Time (no interaction): ${s.idleTime}ms`,
      '',
      '=== VIEWPORT METRICS ===',
      `- Resize Events: ${s.resizeEvents}`,
      `- Orientation Changes: ${s.orientationChanges}`,
      '',
      '=== BEHAVIORAL SIGNALS ===',
      signals.isExploring ? '- User appears to be EXPLORING (lots of scrolling, few clicks)' : null,
      signals.isFrustrated ? '- User appears FRUSTRATED (rage clicks, dead clicks, rapid scrolls)' : null,
      signals.isEngaged ? '- User appears ENGAGED (good interaction patterns)' : null,
      signals.isConfused ? '- User appears CONFUSED (hesitations, back-and-forth navigation)' : null,
      signals.isMobile ? '- User is on MOBILE device (touch events detected)' : null,
      signals.completedGoal ? '- User COMPLETED GOAL (form submission or conversion detected)' : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are an expert UX Researcher analyzing a recorded user session. Your job is to identify what the user was trying to do, what problems they encountered, and rate the overall experience.

IMPORTANT RULES:
1. ONLY reference events that actually appear in the session log
2. Use the EXACT timestamps from the logs when referencing events
3. Pay special attention to friction indicators like [RAGE CLICK], [NO RESPONSE], [CONSOLE ERROR], etc.
4. Be specific about element names from the logs
5. Factor in hover/hesitation patterns — high hesitations suggest UI confusion or unclear CTAs
6. Console and network errors indicate technical failures impacting UX
7. High idle time or tab switches suggest disengagement or waiting on slow responses
8. Scroll reversals indicate the user is searching for something they can't find
9. Pinch zooms on mobile suggest content isn't responsive or text is too small
10. Cleared inputs suggest form friction or user changing their mind

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
      where: { id: sessionId },
      data: {
        analysis: JSON.stringify(object),
        analysisStatus: 'completed',
        analyzedAt: new Date(),
      },
    });

    return object;
  } catch (error) {
    console.error(`Analysis failed for session ${sessionId}:`, error);
    await prisma.session.update({
      where: { id: sessionId },
      data: { analysisStatus: 'failed' },
    });
    throw error;
  }
}
