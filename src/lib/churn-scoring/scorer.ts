import { prisma } from '@/lib/prisma';
import { fetchAllUserMetrics } from './data-fetcher';
import { scoreUser } from './scoring-rules';
import { ScoringSummary, RiskLevel } from './types';

const UPSERT_BATCH_SIZE = 100;

export async function runDailyChurnScoring(projectId: string): Promise<ScoringSummary> {
  const startTime = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateStr = today.toISOString().split('T')[0];

  // 1. Get project with PostHog config
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });

  if (!project.posthogKey || !project.posthogProjId) {
    throw new Error(`PostHog not configured for project ${projectId}`);
  }

  // 2. Fetch all user metrics via paginated HogQL
  const rawMetrics = await fetchAllUserMetrics(project);

  // 3. Score each user
  const scoredUsers = rawMetrics.map(scoreUser);

  // 4. Upsert to DB in batches
  const byRiskLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };

  for (let i = 0; i < scoredUsers.length; i += UPSERT_BATCH_SIZE) {
    const batch = scoredUsers.slice(i, i + UPSERT_BATCH_SIZE);

    await Promise.all(
      batch.map((user) => {
        byRiskLevel[user.riskLevel]++;

        return prisma.dailyChurnScore.upsert({
          where: {
            projectId_date_distinctId: {
              projectId,
              date: today,
              distinctId: user.distinctId,
            },
          },
          create: {
            projectId,
            date: today,
            distinctId: user.distinctId,
            email: user.email,
            segment: user.segment,
            isPro: user.isPro,
            subscriptionStatus: user.subscriptionStatus,

            daysSinceLastEvent: user.daysSinceLastEvent,
            daysSinceLastChatStarted: user.daysSinceLastChatStarted,
            daysSinceLastMessageSent: user.daysSinceLastMessageSent,

            sessionsLast7d: user.sessionsLast7d,
            sessionsPrev7d: user.sessionsPrev7d,
            messageSentLast7d: user.messageSentLast7d,
            messageSentPrev7d: user.messageSentPrev7d,
            chatStartedLast7d: user.chatStartedLast7d,
            chatStartedPrev7d: user.chatStartedPrev7d,
            chatEndedLast7d: user.chatEndedLast7d,
            featureUsedLast7d: user.featureUsedLast7d,
            featureUsedPrev7d: user.featureUsedPrev7d,

            chatCompletionRateLast7d: user.chatCompletionRateLast7d,
            avgMessagesPerChatLast7d: user.avgMessagesPerChatLast7d,

            paywallViewedLast7d: user.paywallViewedLast7d,
            manageSubTappedLast30d: user.manageSubTappedLast30d,

            riskScore: user.riskScore,
            riskLevel: user.riskLevel,
            riskReasons: JSON.stringify(user.riskReasons),

            recencyScore: user.subScores.recencyScore,
            usageDropScore: user.subScores.usageDropScore,
            engagementQualityScore: user.subScores.engagementQualityScore,
            frictionScore: user.subScores.frictionScore,
            featureAdoptionLossScore: user.subScores.featureAdoptionLossScore,
          },
          update: {
            email: user.email,
            segment: user.segment,
            isPro: user.isPro,
            subscriptionStatus: user.subscriptionStatus,

            daysSinceLastEvent: user.daysSinceLastEvent,
            daysSinceLastChatStarted: user.daysSinceLastChatStarted,
            daysSinceLastMessageSent: user.daysSinceLastMessageSent,

            sessionsLast7d: user.sessionsLast7d,
            sessionsPrev7d: user.sessionsPrev7d,
            messageSentLast7d: user.messageSentLast7d,
            messageSentPrev7d: user.messageSentPrev7d,
            chatStartedLast7d: user.chatStartedLast7d,
            chatStartedPrev7d: user.chatStartedPrev7d,
            chatEndedLast7d: user.chatEndedLast7d,
            featureUsedLast7d: user.featureUsedLast7d,
            featureUsedPrev7d: user.featureUsedPrev7d,

            chatCompletionRateLast7d: user.chatCompletionRateLast7d,
            avgMessagesPerChatLast7d: user.avgMessagesPerChatLast7d,

            paywallViewedLast7d: user.paywallViewedLast7d,
            manageSubTappedLast30d: user.manageSubTappedLast30d,

            riskScore: user.riskScore,
            riskLevel: user.riskLevel,
            riskReasons: JSON.stringify(user.riskReasons),

            recencyScore: user.subScores.recencyScore,
            usageDropScore: user.subScores.usageDropScore,
            engagementQualityScore: user.subScores.engagementQualityScore,
            frictionScore: user.subScores.frictionScore,
            featureAdoptionLossScore: user.subScores.featureAdoptionLossScore,
          },
        });
      })
    );
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[ChurnScoring] Scored ${scoredUsers.length} users for project ${projectId} in ${durationMs}ms`
  );

  return {
    date: dateStr,
    usersScored: scoredUsers.length,
    byRiskLevel,
    durationMs,
  };
}
