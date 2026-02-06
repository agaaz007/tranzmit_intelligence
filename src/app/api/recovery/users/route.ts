import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getProjectWithAccess } from '@/lib/auth';

// GET - List churned users
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status'); // outreachStatus filter
    const analysisStatus = searchParams.get('analysisStatus');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Verify user has access to this project
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const where: Record<string, unknown> = { projectId };
    if (status) where.outreachStatus = status;
    if (analysisStatus) where.analysisStatus = analysisStatus;

    const users = await prisma.churnedUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Parse JSON fields for response
    const parsedUsers = users.map(user => ({
      ...user,
      analysisResult: user.analysisResult ? JSON.parse(user.analysisResult) : null,
      recoveryEmail: user.recoveryEmail ? JSON.parse(user.recoveryEmail) : null,
      callScript: user.callScript ? JSON.parse(user.callScript) : null,
    }));

    // Get stats
    const stats = await prisma.churnedUser.groupBy({
      by: ['outreachStatus'],
      where: { projectId },
      _count: true,
    });

    const analysisStats = await prisma.churnedUser.groupBy({
      by: ['analysisStatus'],
      where: { projectId },
      _count: true,
    });

    return NextResponse.json({
      users: parsedUsers,
      stats: {
        byOutreachStatus: Object.fromEntries(stats.map(s => [s.outreachStatus, s._count])),
        byAnalysisStatus: Object.fromEntries(analysisStats.map(s => [s.analysisStatus, s._count])),
        total: users.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch churned users:', error);
    return NextResponse.json({ error: 'Failed to fetch churned users' }, { status: 500 });
  }
}

// POST - Bulk upload churned users from CSV
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, users } = body;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ error: 'Users array required' }, { status: 400 });
    }

    // Verify user has access to this project
    const projectAccess = await getProjectWithAccess(projectId);
    if (!projectAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = projectAccess.project;

    const results = {
      created: 0,
      updated: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Process each user with upsert
    for (const user of users) {
      if (!user.email) {
        results.errors.push({ email: 'unknown', error: 'Email is required' });
        continue;
      }

      try {
        const existingUser = await prisma.churnedUser.findUnique({
          where: {
            projectId_email: {
              projectId,
              email: user.email,
            },
          },
        });

        if (existingUser) {
          // Update existing user (preserve analysis if already done)
          await prisma.churnedUser.update({
            where: { id: existingUser.id },
            data: {
              name: user.name || existingUser.name,
              phone: user.phone || existingUser.phone,
              posthogDistinctId: user.posthogDistinctId || user.posthog_distinct_id || existingUser.posthogDistinctId,
            },
          });
          results.updated++;
        } else {
          // Create new user
          await prisma.churnedUser.create({
            data: {
              projectId,
              email: user.email,
              name: user.name || null,
              phone: user.phone || null,
              posthogDistinctId: user.posthogDistinctId || user.posthog_distinct_id || null,
            },
          });
          results.created++;
        }
      } catch (err) {
        console.error(`Error processing user ${user.email}:`, err);
        results.errors.push({ email: user.email, error: 'Failed to process user' });
      }
    }

    return NextResponse.json({
      message: `Processed ${results.created + results.updated} users (${results.created} created, ${results.updated} updated)`,
      ...results,
    });
  } catch (error) {
    console.error('Failed to upload churned users:', error);
    return NextResponse.json({ error: 'Failed to upload churned users' }, { status: 500 });
  }
}

// DELETE - Remove churned user(s)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const projectId = searchParams.get('projectId');
    const deleteAll = searchParams.get('deleteAll') === 'true';

    if (deleteAll && projectId) {
      // Verify user has access to this project
      const projectAccess = await getProjectWithAccess(projectId);
      if (!projectAccess) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Delete all users for a project
      const result = await prisma.churnedUser.deleteMany({
        where: { projectId },
      });
      return NextResponse.json({ message: `Deleted ${result.count} users` });
    }

    if (userId) {
      // Delete single user
      await prisma.churnedUser.delete({
        where: { id: userId },
      });
      return NextResponse.json({ message: 'User deleted' });
    }

    return NextResponse.json({ error: 'User ID or projectId with deleteAll required' }, { status: 400 });
  } catch (error) {
    console.error('Failed to delete churned user:', error);
    return NextResponse.json({ error: 'Failed to delete churned user' }, { status: 500 });
  }
}

// PATCH - Update churned user
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, outreachStatus, callNotes } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (outreachStatus) updateData.outreachStatus = outreachStatus;
    if (callNotes !== undefined) updateData.callNotes = callNotes;

    const user = await prisma.churnedUser.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Failed to update churned user:', error);
    return NextResponse.json({ error: 'Failed to update churned user' }, { status: 500 });
  }
}
