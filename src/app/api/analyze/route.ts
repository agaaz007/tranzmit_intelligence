import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { parseRRWebSession } from '@/lib/rrweb-parser';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// Define the schema for the LLM response
const UXAnalysisSchema = z.object({
    summary: z.string().describe("A 2-3 sentence executive summary of what happened in this session. Be specific about what the user did and what problems they encountered."),
    user_intent: z.string().describe("What the user was trying to accomplish based on their actions. Be specific - e.g., 'Fill out the contact form' not 'Use the website'"),
    tags: z.array(z.string()).describe("3-5 relevant tags based ONLY on evidence in the logs. Examples: 'form-submission', 'rage-click', 'navigation-issue', 'successful-conversion', 'abandoned-flow'"),
    went_well: z.array(z.string()).describe("List of things that worked smoothly for the user. Only include things you can verify from the logs."),
    frustration_points: z.array(z.object({
        timestamp: z.string().describe("The exact timestamp from the log in [MM:SS] format"),
        issue: z.string().describe("Specific description of what went wrong, referencing the actual element and action from the logs")
    })).describe("Friction points that caused user frustration. Only include issues with clear evidence - look for [RAGE CLICK], [NO RESPONSE], repeated actions on same element, or [CONSOLE ERROR] flags"),
    ux_rating: z.number().min(1).max(10).describe("1-10 rating where 10 is perfect UX. Base this on: successful task completion, presence of rage clicks, dead clicks, and overall flow smoothness"),
    description: z.string().describe("A detailed narrative paragraph explaining the user's journey chronologically. Reference specific timestamps and elements from the logs.")
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { events } = body;

        if (!events || !Array.isArray(events)) {
            return NextResponse.json({ error: 'Invalid RRWeb events provided' }, { status: 400 });
        }

        // 1. Parse and Compress the Session
        const semanticSession = parseRRWebSession(events);
        
        // Check if we have meaningful logs
        if (semanticSession.logs.length === 0) {
            return NextResponse.json({ 
                error: 'No meaningful user interactions found in session' 
            }, { status: 400 });
        }

        // Build the session log string
        const sessionLog = semanticSession.logs
            .map(log => {
                const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
                return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
            })
            .join('\n');

        // Build context about the session
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
            '',
            '=== SCROLL METRICS ===',
            `- Total Scrolls: ${s.totalScrolls}`,
            `- Max Scroll Depth: ${s.scrollDepthMax}%`,
            `- Rapid Scrolls (frustration): ${s.rapidScrolls}`,
            `- Scroll Reversals (searching): ${s.scrollReversals}`,
            '',
            '=== ATTENTION METRICS ===',
            `- Hover Events: ${s.totalHovers}`,
            `- Hesitations: ${s.hesitations}`,
            `- Idle Time: ${s.idleTime}s`,
            `- Tab Switches: ${s.tabSwitches}`,
            '',
            '=== MOBILE/TOUCH METRICS ===',
            `- Touch Events: ${s.totalTouches}`,
            `- Swipes: ${s.swipes}`,
            `- Pinch Zooms: ${s.pinchZooms}`,
            `- Orientation Changes: ${s.orientationChanges}`,
            '',
            '=== MEDIA METRICS ===',
            `- Media Interactions: ${s.totalMediaInteractions}`,
            `- Video Plays: ${s.videoPlays}`,
            `- Video Pauses: ${s.videoPauses}`,
            '',
            '=== CLIPBOARD METRICS ===',
            `- Text Selections: ${s.totalSelections}`,
            `- Copy Events: ${s.copyEvents}`,
            `- Paste Events: ${s.pasteEvents}`,
            '',
            '=== ERROR METRICS ===',
            `- Console Errors: ${s.consoleErrors}`,
            `- Network Errors: ${s.networkErrors}`,
            '',
            '=== CONVERSION METRICS ===',
            `- Form Submissions: ${s.formSubmissions}`,
            `- Resize Events: ${s.resizeEvents}`,
            '',
            '=== BEHAVIORAL SIGNALS (Auto-detected) ===',
            signals.isExploring ? '- User appears to be EXPLORING (lots of scrolling, few clicks)' : null,
            signals.isFrustrated ? '- User appears FRUSTRATED (rage clicks, dead clicks, errors detected)' : null,
            signals.isEngaged ? '- User appears ENGAGED (good interaction patterns)' : null,
            signals.isConfused ? '- User appears CONFUSED (hesitations, back-and-forth behavior)' : null,
            signals.isMobile ? '- User is on MOBILE device (touch events detected)' : null,
            signals.completedGoal ? '- User COMPLETED GOAL (form submission detected)' : null,
        ].filter(Boolean).join('\n');

        const systemPrompt = `You are an expert UX Researcher analyzing a recorded user session. Your job is to identify what the user was trying to do, what problems they encountered, and rate the overall experience.

IMPORTANT RULES:
1. ONLY reference events that actually appear in the session log - do not invent or hallucinate actions
2. Use the EXACT timestamps from the logs when referencing events
3. Pay special attention to these friction indicators:
   - [RAGE CLICK] - User clicked rapidly on same element (frustrated)
   - [NO RESPONSE] - Click had no effect (broken element)
   - [CLICK THRASHING] - Rapid clicks on different elements (confused)
   - [CONSOLE ERROR] - JavaScript error occurred
   - [NETWORK ERROR] - API/network request failed
   - [SLOW NETWORK] - Slow API responses
   - [SLOW LOAD] - Page loaded slowly
   - [ABANDONED INPUT] - User focused on input but left without typing
   - [CLEARED INPUT] - User typed then deleted everything
   - [CORRECTION] - User made typing corrections
   - [HESITATION] - User hovered over element for a long time (uncertain)
   - [RAPID SCROLL] - Fast scrolling (frustrated or searching)
   - [TAB SWITCH] - User switched to another tab
   - [EXIT INTENT] - User tried to leave the page
   - [SWIPE] - Mobile swipe gesture
   - [LONG PRESS] - Mobile long press
   - [HORIZONTAL SCROLL] - Unusual horizontal scrolling
   - [ORIENTATION CHANGE] - Device rotation
   - [OFFLINE] - User went offline
   - [KEYBOARD SHORTCUT] - Power user behavior
   - [FORM SUBMIT] - Form was submitted
   - [VIDEO SEEK] - User skipped in video
4. Consider the behavioral signals section - these are auto-detected patterns
5. Be specific about element names - use the exact descriptions from the logs

SESSION CONTEXT:
${sessionContext}`;

        const userPrompt = `Analyze this user session log and provide insights:

SESSION LOG:
${sessionLog}

Based on this log, analyze:
1. What was the user trying to accomplish?
2. What friction points did they encounter? (Reference specific timestamps)
3. What worked well?
4. Overall UX rating (1-10)

Remember: Only reference events that actually appear in the log above.`;

        // 2. Save processed data locally for inspection
        const timestamp = Date.now();
        const sessionId = `session_${timestamp}`;
        
        try {
            // Save semantic session (what gets processed from raw events)
            await writeFile(
                join(process.cwd(), `${sessionId}_semantic.json`),
                JSON.stringify(semanticSession, null, 2),
                'utf-8'
            );

            // Save the full prompt being sent to AI
            const promptData = {
                model: 'gemini-2.5-flash-lite',
                timestamp: new Date().toISOString(),
                systemPrompt,
                userPrompt,
                sessionLog,
                sessionContext,
                summary: semanticSession.summary
            };
            
            await writeFile(
                join(process.cwd(), `${sessionId}_ai-prompt.json`),
                JSON.stringify(promptData, null, 2),
                'utf-8'
            );
            
            console.log(`[Analyze] Saved processed data: ${sessionId}_semantic.json and ${sessionId}_ai-prompt.json`);
        } catch (saveError) {
            console.error('[Analyze] Failed to save processed data locally:', saveError);
            // Continue even if save fails
        }

        // 3. Call LLM
        const { object } = await generateObject({
            model: google('gemini-2.5-flash-lite'),
            schema: UXAnalysisSchema,
            system: systemPrompt,
            prompt: userPrompt,
        });

        // Save AI response
        try {
            await writeFile(
                join(process.cwd(), `${sessionId}_ai-response.json`),
                JSON.stringify(object, null, 2),
                'utf-8'
            );
            console.log(`[Analyze] Saved AI response: ${sessionId}_ai-response.json`);
        } catch (saveError) {
            console.error('[Analyze] Failed to save AI response:', saveError);
        }

        return NextResponse.json(object);

    } catch (error) {
        console.error('Error analyzing session:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
