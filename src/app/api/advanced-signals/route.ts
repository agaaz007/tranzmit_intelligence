import { NextRequest, NextResponse } from 'next/server';
import { createPostHogClient, PersonWithSignals } from '@/lib/posthog';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/advanced-signals - Get all advanced friction signals
 * 
 * This is the MASTER endpoint for all the new signal detection:
 * - Step retries & loops
 * - Feature abandonment & regression
 * - Engagement decay
 * - Power user churning
 * - Navigation patterns
 * - Idle time detection
 * 
 * Query params:
 * - projectId: (required) Project ID
 * - signalType: (optional) Filter by signal type
 * - funnelEvents: (optional) Comma-separated funnel event names
 * - featureEvents: (optional) Comma-separated feature event names
 * - activationEvents: (optional) Comma-separated activation event names
 * - targetEvents: (optional) Comma-separated events to monitor for idle time
 * - limit: (optional) Max users to return (default: 50)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');
  const signalType = searchParams.get('signalType');
  const funnelEventsParam = searchParams.get('funnelEvents');
  const featureEventsParam = searchParams.get('featureEvents');
  const activationEventsParam = searchParams.get('activationEvents');
  const targetEventsParam = searchParams.get('targetEvents');
  const limit = parseInt(searchParams.get('limit') || '50');

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project?.posthogKey || !project?.posthogProjId) {
      return NextResponse.json({ error: 'PostHog not configured' }, { status: 400 });
    }

    const posthog = createPostHogClient({
      apiKey: project.posthogKey,
      projectId: project.posthogProjId,
      host: project.posthogHost || 'https://us.posthog.com',
    });

    // Parse event arrays
    const funnelEvents = funnelEventsParam?.split(',').filter(Boolean) || [];
    const featureEvents = featureEventsParam?.split(',').filter(Boolean) || [];
    const activationEvents = activationEventsParam?.split(',').filter(Boolean) || [];
    const targetEvents = targetEventsParam?.split(',').filter(Boolean) || [];

    let users: PersonWithSignals[] = [];
    const signalBreakdown: Record<string, number> = {};

    // If a specific signal type is requested, fetch only that
    if (signalType) {
      switch (signalType) {
        case 'step_friction':
          users = await posthog.getUsersWithStepFriction({ funnelEvents, limit });
          break;
        case 'step_retry':
          users = await posthog.detectStepRetries({ limit });
          break;
        case 'step_loop':
          users = await posthog.detectStepLoops({ limit });
          break;
        case 'time_variance':
          if (funnelEvents.length >= 2) {
            users = await posthog.detectHighTimeVariance({ funnelEvents, limit });
          }
          break;
        case 'feature_abandoned':
          if (featureEvents.length > 0) {
            users = await posthog.getUsersWithFeatureAbandonment({ featureEvents, limit });
          }
          break;
        case 'feature_regression':
          if (featureEvents.length > 0) {
            users = await posthog.detectFeatureRegression({ featureEvents, limit });
          }
          break;
        case 'engagement_decay':
          users = await posthog.getUsersWithEngagementDecay({ limit });
          break;
        case 'power_user_churning':
          users = await posthog.detectPowerUserChurning({ limit });
          break;
        case 'activated_abandoned':
          if (activationEvents.length > 0) {
            users = await posthog.detectActivatedAbandoned({ activationEvents, limit });
          }
          break;
        case 'behavioral_transitions':
          users = await posthog.getUsersWithBehavioralTransitions({ activationEvents, limit });
          break;
        case 'excessive_navigation':
          users = await posthog.detectExcessiveNavigation({ limit });
          break;
        case 'idle_after_action':
          if (targetEvents.length > 0) {
            users = await posthog.detectIdleAfterAction({ targetEvents, limit });
          }
          break;
        case 'high_intent_friction':
          users = await posthog.getHighIntentFrictionSignals({ targetEvents, limit });
          break;
        default:
          // Get ALL signals
          users = await posthog.getAllAdvancedFrictionSignals({
            funnelEvents,
            featureEvents,
            activationEvents,
            targetEvents,
            limit,
          });
      }
    } else {
      // Get ALL advanced friction signals
      users = await posthog.getAllAdvancedFrictionSignals({
        funnelEvents,
        featureEvents,
        activationEvents,
        targetEvents,
        limit,
      });
    }

    // Calculate signal breakdown
    for (const user of users) {
      for (const signal of user.signals) {
        signalBreakdown[signal.type] = (signalBreakdown[signal.type] || 0) + 1;
      }
    }

    // Calculate stats
    const stats = {
      totalUsers: users.length,
      totalSignals: users.reduce((sum, u) => sum + u.signals.length, 0),
      avgPriorityScore: users.length > 0 
        ? Math.round(users.reduce((sum, u) => sum + u.priorityScore, 0) / users.length)
        : 0,
      signalBreakdown,
      topSignalTypes: Object.entries(signalBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([type, count]) => ({ type, count })),
    };

    // Categorize users by signal severity
    const categories = {
      critical: users.filter(u => u.priorityScore >= 50),
      high: users.filter(u => u.priorityScore >= 35 && u.priorityScore < 50),
      medium: users.filter(u => u.priorityScore >= 20 && u.priorityScore < 35),
      low: users.filter(u => u.priorityScore < 20),
    };

    return NextResponse.json({
      users,
      stats,
      categories: {
        critical: categories.critical.length,
        high: categories.high.length,
        medium: categories.medium.length,
        low: categories.low.length,
      },
      posthogHost: project.posthogHost || 'https://us.posthog.com',
      posthogProjectId: project.posthogProjId,
    });
  } catch (error) {
    console.error('[Advanced Signals API] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch advanced signals' }, { status: 500 });
  }
}

/**
 * POST /api/advanced-signals - Analyze specific events for signals
 * Body:
 * - projectId: Project ID
 * - funnelEvents: Array of funnel event names
 * - featureEvents: Array of feature event names
 * - activationEvents: Array of activation event names
 * - targetEvents: Array of events to monitor for idle time
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, funnelEvents = [], featureEvents = [], activationEvents = [], targetEvents = [], limit = 50 } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project?.posthogKey || !project?.posthogProjId) {
      return NextResponse.json({ error: 'PostHog not configured' }, { status: 400 });
    }

    const posthog = createPostHogClient({
      apiKey: project.posthogKey,
      projectId: project.posthogProjId,
      host: project.posthogHost || 'https://us.posthog.com',
    });

    // Run all signal detection in parallel
    const [
      stepFrictionUsers,
      featureUsers,
      behavioralUsers,
      highIntentUsers
    ] = await Promise.all([
      funnelEvents.length > 0 
        ? posthog.getUsersWithStepFriction({ funnelEvents, limit: Math.ceil(limit / 4) })
        : Promise.resolve([]),
      featureEvents.length > 0
        ? posthog.getUsersWithFeatureAbandonment({ featureEvents, limit: Math.ceil(limit / 4) })
        : Promise.resolve([]),
      posthog.getUsersWithBehavioralTransitions({ activationEvents, limit: Math.ceil(limit / 4) }),
      posthog.getHighIntentFrictionSignals({ targetEvents, limit: Math.ceil(limit / 4) }),
    ]);

    // Merge all users and dedupe
    const userMap = new Map<string, PersonWithSignals>();

    for (const user of [...stepFrictionUsers, ...featureUsers, ...behavioralUsers, ...highIntentUsers]) {
      const existing = userMap.get(user.distinctId);
      if (existing) {
        for (const signal of user.signals) {
          if (!existing.signals.some(s => s.type === signal.type && s.description === signal.description)) {
            existing.signals.push(signal);
          }
        }
        existing.priorityScore = existing.signals.reduce((sum, s) => sum + s.weight, 0);
        existing.signalSummary = existing.signals.map(s => s.description).join('; ');
      } else {
        userMap.set(user.distinctId, { ...user });
      }
    }

    const users = Array.from(userMap.values())
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);

    // Signal breakdown
    const signalBreakdown: Record<string, number> = {};
    for (const user of users) {
      for (const signal of user.signals) {
        signalBreakdown[signal.type] = (signalBreakdown[signal.type] || 0) + 1;
      }
    }

    // Feature adoption metrics if feature events provided
    let featureMetrics = null;
    if (featureEvents.length > 0) {
      featureMetrics = await posthog.getFeatureAdoptionMetrics({ featureEvents });
    }

    return NextResponse.json({
      users,
      stats: {
        totalUsers: users.length,
        totalSignals: users.reduce((sum, u) => sum + u.signals.length, 0),
        avgPriorityScore: users.length > 0
          ? Math.round(users.reduce((sum, u) => sum + u.priorityScore, 0) / users.length)
          : 0,
        signalBreakdown,
      },
      featureMetrics,
      breakdown: {
        stepFriction: stepFrictionUsers.length,
        featureAbandonment: featureUsers.length,
        behavioralTransitions: behavioralUsers.length,
        highIntentFriction: highIntentUsers.length,
      },
    });
  } catch (error) {
    console.error('[Advanced Signals API] POST Error:', error);
    return NextResponse.json({ error: 'Failed to analyze signals' }, { status: 500 });
  }
}
