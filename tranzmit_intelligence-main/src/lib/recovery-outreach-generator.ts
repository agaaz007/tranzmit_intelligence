import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const RecoveryOutreachSchema = z.object({
  email: z.object({
    subject: z.string().describe('Compelling email subject line, max 60 chars'),
    body: z.string().describe('Email body with personalized opening, empathy for their experience, specific reference to their frustration, and clear CTA'),
    tone: z.enum(['apologetic', 'helpful', 'curious']).describe('The primary tone of the email'),
  }),
  callScript: z.object({
    openingLine: z.string().describe('First thing to say when they answer, mentioning their specific issue'),
    keyPoints: z.array(z.string()).describe('3-4 bullet points to cover during the call'),
    objectionHandlers: z.array(z.object({
      objection: z.string(),
      response: z.string(),
    })).describe('2-3 common objections and how to handle them'),
    closingCTA: z.string().describe('How to close the call and what action to request'),
  }),
  personalizedReason: z.string().describe('One-sentence summary of why this specific user churned, based on their session data'),
});

export type RecoveryOutreach = z.infer<typeof RecoveryOutreachSchema>;

interface SessionAnalysis {
  frustrationPoints?: Array<{ timestamp?: string; issue: string; severity?: string }>;
  behaviorPatterns?: string[];
  dropOffPoints?: string[];
  summary?: string;
  uxRating?: number;
  tags?: string[];
  went_well?: string[];
}

interface GenerateOutreachParams {
  userName?: string;
  userEmail: string;
  companyName?: string;
  productName?: string;
  sessionAnalysis: SessionAnalysis;
  churnReason?: string;
}

export async function generateRecoveryOutreach(params: GenerateOutreachParams): Promise<RecoveryOutreach> {
  const {
    userName = 'there',
    userEmail,
    companyName = 'our team',
    productName = 'our product',
    sessionAnalysis,
    churnReason,
  } = params;

  const systemPrompt = `You are an expert customer success specialist crafting personalized recovery outreach for churned users. Your goal is to win them back by showing genuine understanding of their specific experience.

IMPORTANT RULES:
1. Reference SPECIFIC frustration points from their session data
2. Never be generic - every message should feel personally written
3. Acknowledge their struggles without being overly apologetic
4. Focus on how things have improved or can be fixed for them
5. Keep emails concise (under 150 words)
6. Call scripts should be conversational, not salesy
7. Use their first name if available

COMPANY: ${companyName}
PRODUCT: ${productName}`;

  const frustrationPointsText = sessionAnalysis.frustrationPoints?.length
    ? sessionAnalysis.frustrationPoints.map(fp => `- ${fp.issue}${fp.severity ? ` (${fp.severity})` : ''}`).join('\n')
    : 'No specific frustration points detected';

  const behaviorPatternsText = sessionAnalysis.behaviorPatterns?.length
    ? sessionAnalysis.behaviorPatterns.join('\n')
    : 'No specific patterns detected';

  const dropOffPointsText = sessionAnalysis.dropOffPoints?.length
    ? sessionAnalysis.dropOffPoints.join('\n')
    : 'No specific drop-off points detected';

  const userPrompt = `Generate recovery outreach for this churned user:

USER: ${userName} (${userEmail})
${churnReason ? `KNOWN CHURN REASON: ${churnReason}` : ''}

SESSION ANALYSIS SUMMARY:
${sessionAnalysis.summary || 'No summary available'}

FRUSTRATION POINTS THEY ENCOUNTERED:
${frustrationPointsText}

BEHAVIOR PATTERNS:
${behaviorPatternsText}

KEY DROP-OFF MOMENTS:
${dropOffPointsText}

${sessionAnalysis.uxRating ? `UX RATING: ${sessionAnalysis.uxRating}/10` : ''}
${sessionAnalysis.tags?.length ? `TAGS: ${sessionAnalysis.tags.join(', ')}` : ''}
${sessionAnalysis.went_well?.length ? `WHAT WENT WELL: ${sessionAnalysis.went_well.join(', ')}` : ''}

Generate a personalized recovery email and call script that specifically addresses their experience. Be empathetic but action-oriented.`;

  const { object } = await generateObject({
    model: openai('gpt-5.2-chat-latest'),
    schema: RecoveryOutreachSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  return object;
}
