import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { initiateCall, formatPhoneForTwilio } from '@/lib/twilio';

// POST - Initiate a recovery call
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, agentPhone } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    if (!agentPhone) {
      return NextResponse.json({ error: 'Agent phone number required' }, { status: 400 });
    }

    // Check Twilio configuration
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return NextResponse.json(
        { error: 'Twilio not configured. Please add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to your environment variables.' },
        { status: 500 }
      );
    }

    const user = await prisma.churnedUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.phone) {
      return NextResponse.json({ error: 'User does not have a phone number' }, { status: 400 });
    }

    try {
      // Format phone numbers
      const formattedAgentPhone = formatPhoneForTwilio(agentPhone);
      const formattedCustomerPhone = formatPhoneForTwilio(user.phone);

      // Initiate the call
      const call = await initiateCall(formattedAgentPhone, formattedCustomerPhone);

      return NextResponse.json({
        message: 'Call initiated',
        callSid: call.sid,
        status: call.status,
        customerPhone: formattedCustomerPhone,
      });
    } catch (twilioError: unknown) {
      console.error('Twilio error:', twilioError);
      const errorMessage = twilioError instanceof Error ? twilioError.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to initiate call: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to initiate call:', error);
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 });
  }
}

// GET - Check call status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const callSid = searchParams.get('callSid');

    if (!callSid) {
      return NextResponse.json({ error: 'Call SID required' }, { status: 400 });
    }

    // Note: For full status tracking, you'd use the Twilio client to fetch call details
    // For now, we rely on the webhook to track status
    return NextResponse.json({
      message: 'Use the webhook endpoint for real-time status updates',
      callSid,
    });
  } catch (error) {
    console.error('Failed to get call status:', error);
    return NextResponse.json({ error: 'Failed to get call status' }, { status: 500 });
  }
}
