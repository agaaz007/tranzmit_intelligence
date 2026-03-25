import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: {
        organization: {
          include: {
            projects: true,
          },
        },
      },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
      memberships: memberships.map((m) => ({
        org: m.organization,
        role: m.role,
        projects: m.organization.projects,
      })),
    });
  } catch (error) {
    console.error('[My Orgs] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, orgId } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!orgId || typeof orgId !== 'string') {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    // Verify user owns this organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
      include: { organization: true },
    });

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Not authorized to rename this organization' }, { status: 403 });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        name: name.trim(),
        slug: slug || membership.organization.slug,
      },
      include: { projects: true },
    });

    return NextResponse.json({ organization: updated });
  } catch (error) {
    console.error('[My Orgs PATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
