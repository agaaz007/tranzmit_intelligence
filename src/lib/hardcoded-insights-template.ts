import type { SynthesizedInsightData } from '@/types/session';

/**
 * Hardcoded insights template - fill in your data below.
 * This can be imported and used to override the auto-generated insights.
 */
export const hardcodedInsights: SynthesizedInsightData = {
  id: "hardcoded-001",
  projectId: "", // Fill with your project ID
  sessionCount: 0, // Total number of sessions analyzed

  criticalIssues: [
    {
      title: "", // Issue title
      description: "", // Detailed description of the issue
      frequency: "", // e.g., "8 of 25 sessions (32%)"
      severity: "critical", // 'critical' | 'high' | 'medium'
      recommendation: "", // What to do about it
      sessionIds: [], // DB IDs of sessions with this issue (for linking)
      sessionNames: [], // Human-readable session names
    },
    // Add more issues as needed...
  ],

  patternSummary: "", // Overall summary paragraph of patterns observed

  topUserGoals: [
    { goal: "", success_rate: "" }, // e.g., { goal: "Complete a purchase", success_rate: "68%" }
    // Add more goals...
  ],

  immediateActions: [
    "", // Action item 1
    "", // Action item 2
    // Add more actions...
  ],

  lastSyncedAt: new Date().toISOString(),
  lastAnalyzedAt: new Date().toISOString(),
  lastSynthesizedAt: new Date().toISOString(),
  syncStatus: "complete",
  syncError: null,
};
