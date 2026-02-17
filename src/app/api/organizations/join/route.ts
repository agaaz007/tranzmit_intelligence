import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Auto-create the juno-demo organization and project if they don't exist
async function ensureJunoDemoExists() {
  const existing = await prisma.organization.findUnique({
    where: { id: 'juno-demo' },
    include: { projects: true },
  });

  if (existing) return existing;

  // Create the demo organization with a project
  return await prisma.organization.create({
    data: {
      id: 'juno-demo',
      name: 'Juno Demo',
      slug: 'juno-demo',
      projects: {
        create: {
          id: 'juno-demo',
          name: 'Juno Health Companion',
          apiKey: `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        },
      },
    },
    include: { projects: true },
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await request.json();
    if (!orgId || typeof orgId !== 'string') {
      return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
    }

    // Auto-create juno-demo if requested
    if (orgId === 'juno-demo') {
      await ensureJunoDemoExists();
    }

    // Validate org exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { projects: true },
    });

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Check if user is already a member
    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
    });

    if (existingMembership) {
      return NextResponse.json({
        organization,
        projects: organization.projects,
        message: 'Already a member',
      });
    }

    // Create membership
    await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        role: 'member',
      },
    });

    return NextResponse.json({
      organization,
      projects: organization.projects,
    });
  } catch (error) {
    console.error('[Join Org] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
