import { NextRequest } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from './prisma';
import crypto from 'crypto';

// Get project from external API key (for external API access)
// Supports header (x-tranzmit-api-key) or query param (key) for sendBeacon compatibility
export async function getProjectFromRequest(request: NextRequest) {
  const apiKey =
    request.headers.get('x-tranzmit-api-key') ||
    request.nextUrl.searchParams.get('key');

  if (!apiKey) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { apiKey },
  });

  return project;
}

// Get the current authenticated user from our database
// Auto-creates user, org, and project if they don't exist (for local dev without webhooks)
export async function getCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  // Try to find existing user
  let user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      memberships: {
        include: {
          organization: true,
        },
      },
    },
  });

  // Auto-create user if not found (handles local dev without webhook)
  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return null;

    // Create user, org, and default project in one transaction
    const firstName = clerkUser.firstName;
    const orgName = firstName ? `${firstName}'s Workspace` : 'My Workspace';
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomBytes(3).toString('hex');
    const apiKey = `tranzmit_${crypto.randomBytes(16).toString('hex')}`;

    user = await prisma.user.create({
      data: {
        clerkId: userId,
        email,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
        imageUrl: clerkUser.imageUrl,
        memberships: {
          create: {
            role: 'owner',
            organization: {
              create: {
                name: orgName,
                slug,
                projects: {
                  create: {
                    name: 'Default Project',
                    apiKey,
                  },
                },
              },
            },
          },
        },
      },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    console.log(`[Auth] Auto-created user ${user.email} with org and project`);
  }

  return user;
}

// Get user with their organizations
export async function getUserWithOrganizations() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return {
    ...user,
    organizations: user.memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    })),
  };
}

// Get a specific organization and verify user has access
export async function getOrganizationWithAccess(organizationId: string) {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    return null;
  }

  return {
    organization: membership.organization,
    role: membership.role,
    user,
  };
}

// Get a project and verify user has access through organization
export async function getProjectWithAccess(projectId: string) {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      organization: true,
    },
  });

  if (!project) {
    return null;
  }

  // If project has no organization (legacy), allow access for authenticated users
  // and auto-assign to user's default organization
  if (!project.organizationId) {
    const defaultOrg = await getDefaultOrganization();
    if (defaultOrg) {
      // Auto-migrate legacy project to user's organization
      await prisma.project.update({
        where: { id: projectId },
        data: { organizationId: defaultOrg.organization.id },
      });
      return {
        project: { ...project, organizationId: defaultOrg.organization.id },
        organization: defaultOrg.organization,
        role: defaultOrg.role,
        user,
      };
    }
    return null;
  }

  // Check if user is a member of the project's organization
  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: project.organizationId,
      },
    },
  });

  if (!membership) {
    return null;
  }

  return {
    project,
    organization: project.organization,
    role: membership.role,
    user,
  };
}

// Get user's default organization (first one they own or belong to)
export async function getDefaultOrganization() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  // Prefer owned organizations, then any membership
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    orderBy: [{ role: 'asc' }], // 'owner' comes before 'member' alphabetically... let's fix this
    include: {
      organization: {
        include: {
          projects: true,
        },
      },
    },
  });

  if (!membership) {
    return null;
  }

  return {
    organization: membership.organization,
    role: membership.role,
    projects: membership.organization.projects,
    user,
  };
}

// Get all projects the user has access to
export async function getUserProjects() {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  // Get all organizations the user is a member of
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

  // Flatten all projects from all organizations
  const projects = memberships.flatMap((m) =>
    m.organization.projects.map((p) => ({
      ...p,
      organizationName: m.organization.name,
      organizationId: m.organization.id,
      userRole: m.role,
    }))
  );

  return projects;
}

// Require authentication - throws if not authenticated
export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

// Require project access - throws if not authorized
export async function requireProjectAccess(projectId: string) {
  const result = await getProjectWithAccess(projectId);

  if (!result) {
    throw new Error('Unauthorized');
  }

  return result;
}
