import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

// Resend client will be initialized lazily when needed
let resend: Resend | null = null;

function getResendClient(): Resend {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// GET - Get email stats for a project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const messageId = searchParams.get('messageId');

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Get individual message details
    if (messageId) {
      try {
        const emailDetails = await getResendClient().emails.get(messageId);
        return NextResponse.json({ message: emailDetails.data });
      } catch (err) {
        console.error('Failed to get message details:', err);
        return NextResponse.json(
          { error: 'Failed to get message details' },
          { status: 500 }
        );
      }
    }

    // Get aggregate stats for a project
    if (projectId) {
      // Get all invited users for this project (both with and without messageIds)
      const allInvitedUsers = await prisma.uploadedUser.findMany({
        where: {
          projectId,
          inviteStatus: 'invited',
        },
        select: {
          id: true,
          email: true,
          name: true,
          cohort: true,
          messageId: true,
          invitedAt: true,
          inviteStatus: true,
        },
        orderBy: { invitedAt: 'desc' },
      });

      // Filter to only those with messageIds for detailed tracking
      const usersWithMessages = allInvitedUsers.filter(u => u.messageId);

      // Build message details list
      const messageDetails: Array<{
        userId: string;
        email: string;
        name: string | null;
        cohort: string | null;
        messageId: string;
        invitedAt: Date | null;
        status: string;
        opened: boolean;
        openCount: number;
        clicked: boolean;
        clickCount: number;
        bounced: boolean;
        events: Array<{ type: string; timestamp: string; details?: string }>;
      }> = [];

      // Only fetch details for the most recent 50 messages to avoid rate limits
      const recentMessages = usersWithMessages.slice(0, 50);

      for (const user of recentMessages) {
        if (!user.messageId) continue;

        try {
          const emailResult = await getResendClient().emails.get(user.messageId);
          const emailData = emailResult.data;

          // Resend provides last_event which indicates the last status
          // Note: Detailed open/click tracking requires webhooks in Resend
          const lastEvent = emailData?.last_event || 'sent';
          const bounced = lastEvent === 'bounced';

          messageDetails.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            cohort: user.cohort,
            messageId: user.messageId,
            invitedAt: user.invitedAt,
            status: lastEvent,
            opened: lastEvent === 'opened' || lastEvent === 'clicked',
            openCount: lastEvent === 'opened' || lastEvent === 'clicked' ? 1 : 0,
            clicked: lastEvent === 'clicked',
            clickCount: lastEvent === 'clicked' ? 1 : 0,
            bounced,
            events: emailData?.created_at ? [{ type: 'sent', timestamp: emailData.created_at }] : [],
          });
        } catch (err) {
          // Message might be too old or not found
          messageDetails.push({
            userId: user.id,
            email: user.email,
            name: user.name,
            cohort: user.cohort,
            messageId: user.messageId,
            invitedAt: user.invitedAt,
            status: 'unknown',
            opened: false,
            openCount: 0,
            clicked: false,
            clickCount: 0,
            bounced: false,
            events: [],
          });
        }
      }

      // Add users without messageIds to the list (no tracking data available)
      const usersWithoutMessages = allInvitedUsers.filter(u => !u.messageId);
      for (const user of usersWithoutMessages) {
        messageDetails.push({
          userId: user.id,
          email: user.email,
          name: user.name,
          cohort: user.cohort,
          messageId: '',
          invitedAt: user.invitedAt,
          status: 'sent (no tracking)',
          opened: false,
          openCount: 0,
          clicked: false,
          clickCount: 0,
          bounced: false,
          events: [],
        });
      }

      // Sort all messages by invitedAt
      messageDetails.sort((a, b) => {
        if (!a.invitedAt || !b.invitedAt) return 0;
        return new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime();
      });

      // Calculate project-level stats (use all invited users for total)
      const totalSent = allInvitedUsers.length;
      const totalOpened = messageDetails.filter(m => m.opened).length;
      const totalClicked = messageDetails.filter(m => m.clicked).length;
      const totalBounced = messageDetails.filter(m => m.bounced).length;
      const tracked = usersWithMessages.length;

      return NextResponse.json({
        stats: {
          totalSent,
          totalOpened,
          totalClicked,
          totalBounced,
          tracked,
          openRate: tracked > 0 ? ((totalOpened / tracked) * 100).toFixed(1) : '0',
          clickRate: tracked > 0 ? ((totalClicked / tracked) * 100).toFixed(1) : '0',
          bounceRate: tracked > 0 ? ((totalBounced / tracked) * 100).toFixed(1) : '0',
        },
        serverStats: null, // Resend doesn't have server-level stats API like Postmark
        messages: messageDetails,
        totalMessages: usersWithMessages.length,
      });
    }

    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  } catch (error) {
    console.error('Failed to get email stats:', error);
    return NextResponse.json({ error: 'Failed to get email stats' }, { status: 500 });
  }
}

// POST - Refresh stats for specific messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageIds } = body;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ error: 'Message IDs required' }, { status: 400 });
    }

    const results = await Promise.all(
      messageIds.map(async (messageId: string) => {
        try {
          const emailResult = await getResendClient().emails.get(messageId);
          return { messageId, success: true, details: emailResult.data };
        } catch (err) {
          return { messageId, success: false, error: 'Failed to fetch' };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Failed to refresh stats:', error);
    return NextResponse.json({ error: 'Failed to refresh stats' }, { status: 500 });
  }
}
