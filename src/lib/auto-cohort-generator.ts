import { prisma } from '@/lib/prisma';
import { createPostHogClient, PersonWithSignals, BehavioralSignal } from '@/lib/posthog';
import { generateHypothesesFromSignals, storeHypotheses } from '@/lib/hypothesis-generator';

// Extended cohort pattern types
export type CohortPatternType = 
  | 'churn_risk' 
  | 'low_engagement' 
  | 'error_prone' 
  | 'high_friction' 
  | 'power_users_at_risk'
  // New pattern types leveraging Persons API
  | 'new_users'
  | 'mobile_users'
  | 'international_users'
  | 'paid_traffic'
  | 'organic_traffic'
  | 'power_users'
  | 'returning_visitors'
  | 'feature_explorers';

export interface AutoCohortPattern {
  type: CohortPatternType;
  name: string;
  description: string;
  minUsers: number;
  category: 'behavioral' | 'demographic' | 'acquisition' | 'engagement';
  query: () => Promise<PersonWithSignals[]>;
}

export interface GeneratedCohort {
  id: string;
  name: string;
  description: string;
  size: number;
  pattern: string;
  category: string;
  hypothesesCount: number;
  topInsights?: string[];
}

// Cohort statistics for better analysis
export interface CohortStatistics {
  geoDistribution: Record<string, number>;
  deviceDistribution: Record<string, number>;
  acquisitionDistribution: Record<string, number>;
  avgSessionDuration: number;
  avgSignalWeight: number;
}

/**
 * Auto-detect behavioral patterns and create cohorts
 * Enhanced with rich person data from PostHog Persons API
 */
export async function detectAndCreateCohorts(
  projectId: string,
  options: {
    includeAll?: boolean;  // Include all pattern types
    categories?: ('behavioral' | 'demographic' | 'acquisition' | 'engagement')[];
    minUsers?: number;
  } = {}
): Promise<GeneratedCohort[]> {
  // Get project credentials
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  if (!project.posthogKey || !project.posthogProjId) {
    throw new Error('PostHog not configured for this project');
  }

  const posthog = createPostHogClient({
    apiKey: project.posthogKey,
    projectId: project.posthogProjId,
    host: project.posthogHost || 'https://us.posthog.com',
  });

  const generatedCohorts: GeneratedCohort[] = [];

  // Define ALL patterns to detect - behavioral, demographic, acquisition, and engagement
  const allPatterns: AutoCohortPattern[] = [
    // =====================
    // BEHAVIORAL PATTERNS
    // =====================
    {
      type: 'churn_risk',
      name: 'Churn Risk',
      description: 'Users who were previously active but have significantly reduced engagement',
      minUsers: options.minUsers || 5,
      category: 'behavioral',
      query: () => posthog.getUsersAtChurnRisk(50),
    },
    {
      type: 'low_engagement',
      name: 'Low Engagement',
      description: 'Users with minimal activity who may need re-engagement',
      minUsers: options.minUsers || 5,
      category: 'behavioral',
      query: () => posthog.getUsersWithLowEngagement(50),
    },
    {
      type: 'error_prone',
      name: 'Error Encounters',
      description: 'Users who have encountered multiple errors - potential UX issues',
      minUsers: options.minUsers || 3,
      category: 'behavioral',
      query: () => posthog.getUsersWithErrors(50),
    },
    
    // =====================
    // ENGAGEMENT PATTERNS (from Persons API)
    // =====================
    {
      type: 'power_users',
      name: 'Power Users',
      description: 'Highly engaged users with multiple long sessions - potential advocates',
      minUsers: options.minUsers || 3,
      category: 'engagement',
      query: () => posthog.getPowerUsers(50),
    },
    {
      type: 'returning_visitors',
      name: 'Returning Visitors',
      description: 'Users who come back regularly - strong product-market fit signals',
      minUsers: options.minUsers || 3,
      category: 'engagement',
      query: () => posthog.getReturningVisitors(50),
    },
    
    // =====================
    // DEMOGRAPHIC PATTERNS (from Persons API)
    // =====================
    {
      type: 'new_users',
      name: 'New Users (7 days)',
      description: 'Recently signed up users who need onboarding support',
      minUsers: options.minUsers || 3,
      category: 'demographic',
      query: async () => {
        const users = await posthog.getEnrichedUsersForCohorting(100);
        return users.filter(u => u.signals.some(s => s.type === 'new_user'));
      },
    },
    {
      type: 'mobile_users',
      name: 'Mobile Users',
      description: 'Users on mobile devices - may need mobile-optimized experience feedback',
      minUsers: options.minUsers || 3,
      category: 'demographic',
      query: async () => {
        const users = await posthog.getEnrichedUsersForCohorting(100);
        return users.filter(u => u.signals.some(s => s.type === 'mobile_user'));
      },
    },
    {
      type: 'international_users',
      name: 'International Users',
      description: 'Users outside primary market - localization and timezone feedback',
      minUsers: options.minUsers || 3,
      category: 'demographic',
      query: async () => {
        const users = await posthog.getEnrichedUsersForCohorting(100);
        return users.filter(u => u.signals.some(s => s.type === 'international_user'));
      },
    },
    
    // =====================
    // ACQUISITION PATTERNS (from Persons API)
    // =====================
    {
      type: 'paid_traffic',
      name: 'Paid Traffic Users',
      description: 'Users from paid campaigns - ROI optimization insights',
      minUsers: options.minUsers || 3,
      category: 'acquisition',
      query: async () => {
        const users = await posthog.getEnrichedUsersForCohorting(100);
        return users.filter(u => u.signals.some(s => s.type === 'paid_traffic'));
      },
    },
    {
      type: 'organic_traffic',
      name: 'Organic Search Users',
      description: 'Users from organic search - SEO and content strategy feedback',
      minUsers: options.minUsers || 3,
      category: 'acquisition',
      query: async () => {
        const users = await posthog.getEnrichedUsersForCohorting(100);
        return users.filter(u => u.signals.some(s => s.type === 'organic_traffic'));
      },
    },
  ];

  // Filter patterns by category if specified
  const patterns = options.categories 
    ? allPatterns.filter(p => options.categories!.includes(p.category))
    : options.includeAll 
      ? allPatterns 
      : allPatterns.slice(0, 5); // Default: first 5 patterns

  // Process each pattern
  for (const pattern of patterns) {
    try {
      const users = await pattern.query();

      if (users.length < pattern.minUsers) {
        console.log(`[AutoCohort] Skipping ${pattern.type}: only ${users.length} users (min: ${pattern.minUsers})`);
        continue;
      }

      // Check if a similar cohort was created recently (within 7 days)
      const recentCohort = await prisma.cohort.findFirst({
        where: {
          projectId,
          name: { contains: pattern.name },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });

      if (recentCohort) {
        console.log(`[AutoCohort] Skipping ${pattern.type}: recent cohort exists (${recentCohort.name})`);
        continue;
      }

      // Calculate cohort statistics from enriched person data
      const stats = calculateCohortStatistics(users);

      // Create the cohort with enriched metadata
      const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const cohortName = `Auto: ${pattern.name} (${timestamp})`;

      // Generate top insights from the cohort data
      const topInsights = generateCohortInsights(users, pattern, stats);

      const cohort = await prisma.cohort.create({
        data: {
          name: cohortName,
          description: `${pattern.description}. Auto-detected ${users.length} users matching this pattern.`,
          projectId,
          size: users.length,
          criteria: JSON.stringify({
            autoGenerated: true,
            pattern: pattern.type,
            category: pattern.category,
            detectedAt: new Date().toISOString(),
            signalTypes: [...new Set(users.flatMap(u => u.signals.map(s => s.type)))],
            // Rich statistics from Persons API data
            statistics: {
              geoDistribution: stats.geoDistribution,
              deviceDistribution: stats.deviceDistribution,
              acquisitionDistribution: stats.acquisitionDistribution,
              avgSessionDuration: stats.avgSessionDuration,
              avgSignalWeight: stats.avgSignalWeight,
            },
            topInsights,
          }),
        },
      });

      // Store cohort members with enriched profile data
      const memberPromises = users.map(user => {
        // Build metadata object if profile is available
        const memberMetadata = user.profile ? JSON.stringify({
          geo: user.profile.geo,
          device: user.profile.device,
          acquisition: user.profile.acquisition,
          engagement: user.profile.engagement,
          createdAt: user.profile.createdAt,
        }) : null;

        return prisma.cohortMember.create({
          data: {
            cohortId: cohort.id,
            distinctId: user.distinctId,
            email: user.email,
            priorityScore: user.priorityScore,
            signals: JSON.stringify(user.signals),
            signalSummary: user.signalSummary,
            interviewStatus: 'pending',
            // Store enriched profile data in properties field for compatibility
            properties: memberMetadata,
          },
        });
      });

      await Promise.all(memberPromises);

      // Aggregate signals for hypothesis generation
      const aggregatedSignals = aggregateSignals(users);

      // Generate hypotheses for this cohort with richer context
      const hypotheses = generateHypothesesFromSignals(aggregatedSignals, {
        name: cohortName,
        type: pattern.type,
        size: users.length,
        category: pattern.category,
        statistics: stats,
      });

      const hypothesesCount = await storeHypotheses(cohort.id, hypotheses);

      generatedCohorts.push({
        id: cohort.id,
        name: cohortName,
        description: cohort.description || '',
        size: users.length,
        pattern: pattern.type,
        category: pattern.category,
        hypothesesCount,
        topInsights,
      });

      console.log(`[AutoCohort] Created "${cohortName}" with ${users.length} users and ${hypothesesCount} hypotheses`);
    } catch (error) {
      console.error(`[AutoCohort] Failed to process pattern ${pattern.type}:`, error);
    }
  }

  return generatedCohorts;
}

/**
 * Calculate statistics from enriched user profiles
 */
function calculateCohortStatistics(users: PersonWithSignals[]): CohortStatistics {
  const geoDistribution: Record<string, number> = {};
  const deviceDistribution: Record<string, number> = {};
  const acquisitionDistribution: Record<string, number> = {};
  let totalSessionDuration = 0;
  let sessionCount = 0;
  let totalWeight = 0;

  for (const user of users) {
    // Geo distribution
    const country = user.profile?.geo?.country || user.properties?.$geoip_country_name || 'Unknown';
    geoDistribution[country] = (geoDistribution[country] || 0) + 1;

    // Device distribution
    const device = user.profile?.device?.deviceType || 
      (user.properties?.$os?.toLowerCase().includes('android') || 
       user.properties?.$os?.toLowerCase().includes('ios') ? 'mobile' : 'desktop');
    deviceDistribution[device] = (deviceDistribution[device] || 0) + 1;

    // Acquisition distribution
    const source = user.profile?.acquisition?.initialUtmSource || 
      user.profile?.acquisition?.initialReferringDomain || 
      user.properties?.$initial_utm_source ||
      'direct';
    acquisitionDistribution[source] = (acquisitionDistribution[source] || 0) + 1;

    // Session duration from engagement data
    if (user.profile?.engagement?.avgSessionDuration) {
      totalSessionDuration += user.profile.engagement.avgSessionDuration;
      sessionCount++;
    }

    // Signal weights
    totalWeight += user.priorityScore;
  }

  return {
    geoDistribution,
    deviceDistribution,
    acquisitionDistribution,
    avgSessionDuration: sessionCount > 0 ? totalSessionDuration / sessionCount : 0,
    avgSignalWeight: users.length > 0 ? totalWeight / users.length : 0,
  };
}

/**
 * Generate natural language insights from cohort data
 */
function generateCohortInsights(
  users: PersonWithSignals[], 
  pattern: AutoCohortPattern,
  stats: CohortStatistics
): string[] {
  const insights: string[] = [];

  // Top country insight
  const topCountries = Object.entries(stats.geoDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  if (topCountries.length > 0 && topCountries[0][1] > users.length * 0.3) {
    insights.push(`${Math.round(topCountries[0][1] / users.length * 100)}% of users are from ${topCountries[0][0]}`);
  }

  // Device insight
  const mobileCount = stats.deviceDistribution['mobile'] || 0;
  const mobilePercent = Math.round(mobileCount / users.length * 100);
  if (mobilePercent > 30) {
    insights.push(`${mobilePercent}% are mobile users - consider mobile-first optimizations`);
  }

  // Acquisition insight
  const topSources = Object.entries(stats.acquisitionDistribution)
    .filter(([source]) => source !== 'direct' && source !== 'Unknown')
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2);
  if (topSources.length > 0) {
    insights.push(`Top traffic sources: ${topSources.map(([s, c]) => `${s} (${c})`).join(', ')}`);
  }

  // Pattern-specific insights
  switch (pattern.type) {
    case 'churn_risk':
      insights.push('These users showed declining engagement - early intervention recommended');
      break;
    case 'power_users':
      insights.push('Power users are ideal for testimonials, referrals, and beta testing');
      break;
    case 'new_users':
      insights.push('Focus on onboarding experience and first-value-moment optimization');
      break;
    case 'paid_traffic':
      insights.push('Monitor CAC/LTV ratio - these users represent direct marketing ROI');
      break;
    case 'error_prone':
      insights.push('Prioritize bug fixes affecting these users to prevent churn');
      break;
    case 'returning_visitors':
      insights.push('High retention signal - understand what keeps them coming back');
      break;
  }

  // Signal diversity insight
  const signalTypes = [...new Set(users.flatMap(u => u.signals.map(s => s.type)))];
  if (signalTypes.length > 2) {
    insights.push(`Users show ${signalTypes.length} different behavioral signals`);
  }

  return insights.slice(0, 5); // Return top 5 insights
}

/**
 * Aggregate signals across all users to find common patterns
 */
function aggregateSignals(users: PersonWithSignals[]): BehavioralSignal[] {
  const signalCounts: Record<string, { signal: BehavioralSignal; count: number }> = {};

  for (const user of users) {
    for (const signal of user.signals) {
      const key = signal.type;
      if (!signalCounts[key]) {
        signalCounts[key] = { signal, count: 0 };
      }
      signalCounts[key].count++;
      // Boost weight based on frequency
      signalCounts[key].signal.weight = Math.max(
        signalCounts[key].signal.weight,
        signal.weight
      );
    }
  }

  // Sort by count and return top signals
  return Object.values(signalCounts)
    .sort((a, b) => b.count - a.count)
    .map(({ signal, count }) => ({
      ...signal,
      description: `${signal.description} (${count} users)`,
    }));
}

// Return type for auto-generated cohorts
export interface AutoCohortResult {
  id: string;
  name: string;
  description: string | null;
  size: number;
  memberCount: number;
  hypothesesCount: number;
  criteria: {
    autoGenerated: boolean;
    pattern: CohortPatternType;
    category?: string;
    detectedAt: string;
    signalTypes: string[];
    statistics?: CohortStatistics;
    topInsights?: string[];
  } | null;
  createdAt: Date;
}

/**
 * Get auto-generated cohorts for a project
 */
export async function getAutoCohorts(projectId: string): Promise<AutoCohortResult[]> {
  const cohorts = await prisma.cohort.findMany({
    where: {
      projectId,
      criteria: { contains: '"autoGenerated":true' },
    },
    include: {
      _count: {
        select: {
          members: true,
          hypotheses: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return cohorts.map(cohort => ({
    id: cohort.id,
    name: cohort.name,
    description: cohort.description,
    size: cohort.size,
    memberCount: cohort._count.members,
    hypothesesCount: cohort._count.hypotheses,
    criteria: cohort.criteria ? JSON.parse(cohort.criteria) : null,
    createdAt: cohort.createdAt,
  }));
}

/**
 * Refresh an auto-generated cohort with latest data
 */
export async function refreshAutoCohort(cohortId: string): Promise<{
  added: number;
  removed: number;
  total: number;
}> {
  const cohort = await prisma.cohort.findUnique({
    where: { id: cohortId },
    include: { project: true, members: true },
  });

  if (!cohort || !cohort.project) {
    throw new Error('Cohort not found');
  }

  const criteria = cohort.criteria ? JSON.parse(cohort.criteria) : null;
  if (!criteria?.autoGenerated || !criteria?.pattern) {
    throw new Error('Not an auto-generated cohort');
  }

  if (!cohort.project.posthogKey || !cohort.project.posthogProjId) {
    throw new Error('PostHog not configured for this project');
  }

  const posthog = createPostHogClient({
    apiKey: cohort.project.posthogKey,
    projectId: cohort.project.posthogProjId,
    host: cohort.project.posthogHost || 'https://us.posthog.com',
  });

  // Query for latest users based on pattern
  let users: PersonWithSignals[] = [];
  switch (criteria.pattern) {
    case 'churn_risk':
      users = await posthog.getUsersAtChurnRisk(100);
      break;
    case 'low_engagement':
      users = await posthog.getUsersWithLowEngagement(100);
      break;
    case 'error_prone':
      users = await posthog.getUsersWithErrors(100);
      break;
    default:
      throw new Error(`Unknown pattern: ${criteria.pattern}`);
  }

  const existingIds = new Set(cohort.members.map(m => m.distinctId));
  const newIds = new Set(users.map(u => u.distinctId));

  // Find users to add
  const toAdd = users.filter(u => !existingIds.has(u.distinctId));

  // Find users to remove (no longer matching pattern)
  const toRemove = cohort.members.filter(m => !newIds.has(m.distinctId));

  // Add new members
  if (toAdd.length > 0) {
    await prisma.cohortMember.createMany({
      data: toAdd.map(user => ({
        cohortId,
        distinctId: user.distinctId,
        email: user.email,
        priorityScore: user.priorityScore,
        signals: JSON.stringify(user.signals),
        interviewStatus: 'pending',
      })),
    });
  }

  // Remove outdated members
  if (toRemove.length > 0) {
    await prisma.cohortMember.deleteMany({
      where: {
        cohortId,
        distinctId: { in: toRemove.map(m => m.distinctId) },
      },
    });
  }

  // Update cohort size
  await prisma.cohort.update({
    where: { id: cohortId },
    data: {
      size: users.length,
      criteria: JSON.stringify({
        ...criteria,
        lastRefreshed: new Date().toISOString(),
      }),
    },
  });

  return {
    added: toAdd.length,
    removed: toRemove.length,
    total: users.length,
  };
}
