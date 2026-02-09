import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

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

interface RecoveryEmailContent {
  subject: string;
  body: string;
  tone?: string;
}

function generateRecoveryEmailHTML(
  recipientName: string,
  emailContent: RecoveryEmailContent,
  companyName: string
): string {
  const firstName = recipientName?.split(' ')[0] || 'there';
  const bodyParagraphs = emailContent.body
    .split('\n')
    .filter(p => p.trim())
    .map(p => `<p style="margin: 0 0 16px; color: #475569; font-size: 16px; line-height: 1.6;">${p}</p>`)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailContent.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">We miss you!</h1>
              <p style="margin: 8px 0 0; color: #dbeafe; font-size: 14px;">Let's reconnect</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px; color: #1e293b; font-size: 16px; line-height: 1.6;">
                Hi ${firstName},
              </p>

              ${bodyParagraphs}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 16px 0 24px;">
                    <a href="mailto:support@${companyName.toLowerCase().replace(/\s+/g, '')}.com?subject=Re: ${encodeURIComponent(emailContent.subject)}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">
                      Reply to this email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #1e293b; font-size: 16px; line-height: 1.6;">
                Best regards,<br>
                <strong>The ${companyName} Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                Simply reply to this email if you have any questions.<br>
                We're here to help!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function generatePlainText(
  recipientName: string,
  emailContent: RecoveryEmailContent,
  companyName: string
): string {
  const firstName = recipientName?.split(' ')[0] || 'there';
  return `Hi ${firstName},

${emailContent.body}

Best regards,
The ${companyName} Team

---
Simply reply to this email if you have any questions. We're here to help!
  `.trim();
}

// POST - Send recovery email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, customSubject, customBody } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'Email service not configured. Please add RESEND_API_KEY to your environment variables.' },
        { status: 500 }
      );
    }

    const user = await prisma.churnedUser.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get email content from generated outreach or custom
    let emailContent: RecoveryEmailContent;
    if (customSubject || customBody) {
      emailContent = {
        subject: customSubject || 'We want to hear from you',
        body: customBody || 'We noticed you left and wanted to reach out personally.',
      };
    } else if (user.recoveryEmail) {
      emailContent = JSON.parse(user.recoveryEmail);
    } else {
      return NextResponse.json(
        { error: 'No recovery email generated. Please generate outreach first or provide custom content.' },
        { status: 400 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev';
    const companyName = user.project.name;

    try {
      const emailResult = await getResendClient().emails.send({
        from: fromEmail,
        to: user.email,
        subject: emailContent.subject,
        html: generateRecoveryEmailHTML(user.name || '', emailContent, companyName),
        text: generatePlainText(user.name || '', emailContent, companyName),
      });

      if (emailResult.error) {
        console.error('Resend API error:', emailResult.error);
        return NextResponse.json(
          { error: `Failed to send email: ${emailResult.error.message}` },
          { status: 500 }
        );
      }

      // Update user status
      await prisma.churnedUser.update({
        where: { id: userId },
        data: {
          outreachStatus: 'email_sent',
          emailSentAt: new Date(),
          emailMessageId: emailResult.data?.id || null,
        },
      });

      return NextResponse.json({
        message: `Recovery email sent to ${user.email}`,
        messageId: emailResult.data?.id,
      });
    } catch (emailError: unknown) {
      console.error('Failed to send email:', emailError);
      const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to send email: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to send recovery email:', error);
    return NextResponse.json({ error: 'Failed to send recovery email' }, { status: 500 });
  }
}
