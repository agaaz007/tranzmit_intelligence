import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getCohortHypotheses,
  updateHypothesisStatus,
  generateInterviewScript,
  generateHypothesesFromSignals,
  storeHypotheses,
} from '@/lib/hypothesis-generator';
import OpenAI from 'openai';

/**
 * GET /api/hypotheses - Get hypotheses
 * Query params:
 * - cohortId: required
 * - status: optional filter
 * - includeScript: optional, include generated interview script
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get('cohortId');
    const status = searchParams.get('status');
    const includeScript = searchParams.get('includeScript') === 'true';

    if (!cohortId) {
      return NextResponse.json(
        { error: 'cohortId is required' },
        { status: 400 }
      );
    }

    const hypotheses = await getCohortHypotheses(cohortId, {
      status: status || undefined,
    });

    const response: any = {
      hypotheses,
      total: hypotheses.length,
    };

    // Generate interview script if requested
    if (includeScript && hypotheses.length > 0) {
      response.interviewScript = generateInterviewScript(
        hypotheses.map(h => ({
          ...h,
          behaviorPattern: h.behaviorPattern || 'unknown',
          evidence: h.evidence,
          questions: h.questions,
        }))
      );
    }

    // Get cohort info
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { name: true, type: true, size: true },
    });

    response.cohort = cohort;

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Hypotheses API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get hypotheses' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hypotheses - Generate hypotheses for a cohort
 * Body:
 * - cohortId: required
 * - regenerate: optional, delete existing and regenerate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cohortId, regenerate } = body;

    if (!cohortId) {
      return NextResponse.json(
        { error: 'cohortId is required' },
        { status: 400 }
      );
    }

    // If regenerate, delete existing hypotheses first
    if (regenerate) {
      await prisma.interviewQuestion.deleteMany({
        where: { hypothesis: { cohortId } },
      });
      await prisma.hypothesis.deleteMany({
        where: { cohortId },
      });
    }

    // Get cohort with criteria (contains correlation and analysis data for funnel cohorts)
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { name: true, type: true, size: true, criteria: true, description: true },
    });

    if (!cohort) {
      return NextResponse.json(
        { error: 'Cohort not found' },
        { status: 404 }
      );
    }

    // Parse criteria to get funnel data
    const criteria = cohort.criteria ? JSON.parse(cohort.criteria) : null;
    
    // Check if this is a funnel cohort with correlation/analysis data
    if (criteria?.source === 'funnel' && (criteria.correlations?.length > 0 || criteria.analysis)) {
      // Use OpenAI GPT to generate hypotheses based on funnel data
      const hypotheses = await generateHypothesesWithAI(cohort, criteria);
      
      if (hypotheses.length > 0) {
        const stored = await storeHypotheses(cohortId, hypotheses);
        return NextResponse.json({
          hypothesesGenerated: stored,
          hypotheses,
          source: 'ai',
        });
      }
    }

    // Fallback: Get cohort members' signals for non-funnel cohorts
    const members = await prisma.cohortMember.findMany({
      where: { cohortId },
      orderBy: { priorityScore: 'desc' },
      take: 50,
    });

    if (members.length === 0) {
      // For funnel cohorts without members, generate basic hypotheses
      if (criteria?.source === 'funnel') {
        const basicHypotheses = generateBasicFunnelHypotheses(cohort, criteria);
        const stored = await storeHypotheses(cohortId, basicHypotheses);
        return NextResponse.json({
          hypothesesGenerated: stored,
          hypotheses: basicHypotheses,
          source: 'basic',
        });
      }
      
      return NextResponse.json({
        hypothesesGenerated: 0,
        message: 'No cohort members found. Build priority queue first.',
      });
    }

    // Collect all signals
    const allSignals = members.flatMap(m =>
      m.signals ? JSON.parse(m.signals) : []
    );

    if (allSignals.length === 0) {
      return NextResponse.json({
        hypothesesGenerated: 0,
        message: 'No behavioral signals found in cohort members.',
      });
    }

    // Generate hypotheses from signals
    const hypotheses = generateHypothesesFromSignals(allSignals, {
      name: cohort?.name || 'Unknown',
      type: cohort?.type || 'manual',
      size: cohort?.size || members.length,
    });

    // Store top 10 hypotheses
    const stored = await storeHypotheses(cohortId, hypotheses.slice(0, 10));

    return NextResponse.json({
      hypothesesGenerated: stored,
      hypotheses: hypotheses.slice(0, 10),
      source: 'signals',
    });
  } catch (error: any) {
    console.error('[Hypotheses API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate hypotheses' },
      { status: 500 }
    );
  }
}

// Generate hypotheses using OpenAI GPT based on funnel correlation and analysis data
async function generateHypothesesWithAI(
  cohort: { name: string; type: string | null; size: number; description: string | null },
  criteria: {
    cohortType: 'converted' | 'dropped';
    stepName?: string;
    stepIndex?: number;
    conversionRate?: number;
    dropOffRate?: number;
    correlations?: Array<{
      event: string;
      odds_ratio: number;
      success_percentage: number;
      failure_percentage: number;
    }>;
    analysis?: {
      lastEvents?: Array<{ event: string; count: number }>;
      lastPages?: Array<{ page: string; count: number }>;
      errors?: Array<{ event: string; message?: string; elementText?: string }>;
      devices?: Array<{ browser: string; deviceType: string; os: string; userCount: number }>;
    };
  }
): Promise<Array<{
  title: string;
  description: string;
  behaviorPattern: string;
  confidence: number;
  evidence: string[];
  questions: Array<{ question: string; purpose: string; category: 'opening' | 'discovery' | 'pain_point' | 'solution' | 'closing'; priority: number }>;
}>> {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  if (!openaiKey) {
    console.log('[Hypotheses] No OpenAI API key, falling back to basic generation');
    return generateBasicFunnelHypotheses({ name: cohort.name, type: cohort.type, size: cohort.size, description: cohort.description }, criteria);
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  // Build context from the data
  const isDropOff = criteria.cohortType === 'dropped';
  const contextParts: string[] = [];

  contextParts.push(`Cohort: "${cohort.name}" - ${cohort.size} users who ${isDropOff ? 'dropped off' : 'converted'} at step "${criteria.stepName || 'Unknown'}" (Step ${(criteria.stepIndex || 0) + 1})`);
  
  if (criteria.dropOffRate) {
    contextParts.push(`Drop-off rate at this step: ${criteria.dropOffRate.toFixed(1)}%`);
  }

  // Add correlation data
  if (criteria.correlations && criteria.correlations.length > 0) {
    const correlationSummary = criteria.correlations.slice(0, 8).map(c => 
      `- "${c.event}": ${c.odds_ratio.toFixed(2)}x ratio (${c.failure_percentage.toFixed(0)}% dropped, ${c.success_percentage.toFixed(0)}% converted)`
    ).join('\n');
    contextParts.push(`\nCorrelated Events (${isDropOff ? 'associated with drop-off' : 'associated with conversion'}):\n${correlationSummary}`);
  }

  // Add analysis data
  if (criteria.analysis) {
    if (criteria.analysis.lastEvents && criteria.analysis.lastEvents.length > 0) {
      const lastEventsSummary = criteria.analysis.lastEvents.slice(0, 5).map(e => 
        `- "${e.event}": ${e.count} users`
      ).join('\n');
      contextParts.push(`\nLast Events Before ${isDropOff ? 'Drop-off' : 'Conversion'}:\n${lastEventsSummary}`);
    }

    if (criteria.analysis.lastPages && criteria.analysis.lastPages.length > 0) {
      const lastPagesSummary = criteria.analysis.lastPages.slice(0, 5).map(p => 
        `- "${p.page}": ${p.count} users`
      ).join('\n');
      contextParts.push(`\nLast Pages Visited:\n${lastPagesSummary}`);
    }

    if (criteria.analysis.errors && criteria.analysis.errors.length > 0) {
      const errorsSummary = criteria.analysis.errors.slice(0, 5).map(e => 
        `- ${e.event}${e.elementText ? ` on "${e.elementText}"` : ''}${e.message ? `: ${e.message}` : ''}`
      ).join('\n');
      contextParts.push(`\nErrors & Frustration Signals:\n${errorsSummary}`);
    }

    if (criteria.analysis.devices && criteria.analysis.devices.length > 0) {
      const devicesSummary = criteria.analysis.devices.slice(0, 3).map(d => 
        `- ${d.browser} on ${d.os} (${d.deviceType}): ${d.userCount} users`
      ).join('\n');
      contextParts.push(`\nDevice Distribution:\n${devicesSummary}`);
    }
  }

  const prompt = `You are a product analytics expert. Based on the following funnel analysis data, generate 3-5 actionable hypotheses about why users ${isDropOff ? 'dropped off' : 'converted'}.

${contextParts.join('\n')}

For each hypothesis, provide:
1. A clear, specific title (e.g., "Mobile Safari users encounter checkout bug")
2. A detailed description explaining the hypothesis
3. The behavioral pattern observed
4. Confidence level (0.0 to 1.0) based on evidence strength
5. Key evidence as an array of strings supporting this hypothesis
6. 2-3 interview questions to validate this hypothesis (category must be one of: opening, discovery, pain_point, solution, closing)

Respond in JSON format:
{
  "hypotheses": [
    {
      "title": "string",
      "description": "string",
      "behaviorPattern": "string",
      "confidence": number,
      "evidence": ["string", "string"],
      "questions": [
        { "question": "string", "purpose": "string", "category": "discovery", "priority": 1 }
      ]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a product analytics expert who generates actionable hypotheses from funnel data. Always respond with valid JSON. For question categories, only use: opening, discovery, pain_point, solution, or closing.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    console.log('[Hypotheses] Generated', parsed.hypotheses?.length || 0, 'hypotheses with AI');
    
    // Ensure evidence is always an array of strings
    const hypotheses = (parsed.hypotheses || []).map((h: { title: string; description: string; behaviorPattern: string; confidence: number; evidence: string[] | Record<string, string[]>; questions: Array<{ question: string; purpose: string; category: string; priority: number }> }) => ({
      ...h,
      evidence: Array.isArray(h.evidence) ? h.evidence : (h.evidence?.key_points || []),
      questions: h.questions.map(q => ({
        ...q,
        category: ['opening', 'discovery', 'pain_point', 'solution', 'closing'].includes(q.category) ? q.category : 'discovery'
      }))
    }));
    
    return hypotheses;
  } catch (error) {
    console.error('[Hypotheses] OpenAI error:', error);
    // Fallback to basic generation
    return generateBasicFunnelHypotheses({ name: cohort.name, type: cohort.type, size: cohort.size, description: cohort.description }, criteria);
  }
}

// Generate basic hypotheses without AI for funnel cohorts
function generateBasicFunnelHypotheses(
  cohort: { name: string; type: string | null; size: number; description: string | null },
  criteria: {
    cohortType: 'converted' | 'dropped';
    stepName?: string;
    correlations?: Array<{ event: string; odds_ratio: number }>;
    analysis?: {
      lastEvents?: Array<{ event: string; count: number }>;
      errors?: Array<{ event: string; elementText?: string }>;
      devices?: Array<{ browser: string; deviceType: string; userCount: number }>;
    };
  }
): Array<{
  title: string;
  description: string;
  behaviorPattern: string;
  confidence: number;
  evidence: string[];
  questions: Array<{ question: string; purpose: string; category: 'opening' | 'discovery' | 'pain_point' | 'solution' | 'closing'; priority: number }>;
}> {
  const hypotheses: Array<{
    title: string;
    description: string;
    behaviorPattern: string;
    confidence: number;
    evidence: string[];
    questions: Array<{ question: string; purpose: string; category: 'opening' | 'discovery' | 'pain_point' | 'solution' | 'closing'; priority: number }>;
  }> = [];
  const isDropOff = criteria.cohortType === 'dropped';

  // Hypothesis from top correlated event
  if (criteria.correlations && criteria.correlations.length > 0) {
    const topCorrelation = criteria.correlations[0];
    hypotheses.push({
      title: `"${topCorrelation.event}" ${isDropOff ? 'causes friction' : 'drives conversion'}`,
      description: `Users who ${isDropOff ? 'dropped off' : 'converted'} at "${criteria.stepName}" frequently performed "${topCorrelation.event}" with a ${topCorrelation.odds_ratio.toFixed(2)}x correlation ratio. This suggests ${isDropOff ? 'this action may be causing confusion or frustration' : 'this action is a key success indicator'}.`,
      behaviorPattern: `${topCorrelation.event}_correlation`,
      confidence: Math.min(0.9, 0.5 + (topCorrelation.odds_ratio > 1 ? topCorrelation.odds_ratio * 0.1 : (1 - topCorrelation.odds_ratio) * 0.5)),
      evidence: [`Correlated event: ${topCorrelation.event}`, `Odds ratio: ${topCorrelation.odds_ratio.toFixed(2)}x`],
      questions: [
        { question: `Can you walk me through what happened when you ${topCorrelation.event.replace(/_/g, ' ')}?`, purpose: 'Understand user experience', category: 'discovery', priority: 1 },
        { question: `What were you expecting to happen after ${topCorrelation.event.replace(/_/g, ' ')}?`, purpose: 'Identify expectation gaps', category: 'pain_point', priority: 2 },
      ],
    });
  }

  // Hypothesis from errors
  if (criteria.analysis?.errors && criteria.analysis.errors.length > 0) {
    const errorTypes = [...new Set(criteria.analysis.errors.map(e => e.event))];
    hypotheses.push({
      title: `Technical issues causing ${isDropOff ? 'drop-off' : 'hesitation'}`,
      description: `${criteria.analysis.errors.length} frustration signals detected including ${errorTypes.join(', ')}. ${criteria.analysis.errors[0].elementText ? `Users encountered issues with "${criteria.analysis.errors[0].elementText}".` : ''}`,
      behaviorPattern: 'error_encounter',
      confidence: 0.75,
      evidence: [`Error count: ${criteria.analysis.errors.length}`, `Error types: ${errorTypes.join(', ')}`],
      questions: [
        { question: 'Did you encounter any errors or issues during your experience?', purpose: 'Validate error impact', category: 'discovery', priority: 1 },
        { question: 'Was there anything that felt broken or didn\'t work as expected?', purpose: 'Discover hidden issues', category: 'pain_point', priority: 2 },
      ],
    });
  }

  // Hypothesis from device distribution
  if (criteria.analysis?.devices && criteria.analysis.devices.length > 0) {
    const mobileUsers = criteria.analysis.devices.filter(d => d.deviceType === 'Mobile');
    const totalUsers = criteria.analysis.devices.reduce((sum, d) => sum + d.userCount, 0);
    const mobileCount = mobileUsers.reduce((sum, d) => sum + d.userCount, 0);
    
    if (mobileCount > totalUsers * 0.4) {
      hypotheses.push({
        title: `Mobile experience ${isDropOff ? 'friction' : 'optimization opportunity'}`,
        description: `${Math.round(mobileCount / totalUsers * 100)}% of users in this cohort are on mobile devices. The mobile experience at "${criteria.stepName}" may ${isDropOff ? 'need optimization' : 'be working well'}.`,
        behaviorPattern: 'mobile_usage',
        confidence: 0.6,
        evidence: [`Mobile percentage: ${Math.round(mobileCount / totalUsers * 100)}%`, `Top devices: ${criteria.analysis.devices.slice(0, 3).map(d => d.browser).join(', ')}`],
        questions: [
          { question: 'Were you using a phone or computer when this happened?', purpose: 'Confirm device context', category: 'discovery', priority: 2 },
          { question: 'How was the experience on your device? Was anything hard to see or tap?', purpose: 'Identify mobile-specific issues', category: 'pain_point', priority: 1 },
        ],
      });
    }
  }

  // Default hypothesis if no specific data
  if (hypotheses.length === 0) {
    hypotheses.push({
      title: `Understanding ${isDropOff ? 'drop-off' : 'conversion'} at "${criteria.stepName}"`,
      description: `${cohort.size} users ${isDropOff ? 'dropped off' : 'converted'} at this funnel step. Further investigation is needed to understand the root cause.`,
      behaviorPattern: 'general_funnel_behavior',
      confidence: 0.4,
      evidence: [`Cohort size: ${cohort.size}`, `Step: ${criteria.stepName}`],
      questions: [
        { question: `What was going through your mind at the ${criteria.stepName} step?`, purpose: 'Understand user mindset', category: 'discovery', priority: 1 },
        { question: `Was there anything that made you ${isDropOff ? 'hesitate or stop' : 'feel confident to continue'}?`, purpose: 'Identify key factors', category: 'pain_point', priority: 1 },
      ],
    });
  }

  return hypotheses;
}

/**
 * PATCH /api/hypotheses - Update hypothesis status
 * Body:
 * - hypothesisId: required
 * - status: 'active' | 'validated' | 'invalidated'
 * - validationNotes: optional notes
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { hypothesisId, status, validationNotes } = body;

    if (!hypothesisId || !status) {
      return NextResponse.json(
        { error: 'hypothesisId and status are required' },
        { status: 400 }
      );
    }

    await updateHypothesisStatus(hypothesisId, status, validationNotes);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Hypotheses API] PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update hypothesis' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/hypotheses - Delete a hypothesis
 * Query params:
 * - hypothesisId: required
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hypothesisId = searchParams.get('hypothesisId');

    if (!hypothesisId) {
      return NextResponse.json(
        { error: 'hypothesisId is required' },
        { status: 400 }
      );
    }

    // Delete questions first (cascade should handle this, but being explicit)
    await prisma.interviewQuestion.deleteMany({
      where: { hypothesisId },
    });

    await prisma.hypothesis.delete({
      where: { id: hypothesisId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Hypotheses API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete hypothesis' },
      { status: 500 }
    );
  }
}
