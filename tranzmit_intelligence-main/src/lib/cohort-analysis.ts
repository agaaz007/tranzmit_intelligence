import { PostHogClient } from './posthog';
import { prisma } from './prisma';

export interface CohortMetrics {
  totalUsers: number;
  activeUsers: number;
  conversionRate: number;
  retentionRate: number;
  avgSessionDuration: number;
  avgEventsPerUser: number;
  topEvents: { event: string; count: number }[];
}

export interface CohortInsights {
  summary: string;
  trends: string[];
  anomalies: string[];
  recommendations: string[];
}

/**
 * Analyze cohort behavior using PostHog data
 */
export async function analyzeCohortBehavior(
  cohortId: string,
  posthogClient: PostHogClient,
  dateRange: { from: string; to: string } = { from: '-30d', to: 'now' }
): Promise<{ metrics: CohortMetrics; insights: CohortInsights }> {
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
  });

  if (!cohort) {
    throw new Error('Cohort not found');
  }

  // Parse criteria to get user IDs
  const criteria = cohort.criteria ? JSON.parse(cohort.criteria) : null;
  const userIds = criteria?.userIds || [];

  // Build HogQL query to get cohort metrics
  const metricsQuery = `
    SELECT
      uniq(distinct_id) as total_users,
      count() as total_events,
      avg(session_duration) as avg_duration
    FROM events
    WHERE distinct_id IN (${userIds.map((id: string) => `'${id}'`).join(',')})
      AND timestamp >= toDateTime('${dateRange.from}')
      AND timestamp <= toDateTime('${dateRange.to}')
  `;

  let metrics: CohortMetrics = {
    totalUsers: cohort.size,
    activeUsers: 0,
    conversionRate: 0,
    retentionRate: 0,
    avgSessionDuration: 0,
    avgEventsPerUser: 0,
    topEvents: [],
  };

  try {
    const result = await posthogClient.executeHogQL(metricsQuery);
    if (result.results && result.results.length > 0) {
      const row = result.results[0];
      metrics.totalUsers = row[0] || cohort.size;
      metrics.avgEventsPerUser = row[1] / (row[0] || 1);
      metrics.avgSessionDuration = row[2] || 0;
    }
  } catch (error) {
    console.error('[CohortAnalysis] Failed to fetch metrics:', error);
  }

  // Get top events for this cohort
  try {
    const eventsQuery = `
      SELECT event, count() as count
      FROM events
      WHERE distinct_id IN (${userIds.slice(0, 100).map((id: string) => `'${id}'`).join(',')})
        AND timestamp >= minus(now(), toIntervalDay(30))
      GROUP BY event
      ORDER BY count DESC
      LIMIT 10
    `;

    const eventsResult = await posthogClient.executeHogQL(eventsQuery);
    if (eventsResult.results) {
      metrics.topEvents = eventsResult.results.map((row: any) => ({
        event: row[0],
        count: row[1],
      }));
    }
  } catch (error) {
    console.error('[CohortAnalysis] Failed to fetch top events:', error);
  }

  // Generate insights
  const insights = generateCohortInsights(metrics, cohort);

  return { metrics, insights };
}

/**
 * Generate insights from cohort metrics
 */
function generateCohortInsights(
  metrics: CohortMetrics,
  cohort: any
): CohortInsights {
  const insights: CohortInsights = {
    summary: '',
    trends: [],
    anomalies: [],
    recommendations: [],
  };

  // Summary
  insights.summary = `Cohort "${cohort.name}" has ${metrics.totalUsers} users with an average of ${metrics.avgEventsPerUser.toFixed(1)} events per user.`;

  // Engagement analysis
  if (metrics.avgEventsPerUser < 5) {
    insights.anomalies.push('Low engagement: Users are performing fewer than 5 events on average');
    insights.recommendations.push('Implement onboarding flow to increase feature adoption');
    insights.recommendations.push('Send targeted email campaigns to re-engage users');
  } else if (metrics.avgEventsPerUser > 50) {
    insights.trends.push('High engagement: Power users performing many actions');
    insights.recommendations.push('Consider creating a VIP program for highly engaged users');
  }

  // Session duration analysis
  if (metrics.avgSessionDuration > 0) {
    const avgMinutes = metrics.avgSessionDuration / 60;
    if (avgMinutes < 2) {
      insights.anomalies.push(`Short sessions: Average ${avgMinutes.toFixed(1)} minutes`);
      insights.recommendations.push('Investigate bounce rate and page load times');
    } else if (avgMinutes > 30) {
      insights.trends.push(`Long sessions: Users spending ${avgMinutes.toFixed(0)} minutes on average`);
    }
  }

  // Event patterns
  if (metrics.topEvents.length > 0) {
    const topEvent = metrics.topEvents[0];
    insights.trends.push(`Most common action: "${topEvent.event}" (${topEvent.count} times)`);
  }

  // Generic recommendations
  if (insights.recommendations.length === 0) {
    insights.recommendations.push('Monitor cohort behavior over time for trends');
    insights.recommendations.push('Run A/B tests to improve conversion');
    insights.recommendations.push('Conduct user interviews to understand needs');
  }

  return insights;
}

/**
 * Store cohort analysis in database
 */
export async function storeCohortAnalysis(
  cohortId: string,
  analysisType: string,
  metrics: CohortMetrics,
  insights: CohortInsights,
  dateRange: { from: string; to: string }
) {
  return await prisma.cohortAnalysis.create({
    data: {
      cohortId,
      analysisType,
      metrics: JSON.stringify(metrics),
      insights: JSON.stringify(insights),
      dateRange: JSON.stringify(dateRange),
    },
  });
}

/**
 * Get cohort analyses
 */
export async function getCohortAnalyses(cohortId: string, limit: number = 10) {
  const analyses = await prisma.cohortAnalysis.findMany({
    where: { cohortId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return analyses.map(analysis => ({
    ...analysis,
    metrics: JSON.parse(analysis.metrics),
    insights: analysis.insights ? JSON.parse(analysis.insights) : null,
    dateRange: JSON.parse(analysis.dateRange),
  }));
}
