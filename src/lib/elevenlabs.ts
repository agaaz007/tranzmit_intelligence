// ElevenLabs Conversational AI Integration
// Docs: https://elevenlabs.io/docs/conversational-ai/api-reference

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

interface OutboundCallConfig {
  agentId: string;
  phoneNumber: string;
  // Dynamic variables for personalization (referenced in agent prompt as {{variable_name}})
  dynamicVariables?: Record<string, string>;
  // First message override
  firstMessage?: string;
  // Custom prompt override for this specific call
  promptOverride?: string;
}

interface Agent {
  agent_id: string;
  name: string;
  conversation_config: {
    agent: {
      prompt: {
        prompt: string;
      };
      first_message: string;
      language: string;
    };
    tts: {
      voice_id: string;
    };
  };
}

interface CallResponse {
  success: boolean;
  message: string;
  conversation_id: string;
  callSid?: string;
  // Legacy fields for compatibility
  call_id?: string;
  agent_id?: string;
  status?: string;
}

interface AnalysisData {
  summary?: string;
  frustrationPoints?: Array<{ issue: string; severity: string; occurrences?: number }>;
  behaviorPatterns?: string[];
  dropOffPoints?: string[];
  recoveryInsight?: string; // AI-generated insight for recovery call
  sessionCount?: number;
  analyzedSessions?: number;
  totalEvents?: number;
}

class ElevenLabsClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${ELEVENLABS_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // List all conversational AI agents
  async listAgents(): Promise<{ agents: Agent[] }> {
    return this.request('/convai/agents');
  }

  // Get a specific agent
  async getAgent(agentId: string): Promise<Agent> {
    return this.request(`/convai/agents/${agentId}`);
  }

  // Initiate an outbound call with full context via Twilio integration
  async initiateCall(config: OutboundCallConfig): Promise<CallResponse> {
    const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

    if (!phoneNumberId) {
      throw new Error('ELEVENLABS_PHONE_NUMBER_ID environment variable is not set');
    }

    // Build conversation_initiation_client_data with correct structure
    // See: https://elevenlabs.io/docs/agents-platform/customization/personalization/twilio-personalization
    const clientData: Record<string, unknown> = {
      type: 'conversation_initiation_client_data',
    };

    // Pass dynamic variables for {{variable}} substitution
    // These must include all variables defined in the agent's dynamic_variable_placeholders
    if (config.dynamicVariables) {
      clientData.dynamic_variables = config.dynamicVariables;
    }

    // Build conversation_config_override for prompt/first_message overrides
    const configOverride: Record<string, unknown> = {};

    if (config.firstMessage || config.promptOverride) {
      const agentOverride: Record<string, unknown> = {};

      if (config.firstMessage) {
        agentOverride.first_message = config.firstMessage;
      }

      if (config.promptOverride) {
        agentOverride.prompt = {
          prompt: config.promptOverride,
        };
      }

      configOverride.agent = agentOverride;
    }

    if (Object.keys(configOverride).length > 0) {
      clientData.conversation_config_override = configOverride;
    }

    const payload: Record<string, unknown> = {
      agent_id: config.agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: config.phoneNumber,
      conversation_initiation_client_data: clientData,
    };

    console.log('[ElevenLabs] Initiating call with payload:', JSON.stringify(payload, null, 2));

    // Correct endpoint: /convai/twilio/outbound-call
    return this.request('/convai/twilio/outbound-call', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Get call status
  async getCallStatus(callId: string): Promise<{
    call_id: string;
    status: string;
    transcript?: string;
    duration_seconds?: number;
  }> {
    return this.request(`/convai/conversations/${callId}`);
  }

  // Get call transcript after completion
  async getCallTranscript(callId: string): Promise<{
    transcript: Array<{
      role: 'agent' | 'user';
      message: string;
      timestamp: number;
    }>;
  }> {
    return this.request(`/convai/conversations/${callId}/transcript`);
  }

  // List conversations for an agent (with optional call_successful filter)
  async listConversations(agentId: string, callSuccessful?: 'success' | 'failure' | 'unknown'): Promise<{
    conversations: Array<{
      conversation_id: string;
      agent_id: string;
      status: string;
      start_time: string;
      end_time: string;
      duration_seconds: number;
      call_successful: string | null;
      metadata: Record<string, unknown>;
    }>;
    cursor?: string;
  }> {
    const params = new URLSearchParams({ agent_id: agentId });
    if (callSuccessful) {
      params.set('call_successful', callSuccessful);
    }
    return this.request(`/convai/conversations?${params.toString()}`);
  }

  // Get full conversation detail with transcript and analysis
  async getConversation(conversationId: string): Promise<{
    conversation_id: string;
    agent_id: string;
    status: string;
    start_time: string;
    end_time: string;
    duration_seconds: number;
    call_successful: boolean | null;
    transcript: Array<{ role: 'agent' | 'user'; message: string; timestamp: number }>;
    analysis: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
  }> {
    return this.request(`/convai/conversations/${conversationId}`);
  }
}

// Singleton instance
let client: ElevenLabsClient | null = null;

export function getElevenLabsClient(): ElevenLabsClient {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY environment variable is not set');
  }

  if (!client) {
    client = new ElevenLabsClient(ELEVENLABS_API_KEY);
  }

  return client;
}

// Generate a complete system prompt with embedded analysis context
export function generateRecoveryPrompt(
  companyName: string,
  userName: string | null,
  analysis: AnalysisData
): string {
  // Build the context section from analysis
  let contextSection = '';

  if (analysis.summary) {
    contextSection += `\n\nUSER BEHAVIOR ANALYSIS:\n${analysis.summary}`;
  }

  if (analysis.frustrationPoints && analysis.frustrationPoints.length > 0) {
    const issues = analysis.frustrationPoints
      .map(fp => `- ${fp.issue} (${fp.severity} severity)`)
      .join('\n');
    contextSection += `\n\nFRUSTRATION POINTS DETECTED:\n${issues}`;
  }

  if (analysis.dropOffPoints && analysis.dropOffPoints.length > 0) {
    contextSection += `\n\nDROP-OFF SIGNALS:\n- ${analysis.dropOffPoints.join('\n- ')}`;
  }

  if (analysis.behaviorPatterns && analysis.behaviorPatterns.length > 0) {
    contextSection += `\n\nBEHAVIOR PATTERNS:\n- ${analysis.behaviorPatterns.join('\n- ')}`;
  }

  const prompt = `You are a friendly, empathetic customer success agent calling on behalf of ${companyName}. You're speaking with ${userName || 'a former user'} who has churned (stopped using the product).

YOUR GOAL: Have a warm, genuine conversation to understand why they left and see if there's anything you can do to win them back.

CONVERSATION GUIDELINES:
1. Be warm and conversational, NOT salesy or pushy
2. Listen actively and acknowledge their concerns before responding
3. Ask open-ended questions to understand their experience
4. If they mention specific issues, show empathy and explain any improvements made
5. Offer concrete solutions or incentives when appropriate (discounts, extended trials, premium features)
6. If they're not interested, thank them graciously and end the call politely
7. Keep responses SHORT and natural - this is a phone call, not an email
8. Don't read out bullet points or sound robotic
${contextSection}

IMPORTANT TACTICS BASED ON ANALYSIS:
${analysis.frustrationPoints && analysis.frustrationPoints.length > 0
    ? `- This user experienced frustration. Acknowledge this early: "I understand you ran into some issues..."
- Be prepared to explain what's been fixed or improved`
    : ''}
${analysis.dropOffPoints?.some(d => d.includes('pricing'))
    ? `- User showed interest in pricing. Be ready to discuss flexible plans or discounts.`
    : ''}
${analysis.dropOffPoints?.some(d => d.includes('checkout') || d.includes('payment'))
    ? `- User almost converted. There might be a payment or trust concern - offer assistance.`
    : ''}
${analysis.behaviorPatterns?.some(p => p.includes('rage') || p.includes('frustration'))
    ? `- User showed signs of frustration (rage clicking). Lead with empathy and acknowledge their experience wasn't ideal.`
    : ''}
${analysis.behaviorPatterns?.some(p => p.includes('Low') || p.includes('short'))
    ? `- User had limited engagement. Ask what features they were looking for that they couldn't find.`
    : ''}

Remember: Your tone should be like a helpful friend, not a telemarketer. Be genuine and caring.`;

  return prompt;
}

// Generate dynamic variables for the agent (if using {{variable}} syntax in pre-configured agent)
export function generateDynamicVariables(
  analysis: AnalysisData,
  userName: string | null,
  companyName: string
): Record<string, string> {
  const variables: Record<string, string> = {
    user_name: userName || 'there',
    company_name: companyName,
    user_context: analysis.summary || 'No specific analysis available',
  };

  // Top frustration points
  if (analysis.frustrationPoints && analysis.frustrationPoints.length > 0) {
    variables.frustration_points = analysis.frustrationPoints
      .slice(0, 3)
      .map(fp => fp.issue)
      .join('; ');
    variables.has_frustrations = 'true';
  } else {
    variables.frustration_points = 'None detected';
    variables.has_frustrations = 'false';
  }

  // Drop-off context
  if (analysis.dropOffPoints && analysis.dropOffPoints.length > 0) {
    variables.drop_off_reason = analysis.dropOffPoints[0];
    variables.all_drop_offs = analysis.dropOffPoints.join('; ');
  } else {
    variables.drop_off_reason = 'Unknown';
    variables.all_drop_offs = 'None detected';
  }

  // Behavior patterns
  if (analysis.behaviorPatterns && analysis.behaviorPatterns.length > 0) {
    variables.behavior_patterns = analysis.behaviorPatterns.slice(0, 3).join('; ');
  } else {
    variables.behavior_patterns = 'Normal usage patterns';
  }

  // Session stats
  variables.session_count = String(analysis.sessionCount || 0);
  variables.event_count = String(analysis.totalEvents || 0);

  return variables;
}

// Generate a personalized first message based on analysis
export function generateFirstMessage(
  userName: string | null,
  companyName: string,
  analysis: AnalysisData
): string {
  const greeting = userName ? `Hi ${userName}!` : 'Hi there!';
  const intro = `This is an AI assistant calling on behalf of ${companyName}.`;

  // Personalize based on drop-off reason
  if (analysis.dropOffPoints && analysis.dropOffPoints.length > 0) {
    const dropOff = analysis.dropOffPoints[0].toLowerCase();

    if (dropOff.includes('pricing') || dropOff.includes('plans')) {
      return `${greeting} ${intro} I noticed you were checking out our pricing recently, and I wanted to reach out personally to see if I could help answer any questions or maybe find a plan that works better for your needs. Do you have a quick moment?`;
    }

    if (dropOff.includes('checkout') || dropOff.includes('payment')) {
      return `${greeting} ${intro} I saw you got pretty close to signing up with us, and I just wanted to check in to see if there was anything that held you back. Sometimes these things are just timing, but if there's anything I can help with, I'd love to chat. Got a minute?`;
    }

    if (dropOff.includes('signup') || dropOff.includes('onboarding')) {
      return `${greeting} ${intro} I noticed you started the signup process but didn't quite finish. No pressure at all, but I wanted to reach out and see if you ran into any issues or if there's anything I can help clarify. Do you have a moment?`;
    }

    if (dropOff.includes('cancel')) {
      return `${greeting} ${intro} I saw that you cancelled your account recently, and I completely understand - things change. But I wanted to personally reach out to understand what happened and see if there's anything we could do differently. Mind if I ask you a quick question?`;
    }
  }

  // Personalize based on frustration
  if (analysis.frustrationPoints && analysis.frustrationPoints.length > 0) {
    const hasHighSeverity = analysis.frustrationPoints.some(fp => fp.severity === 'high');

    if (hasHighSeverity) {
      return `${greeting} ${intro} I'm reaching out because it looks like you may have had a frustrating experience with us, and I wanted to personally apologize and see if there's anything we can do to make it right. Do you have a moment to chat?`;
    }

    return `${greeting} ${intro} I wanted to reach out personally because I noticed you had some trouble during your time with us. I'd love to understand what happened and see if we've fixed the issues you ran into. Got a quick minute?`;
  }

  // Default message
  return `${greeting} ${intro} I'm reaching out to former users to understand how we can improve. I was wondering if you had a moment to share your experience with us? No sales pitch, just genuinely curious about your feedback.`;
}

export type { Agent, CallResponse, OutboundCallConfig, AnalysisData };
