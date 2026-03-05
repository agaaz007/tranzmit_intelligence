import { prisma } from '@/lib/prisma';

interface ResolveIdentityInput {
  email?: string | null;
  distinctId?: string | null;
  source?: string | null;
  userType?: string | null;
  displayName?: string | null;
}

export async function resolveOrCreateProfile(
  projectId: string,
  input: ResolveIdentityInput
) {
  const { distinctId, source, userType, displayName } = input;
  const email = input.email?.toLowerCase().trim() || null;

  if (!email && !distinctId) return null;

  let profileFromIdentifier = null;
  let profileFromEmail = null;

  // Lookup by distinctId + source
  if (distinctId && source) {
    const identifier = await prisma.userIdentifier.findUnique({
      where: { source_identifier: { source, identifier: distinctId } },
      include: { userProfile: true },
    });
    if (identifier) {
      profileFromIdentifier = identifier.userProfile;
    }
  }

  // Lookup by email
  if (email) {
    profileFromEmail = await prisma.userProfile.findUnique({
      where: { projectId_canonicalEmail: { projectId, canonicalEmail: email } },
    });
  }

  // If both resolve to different profiles → merge
  if (profileFromIdentifier && profileFromEmail && profileFromIdentifier.id !== profileFromEmail.id) {
    const keep = (profileFromIdentifier.createdAt <= profileFromEmail.createdAt)
      ? profileFromIdentifier
      : profileFromEmail;
    const remove = keep.id === profileFromIdentifier.id ? profileFromEmail : profileFromIdentifier;

    // Move all identifiers from remove to keep
    await prisma.userIdentifier.updateMany({
      where: { userProfileId: remove.id },
      data: { userProfileId: keep.id },
    });

    // Transfer email if keep doesn't have one
    if (!keep.canonicalEmail && remove.canonicalEmail) {
      await prisma.userProfile.update({
        where: { id: keep.id },
        data: { canonicalEmail: remove.canonicalEmail },
      });
    }

    // Delete the duplicate
    await prisma.userProfile.delete({ where: { id: remove.id } });

    return prisma.userProfile.findUnique({
      where: { id: keep.id },
      include: { identifiers: true },
    });
  }

  const existingProfile = profileFromIdentifier || profileFromEmail;

  if (existingProfile) {
    // Add missing identifier
    if (distinctId && source) {
      await prisma.userIdentifier.upsert({
        where: { source_identifier: { source, identifier: distinctId } },
        create: { userProfileId: existingProfile.id, source, identifier: distinctId },
        update: { userProfileId: existingProfile.id },
      });
    }

    // Update userType if current is null/unknown and a value is provided
    const shouldUpdateType = userType && (!existingProfile.userType || existingProfile.userType === 'unknown');
    if (shouldUpdateType || displayName) {
      await prisma.userProfile.update({
        where: { id: existingProfile.id },
        data: {
          ...(shouldUpdateType ? { userType } : {}),
          ...(displayName && !existingProfile.displayName ? { displayName } : {}),
        },
      });
    }

    return prisma.userProfile.findUnique({
      where: { id: existingProfile.id },
      include: { identifiers: true },
    });
  }

  // Create new profile
  const profile = await prisma.userProfile.create({
    data: {
      projectId,
      canonicalEmail: email,
      displayName: displayName || email?.split('@')[0] || null,
      userType: userType || 'unknown',
    },
  });

  // Add identifier if provided
  if (distinctId && source) {
    await prisma.userIdentifier.create({
      data: { userProfileId: profile.id, source, identifier: distinctId },
    });
  }

  return prisma.userProfile.findUnique({
    where: { id: profile.id },
    include: { identifiers: true },
  });
}
