import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getElevenLabsClient,
  generateFirstMessage,
  type AnalysisData,
} from '@/lib/elevenlabs';

// POST - Initiate an ElevenLabs AI call to a churned user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, agentId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Get the churned user
    const churnedUser = await prisma.churnedUser.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    if (!churnedUser) {
      return NextResponse.json({ error: 'Churned user not found' }, { status: 404 });
    }

    if (!churnedUser.phone) {
      return NextResponse.json({ error: 'User has no phone number' }, { status: 400 });
    }

    // Parse analysis result
    let analysis: AnalysisData = {};
    if (churnedUser.analysisResult) {
      try {
        analysis = typeof churnedUser.analysisResult === 'string'
          ? JSON.parse(churnedUser.analysisResult)
          : churnedUser.analysisResult as AnalysisData;
      } catch {
        console.warn('[ElevenLabs] Failed to parse analysis result');
      }
    }

    const companyName = churnedUser.project.name || 'our company';
    const userName = churnedUser.name;

    // Build session insights string from PostHog analysis
    let sessionInsights = '';

    if (analysis.summary) {
      sessionInsights += `SUMMARY: ${analysis.summary}\n\n`;
    }

    if (analysis.frustrationPoints && analysis.frustrationPoints.length > 0) {
      const frustrations = analysis.frustrationPoints
        .map(fp => `- ${fp.issue} (${fp.severity})`)
        .join('\n');
      sessionInsights += `FRUSTRATION POINTS:\n${frustrations}\n\n`;
    }

    if (analysis.dropOffPoints && analysis.dropOffPoints.length > 0) {
      sessionInsights += `DROP-OFF SIGNALS:\n- ${analysis.dropOffPoints.join('\n- ')}\n\n`;
    }

    if (analysis.behaviorPatterns && analysis.behaviorPatterns.length > 0) {
      sessionInsights += `BEHAVIOR PATTERNS:\n- ${analysis.behaviorPatterns.join('\n- ')}\n\n`;
    }

    // Add recovery insight at the top if available
    if (analysis.recoveryInsight) {
      sessionInsights = `KEY RECOVERY INSIGHT: ${analysis.recoveryInsight}\n\n${sessionInsights}`;
    }

    if (!sessionInsights.trim()) {
      sessionInsights = 'No specific session insights available.';
    }

    // Generate personalized first message based on analysis
    const firstMessage = generateFirstMessage(userName, companyName, analysis);

    // Pass session insights + first message as dynamic variables
    // Prompt is configured in ElevenLabs dashboard
    // Variables available: {{session_insights}}, {{user_name}}, {{company_name}}, {{frustration_points}}, {{drop_off_points}}
    const dynamicVariables: Record<string, string> = {
      // First message (personalized based on analysis)
      first_message: firstMessage,

      // User info
      user_name: userName || 'there',
      company_name: companyName,

      // Full formatted session insights (main context)
      session_insights: sessionInsights.trim(),

      // Individual fields for targeted use in prompt
      frustration_points: analysis.frustrationPoints?.map(fp => `${fp.issue} (${fp.severity})`).join('; ') || 'None detected',
      drop_off_points: analysis.dropOffPoints?.join('; ') || 'None detected',
    };

    console.log('[ElevenLabs] ========== CALL CONTEXT ==========');
    console.log('[ElevenLabs] User:', userName || churnedUser.email);
    console.log('[ElevenLabs] Phone:', churnedUser.phone);
    console.log('[ElevenLabs] Company:', companyName);
    console.log('[ElevenLabs] First Message:', firstMessage);
    console.log('[ElevenLabs] Frustration Points:', dynamicVariables.frustration_points);
    console.log('[ElevenLabs] Drop-off Points:', dynamicVariables.drop_off_points);
    console.log('[ElevenLabs] Session Insights (preview):', sessionInsights.substring(0, 300));
    console.log('[ElevenLabs] ====================================');

    // Get ElevenLabs client
    const elevenlabs = getElevenLabsClient();

    // Use provided agent ID or default from env
    const finalAgentId = agentId || process.env.ELEVENLABS_RECOVERY_AGENT_ID;

    if (!finalAgentId) {
      return NextResponse.json({
        error: 'No agent ID provided and ELEVENLABS_RECOVERY_AGENT_ID not set'
      }, { status: 400 });
    }

    // Initiate the call - only pass dynamic variables (prompt configured in ElevenLabs dashboard)
    const callResult = await elevenlabs.initiateCall({
      agentId: finalAgentId,
      phoneNumber: churnedUser.phone,
      // Pass dynamic variables for {{variable}} substitution in agent prompt
      dynamicVariables,
      // Pass personalized first message
      firstMessage,
      // No promptOverride - using prompt from ElevenLabs dashboard
    });

    console.log('[ElevenLabs] Call initiated successfully:', callResult);

    // Update user record with call details
    await prisma.churnedUser.update({
      where: { id: userId },
      data: {
        outreachStatus: 'call_initiated',
        callNotes: JSON.stringify({
          callId: callResult.call_id,
          initiatedAt: new Date().toISOString(),
          agentId: finalAgentId,
          firstMessage,
          dynamicVariables: {
            user_name: dynamicVariables.user_name,
            company_name: dynamicVariables.company_name,
            frustration_points: dynamicVariables.frustration_points,
            drop_off_points: dynamicVariables.drop_off_points,
          },
        }),
      },
    });

    return NextResponse.json({
      success: true,
      callId: callResult.call_id,
      status: callResult.status,
      context: {
        firstMessage,
        frustrationPoints: analysis.frustrationPoints?.length || 0,
        dropOffPoints: analysis.dropOffPoints?.length || 0,
      },
    });
  } catch (error) {
    console.error('[ElevenLabs] Failed to initiate call:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to initiate call'
    }, { status: 500 });
  }
}

// GET - Check call status and optionally fetch transcript
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');
    const includeTranscript = searchParams.get('transcript') === 'true';

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    const elevenlabs = getElevenLabsClient();
    const status = await elevenlabs.getCallStatus(callId);

    let transcript = null;
    if (includeTranscript && status.status === 'completed') {
      try {
        const transcriptData = await elevenlabs.getCallTranscript(callId);
        transcript = transcriptData.transcript;
      } catch {
        console.warn('[ElevenLabs] Could not fetch transcript');
      }
    }

    return NextResponse.json({
      ...status,
      transcript,
    });
  } catch (error) {
    console.error('[ElevenLabs] Failed to get call status:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get call status'
    }, { status: 500 });
  }
}
