import { prisma } from '@/lib/prisma';
import { parseRRWebSession } from '@/lib/rrweb-parser';
import type { KeyframeCapture } from '@/lib/replay-screenshotter';
import type { MultimodalAnalysis } from '@/types/session';

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const FIREWORKS_MODEL = process.env.FIREWORKS_VLM_MODEL || 'accounts/fireworks/models/qwen3-vl-30b-a3b-instruct';
const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

/**
 * Build the fused multimodal prompt combining DOM event log with visual keyframes.
 * Uses the same detailed analysis approach as session-analysis.ts but enhanced with
 * visual evidence cross-referencing.
 */
function buildFusedPrompt(
  sessionLog: string,
  sessionContext: string,
  keyframes: KeyframeCapture[]
): { system: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> } {

  const system = `You are an expert UX Researcher performing MULTIMODAL analysis of a recorded user session. You have two data sources:

1. DOM EVENT LOG — the actual browser event stream (clicks, hovers, scrolls, rage clicks, dead clicks, page loads). This is GROUND TRUTH for user behavior.
2. VISUAL KEYFRAMES — screenshots captured at key moments during the session. These show what was VISUALLY on screen when events occurred.

ANALYSIS RULES:
1. ONLY reference events that actually appear in the session log
2. Use the EXACT timestamps from the logs when referencing events
3. Cross-reference DOM events with visual frames at matching timestamps
4. For each friction point, cite BOTH the DOM evidence AND the visual evidence
5. Pay special attention to friction indicators like [RAGE CLICK], [NO RESPONSE], [CONSOLE ERROR]
6. Be specific about element names from the logs
7. Factor in hover/hesitation patterns — high hesitations suggest UI confusion or unclear CTAs
8. Console and network errors indicate technical failures impacting UX
9. High idle time or tab switches suggest disengagement or waiting on slow responses
10. Scroll reversals indicate the user is searching for something they can't find
11. Pinch zooms on mobile suggest content isn't responsive or text is too small
12. Cleared inputs suggest form friction or user changing their mind
13. Pay attention to URL paths in "Navigated to" events — they reveal which specific pages the user visited
14. When interactions include ancestor context like "(in heading: ..., section: ...)", use that to understand WHAT SPECIFIC CONTENT the user was engaging with
15. Failed network request paths reveal which specific resources failed to load
16. USE THE VISUAL FRAMES to identify: layout issues, unclear CTAs, missing loading indicators, confusing UI states, broken layouts, content not rendering, or any visual problem the DOM log alone cannot capture
17. If a visual frame shows something interesting that the DOM log doesn't capture (e.g., a broken layout, misleading visual hierarchy, poor contrast), call it out as a VISUAL-ONLY insight

SESSION CONTEXT:
${sessionContext}`;

  // Build content array with interleaved images and text
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  // Add keyframes with timestamps
  for (const frame of keyframes) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${frame.base64}` },
    });
    const mins = Math.floor(frame.timestamp / 60);
    const secs = frame.timestamp % 60;
    content.push({
      type: 'text',
      text: `[Frame at ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} — captured because: ${frame.reason}]`,
    });
  }

  // Add the DOM event log and analysis instructions
  content.push({
    type: 'text',
    text: `
=== DOM EVENT LOG (ground truth behavioral data) ===
${sessionLog}

=== ANALYSIS INSTRUCTIONS ===
Cross-reference the DOM events with the visual frames at matching timestamps. Provide your analysis as valid JSON matching this exact schema:

{
  "summary": "2-3 sentence executive summary of what happened",
  "user_intent": "what the user was trying to accomplish",
  "tags": ["3-5 relevant tags based on evidence"],
  "went_well": ["list of things that worked smoothly"],
  "friction_points": [
    {
      "timestamp": "[MM:SS] exact timestamp from log",
      "dom_evidence": "what the DOM log shows happened",
      "visual_evidence": "what the screenshot reveals about the visual state",
      "issue": "specific description of the friction",
      "severity": "critical|high|medium|low",
      "product_fix": "specific actionable product improvement"
    }
  ],
  "ux_rating": 7,
  "description": "detailed narrative paragraph of the user's journey",
  "visual_insights": ["insights that could ONLY be derived from visual frames, not DOM logs alone"]
}

Respond ONLY with valid JSON. No markdown, no code fences, no explanation outside the JSON.`,
  });

  return { system, content };
}

/**
 * Call Fireworks AI Qwen VLM for multimodal analysis.
 */
async function callFireworksVLM(
  system: string,
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>
): Promise<MultimodalAnalysis> {
  if (!FIREWORKS_API_KEY) {
    throw new Error('FIREWORKS_API_KEY environment variable is not set');
  }

  const response = await fetch(FIREWORKS_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      max_tokens: 4096,
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fireworks API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const raw = result.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error('No content in Fireworks API response');
  }

  // Parse the JSON response, stripping any markdown code fences
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return parsed as MultimodalAnalysis;
}

/**
 * Run multimodal analysis for a session.
 * Keyframes are captured client-side and passed in. Server does DOM parsing + VLM fusion.
 */
export async function runMultimodalAnalysis(
  sessionId: string,
  keyframes: KeyframeCapture[]
): Promise<MultimodalAnalysis> {
  if (!keyframes || keyframes.length === 0) {
    throw new Error('Keyframes are required for multimodal analysis');
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, events: true, analysisStatus: true, analysis: true },
  });

  if (!session) throw new Error('Session not found');
  if (!session.events) throw new Error('No events stored for this session');

  // Mark as analyzing
  await prisma.session.update({
    where: { id: sessionId },
    data: { multimodalStatus: 'analyzing' },
  });

  try {
    // Step 1: Parse events with rrweb-parser (DOM analysis)
    const events = JSON.parse(session.events);
    const semanticSession = parseRRWebSession(events);

    if (semanticSession.logs.length === 0) {
      throw new Error('No meaningful user interactions found');
    }

    console.log(`[Multimodal] Session ${sessionId}: ${keyframes.length} client-captured keyframes received`);

    // Step 2: Build session context
    const sessionLog = semanticSession.logs
      .map(log => {
        const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
        return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
      })
      .join('\n');

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
      `- Right Clicks: ${s.rightClicks}`,
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
      `- Scroll Reversals (searching): ${s.scrollReversals}`,
      '',
      '=== HOVER & ATTENTION ===',
      `- Total Hovers: ${s.totalHovers}`,
      `- Hesitations: ${s.hesitations}`,
      `- Hover Time: ${s.hoverTime}ms`,
      '',
      '=== ERROR METRICS ===',
      `- Console Errors: ${s.consoleErrors}`,
      `- Network Errors: ${s.networkErrors}`,
      '',
      '=== ENGAGEMENT ===',
      `- Tab Switches: ${s.tabSwitches}`,
      `- Idle Time: ${s.idleTime}ms`,
      '',
      '=== BEHAVIORAL SIGNALS ===',
      signals.isExploring ? '- User appears to be EXPLORING (lots of scrolling, few clicks)' : null,
      signals.isFrustrated ? '- User appears FRUSTRATED (rage clicks, dead clicks, rapid scrolls)' : null,
      signals.isEngaged ? '- User appears ENGAGED (good interaction patterns)' : null,
      signals.isConfused ? '- User appears CONFUSED (hesitations, back-and-forth navigation)' : null,
      signals.isMobile ? '- User is on MOBILE device' : null,
      signals.completedGoal ? '- User COMPLETED GOAL (form submission or conversion detected)' : null,
    ].filter(Boolean).join('\n');

    // Step 3: Call VLM with fused prompt (DOM log + client-captured keyframes)
    const { system, content } = buildFusedPrompt(sessionLog, sessionContext, keyframes);
    const analysis = await callFireworksVLM(system, content);
    analysis.frames_analyzed = keyframes.length;

    // Step 4: Save result
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        multimodalAnalysis: JSON.stringify(analysis),
        multimodalStatus: 'completed',
        multimodalAt: new Date(),
      },
    });

    console.log(`[Multimodal] Session ${sessionId}: analysis complete (UX rating: ${analysis.ux_rating}/10)`);
    return analysis;
  } catch (error) {
    console.error(`[Multimodal] Analysis failed for session ${sessionId}:`, error);
    await prisma.session.update({
      where: { id: sessionId },
      data: { multimodalStatus: 'failed' },
    });
    throw error;
  }
}
