import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Fetch all uploaded users for a project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const users = await prisma.uploadedUser.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Failed to fetch uploaded users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST - Create uploaded users (bulk from CSV)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, users } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ error: 'Users array is required' }, { status: 400 });
    }

    // Upsert users (update if email exists, create if not)
    const results = await Promise.all(
      users.map(async (user: { name?: string; email: string; phone?: string; cohort?: string }) => {
        try {
          return await prisma.uploadedUser.upsert({
            where: {
              projectId_email: {
                projectId,
                email: user.email,
              },
            },
            update: {
              name: user.name,
              phone: user.phone,
              cohort: user.cohort,
              updatedAt: new Date(),
            },
            create: {
              projectId,
              name: user.name || null,
              email: user.email,
              phone: user.phone || null,
              cohort: user.cohort || null,
              inviteStatus: 'pending',
              source: 'csv',
            },
          });
        } catch (err) {
          console.error(`Failed to upsert user ${user.email}:`, err);
          return null;
        }
      })
    );

    const successCount = results.filter(Boolean).length;

    return NextResponse.json({
      message: `Successfully saved ${successCount} users`,
      count: successCount,
    });
  } catch (error) {
    console.error('Failed to save uploaded users:', error);
    return NextResponse.json({ error: 'Failed to save users' }, { status: 500 });
  }
}

// DELETE - Remove an uploaded user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const projectId = searchParams.get('projectId');
    const deleteAll = searchParams.get('deleteAll');

    if (deleteAll === 'true' && projectId) {
      // Delete all users for a project
      await prisma.uploadedUser.deleteMany({
        where: { projectId },
      });
      return NextResponse.json({ message: 'All users deleted' });
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    await prisma.uploadedUser.delete({
      where: { id: userId },
    });

    return NextResponse.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

// PATCH - Update invite status
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, inviteStatus } = body;

    if (!userId || !inviteStatus) {
      return NextResponse.json({ error: 'User ID and invite status are required' }, { status: 400 });
    }

    const user = await prisma.uploadedUser.update({
      where: { id: userId },
      data: {
        inviteStatus,
        invitedAt: inviteStatus === 'invited' ? new Date() : null,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
