import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { provisionUserAccount } from '@/lib/account-provisioning';

export async function POST(req: Request) {
  // Get the webhook secret from environment
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('[Clerk Webhook] Missing CLERK_WEBHOOK_SECRET');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  // Get headers for verification
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('[Clerk Webhook] Missing svix headers');
    return new Response('Missing svix headers', { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify the webhook
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('[Clerk Webhook] Verification failed:', err);
    return new Response('Webhook verification failed', { status: 400 });
  }

  // Handle the webhook event
  const eventType = evt.type;
  console.log(`[Clerk Webhook] Received event: ${eventType}`);

  try {
    switch (eventType) {
      case 'user.created': {
        const { id, email_addresses, first_name, last_name, image_url } = evt.data;
        const primaryEmail = email_addresses?.[0]?.email_address;

        if (!primaryEmail) {
          console.error('[Clerk Webhook] No email found for user:', id);
          return new Response('No email found', { status: 400 });
        }

        const user = await provisionUserAccount({
          clerkId: id,
          email: primaryEmail,
          firstName: first_name || null,
          lastName: last_name || null,
          imageUrl: image_url || null,
        });

        console.log(`[Clerk Webhook] Provisioned user ${user.id} with default project API key`);
        break;
      }

      case 'user.updated': {
        const { id, email_addresses, first_name, last_name, image_url } = evt.data;
        const primaryEmail = email_addresses?.[0]?.email_address;

        const existingUser = await prisma.user.findUnique({
          where: { clerkId: id },
          select: { email: true },
        });

        const email = primaryEmail || existingUser?.email;

        if (!email) {
          console.error('[Clerk Webhook] No email found for updated user:', id);
          return new Response('No email found', { status: 400 });
        }

        await provisionUserAccount({
          clerkId: id,
          email,
          firstName: first_name || null,
          lastName: last_name || null,
          imageUrl: image_url || null,
        });

        console.log(`[Clerk Webhook] Updated user with clerkId: ${id}`);
        break;
      }

      case 'user.deleted': {
        const { id } = evt.data;

        if (id) {
          // This will cascade delete organization memberships
          await prisma.user.delete({
            where: { clerkId: id },
          });
          console.log(`[Clerk Webhook] Deleted user with clerkId: ${id}`);
        }
        break;
      }

      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${eventType}`);
    }

    return new Response('Webhook processed', { status: 200 });
  } catch (error) {
    console.error('[Clerk Webhook] Error processing webhook:', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
}
