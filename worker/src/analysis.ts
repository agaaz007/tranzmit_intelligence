/**
 * OpenAI GPT-5.4 mini VLM call for multimodal analysis.
 */

import OpenAI from 'openai';

export interface MultimodalFrictionPoint {
  timestamp: string;
  dom_evidence: string;
  visual_evidence: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  product_fix: string;
}

export interface MultimodalAnalysis {
  summary: string;
  user_intent: string;
  tags: string[];
  went_well: string[];
  friction_points: MultimodalFrictionPoint[];
  ux_rating: number;
  description: string;
  visual_insights: string[];
  frames_analyzed: number;
}

const client = new OpenAI(); // reads OPENAI_API_KEY from env

export async function callVLM(
  system: string,
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>
): Promise<MultimodalAnalysis> {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4-mini',
    max_completion_tokens: 4096,
    temperature: 0.4,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: content as any },
    ],
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('No content in OpenAI API response');
  }

  // Strip markdown fences if present
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned) as MultimodalAnalysis;
}
