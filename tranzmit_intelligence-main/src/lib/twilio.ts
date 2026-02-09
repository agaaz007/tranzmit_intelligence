import twilio from 'twilio';

let client: twilio.Twilio | null = null;

export function getTwilioClient(): twilio.Twilio {
  if (!client) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to your environment variables.');
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

export async function initiateCall(agentPhone: string, customerPhone: string) {
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!twilioPhoneNumber) {
    throw new Error('TWILIO_PHONE_NUMBER not configured');
  }
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL not configured');
  }

  const twilioClient = getTwilioClient();

  // Create a call that first connects to the agent, then dials the customer
  const call = await twilioClient.calls.create({
    url: `${appUrl}/api/recovery/call/twiml?to=${encodeURIComponent(customerPhone)}`,
    to: agentPhone,
    from: twilioPhoneNumber,
    statusCallback: `${appUrl}/api/recovery/call/webhook`,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
  });

  return call;
}

export function formatPhoneForTwilio(phone: string): string {
  // Remove all non-digit characters except + at the start
  let formatted = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

  // Add +1 if it's a 10-digit US number without country code
  if (formatted.length === 10 && !formatted.startsWith('+')) {
    formatted = '+1' + formatted;
  } else if (!formatted.startsWith('+')) {
    formatted = '+' + formatted;
  }

  return formatted;
}
