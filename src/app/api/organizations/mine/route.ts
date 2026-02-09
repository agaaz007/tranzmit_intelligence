import { NextResponse } from 'next/server';
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
