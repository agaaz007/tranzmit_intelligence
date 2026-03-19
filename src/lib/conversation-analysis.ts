import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const ConversationAnalysisSchema = z.object({
  summary: z.string().describe("A 2-3 sentence summary of the conversation."),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']).describe("Overall sentiment of the conversation."),
  pain_points: z.array(z.string()).describe("Specific issues the user mentioned during the conversation."),
  feature_requests: z.array(z.string()).describe("Things the user wished existed or asked for."),
  key_quotes: z.array(z.string()).min(3).max(5).describe("3-5 verbatim quotes from the transcript, exact words the user said."),
  satisfaction_score: z.number().min(1).max(10).describe("1-10 satisfaction score based on the conversation."),
  churn_reason: z.string().describe("One-sentence reason for churn if mentioned, or empty string if not applicable."),
  willing_to_return: z.boolean().describe("Whether the user expressed willingness to come back."),
});

export type ConversationAnalysisResult = z.infer<typeof ConversationAnalysisSchema>;

/**
 * Analyze a single conversation by ID. Loads transcript from DB, parses it,
 * sends to LLM, and saves the result back to the conversation record.
 */
export async function analyzeConversation(conversationId: string): Promise<ConversationAnalysisResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, transcript: true, analysisStatus: true },
  });

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (!conversation.transcript) {
    throw new Error('No transcript stored for this conversation');
  }

  // Mark as analyzing
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { analysisStatus: 'analyzing' },
  });

  try {
    const transcript = JSON.parse(conversation.transcript as string) as Array<{
      role: string;
      message: string;
      timestamp: string;
    }>;

    // Build readable conversation text
    const conversationText = transcript
      .map(entry => `[${entry.timestamp}] ${entry.role}: ${entry.message}`)
      .join('\n');

    if (conversationText.length < 50) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { analysisStatus: 'failed' },
      });
      throw new Error('No meaningful conversation content');
    }

    const systemPrompt = `You are an expert conversation analyst reviewing a voice/chat conversation transcript. Your job is to extract insights about user sentiment, pain points, feature requests, and churn risk.

IMPORTANT RULES:
1. ONLY reference things that were actually said in the transcript
2. key_quotes MUST be verbatim quotes — copy the exact words from the transcript, do not paraphrase
3. Be specific about pain points — reference the actual issues the user described
4. For feature_requests, only include things the user explicitly wished for or asked about
5. For churn_reason, only provide a reason if the user actually mentioned leaving, cancelling, or being dissatisfied enough to stop using the product. If no churn reason is mentioned, return an empty string.
6. For willing_to_return, look for explicit signals — statements like "I'd come back if...", "I'll give it another try", or conversely "I'm done with this"
7. satisfaction_score should reflect the overall tone and content of the conversation
8. sentiment should reflect the dominant emotional tone across the entire conversation`;

    const userPrompt = `Analyze this conversation transcript and provide insights:

TRANSCRIPT:
${conversationText}

Based on this transcript, extract:
1. A 2-3 sentence summary
2. Overall sentiment
3. Specific pain points mentioned
4. Feature requests
5. 3-5 key verbatim quotes
6. Satisfaction score (1-10)
7. Churn reason if mentioned
8. Whether the user is willing to return`;

    // Call LLM
    const { object } = await generateObject({
      model: openai('gpt-5-mini'),
      schema: ConversationAnalysisSchema,
      system: systemPrompt,
      prompt: userPrompt,
    });

    // Save analysis results
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        analysis: JSON.stringify(object),
        analysisStatus: 'completed',
      },
    });

    return object;
  } catch (error) {
    console.error(`Analysis failed for conversation ${conversationId}:`, error);
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { analysisStatus: 'failed' },
    });
    throw error;
  }
}
