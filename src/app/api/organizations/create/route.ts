import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateSdkApiKey, provisionSdkTenant } from '@/lib/sdk-db';
import crypto from 'crypto';

/**
 * POST /api/organizations/create — Create a new workspace (org + project + SDK tenant)
 * Body: { name: string, posthogKey?, posthogProjId?, posthogHost?, amplitudeKey?, amplitudeSecret? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + crypto.randomBytes(3).toString('hex');
    const apiKey = generateSdkApiKey();

    // Create org + membership + project in one transaction
    const organization = await prisma.organization.create({
      data: {
        name: trimmedName,
        slug,
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
        projects: {
          create: {
            name: `${trimmedName} — Main`,
            apiKey,
          },
        },
      },
      include: {
        projects: true,
      },
    });

    const project = organization.projects[0];

    // Provision tenant + API key in the SDK database (fire-and-forget)
    provisionSdkTenant({
      name: trimmedName,
      apiKey,
      posthogApiKey: body.posthogKey || null,
      posthogProjectId: body.posthogProjId || null,
      posthogHost: body.posthogHost || null,
      amplitudeApiKey: body.amplitudeKey || null,
      amplitudeSecretKey: body.amplitudeSecret || null,
    }).catch(err => console.error('[Create Org] SDK provisioning failed:', err));

    console.log(`[Create Org] User ${user.email} created org ${organization.id} (${trimmedName})`);

    return NextResponse.json({
      organization,
      project,
    });
  } catch (error: any) {
    console.error('[Create Org] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create workspace' },
      { status: 500 }
    );
  }
}
