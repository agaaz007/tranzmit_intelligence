/**
 * Prioritization Engine
 * Combines behavioral signals to rank users for interview priority
 */

import { prisma } from './prisma';
import { createPostHogClient, PersonWithSignals, BehavioralSignal } from './posthog';

export interface PrioritizedUser {
  distinctId: string;
  email?: string;
  name?: string;
  properties: Record<string, any>;
  signals: BehavioralSignal[];
  priorityScore: number;
  signalSummary: string;
  cohortId?: string;
  cohortName?: string;
}

// Signal weights for different types of behavioral patterns
const SIGNAL_WEIGHTS: Record<BehavioralSignal['type'], number> = {
  // Core behavioral signals
  funnel_dropoff: 30,
  rage_click: 25,
  error_encounter: 20,
  low_engagement: 15,
  high_session_time: 10,
  repeat_visitor: 5,
  churn_risk: 35,
  
  // Cohort-based signal types
  technical_victim: 15,    // Lower - send bug report, not interview
  confused_browser: 40,    // Highest - prime interview candidates
  wrong_fit: 5,            // Lowest - ignore these users
  
  // Enhanced signals from Persons API
  new_user: 20,            // Good for onboarding feedback
  mobile_user: 15,         // Mobile experience feedback
  international_user: 12,  // Localization feedback
  organic_traffic: 10,     // SEO/content feedback
  paid_traffic: 25,        // High value - ROI feedback
  returning_visitor: 18,   // Retention insights
  power_user: 30,          // Advocates, beta testers
  feature_adopter: 20,     // Feature-specific feedback
  upgrade_candidate: 22,   // Conversion optimization
  
  // =============================================
  // ADVANCED FRICTION SIGNALS - HIGH INTERVIEW VALUE
  // =============================================
  
  // Step-level friction (WHERE users fail)
  step_retry: 40,           // User struggling with specific action
  step_loop: 45,            // User stuck going back and forth - highest friction signal
  high_time_variance: 35,   // User taking abnormally long
  
  // Feature-level signals (WHAT is broken)
  feature_abandoned: 38,    // Tried once, never again - clear value gap
  feature_regression: 42,   // Was using, now stopped - something changed
  
  // Behavioral transitions (WHO is at risk)
  engagement_decay: 40,     // Activity dropping significantly
  power_user_churning: 55,  // Power user going silent - URGENT
  activated_abandoned: 45,  // Did onboarding but left - onboarding gap
  
  // High-intent micro-signals (WHEN to intervene)
  excessive_navigation: 35, // Lost in navigation
  idle_after_action: 32,    // Got stuck after doing something
};

// Recency multiplier - more recent signals are weighted higher
function getRecencyMultiplier(daysAgo: number): number {
  if (daysAgo <= 1) return 1.5;
  if (daysAgo <= 3) return 1.3;
  if (daysAgo <= 7) return 1.1;
  if (daysAgo <= 14) return 1.0;
  if (daysAgo <= 30) return 0.8;
  return 0.5;
}

// Calculate priority score from signals
export function calculatePriorityScore(signals: BehavioralSignal[]): number {
  if (signals.length === 0) return 0;

  let totalScore = 0;

  for (const signal of signals) {
    const baseWeight = signal.weight || SIGNAL_WEIGHTS[signal.type] || 10;
    const recencyMultiplier = signal.metadata?.daysAgo
      ? getRecencyMultiplier(signal.metadata.daysAgo)
      : 1.0;

    totalScore += baseWeight * recencyMultiplier;
  }

  // Bonus for multiple distinct signal types (user showing multiple friction signals)
  const uniqueTypes = new Set(signals.map(s => s.type)).size;
  if (uniqueTypes >= 3) totalScore *= 1.3;
  else if (uniqueTypes >= 2) totalScore *= 1.15;

  // Cap at 100
  return Math.min(100, Math.round(totalScore));
}

// Generate human-readable summary of signals
export function generateSignalSummary(signals: BehavioralSignal[]): string {
  if (signals.length === 0) return 'No signals detected';
  if (signals.length === 1) return signals[0].description;

  const summaries = signals.slice(0, 3).map(s => s.description);
  const remaining = signals.length - 3;

  if (remaining > 0) {
    return `${summaries.join('; ')} (+${remaining} more)`;
  }
  return summaries.join('; ');
}

// Merge signals for the same user from different sources
export function mergeUserSignals(users: PersonWithSignals[]): Map<string, PersonWithSignals> {
  const merged = new Map<string, PersonWithSignals>();

  for (const user of users) {
    const existing = merged.get(user.distinctId);

    if (existing) {
      // Merge signals
      const allSignals = [...existing.signals, ...user.signals];
      // Dedupe by type+description
      const uniqueSignals = allSignals.filter((signal, index, self) =>
        index === self.findIndex(s => s.type === signal.type && s.description === signal.description)
      );

      existing.signals = uniqueSignals;
      existing.priorityScore = calculatePriorityScore(uniqueSignals);
      existing.signalSummary = generateSignalSummary(uniqueSignals);

      // Merge properties (prefer non-null values)
      existing.email = existing.email || user.email;
      existing.name = existing.name || user.name;
      existing.properties = { ...user.properties, ...existing.properties };
    } else {
      merged.set(user.distinctId, { ...user });
    }
  }

  return merged;
}

// Main function to build prioritized interview queue
export async function buildPriorityQueue(
  projectId: string,
  options: {
    limit?: number;
    cohortType?: string;
    minScore?: number;
  } = {}
): Promise<PrioritizedUser[]> {
  const { limit = 50, cohortType, minScore = 10 } = options;

  // Get project with PostHog credentials
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

  const allUsers: PersonWithSignals[] = [];

  // Collect users from different sources based on cohort type or all
  const typesToFetch = cohortType
    ? [cohortType]
    : ['funnel_dropoff', 'churn_risk', 'low_engagement', 'high_errors'];

  for (const type of typesToFetch) {
    try {
      switch (type) {
        case 'funnel_dropoff': {
          // Get all funnels and their drop-off users
          const insights = await posthog.getInsights();
          for (const insight of insights.slice(0, 5)) { // Limit to 5 funnels
            const funnelWithResults = await posthog.getFunnelWithResults(insight.id);
            if (funnelWithResults.result) {
              // Get drop-offs from each step (except last)
              for (let i = 0; i < funnelWithResults.result.length - 1; i++) {
                const step = funnelWithResults.result[i];
                const nextStep = funnelWithResults.result[i + 1];
                // Calculate drop-off rate
                const dropOffRate = step.count > 0
                  ? ((step.count - nextStep.count) / step.count) * 100
                  : 0;
                if (dropOffRate > 10) { // Only significant drop-offs
                  const dropped = await posthog.getDroppedPersonsWithDetails(insight.id, i);
                  allUsers.push(...dropped);
                }
              }
            }
          }
          break;
        }

        case 'churn_risk': {
          const churnUsers = await posthog.getUsersAtChurnRisk(limit);
          allUsers.push(...churnUsers);
          break;
        }

        case 'low_engagement': {
          const lowEngagementUsers = await posthog.getUsersWithLowEngagement(limit);
          allUsers.push(...lowEngagementUsers);
          break;
        }

        case 'high_errors': {
          const errorUsers = await posthog.getUsersWithErrors(limit);
          allUsers.push(...errorUsers);
          break;
        }
      }
    } catch (e) {
      console.error(`Failed to fetch ${type} users:`, e);
    }
  }

  // Merge duplicate users and combine their signals
  const mergedUsers = mergeUserSignals(allUsers);

  // Convert to array and sort by priority
  const prioritizedUsers: PrioritizedUser[] = Array.from(mergedUsers.values())
    .filter(u => u.priorityScore >= minScore)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit);

  return prioritizedUsers;
}

// Store prioritized users as cohort members
export async function storePriorityQueue(
  cohortId: string,
  users: PrioritizedUser[]
): Promise<number> {
  let stored = 0;

  for (const user of users) {
    try {
      await prisma.cohortMember.upsert({
        where: {
          cohortId_distinctId: {
            cohortId,
            distinctId: user.distinctId,
          },
        },
        create: {
          cohortId,
          distinctId: user.distinctId,
          email: user.email,
          name: user.name,
          properties: JSON.stringify(user.properties),
          priorityScore: user.priorityScore,
          signals: JSON.stringify(user.signals),
          signalSummary: user.signalSummary,
          interviewStatus: 'pending',
        },
        update: {
          email: user.email,
          name: user.name,
          properties: JSON.stringify(user.properties),
          priorityScore: user.priorityScore,
          signals: JSON.stringify(user.signals),
          signalSummary: user.signalSummary,
        },
      });
      stored++;
    } catch (e) {
      console.error(`Failed to store member ${user.distinctId}:`, e);
    }
  }

  // Update cohort size
  await prisma.cohort.update({
    where: { id: cohortId },
    data: { size: stored },
  });

  return stored;
}

// Get priority queue for a cohort
export async function getPriorityQueue(
  cohortId: string,
  options: {
    limit?: number;
    status?: string;
    minScore?: number;
  } = {}
): Promise<PrioritizedUser[]> {
  const { limit = 50, status, minScore = 0 } = options;

  const members = await prisma.cohortMember.findMany({
    where: {
      cohortId,
      priorityScore: { gte: minScore },
      ...(status ? { interviewStatus: status } : {}),
    },
    orderBy: { priorityScore: 'desc' },
    take: limit,
  });

  return members.map(m => ({
    distinctId: m.distinctId,
    email: m.email || undefined,
    name: m.name || undefined,
    properties: m.properties ? JSON.parse(m.properties) : {},
    signals: m.signals ? JSON.parse(m.signals) : [],
    priorityScore: m.priorityScore,
    signalSummary: m.signalSummary || '',
    cohortId: m.cohortId,
  }));
}

// Update interview status for a cohort member
export async function updateMemberStatus(
  cohortId: string,
  distinctId: string,
  status: 'pending' | 'scheduled' | 'completed' | 'skipped'
): Promise<void> {
  await prisma.cohortMember.update({
    where: {
      cohortId_distinctId: { cohortId, distinctId },
    },
    data: { interviewStatus: status },
  });
}
