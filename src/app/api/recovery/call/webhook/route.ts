import { NextRequest, NextResponse } from 'next/server';

// POST - Handle Twilio status callbacks
export async function POST(request: NextRequest) {
  try {
    // Parse form data from Twilio
    const formData = await request.formData();

    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const callDuration = formData.get('CallDuration') as string;
    const dialCallStatus = formData.get('DialCallStatus') as string;

    console.log('Twilio webhook received:', {
      callSid,
      callStatus,
      dialCallStatus,
      callDuration,
    });

    // Log the call status for now
    // In a production system, you might want to store this in the database
    // and update the ChurnedUser record

    // Return empty TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('Webhook error:', error);

    // Still return valid TwiML even on error
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}

// GET - Handle GET requests (for testing)
export async function GET() {
  return NextResponse.json({ message: 'Twilio webhook endpoint' });
}
