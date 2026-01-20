import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/interviews/insights - Create insight for interview
 * Body: interviewId, painPoints, suggestions, sentiment, themes, satisfaction, summary
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      interviewId,
      painPoints,
      suggestions,
      sentiment,
      themes,
      satisfaction,
      summary,
    } = body;

    if (!interviewId) {
      return NextResponse.json(
        { error: 'interviewId is required' },
        { status: 400 }
      );
    }

    const insight = await prisma.interviewInsight.create({
      data: {
        interviewId,
        painPoints: painPoints ? JSON.stringify(painPoints) : null,
        suggestions: suggestions ? JSON.stringify(suggestions) : null,
        sentiment,
        themes: themes ? JSON.stringify(themes) : null,
        satisfaction,
        summary,
      },
    });

    return NextResponse.json({ insight });
  } catch (error: any) {
    console.error('[Interview Insights API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create insight' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/interviews/insights - Get aggregated insights
 * Query params: projectId, cohortId
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const cohortId = searchParams.get('cohortId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const where: any = { interview: { projectId } };
    if (cohortId) where.interview = { ...where.interview, cohortId };

    const insights = await prisma.interviewInsight.findMany({
      where,
      include: {
        interview: {
          select: {
            id: true,
            userId: true,
            userName: true,
            completedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate insights
    const aggregated = {
      totalInsights: insights.length,
      sentimentBreakdown: {
        positive: insights.filter(i => i.sentiment === 'positive').length,
        neutral: insights.filter(i => i.sentiment === 'neutral').length,
        negative: insights.filter(i => i.sentiment === 'negative').length,
        mixed: insights.filter(i => i.sentiment === 'mixed').length,
      },
      avgSatisfaction: insights.reduce((sum, i) => sum + (i.satisfaction || 0), 0) / insights.length || 0,
      commonThemes: extractCommonThemes(insights),
      topPainPoints: extractTopPainPoints(insights),
      topSuggestions: extractTopSuggestions(insights),
    };

    return NextResponse.json({
      aggregated,
      insights: insights.map(ins => ({
        ...ins,
        painPoints: ins.painPoints ? JSON.parse(ins.painPoints) : null,
        suggestions: ins.suggestions ? JSON.parse(ins.suggestions) : null,
        themes: ins.themes ? JSON.parse(ins.themes) : null,
      })),
    });
  } catch (error: any) {
    console.error('[Interview Insights API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}

function extractCommonThemes(insights: any[]): { theme: string; count: number }[] {
  const themeMap = new Map<string, number>();

  insights.forEach(insight => {
    if (insight.themes) {
      try {
        const themes = JSON.parse(insight.themes);
        themes.forEach((t: any) => {
          const theme = typeof t === 'string' ? t : t.theme;
          themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
        });
      } catch (e) {}
    }
  });

  return Array.from(themeMap.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function extractTopPainPoints(insights: any[]): string[] {
  const painPointsMap = new Map<string, number>();

  insights.forEach(insight => {
    if (insight.painPoints) {
      try {
        const painPoints = JSON.parse(insight.painPoints);
        painPoints.forEach((p: any) => {
          const point = typeof p === 'string' ? p : p.point;
          painPointsMap.set(point, (painPointsMap.get(point) || 0) + 1);
        });
      } catch (e) {}
    }
  });

  return Array.from(painPointsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([point]) => point);
}

function extractTopSuggestions(insights: any[]): string[] {
  const suggestionsMap = new Map<string, number>();

  insights.forEach(insight => {
    if (insight.suggestions) {
      try {
        const suggestions = JSON.parse(insight.suggestions);
        suggestions.forEach((s: any) => {
          const suggestion = typeof s === 'string' ? s : s.suggestion;
          suggestionsMap.set(suggestion, (suggestionsMap.get(suggestion) || 0) + 1);
        });
      } catch (e) {}
    }
  });

  return Array.from(suggestionsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([suggestion]) => suggestion);
}
