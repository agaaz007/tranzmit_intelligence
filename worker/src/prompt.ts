/**
 * Fused multimodal prompt builder.
 * Ported from src/lib/multimodal-analysis.ts.
 */

import type { KeyframeCapture } from './capture';

interface SemanticSession {
  totalDuration: string;
  eventCount: number;
  pageUrl: string;
  pageTitle: string;
  viewportSize: { width: number; height: number };
  logs: Array<{ timestamp: string; action: string; details: string; flags: string[] }>;
  summary: {
    totalClicks: number; rageClicks: number; deadClicks: number; doubleClicks: number; rightClicks: number;
    totalInputs: number; abandonedInputs: number; clearedInputs: number;
    totalScrolls: number; scrollDepthMax: number; rapidScrolls: number; scrollReversals: number;
    totalHovers: number; hesitations: number; hoverTime: number;
    consoleErrors: number; networkErrors: number;
    tabSwitches: number; idleTime: number; formSubmissions: number;
  };
  behavioralSignals: {
    isExploring: boolean; isFrustrated: boolean; isEngaged: boolean;
    isConfused: boolean; isMobile: boolean; completedGoal: boolean;
  };
}

export function buildSessionLog(session: SemanticSession): string {
  return session.logs
    .map(log => {
      const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
      return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
    })
    .join('\n');
}

export function buildSessionContext(session: SemanticSession): string {
  const s = session.summary;
  const signals = session.behavioralSignals;

  return [
    `Page: ${session.pageUrl || 'Unknown'}`,
    session.pageTitle ? `Title: "${session.pageTitle}"` : null,
    `Duration: ${session.totalDuration}`,
    `Total Events: ${session.eventCount}`,
    `Viewport: ${session.viewportSize.width}x${session.viewportSize.height}`,
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
}

export function buildFusedPrompt(
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

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

  // Interleave images with timestamps
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

  // Add DOM log and analysis instructions
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
