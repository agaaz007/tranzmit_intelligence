import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateRecoveryOutreach } from '@/lib/recovery-outreach-generator';

// POST - Generate personalized recovery outreach for a churned user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userIds, companyName, productName } = body;

    // Handle single user
    if (userId) {
      const result = await generateOutreachForUser(userId, companyName, productName);
      return NextResponse.json(result);
    }

    // Handle multiple users
    if (userIds && Array.isArray(userIds)) {
      const results = await Promise.all(
        userIds.map(id => generateOutreachForUser(id, companyName, productName))
      );

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      return NextResponse.json({
        message: `Generated outreach for ${successful.length} users (${failed.length} failed)`,
        results,
      });
    }

    return NextResponse.json({ error: 'userId or userIds required' }, { status: 400 });
  } catch (error) {
    console.error('Failed to generate outreach:', error);
    return NextResponse.json({ error: 'Failed to generate outreach' }, { status: 500 });
  }
}

async function generateOutreachForUser(
  userId: string,
  companyName?: string,
  productName?: string
): Promise<{
  success: boolean;
  userId: string;
  outreach?: {
    email: { subject: string; body: string; tone: string };
    callScript: {
      openingLine: string;
      keyPoints: string[];
      objectionHandlers: Array<{ objection: string; response: string }>;
      closingCTA: string;
    };
    personalizedReason: string;
  };
  error?: string;
}> {
  try {
    const user = await prisma.churnedUser.findUnique({
      where: { id: userId },
      include: { project: true },
    });

    if (!user) {
      return { success: false, userId, error: 'User not found' };
    }

    if (user.analysisStatus !== 'completed' || !user.analysisResult) {
      return { success: false, userId, error: 'User session analysis not completed' };
    }

    const analysisResult = JSON.parse(user.analysisResult);

    // Generate outreach using AI
    const outreach = await generateRecoveryOutreach({
      userName: user.name || undefined,
      userEmail: user.email,
      companyName: companyName || user.project.name,
      productName: productName || user.project.name,
      sessionAnalysis: {
        frustrationPoints: analysisResult.frustrationPoints?.map((fp: { issue: string; severity?: string }) => ({
          issue: fp.issue,
          severity: fp.severity,
        })),
        behaviorPatterns: analysisResult.behaviorPatterns,
        dropOffPoints: analysisResult.dropOffPoints,
        summary: analysisResult.summary,
        uxRating: analysisResult.uxRating,
        tags: analysisResult.tags,
        went_well: analysisResult.went_well,
      },
    });

    // Save generated outreach to database
    await prisma.churnedUser.update({
      where: { id: userId },
      data: {
        recoveryEmail: JSON.stringify(outreach.email),
        callScript: JSON.stringify(outreach.callScript),
      },
    });

    return {
      success: true,
      userId,
      outreach: {
        email: outreach.email,
        callScript: outreach.callScript,
        personalizedReason: outreach.personalizedReason,
      },
    };
  } catch (error) {
    console.error(`Failed to generate outreach for user ${userId}:`, error);
    return { success: false, userId, error: 'Generation failed' };
  }
}
