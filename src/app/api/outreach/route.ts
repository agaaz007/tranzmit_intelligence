import { NextRequest, NextResponse } from 'next/server';
import { createPostHogClient, ClassifiedUser, ContextualOutreach } from '@/lib/posthog';
import { prisma } from '@/lib/prisma';

// POST: Generate outreach for users
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, users, funnelName, dropoffStepName } = body as {
      projectId: string;
      users: ClassifiedUser[];
      funnelName: string;
      dropoffStepName: string;
    };

    if (!projectId || !users || users.length === 0) {
      return NextResponse.json(
        { error: 'projectId and users array are required' },
        { status: 400 }
      );
    }

    // Get project PostHog config
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

    // Generate outreach for each user
    const outreachMessages: ContextualOutreach[] = users.map(user =>
      posthog.generateContextualOutreach(
        user,
        funnelName || 'onboarding',
        dropoffStepName || 'the next step'
      )
    );

    // Group by cohort type for summary
    const summary = {
      total: outreachMessages.length,
      byCohort: {
        technical_victim: outreachMessages.filter(o => o.cohortType === 'technical_victim').length,
        confused_browser: outreachMessages.filter(o => o.cohortType === 'confused_browser').length,
        wrong_fit: outreachMessages.filter(o => o.cohortType === 'wrong_fit').length,
        high_value: outreachMessages.filter(o => o.cohortType === 'high_value').length,
      },
    };

    return NextResponse.json({
      outreach: outreachMessages,
      summary,
    });
  } catch (error) {
    console.error('Failed to generate outreach:', error);
    return NextResponse.json({ error: 'Failed to generate outreach' }, { status: 500 });
  }
}

// GET: Generate outreach for a specific user
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get('projectId');
  const userId = searchParams.get('userId');
  const cohortType = searchParams.get('cohortType') as ClassifiedUser['cohortType'];
  const funnelName = searchParams.get('funnelName') || 'onboarding';
  const dropoffStepName = searchParams.get('dropoffStepName') || 'the next step';

  if (!projectId || !userId) {
    return NextResponse.json(
      { error: 'projectId and userId are required' },
      { status: 400 }
    );
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

    // Get session context for this user
    const sessionContext = await posthog.getSessionContext(userId);

    // Create a minimal classified user for outreach generation
    const classifiedUser: ClassifiedUser = {
      distinctId: userId,
      properties: {},
      signals: [],
      priorityScore: 0,
      signalSummary: '',
      cohortType: cohortType || 'high_value',
      cohortReason: '',
      correlationSignals: [],
      recommendedAction: cohortType === 'technical_victim' ? 'bug_report' :
                        cohortType === 'wrong_fit' ? 'ignore' : 'interview',
    };

    // Try to get person details
    const person = await posthog.getPerson(userId);
    if (person) {
      classifiedUser.email = person.properties?.email;
      classifiedUser.name = person.properties?.name;
      classifiedUser.properties = person.properties;
    }

    const outreach = posthog.generateContextualOutreach(
      classifiedUser,
      funnelName,
      dropoffStepName
    );

    return NextResponse.json({
      outreach,
      sessionContext: {
        hasErrors: sessionContext.hasErrors,
        hasRageClicks: sessionContext.hasRageClicks,
        sessionCount: sessionContext.totalCount,
        avgDuration: sessionContext.averageDuration,
      },
    });
  } catch (error) {
    console.error('Failed to generate outreach:', error);
    return NextResponse.json({ error: 'Failed to generate outreach' }, { status: 500 });
  }
}
