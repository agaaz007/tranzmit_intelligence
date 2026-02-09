import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPostHogClient, type PostHogConfig } from '@/lib/posthog';
import { getProjectWithAccess } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    // Verify user has access to this project
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = projectAccess.project;

    // Parallel fetch from database
    const [
      cohortsData,
      interviewsData,
      frictionData,
      hypothesesData,
      recentInsightsData,
      upcomingInterviewsData,
    ] = await Promise.all([
      // Cohorts count
      prisma.cohort.count({ where: { projectId } }),
      
      // Interviews stats
      prisma.interview.groupBy({
        by: ['status'],
        where: { projectId },
        _count: true,
      }),
      
      // Friction points (active)
      prisma.frictionPoint.count({
        where: { projectId, status: { not: 'resolved' } },
      }),
      
      // Hypotheses count (through cohorts)
      prisma.hypothesis.count({ 
        where: { 
          cohort: { projectId } 
        } 
      }),
      
      // Recent insights from completed interviews
      prisma.interviewInsight.findMany({
        where: {
          interview: { projectId },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          interview: {
            include: {
              cohort: true,
            },
          },
        },
      }),
      
      // Upcoming interviews
      prisma.interview.findMany({
        where: {
          projectId,
          status: { in: ['scheduled', 'pending'] },
          scheduledAt: { gte: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: {
          cohort: true,
        },
      }),
    ]);

    // Calculate interview stats
    type InterviewGroup = { status: string; _count: number };
    const interviewStats = {
      total: interviewsData.reduce((sum: number, item: InterviewGroup) => sum + item._count, 0),
      completed: (interviewsData.find((i: InterviewGroup) => i.status === 'completed') as InterviewGroup | undefined)?._count || 0,
      scheduled: (interviewsData.find((i: InterviewGroup) => i.status === 'scheduled') as InterviewGroup | undefined)?._count || 0,
      inProgress: (interviewsData.find((i: InterviewGroup) => i.status === 'in_progress') as InterviewGroup | undefined)?._count || 0,
    };

    // Get funnel count from PostHog if credentials available
    let funnelCount = 0;
    let sessionStats = { total: 0, withErrors: 0, highActivity: 0 };

    if (project.posthogKey && project.posthogProjId) {
      try {
        const config: PostHogConfig = {
          apiKey: project.posthogKey,
          projectId: project.posthogProjId,
          host: project.posthogHost || undefined,
        };
        const client = createPostHogClient(config);

        // Get funnels
        const insights = await client.getInsights();
        funnelCount = insights.length;

        // Get session stats
        const [errorSessions, highActivitySessions] = await Promise.all([
          client.getSessionsWithErrors(50),
          client.getHighActivitySessions(50),
        ]);

        sessionStats = {
          total: errorSessions.length + highActivitySessions.length,
          withErrors: errorSessions.length,
          highActivity: highActivitySessions.length,
        };
      } catch (e) {
        console.error('Failed to fetch PostHog stats:', e);
      }
    }

    // Calculate week-over-week changes (simplified - comparing last 7 days to previous 7 days)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [recentInterviews, previousInterviews] = await Promise.all([
      prisma.interview.count({
        where: {
          projectId,
          status: 'completed',
          completedAt: { gte: oneWeekAgo },
        },
      }),
      prisma.interview.count({
        where: {
          projectId,
          status: 'completed',
          completedAt: { gte: twoWeeksAgo, lt: oneWeekAgo },
        },
      }),
    ]);

    const interviewChange = recentInterviews - previousInterviews;

    // Format recent insights
    interface InsightWithInterview {
      id: string;
      summary: string | null;
      sentiment: string | null;
      satisfaction: number | null;
      createdAt: Date;
      interview: {
        cohort: { name: string } | null;
      };
    }
    const formattedInsights = recentInsightsData.map((insight: InsightWithInterview) => {
      return {
        id: insight.id,
        funnel: insight.interview.cohort?.name || 'General Feedback',
        insight: insight.summary || 'Interview completed',
        sentiment: insight.sentiment || 'neutral',
        severity: insight.sentiment === 'negative' ? 'high' : insight.sentiment === 'mixed' ? 'medium' : 'low',
        satisfaction: insight.satisfaction,
        time: formatTimeAgo(insight.createdAt),
      };
    });

    // Format upcoming interviews
    interface UpcomingInterview {
      id: string;
      userEmail: string | null;
      userName: string | null;
      userId: string;
      cohort: { name: string } | null;
      scheduledAt: Date | null;
      status: string;
    }
    const formattedUpcoming = upcomingInterviewsData.map((interview: UpcomingInterview) => ({
      id: interview.id,
      user: interview.userEmail || interview.userName || interview.userId,
      cohort: interview.cohort?.name || 'No cohort',
      time: formatScheduledTime(interview.scheduledAt),
      status: interview.status,
    }));

    return NextResponse.json({
      stats: {
        funnels: {
          value: funnelCount,
          change: null, // Would need historical data to calculate
          positive: true,
        },
        interviews: {
          value: interviewStats.completed,
          change: interviewChange !== 0 ? `${interviewChange > 0 ? '+' : ''}${interviewChange} this week` : null,
          positive: interviewChange >= 0,
        },
        frictionPoints: {
          value: frictionData,
          change: null,
          positive: frictionData === 0, // Less friction is better
        },
        hypotheses: {
          value: hypothesesData,
          change: null,
          positive: true,
        },
        cohorts: {
          value: cohortsData,
          change: null,
          positive: true,
        },
        sessions: sessionStats,
      },
      recentInsights: formattedInsights,
      upcomingInterviews: formattedUpcoming,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

function formatScheduledTime(date: Date | null): string {
  if (!date) return 'Not scheduled';
  
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 0) return 'Overdue';
  if (diffMins < 60) return `In ${diffMins} mins`;
  if (diffMins < 1440) return `In ${Math.floor(diffMins / 60)} hours`;
  if (diffMins < 10080) return `In ${Math.floor(diffMins / 1440)} days`;
  return date.toLocaleDateString();
}
