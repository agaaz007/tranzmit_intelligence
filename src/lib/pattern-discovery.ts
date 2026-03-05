import { prisma } from '@/lib/prisma';
import { analyzePatterns, type PatternAnalysisInput, type AnalyzedPattern } from './pattern-analyzer';

interface DiscoveryResult {
  patternsCreated: number;
  patternsUpdated: number;
  errors: string[];
  debug?: {
    sessionsFound: number;
    sessionsWithAnalysis: number;
    frictionPointCount: number;
    interviewThemeCount: number;
    errorClusterCount: number;
    archetypeCount: number;
    llmPatternsReturned: number;
    sampleAnalysisKeys?: string[];
  };
}

async function gatherFrictionPoints(projectId: string) {
  const sessions = await prisma.session.findMany({
    where: { projectId, analysisStatus: 'completed' },
    select: { id: true, analysis: true },
  });

  console.log(`[Discover] Found ${sessions.length} completed sessions`);

  let withAnalysis = 0;
  let sampleKeys: string[] = [];
  const frictionMap = new Map<string, { count: number; sessionIds: string[] }>();

  for (const s of sessions) {
    if (!s.analysis) continue;
    let parsed;
    try { parsed = JSON.parse(s.analysis); } catch { continue; }
    withAnalysis++;

    // Log first session's analysis keys so we know the field names
    if (sampleKeys.length === 0) {
      sampleKeys = Object.keys(parsed);
      console.log(`[Discover] Sample analysis keys: ${sampleKeys.join(', ')}`);
    }

    // Try multiple field names for friction/frustration points
    const points = parsed.frustration_points || parsed.friction_points || parsed.frictionPoints || parsed.frustrationPoints || [];
    for (const fp of points) {
      const key = typeof fp === 'string' ? fp : (fp.issue || fp.description || fp.point || JSON.stringify(fp));
      const entry = frictionMap.get(key) || { count: 0, sessionIds: [] };
      entry.count++;
      if (!entry.sessionIds.includes(s.id)) entry.sessionIds.push(s.id);
      frictionMap.set(key, entry);
    }
  }

  console.log(`[Discover] ${withAnalysis} sessions have analysis, ${frictionMap.size} unique friction points`);

  return {
    points: Array.from(frictionMap.entries())
      .map(([issue, data]) => ({ issue, count: data.count, sessionIds: data.sessionIds }))
      .sort((a, b) => b.count - a.count),
    sessionsWithAnalysis: withAnalysis,
    sampleKeys,
  };
}

async function gatherInterviewThemes(projectId: string) {
  const interviews = await prisma.interview.findMany({
    where: { projectId },
    select: { id: true, insights: { select: { painPoints: true, themes: true } } },
  });

  console.log(`[Discover] Found ${interviews.length} interviews`);

  const themeMap = new Map<string, { count: number; sentiments: string[] }>();
  for (const i of interviews) {
    for (const insight of i.insights) {
      if (insight.painPoints) {
        let points;
        try { points = JSON.parse(insight.painPoints); } catch { continue; }
        for (const point of points) {
          const theme = point.point || point.theme || point;
          if (typeof theme !== 'string') continue;
          const entry = themeMap.get(theme) || { count: 0, sentiments: [] };
          entry.count++;
          if (point.severity) entry.sentiments.push(point.severity);
          themeMap.set(theme, entry);
        }
      }
      if (insight.themes) {
        let themes;
        try { themes = JSON.parse(insight.themes); } catch { continue; }
        for (const t of themes) {
          const theme = t.theme || t;
          if (typeof theme !== 'string') continue;
          const entry = themeMap.get(theme) || { count: 0, sentiments: [] };
          entry.count++;
          themeMap.set(theme, entry);
        }
      }
    }
  }

  console.log(`[Discover] ${themeMap.size} unique interview themes`);

  return Array.from(themeMap.entries())
    .map(([theme, data]) => ({
      theme,
      count: data.count,
      sentiment: data.sentiments.includes('high') || data.sentiments.includes('critical') ? 'negative' : 'neutral',
    }))
    .sort((a, b) => b.count - a.count);
}

async function gatherErrorClusters(projectId: string) {
  const errors = await prisma.userErrorEvent.groupBy({
    by: ['errorMessage'],
    where: { projectId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  });

  const clusters = [];
  for (const e of errors) {
    const userCount = await prisma.userErrorEvent.findMany({
      where: { projectId, errorMessage: e.errorMessage },
      select: { userProfileId: true },
      distinct: ['userProfileId'],
    });
    clusters.push({ message: e.errorMessage, count: e._count.id, userCount: userCount.length });
  }
  return clusters;
}

async function gatherArchetypes(projectId: string) {
  const archetypes = await prisma.churnArchetype.findMany({
    where: { projectId, isActive: true },
    select: { id: true, name: true, userCount: true, triggerEvents: true },
  });
  return archetypes.map(a => ({
    name: a.name,
    id: a.id,
    userCount: a.userCount,
    triggerEvents: a.triggerEvents ? JSON.parse(a.triggerEvents) : [],
  }));
}

function buildInterviewValidation(pattern: AnalyzedPattern, interviewThemes: Array<{ theme: string; count: number }>) {
  const matches = interviewThemes.filter(t => {
    const tLower = t.theme.toLowerCase();
    const pLower = pattern.title.toLowerCase();
    return tLower.includes(pLower.substring(0, 15)) || pLower.includes(tLower.substring(0, 15));
  });
  if (matches.length === 0) return null;
  return JSON.stringify({
    validated: true,
    matchingThemes: matches.map(m => m.theme),
    totalMentions: matches.reduce((sum, m) => sum + m.count, 0),
  });
}

export async function discoverPatterns(projectId: string, churnType?: 'unpaid' | 'paid' | null): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { patternsCreated: 0, patternsUpdated: 0, errors: [], debug: undefined };

  console.log(`[Discover] Starting discovery for project ${projectId}`);

  const [frictionData, interviewThemes, errorClusters, archetypeSummaries] = await Promise.all([
    gatherFrictionPoints(projectId),
    gatherInterviewThemes(projectId),
    gatherErrorClusters(projectId),
    gatherArchetypes(projectId),
  ]);

  const frictionPoints = frictionData.points;
  const totalUsers = await prisma.userProfile.count({ where: { projectId } });

  console.log(`[Discover] Data gathered: ${frictionPoints.length} friction, ${interviewThemes.length} themes, ${errorClusters.length} errors, ${archetypeSummaries.length} archetypes, ${totalUsers} profiles`);

  const input: PatternAnalysisInput = {
    frictionPoints,
    interviewThemes,
    errorClusters,
    archetypeSummaries,
    totalUsers,
    churnType,
  };

  let patterns: AnalyzedPattern[];
  try {
    console.log(`[Discover] Calling LLM...`);
    patterns = await analyzePatterns(input);
    console.log(`[Discover] LLM returned ${patterns.length} patterns`);
  } catch (e) {
    console.error(`[Discover] LLM failed:`, e);
    result.errors.push(`LLM analysis failed: ${e}`);
    result.debug = {
      sessionsFound: frictionData.sessionsWithAnalysis,
      sessionsWithAnalysis: frictionData.sessionsWithAnalysis,
      frictionPointCount: frictionPoints.length,
      interviewThemeCount: interviewThemes.length,
      errorClusterCount: errorClusters.length,
      archetypeCount: archetypeSummaries.length,
      llmPatternsReturned: 0,
      sampleAnalysisKeys: frictionData.sampleKeys,
    };
    return result;
  }

  for (const pattern of patterns) {
    const affectedArchetypes = archetypeSummaries
      .filter(a => pattern.evidence.some(e => e.source === 'archetype' && e.detail.toLowerCase().includes(a.name.toLowerCase())))
      .map(a => ({ archetypeId: a.id, archetypeName: a.name, count: a.userCount }));

    const sourceTypes = [...new Set(pattern.evidence.map(e => e.source))];
    const interviewValidation = buildInterviewValidation(pattern, interviewThemes);

    const data = {
      churnType: churnType || null,
      patternType: pattern.patternType,
      description: pattern.description,
      confidence: pattern.confidence,
      evidence: JSON.stringify(pattern.evidence),
      sourceTypes: JSON.stringify(sourceTypes),
      suggestion: pattern.suggestion || null,
      affectedArchetypes: affectedArchetypes.length > 0 ? JSON.stringify(affectedArchetypes) : null,
      priority: pattern.priority,
      status: 'new',
      interviewValidation,
      affectedUserCount: pattern.affectedUserCount,
    };

    const existing = await prisma.discoveredPattern.findFirst({
      where: { projectId, title: pattern.title },
    });

    if (existing) {
      await prisma.discoveredPattern.update({ where: { id: existing.id }, data });
      result.patternsUpdated++;
    } else {
      await prisma.discoveredPattern.create({ data: { projectId, title: pattern.title, ...data } });
      result.patternsCreated++;
    }
  }

  result.debug = {
    sessionsFound: frictionData.sessionsWithAnalysis,
    sessionsWithAnalysis: frictionData.sessionsWithAnalysis,
    frictionPointCount: frictionPoints.length,
    interviewThemeCount: interviewThemes.length,
    errorClusterCount: errorClusters.length,
    archetypeCount: archetypeSummaries.length,
    llmPatternsReturned: patterns.length,
    sampleAnalysisKeys: frictionData.sampleKeys,
  };

  console.log(`[Discover] Done: created=${result.patternsCreated}, updated=${result.patternsUpdated}`);
  return result;
}
