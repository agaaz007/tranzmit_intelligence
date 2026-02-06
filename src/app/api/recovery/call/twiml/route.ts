import { NextRequest, NextResponse } from 'next/server';

// GET - Return TwiML to connect agent to customer
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get('to');

  if (!to) {
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, there was an error connecting your call. Please try again.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(errorTwiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  // TwiML that announces the call and then connects to the customer
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to the customer now. Please hold.</Say>
  <Pause length="1"/>
  <Dial callerId="${twilioPhoneNumber}" timeout="30" action="/api/recovery/call/webhook">
    <Number>${to}</Number>
  </Dial>
</Response>`;

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

// POST - Also handle POST requests (some Twilio flows use POST)
export async function POST(request: NextRequest) {
  return GET(request);
}
