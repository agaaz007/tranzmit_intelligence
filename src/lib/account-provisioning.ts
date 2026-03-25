import crypto from 'crypto';
import { prisma } from './prisma';

const DEFAULT_PROJECT_NAME = 'Default Project';

const userWithOrganizationsInclude = {
  memberships: {
    include: {
      organization: {
        include: {
          projects: true,
        },
      },
    },
  },
} as const;

export function generateProjectApiKey() {
  return `tranzmit_${crypto.randomBytes(16).toString('hex')}`;
}

export function getDefaultWorkspaceName(firstName?: string | null) {
  return firstName ? `${firstName}'s Workspace` : 'My Workspace';
}

export function generateOrganizationSlug(name: string) {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
}

type ProvisionUserAccountInput = {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
};

function shouldRetryProvisioning(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function provisionUserAccount(
  input: ProvisionUserAccountInput,
  attempt = 0
) {
  try {
    return await prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({
        where: {
          OR: [{ clerkId: input.clerkId }, { email: input.email }],
        },
        include: userWithOrganizationsInclude,
      });

      if (user) {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            clerkId: input.clerkId,
            email: input.email,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            imageUrl: input.imageUrl ?? null,
          },
          include: userWithOrganizationsInclude,
        });
      } else {
        user = await tx.user.create({
          data: {
            clerkId: input.clerkId,
            email: input.email,
            firstName: input.firstName ?? null,
            lastName: input.lastName ?? null,
            imageUrl: input.imageUrl ?? null,
          },
          include: userWithOrganizationsInclude,
        });
      }

      const ownerMembership =
        user.memberships.find((membership) => membership.role === 'owner') ?? null;

      if (!ownerMembership) {
        const orgName = getDefaultWorkspaceName(input.firstName);

        await tx.organization.create({
          data: {
            name: orgName,
            slug: generateOrganizationSlug(orgName),
            members: {
              create: {
                userId: user.id,
                role: 'owner',
              },
            },
            projects: {
              create: {
                name: DEFAULT_PROJECT_NAME,
                apiKey: generateProjectApiKey(),
              },
            },
          },
        });
      } else if (ownerMembership.organization.projects.length === 0) {
        await tx.project.create({
          data: {
            organizationId: ownerMembership.organization.id,
            name: DEFAULT_PROJECT_NAME,
            apiKey: generateProjectApiKey(),
          },
        });
      }

      const provisionedUser = await tx.user.findUnique({
        where: { id: user.id },
        include: userWithOrganizationsInclude,
      });

      if (!provisionedUser) {
        throw new Error('Failed to provision user account');
      }

      return provisionedUser;
    });
  } catch (error) {
    if (attempt === 0 && shouldRetryProvisioning(error)) {
      return provisionUserAccount(input, attempt + 1);
    }

    throw error;
  }
}
