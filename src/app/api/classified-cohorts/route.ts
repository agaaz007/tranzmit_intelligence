import { NextRequest, NextResponse } from 'next/server';
import { createPostHogClient, ClassifiedUser, InterviewCohortType, FunnelCorrelation } from '@/lib/posthog';
import { prisma } from '@/lib/prisma';

// Top correlations across all analyzed funnels
interface FunnelCorrelationSummary {
  funnelName: string;
  funnelId: number;
  dropoffStep: string;
  dropoffStepIndex: number;
  dropoffRate: number;
  correlations: FunnelCorrelation[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');
  const insightId = searchParams.get('insightId');
  const stepIndex = searchParams.get('stepIndex');
  const cohortFilter = searchParams.get('cohort') as InterviewCohortType | 'all' | null;
  const limit = parseInt(searchParams.get('limit') || '30');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    // Get project PostHog config
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project?.posthogKey || !project?.posthogProjId) {
      return NextResponse.json({ error: 'PostHog not configured for this project' }, { status: 400 });
    }

    const posthog = createPostHogClient({
      apiKey: project.posthogKey,
      projectId: project.posthogProjId,
      host: project.posthogHost || 'https://us.posthog.com',
    });

    let classifiedUsers: ClassifiedUser[] = [];
    const funnelCorrelations: FunnelCorrelationSummary[] = [];

    // If insightId provided, get users from that specific funnel
    if (insightId) {
      const insight = await posthog.getInsight(parseInt(insightId));

      if (insight.filters.events) {
        const funnelSteps = insight.filters.events.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
        }));

        // Get correlations for this funnel
        const correlations = await posthog.getFunnelCorrelations({ funnelSteps });

        funnelCorrelations.push({
          funnelName: insight.name,
          funnelId: insight.id,
          dropoffStep: funnelSteps[parseInt(stepIndex || '1')]?.name || 'Unknown',
          dropoffStepIndex: parseInt(stepIndex || '1'),
          dropoffRate: 0,
          correlations: correlations.slice(0, 5),
        });

        classifiedUsers = await posthog.classifyUsersIntoCohorts({
          funnelSteps,
          funnelStep: parseInt(stepIndex || '1'),
          limit,
        });
      }
    } else {
      // Get all funnel insights and classify users from each
      const insights = await posthog.getInsights();

      for (const insight of insights.slice(0, 3)) { // Limit to top 3 funnels
        if (insight.filters.events && insight.filters.events.length > 1) {
          const funnelSteps = insight.filters.events.map(e => ({
            id: e.id,
            name: e.name,
            type: e.type,
          }));

          // Get users from step with highest drop-off
          const processed = await posthog.getFunnelWithResults(insight.id);
          let maxDropoffStep = 1;
          let maxDropoffRate = 0;
          let dropoffStepName = funnelSteps[1]?.name || 'Step 2';

          if (processed.result) {
            for (let i = 1; i < processed.result.length; i++) {
              const prev = processed.result[i - 1].count || 0;
              const curr = processed.result[i].count || 0;
              const dropoff = prev > 0 ? ((prev - curr) / prev) * 100 : 0;
              if (dropoff > maxDropoffRate) {
                maxDropoffRate = dropoff;
                maxDropoffStep = i;
                dropoffStepName = processed.result[i].name || funnelSteps[i]?.name || `Step ${i + 1}`;
              }
            }
          }

          // Get correlations for this funnel - the "AI Shortcut"
          try {
            const correlations = await posthog.getFunnelCorrelations({ funnelSteps });

            funnelCorrelations.push({
              funnelName: insight.name,
              funnelId: insight.id,
              dropoffStep: dropoffStepName,
              dropoffStepIndex: maxDropoffStep,
              dropoffRate: maxDropoffRate,
              correlations: correlations.slice(0, 5),
            });
          } catch (e) {
            console.error(`Failed to get correlations for funnel ${insight.name}:`, e);
          }

          const users = await posthog.classifyUsersIntoCohorts({
            funnelSteps,
            funnelStep: maxDropoffStep,
            limit: Math.ceil(limit / insights.length),
          });

          classifiedUsers.push(...users);
        }
      }
    }

    // Apply cohort filter
    if (cohortFilter && cohortFilter !== 'all') {
      classifiedUsers = classifiedUsers.filter(u => u.cohortType === cohortFilter);
    }

    // Sort by priority score and limit
    classifiedUsers = classifiedUsers
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);

    // Calculate stats by cohort type
    const stats = {
      total: classifiedUsers.length,
      technicalVictims: classifiedUsers.filter(u => u.cohortType === 'technical_victim').length,
      confusedBrowsers: classifiedUsers.filter(u => u.cohortType === 'confused_browser').length,
      wrongFit: classifiedUsers.filter(u => u.cohortType === 'wrong_fit').length,
      highValue: classifiedUsers.filter(u => u.cohortType === 'high_value').length,
      interviewRecommended: classifiedUsers.filter(u => u.recommendedAction === 'interview').length,
      bugReportRecommended: classifiedUsers.filter(u => u.recommendedAction === 'bug_report').length,
    };

    // Aggregate all correlations and rank by odds ratio
    const allCorrelations = funnelCorrelations.flatMap(fc =>
      fc.correlations.map(c => ({
        ...c,
        funnelName: fc.funnelName,
        dropoffStep: fc.dropoffStep,
      }))
    ).sort((a, b) => b.odds_ratio - a.odds_ratio);

    return NextResponse.json({
      users: classifiedUsers,
      stats,
      // NEW: Correlation analysis data for the UI
      correlationAnalysis: {
        funnels: funnelCorrelations,
        topCorrelations: allCorrelations.slice(0, 10),
        hasErrorCorrelations: allCorrelations.some(c =>
          c.event.event.toLowerCase().includes('error') ||
          c.event.event.toLowerCase().includes('exception')
        ),
        hasBrowserCorrelations: allCorrelations.some(c =>
          c.event.properties?.['$browser'] ||
          c.event.properties?.['$os']
        ),
      },
      posthogHost: project.posthogHost || 'https://us.posthog.com',
      posthogProjectId: project.posthogProjId,
    });
  } catch (error) {
    console.error('Failed to get classified cohorts:', error);
    return NextResponse.json({ error: 'Failed to classify users' }, { status: 500 });
  }
}
