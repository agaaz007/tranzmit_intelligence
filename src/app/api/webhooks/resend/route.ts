import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Resend Webhook Events
// https://resend.com/docs/dashboard/webhooks/event-types
interface ResendWebhookEvent {
  type: 'email.sent' | 'email.delivered' | 'email.opened' | 'email.clicked' | 'email.bounced' | 'email.complained';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    // For click events
    click?: {
      link: string;
      timestamp: string;
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ResendWebhookEvent;

    console.log('[Resend Webhook] Received event:', body.type, body.data.email_id);

    const emailId = body.data.email_id;
    if (!emailId) {
      return NextResponse.json({ error: 'No email_id in webhook' }, { status: 400 });
    }

    // Find the churned user by email message ID
    const user = await prisma.churnedUser.findFirst({
      where: { emailMessageId: emailId },
    });

    if (!user) {
      console.log('[Resend Webhook] No user found for email_id:', emailId);
      return NextResponse.json({ message: 'User not found, ignoring' });
    }

    // Update status based on event type
    let updateData: Record<string, unknown> = {};

    switch (body.type) {
      case 'email.delivered':
        // Email was delivered successfully
        updateData = {
          outreachStatus: 'email_delivered',
        };
        break;

      case 'email.opened':
        // Email was opened - only update if not already clicked/replied
        if (!['email_clicked', 'email_replied', 'recovered'].includes(user.outreachStatus)) {
          updateData = {
            outreachStatus: 'email_opened',
          };
        }
        break;

      case 'email.clicked':
        // Email link was clicked - only update if not already replied
        if (!['email_replied', 'recovered'].includes(user.outreachStatus)) {
          updateData = {
            outreachStatus: 'email_clicked',
          };
        }
        break;

      case 'email.bounced':
        updateData = {
          outreachStatus: 'email_bounced',
        };
        break;

      case 'email.complained':
        updateData = {
          outreachStatus: 'email_complained',
        };
        break;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.churnedUser.update({
        where: { id: user.id },
        data: updateData,
      });
      console.log('[Resend Webhook] Updated user:', user.id, 'to status:', updateData.outreachStatus);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Resend Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// Verify webhook signature (optional but recommended)
// You can add signature verification here using the webhook signing secret from Resend
