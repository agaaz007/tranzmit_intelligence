import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
