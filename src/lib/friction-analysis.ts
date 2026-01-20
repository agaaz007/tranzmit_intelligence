import { PostHogClient, FunnelStep, ProcessedFunnel } from './posthog';
import { prisma } from './prisma';

export interface FrictionPointInsights {
  reasons: string[];
  recommendations: string[];
  affectedSegments: string[];
  commonPatterns?: string[];
}

export interface SessionRecordingSummary {
  recordingId: string;
  userId: string;
  duration?: number;
  events?: number;
  timestamp?: string;
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Calculate severity based on drop-off metrics
 */
export function calculateSeverity(dropOffRate: number, dropOffCount: number): SeverityLevel {
  // Critical: >50% drop-off OR >1000 users dropped
  if (dropOffRate > 50 || dropOffCount > 1000) {
    return 'critical';
  }
  // High: >30% drop-off OR >500 users dropped
  if (dropOffRate > 30 || dropOffCount > 500) {
    return 'high';
  }
  // Medium: >15% drop-off OR >100 users dropped
  if (dropOffRate > 15 || dropOffCount > 100) {
    return 'medium';
  }
  // Low: everything else
  return 'low';
}

/**
 * Generate insights based on funnel step analysis
 */
export async function generateFrictionInsights(
  step: FunnelStep,
  funnelName: string,
  posthogClient: PostHogClient
): Promise<FrictionPointInsights> {
  const insights: FrictionPointInsights = {
    reasons: [],
    recommendations: [],
    affectedSegments: [],
    commonPatterns: [],
  };

  // Analyze drop-off rate
  if (step.dropOffRate > 50) {
    insights.reasons.push(`Severe drop-off at "${step.name}" with ${step.dropOffRate.toFixed(1)}% of users leaving`);
    insights.recommendations.push('Immediate investigation required - consider A/B testing alternative flows');
    insights.recommendations.push('Review session recordings to identify usability issues');
  } else if (step.dropOffRate > 30) {
    insights.reasons.push(`High drop-off rate of ${step.dropOffRate.toFixed(1)}% indicates friction`);
    insights.recommendations.push('Simplify the step or provide better guidance');
    insights.recommendations.push('Add progressive disclosure to reduce cognitive load');
  } else if (step.dropOffRate > 15) {
    insights.reasons.push(`Moderate drop-off of ${step.dropOffRate.toFixed(1)}% detected`);
    insights.recommendations.push('Consider improving UI/UX at this step');
    insights.recommendations.push('Add contextual help or tooltips');
  }

  // Analyze conversion time
  if (step.avgTimeToConvert) {
    const avgMinutes = step.avgTimeToConvert / 60;
    if (avgMinutes > 60) {
      insights.reasons.push(`Users take ${avgMinutes.toFixed(0)} minutes on average - possibly confusing`);
      insights.recommendations.push('Break this step into smaller sub-steps');
      insights.recommendations.push('Add progress indicators to show completion status');
    } else if (avgMinutes > 10) {
      insights.reasons.push(`Long completion time (${avgMinutes.toFixed(0)} minutes) suggests complexity`);
      insights.recommendations.push('Reduce form fields or required information');
      insights.recommendations.push('Consider auto-saving progress');
    }
  }

  // Step-specific insights based on common patterns
  const stepNameLower = step.name.toLowerCase();

  if (stepNameLower.includes('payment') || stepNameLower.includes('checkout')) {
    insights.commonPatterns?.push('Payment friction detected');
    insights.recommendations.push('Ensure multiple payment methods are available');
    insights.recommendations.push('Display security badges and trust indicators');
    insights.recommendations.push('Reduce required fields to minimum');
    insights.affectedSegments.push('Price-sensitive users', 'Security-conscious users');
  } else if (stepNameLower.includes('signup') || stepNameLower.includes('register')) {
    insights.commonPatterns?.push('Registration friction detected');
    insights.recommendations.push('Allow social login options (Google, Apple, etc.)');
    insights.recommendations.push('Consider passwordless authentication');
    insights.recommendations.push('Defer optional information collection');
    insights.affectedSegments.push('New users', 'Mobile users');
  } else if (stepNameLower.includes('form') || stepNameLower.includes('information')) {
    insights.commonPatterns?.push('Form completion friction');
    insights.recommendations.push('Add inline validation and helpful error messages');
    insights.recommendations.push('Use smart defaults and auto-fill where possible');
    insights.recommendations.push('Show field format examples');
    insights.affectedSegments.push('First-time users', 'Users on small screens');
  } else if (stepNameLower.includes('verification') || stepNameLower.includes('confirm')) {
    insights.commonPatterns?.push('Verification friction detected');
    insights.recommendations.push('Simplify verification process');
    insights.recommendations.push('Provide alternative verification methods');
    insights.recommendations.push('Send reminder emails/SMS automatically');
    insights.affectedSegments.push('Users with email issues', 'International users');
  }

  // General recommendations if no specific issues found
  if (insights.recommendations.length === 0) {
    insights.recommendations.push('Monitor user behavior at this step');
    insights.recommendations.push('Collect user feedback through surveys');
    insights.recommendations.push('Test with different user segments');
  }

  return insights;
}

/**
 * Analyze a complete funnel for friction points
 */
export async function analyzeFunnelFriction(
  projectId: string,
  funnel: ProcessedFunnel,
  posthogClient: PostHogClient,
  options: {
    minDropOffRate?: number; // Minimum drop-off rate to consider (default: 10%)
    minDropOffCount?: number; // Minimum users dropped to consider (default: 50)
    fetchRecordings?: boolean; // Whether to fetch session recordings (default: false)
  } = {}
): Promise<void> {
  const {
    minDropOffRate = 10,
    minDropOffCount = 50,
    fetchRecordings = false,
  } = options;

  console.log(`[FrictionAnalysis] Analyzing funnel: ${funnel.name} (${funnel.id})`);

  // Skip the first step as it has no drop-off
  for (let i = 1; i < funnel.steps.length; i++) {
    const step = funnel.steps[i];

    // Only analyze steps with significant drop-off
    if (step.dropOffRate < minDropOffRate && step.dropOffCount < minDropOffCount) {
      continue;
    }

    console.log(`[FrictionAnalysis] Found friction at step ${i}: ${step.name} (${step.dropOffRate}% drop-off)`);

    // Calculate severity
    const severity = calculateSeverity(step.dropOffRate, step.dropOffCount);

    // Generate insights
    const insights = await generateFrictionInsights(step, funnel.name, posthogClient);

    // Fetch session recordings if enabled
    let recordings: SessionRecordingSummary[] = [];
    if (fetchRecordings && step.droppedPeopleUrl) {
      try {
        console.log(`[FrictionAnalysis] Fetching session recordings for dropped users...`);
        // This would require additional PostHog API calls
        // For now, we'll store the URL for manual investigation
        recordings = [{
          recordingId: 'pending',
          userId: 'multiple',
          timestamp: new Date().toISOString(),
        }];
      } catch (error) {
        console.error('[FrictionAnalysis] Failed to fetch recordings:', error);
      }
    }

    // Store or update friction point in database
    await prisma.frictionPoint.upsert({
      where: {
        projectId_funnelId_stepId: {
          projectId,
          funnelId: funnel.id,
          stepId: step.id,
        },
      },
      update: {
        funnelName: funnel.name,
        stepName: step.name,
        stepOrder: step.order,
        dropOffRate: step.dropOffRate,
        dropOffCount: step.dropOffCount,
        avgTimeToConvert: step.avgTimeToConvert,
        severity,
        insights: JSON.stringify(insights),
        sessionRecordings: recordings.length > 0 ? JSON.stringify(recordings) : null,
        updatedAt: new Date(),
      },
      create: {
        projectId,
        funnelId: funnel.id,
        funnelName: funnel.name,
        stepId: step.id,
        stepName: step.name,
        stepOrder: step.order,
        dropOffRate: step.dropOffRate,
        dropOffCount: step.dropOffCount,
        avgTimeToConvert: step.avgTimeToConvert,
        severity,
        insights: JSON.stringify(insights),
        sessionRecordings: recordings.length > 0 ? JSON.stringify(recordings) : null,
        status: 'active',
      },
    });

    console.log(`[FrictionAnalysis] Friction point saved: ${step.name} (${severity})`);
  }
}

/**
 * Get all friction points for a project with filtering options
 */
export async function getFrictionPoints(
  projectId: string,
  options: {
    funnelId?: string;
    severity?: SeverityLevel;
    status?: string;
    limit?: number;
  } = {}
) {
  const where: any = { projectId };

  if (options.funnelId) {
    where.funnelId = options.funnelId;
  }

  if (options.severity) {
    where.severity = options.severity;
  }

  if (options.status) {
    where.status = options.status;
  }

  const frictionPoints = await prisma.frictionPoint.findMany({
    where,
    orderBy: [
      { severity: 'asc' }, // critical first (alphabetically)
      { dropOffRate: 'desc' },
    ],
    take: options.limit,
  });

  return frictionPoints.map(fp => ({
    ...fp,
    insights: fp.insights ? JSON.parse(fp.insights) : null,
    sessionRecordings: fp.sessionRecordings ? JSON.parse(fp.sessionRecordings) : null,
  }));
}

/**
 * Update friction point status (e.g., mark as resolved)
 */
export async function updateFrictionPointStatus(
  frictionPointId: string,
  status: 'active' | 'resolved' | 'investigating'
) {
  return await prisma.frictionPoint.update({
    where: { id: frictionPointId },
    data: { status, updatedAt: new Date() },
  });
}

/**
 * Get friction point summary statistics
 */
export async function getFrictionSummary(projectId: string) {
  const [total, critical, high, medium, low, resolved] = await Promise.all([
    prisma.frictionPoint.count({ where: { projectId } }),
    prisma.frictionPoint.count({ where: { projectId, severity: 'critical', status: 'active' } }),
    prisma.frictionPoint.count({ where: { projectId, severity: 'high', status: 'active' } }),
    prisma.frictionPoint.count({ where: { projectId, severity: 'medium', status: 'active' } }),
    prisma.frictionPoint.count({ where: { projectId, severity: 'low', status: 'active' } }),
    prisma.frictionPoint.count({ where: { projectId, status: 'resolved' } }),
  ]);

  const totalDroppedUsers = await prisma.frictionPoint.aggregate({
    where: { projectId, status: 'active' },
    _sum: { dropOffCount: true },
  });

  return {
    total,
    bySeverity: {
      critical,
      high,
      medium,
      low,
    },
    resolved,
    active: total - resolved,
    totalDroppedUsers: totalDroppedUsers._sum.dropOffCount || 0,
  };
}
