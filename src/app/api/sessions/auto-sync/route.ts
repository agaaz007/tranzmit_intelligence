import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncSessionsFromPostHog } from '@/lib/session-sync';
import { syncSessionsFromMixpanel } from '@/lib/mixpanel';
import { syncSessionsFromAmplitude } from '@/lib/amplitude';
import { analyzeSession } from '@/lib/session-analysis';
import { synthesizeInsightsWithSessionLinkage } from '@/lib/session-synthesize';

// POST: Auto-sync pipeline — sync from PostHog or Mixpanel, analyze pending, re-synthesize
export async function POST(req: NextRequest) {
  let projectId: string;
  try {
    const body = await req.json();
    projectId = body.projectId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  // Upsert status to syncing
  await prisma.synthesizedInsight.upsert({
    where: { projectId },
    create: { projectId, syncStatus: 'syncing' },
    update: { syncStatus: 'syncing', syncError: null },
  });

  try {
    // Get project to check which integration is configured
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        posthogKey: true,
        posthogProjId: true,
        mixpanelKey: true,
        mixpanelProjId: true,
        amplitudeKey: true,
        amplitudeSecret: true,
        amplitudeProjId: true,
        replaySource: true,
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const hasPostHog = project.posthogKey && project.posthogProjId;
    const hasMixpanel = project.mixpanelKey && project.mixpanelProjId;
    const hasAmplitude = project.amplitudeKey && project.amplitudeSecret && project.amplitudeProjId;

    // Step 1: Sync new sessions from preferred source (or auto-detect)
    console.log(`[Auto-Sync] Step 1: Syncing sessions for project ${projectId} (preferred: ${project.replaySource || 'auto'})`);
    let syncResult: { imported: number; skipped: number; failed: number; errors?: string[] } = { imported: 0, skipped: 0, failed: 0, errors: [] };

    const preferred = project.replaySource;

    try {
      if (preferred === 'posthog' && hasPostHog) {
        console.log('[Auto-Sync] Using PostHog integration (user preference)');
        syncResult = await syncSessionsFromPostHog(projectId, 20);
      } else if (preferred === 'mixpanel' && hasMixpanel) {
        console.log('[Auto-Sync] Using Mixpanel integration (user preference)');
        syncResult = await syncSessionsFromMixpanel(projectId, 3, 5);
      } else if (preferred === 'amplitude' && hasAmplitude) {
        console.log('[Auto-Sync] Using Amplitude integration (user preference)');
        syncResult = await syncSessionsFromAmplitude(projectId, 7);
      } else if (hasMixpanel) {
        console.log('[Auto-Sync] Using Mixpanel integration (auto-detected)');
        syncResult = await syncSessionsFromMixpanel(projectId, 3, 5);
      } else if (hasAmplitude) {
        console.log('[Auto-Sync] Using Amplitude integration (auto-detected)');
        syncResult = await syncSessionsFromAmplitude(projectId, 7);
      } else if (hasPostHog) {
        console.log('[Auto-Sync] Using PostHog integration (auto-detected)');
        syncResult = await syncSessionsFromPostHog(projectId, 20);
      } else {
        console.log('[Auto-Sync] No integration configured, skipping sync');
      }
    } catch (syncError) {
      console.error('[Auto-Sync] Sync failed:', syncError);
    }

    await prisma.synthesizedInsight.update({
      where: { projectId },
      data: { lastSyncedAt: new Date(), syncStatus: 'analyzing' },
    });

    // Step 2: Analyze all pending sessions
    console.log(`[Auto-Sync] Step 2: Analyzing pending sessions`);
    const pending = await prisma.session.findMany({
      where: { projectId, analysisStatus: 'pending' },
      select: { id: true },
    });

    let analyzedCount = 0;
    for (const session of pending) {
      try {
        await analyzeSession(session.id);
        analyzedCount++;
        console.log(`[Auto-Sync] Analyzed session ${session.id} (${analyzedCount}/${pending.length})`);
      } catch (err) {
        console.error(`[Auto-Sync] Failed to analyze session ${session.id}:`, err);
      }
    }

    await prisma.synthesizedInsight.update({
      where: { projectId },
      data: { lastAnalyzedAt: new Date(), syncStatus: 'synthesizing' },
    });

    // Step 3: Re-synthesize insights with session linkage
    console.log(`[Auto-Sync] Step 3: Synthesizing insights`);
    const completedCount = await prisma.session.count({
      where: { projectId, analysisStatus: 'completed' },
    });

    let insight = null;
    if (completedCount > 0) {
      try {
        insight = await synthesizeInsightsWithSessionLinkage(projectId);
      } catch (synthError) {
        console.error('[Auto-Sync] Synthesis failed:', synthError);
        await prisma.synthesizedInsight.update({
          where: { projectId },
          data: { syncStatus: 'complete', lastSynthesizedAt: new Date() },
        });
      }
    } else {
      await prisma.synthesizedInsight.update({
        where: { projectId },
        data: { syncStatus: 'complete' },
      });
    }

    console.log(`[Auto-Sync] Complete: ${syncResult.imported} synced, ${analyzedCount} analyzed, synthesis=${!!insight}`);

    return NextResponse.json({
      synced: syncResult.imported,
      analyzed: analyzedCount,
      synthesized: !!insight,
      insight,
    });
  } catch (error) {
    console.error('[Auto-Sync] Error:', error);
    await prisma.synthesizedInsight.update({
      where: { projectId },
      data: { syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-sync failed' },
      { status: 500 }
    );
  }
}
