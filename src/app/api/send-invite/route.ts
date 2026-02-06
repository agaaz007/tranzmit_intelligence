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

interface EmailContentProps {
  recipientName: string;
  subject?: string;
  senderName?: string;
  companyName?: string;
  greeting?: string;
  body?: string;
  ctaText?: string;
  ctaType?: 'phone' | 'link';
  ctaLink?: string;
  ctaPhone?: string;
  giftAmount?: string;
  giftType?: string;
  closing?: string;
}

function formatPhoneForTel(phone: string): string {
  // Remove all non-digit characters except + at the start
  return phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

function generateEmailHTML({
  recipientName,
  senderName = 'The Research Team',
  companyName = 'VoiceJourneys',
  greeting = 'Hi {firstName},',
  body = "We'd love to hear your thoughts! You've been selected to participate in a brief interview to help us understand your experience better.\n\nYour feedback is incredibly valuable and will directly shape how we improve our product.",
  ctaText = 'Schedule Interview',
  ctaType = 'phone',
  ctaLink = '',
  ctaPhone = '',
  giftAmount = '',
  giftType = 'Amazon Gift Card',
  closing = 'Thank you for being part of our community!',
}: EmailContentProps): string {
  const firstName = recipientName?.split(' ')[0] || 'there';
  const personalizedGreeting = greeting.replace('{firstName}', firstName);
  const formattedBody = body.split('\n').map(p => p.trim()).filter(Boolean).map(p =>
    `<p style="margin: 0 0 20px; color: #475569; font-size: 16px; line-height: 1.6;">${p}</p>`
  ).join('');

  // Determine the CTA href based on type
  let ctaHref = '#';
  let showCta = false;

  if (ctaType === 'phone' && ctaPhone) {
    ctaHref = `tel:${formatPhoneForTel(ctaPhone)}`;
    showCta = true;
  } else if (ctaType === 'link' && ctaLink) {
    ctaHref = ctaLink;
    showCta = true;
  }

  // Gift voucher section
  const giftSection = giftAmount ? `
              <!-- Gift Voucher Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%); border-radius: 16px; overflow: hidden;">
                      <tr>
                        <td style="padding: 24px; text-align: center;">
                          <p style="margin: 0 0 8px; color: #d1fae5; font-size: 14px;">✨ As a thank you for your time, you'll receive ✨</p>
                          <p style="margin: 0 0 8px; color: #ffffff; font-size: 48px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">$${giftAmount}</p>
                          <p style="margin: 0; color: #d1fae5; font-size: 18px; font-weight: 600;">🎁 ${giftType}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">You're Invited!</h1>
              ${giftAmount ? `<p style="margin: 8px 0 0; color: #f3e8ff; font-size: 14px;">Plus receive a $${giftAmount} gift for your time 🎁</p>` : ''}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px; color: #1e293b; font-size: 16px; line-height: 1.6;">
                ${personalizedGreeting}
              </p>

              ${formattedBody}

              ${giftSection}

              <!-- CTA Button -->
              ${showCta ? `
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${ctaHref}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 12px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);">
                      ${ctaType === 'phone' ? '📞 ' : ''}${ctaText}
                    </a>
                  </td>
                </tr>
              </table>
              ${ctaType === 'phone' && ctaPhone ? `
              <p style="margin: 0 0 24px; color: #64748b; font-size: 14px; text-align: center;">
                Or call us directly at: <a href="tel:${formatPhoneForTel(ctaPhone)}" style="color: #7c3aed; font-weight: 600;">${ctaPhone}</a>
              </p>
              ` : ''}
              ` : ''}

              <p style="margin: 0 0 8px; color: #475569; font-size: 14px; line-height: 1.6;">
                What to expect:
              </p>
              <ul style="margin: 0 0 24px; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.8;">
                <li>A casual 15-20 minute conversation</li>
                <li>Questions about your experience and preferences</li>
                <li>Your honest feedback is all we need</li>
                ${giftAmount ? `<li style="color: #059669; font-weight: 500;">Your $${giftAmount} ${giftType} sent after completion!</li>` : ''}
              </ul>

              <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.6;">
                ${closing}
              </p>

              <p style="margin: 24px 0 0; color: #1e293b; font-size: 16px; line-height: 1.6;">
                Best regards,<br>
                <strong>${senderName}</strong><br>
                <span style="color: #64748b;">${companyName}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                If you have any questions, simply reply to this email.<br>
                We're always happy to help!
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

function generatePlainText({
  recipientName,
  senderName = 'The Research Team',
  companyName = 'VoiceJourneys',
  greeting = 'Hi {firstName},',
  body = "We'd love to hear your thoughts! You've been selected to participate in a brief interview to help us understand your experience better.\n\nYour feedback is incredibly valuable and will directly shape how we improve our product.",
  ctaText = 'Schedule Interview',
  ctaType = 'phone',
  ctaLink = '',
  ctaPhone = '',
  giftAmount = '',
  giftType = 'Amazon Gift Card',
  closing = 'Thank you for being part of our community!',
}: EmailContentProps): string {
  const firstName = recipientName?.split(' ')[0] || 'there';
  const personalizedGreeting = greeting.replace('{firstName}', firstName);

  let ctaSection = '';
  if (ctaType === 'phone' && ctaPhone) {
    ctaSection = `${ctaText}: ${ctaPhone}`;
  } else if (ctaType === 'link' && ctaLink) {
    ctaSection = `${ctaText}: ${ctaLink}`;
  }

  const giftSection = giftAmount ? `
✨ AS A THANK YOU FOR YOUR TIME ✨

You'll receive a $${giftAmount} ${giftType}!

` : '';

  return `
${personalizedGreeting}

You're Invited!${giftAmount ? ` + Get a $${giftAmount} Gift!` : ''}

${body}

${giftSection}${ctaSection}

What to expect:
- A casual 15-20 minute conversation
- Questions about your experience and preferences
- Your honest feedback is all we need${giftAmount ? `
- Your $${giftAmount} ${giftType} sent after completion!` : ''}

${closing}

Best regards,
${senderName}
${companyName}

---
If you have any questions, simply reply to this email. We're always happy to help!
  `.trim();
}

// POST - Send invite email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      userIds,
      subject = "You're Invited to Share Your Feedback!",
      senderName,
      companyName,
      greeting,
      body: emailBody,
      ctaText,
      ctaType,
      ctaLink,
      ctaPhone,
      giftAmount,
      giftType,
      closing,
    } = body;

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: 'Email service not configured. Please add RESEND_API_KEY to your environment variables.' },
        { status: 500 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'research@yourdomain.com';

    const emailContentParams = {
      senderName,
      companyName,
      greeting,
      body: emailBody,
      ctaText,
      ctaType,
      ctaLink,
      ctaPhone,
      giftAmount,
      giftType,
      closing,
    };

    // Handle single user invite
    if (userId) {
      const user = await prisma.uploadedUser.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      try {
        const emailResult = await getResendClient().emails.send({
          from: fromEmail,
          to: user.email,
          subject: subject,
          html: generateEmailHTML({
            recipientName: user.name || '',
            ...emailContentParams,
          }),
          text: generatePlainText({
            recipientName: user.name || '',
            ...emailContentParams,
          }),
        });

        // Check for Resend API error (it doesn't throw, returns { data, error })
        if (emailResult.error) {
          console.error('Resend API error:', emailResult.error);
          await prisma.uploadedUser.update({
            where: { id: userId },
            data: { inviteStatus: 'failed' },
          });
          return NextResponse.json(
            { error: `Failed to send email: ${emailResult.error.message}` },
            { status: 500 }
          );
        }

        // Update user status to invited with message ID for tracking
        await prisma.uploadedUser.update({
          where: { id: userId },
          data: {
            inviteStatus: 'invited',
            invitedAt: new Date(),
            messageId: emailResult.data?.id || null,
          },
        });

        return NextResponse.json({
          message: `Invite sent to ${user.email}`,
          messageId: emailResult.data?.id,
        });
      } catch (emailError: unknown) {
        console.error('Failed to send email:', emailError);

        // Update user status to failed
        await prisma.uploadedUser.update({
          where: { id: userId },
          data: { inviteStatus: 'failed' },
        });

        const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error';
        return NextResponse.json(
          { error: `Failed to send email: ${errorMessage}` },
          { status: 500 }
        );
      }
    }

    // Handle bulk invite
    if (userIds && Array.isArray(userIds)) {
      const users = await prisma.uploadedUser.findMany({
        where: { id: { in: userIds } },
      });

      const results = await Promise.all(
        users.map(async (user) => {
          try {
            const emailResult = await getResendClient().emails.send({
              from: fromEmail,
              to: user.email,
              subject: subject,
              html: generateEmailHTML({
                recipientName: user.name || '',
                ...emailContentParams,
              }),
              text: generatePlainText({
                recipientName: user.name || '',
                ...emailContentParams,
              }),
            });

            // Check for Resend API error
            if (emailResult.error) {
              console.error(`Resend API error for ${user.email}:`, emailResult.error);
              await prisma.uploadedUser.update({
                where: { id: user.id },
                data: { inviteStatus: 'failed' },
              });
              return { userId: user.id, success: false, error: emailResult.error.message };
            }

            await prisma.uploadedUser.update({
              where: { id: user.id },
              data: {
                inviteStatus: 'invited',
                invitedAt: new Date(),
                messageId: emailResult.data?.id || null,
              },
            });

            return { userId: user.id, success: true, messageId: emailResult.data?.id };
          } catch (error) {
            console.error(`Failed to send email to ${user.email}:`, error);

            await prisma.uploadedUser.update({
              where: { id: user.id },
              data: { inviteStatus: 'failed' },
            });

            return { userId: user.id, success: false };
          }
        })
      );

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      return NextResponse.json({
        message: `Sent ${successCount} invites${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        results,
      });
    }

    return NextResponse.json({ error: 'User ID or User IDs required' }, { status: 400 });
  } catch (error) {
    console.error('Failed to send invite:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 500 });
  }
}
