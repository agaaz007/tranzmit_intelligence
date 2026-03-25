/**
 * Script to manually create a user in the database for local development
 * Run with: npx ts-node scripts/create-local-user.ts
 *
 * After signing up with Clerk locally, run this script with your Clerk user ID
 * to create the database records (since webhooks don't work locally without ngrok)
 */

import { PrismaClient } from '@prisma/client';
import {
  generateOrganizationSlug,
  generateProjectApiKey,
  getDefaultWorkspaceName,
} from '../src/lib/account-provisioning';

const prisma = new PrismaClient();

async function createLocalUser() {
  // Get args from command line or use defaults
  const clerkId = process.argv[2];
  const email = process.argv[3];
  const firstName = process.argv[4] || null;

  if (!clerkId || !email) {
    console.log('Usage: npx ts-node scripts/create-local-user.ts <clerkId> <email> [firstName]');
    console.log('');
    console.log('Example: npx ts-node scripts/create-local-user.ts user_2abc123 john@example.com John');
    console.log('');
    console.log('Find your Clerk user ID in the Clerk dashboard under Users');
    process.exit(1);
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (existingUser) {
      console.log('User already exists:', existingUser.email);
      process.exit(0);
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        clerkId,
        email,
        firstName,
      },
    });
    console.log('Created user:', user.id);

    // Create organization
    const orgName = getDefaultWorkspaceName(firstName);
    const slug = generateOrganizationSlug(orgName);

    const organization = await prisma.organization.create({
      data: {
        name: orgName,
        slug,
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
      },
    });
    console.log('Created organization:', organization.name);

    // Create default project
    const apiKey = generateProjectApiKey();
    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: 'Default Project',
        apiKey,
      },
    });
    console.log('Created project:', project.name);
    console.log('');
    console.log('Setup complete! You can now use the app.');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createLocalUser();
