import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// DELETE - Delete a churned user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // Delete the churned user
    await prisma.churnedUser.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete churned user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

// GET - Get a single churned user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const user = await prisma.churnedUser.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Failed to get churned user:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}

// PATCH - Update a churned user (reset analysis, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    // Allow resetting analysis
    if (body.resetAnalysis) {
      updateData.analysisStatus = 'pending';
      updateData.analysisResult = null;
      updateData.analyzedAt = null;
      updateData.sessionCount = 0;
    }

    // Allow resetting outreach
    if (body.resetOutreach) {
      updateData.recoveryEmail = null;
      updateData.callScript = null;
      updateData.outreachStatus = 'pending';
      updateData.emailSentAt = null;
      updateData.emailMessageId = null;
      updateData.callCompletedAt = null;
      updateData.callNotes = null;
    }

    // Allow updating specific fields
    if (body.name !== undefined) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.posthogDistinctId !== undefined) updateData.posthogDistinctId = body.posthogDistinctId;

    const user = await prisma.churnedUser.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Failed to update churned user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
