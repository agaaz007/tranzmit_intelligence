import { prisma } from '@/lib/prisma';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const BaseArchetypeFields = z.object({
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  behavioral_signature: z.object({
    engagement_pattern: z.string(),
    frustration_level: z.string(),
    trigger_events: z.array(z.string()),
    session_pattern: z.string(),
  }),
  product_fixes: z.array(z.string()),
  interview_questions: z.array(z.string()),
  color: z.string().describe("Hex color code like #FF6B6B"),
  icon: z.string().describe("Lucide icon name like 'ghost', 'eye-off', 'shopping-cart'"),
});

export const UnpaidArchetypeSchema = z.object({
  archetypes: z.array(BaseArchetypeFields.extend({ conversion_blockers: z.array(z.string()) })),
});

export const PaidArchetypeSchema = z.object({
  archetypes: z.array(BaseArchetypeFields.extend({ recovery_strategy: z.string() })),
});

interface BehavioralSummary {
  engagement_pattern?: string;
  frustration_level?: string;
  drop_off_points?: string[];
  [key: string]: unknown;
}

interface ProfileForClustering {
  id: string;
  behavioralSummary: BehavioralSummary;
  engagementScore: number;
  frustrationScore: number;
  totalSessions: number;
  totalErrors: number;
}

interface Cluster {
  label: string;
  profiles: ProfileForClustering[];
  centroid: { avgEngagement: number; avgFrustration: number; avgSessions: number };
}

function parseSummary(raw: string | null): BehavioralSummary {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function precluster(profiles: ProfileForClustering[]): Cluster[] {
  const buckets = new Map<string, ProfileForClustering[]>();
  for (const p of profiles) {
    const eng = p.engagementScore < 20 ? 'disengaged' : p.engagementScore < 50 ? 'low' : 'moderate';
    const fru = p.frustrationScore < 25 ? 'calm' : p.frustrationScore < 50 ? 'mild' : 'frustrated';
    const sess = p.totalSessions <= 2 ? 'fleeting' : p.totalSessions <= 8 ? 'moderate' : 'heavy';
    const key = `${eng}|${fru}|${sess}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  const clusters: Cluster[] = [];
  const orphans: ProfileForClustering[] = [];
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  for (const [label, members] of buckets) {
    if (members.length < 2) { orphans.push(...members); continue; }
    clusters.push({ label, profiles: members, centroid: { avgEngagement: avg(members.map(p => p.engagementScore)), avgFrustration: avg(members.map(p => p.frustrationScore)), avgSessions: avg(members.map(p => p.totalSessions)) } });
  }
  for (const o of orphans) {
    let nearest = clusters[0]; let minDist = Infinity;
    for (const c of clusters) { const d = Math.abs(o.engagementScore - c.centroid.avgEngagement) + Math.abs(o.frustrationScore - c.centroid.avgFrustration); if (d < minDist) { minDist = d; nearest = c; } }
    if (nearest) nearest.profiles.push(o);
  }
  if (clusters.length === 0 && profiles.length > 0) {
    clusters.push({ label: 'all', profiles, centroid: { avgEngagement: avg(profiles.map(p => p.engagementScore)), avgFrustration: avg(profiles.map(p => p.frustrationScore)), avgSessions: avg(profiles.map(p => p.totalSessions)) } });
  }
  return clusters;
}

export async function generateArchetypes(projectId: string, churnType: 'unpaid' | 'paid') {
  const targetUserType = churnType === 'unpaid' ? 'trial' : 'paid';
  const rawProfiles = await prisma.userProfile.findMany({
    where: { projectId, userType: targetUserType, riskLevel: { in: ['high', 'churned'] } },
    select: { id: true, behavioralSummary: true, engagementScore: true, frustrationScore: true, totalSessions: true, totalErrors: true },
  });
  if (rawProfiles.length === 0) return [];

  const profiles: ProfileForClustering[] = rawProfiles.map(p => ({ id: p.id, behavioralSummary: parseSummary(p.behavioralSummary), engagementScore: p.engagementScore, frustrationScore: p.frustrationScore, totalSessions: p.totalSessions, totalErrors: p.totalErrors }));
  const clusters = precluster(profiles);

  const clusterDesc = clusters.map(c => {
    const samples = c.profiles.slice(0, 10).map(p => { const bs = p.behavioralSummary; return `  - eng:${bs.engagement_pattern || '?'}, fru:${bs.frustration_level || '?'}, drops:${(bs.drop_off_points || []).join(',')}` }).join('\n');
    return `Cluster "${c.label}" (${c.profiles.length} users, avgEng:${c.centroid.avgEngagement.toFixed(1)}, avgFru:${c.centroid.avgFrustration.toFixed(1)}):\n${samples}`;
  }).join('\n\n');

  const directive = churnType === 'unpaid'
    ? 'These are trial users who never converted. Name each cluster as a memorable persona. Focus on what blocked conversion.'
    : 'These are paying customers who cancelled. Name each cluster as a memorable persona. Focus on what drove them away.';

  const schema = churnType === 'unpaid' ? UnpaidArchetypeSchema : PaidArchetypeSchema;
  const { object } = await generateObject({
    model: openai('gpt-5.2-chat-latest'), schema,
    system: `You are a senior product analyst generating churn archetypes. Create distinct, memorable personas. Generate exactly ${clusters.length} archetypes.`,
    prompt: `${directive}\n\n${clusters.length} clusters from ${rawProfiles.length} users:\n\n${clusterDesc}`,
  });

  const archetypes = [];
  for (const g of object.archetypes) {
    const data = {
      churnType, tagline: g.tagline, description: g.description,
      behavioralSignature: JSON.stringify(g.behavioral_signature),
      triggerEvents: JSON.stringify(g.behavioral_signature.trigger_events),
      conversionBlockers: 'conversion_blockers' in g ? JSON.stringify(g.conversion_blockers) : null,
      recoveryStrategy: 'recovery_strategy' in g ? g.recovery_strategy : null,
      interviewQuestions: JSON.stringify(g.interview_questions),
      productFixes: JSON.stringify(g.product_fixes),
      color: g.color, icon: g.icon,
    };
    archetypes.push(await prisma.churnArchetype.upsert({
      where: { projectId_name: { projectId, name: g.name } },
      create: { projectId, name: g.name, ...data },
      update: data,
    }));
  }

  // Assign profiles
  for (const p of profiles) {
    const best = matchArchetype(p, archetypes.map((a, i) => ({ id: a.id, sig: JSON.parse(a.behavioralSignature), centroid: clusters[i]?.centroid })));
    if (best) await prisma.userProfile.update({ where: { id: p.id }, data: { archetypeId: best } });
  }
  for (const a of archetypes) {
    const count = await prisma.userProfile.count({ where: { archetypeId: a.id } });
    await prisma.churnArchetype.update({ where: { id: a.id }, data: { userCount: count } });
  }
  return prisma.churnArchetype.findMany({ where: { id: { in: archetypes.map(a => a.id) } }, orderBy: { userCount: 'desc' } });
}

function matchArchetype(profile: ProfileForClustering, sigs: Array<{ id: string; sig: { engagement_pattern: string; frustration_level: string }; centroid?: { avgEngagement: number; avgFrustration: number } }>): string | null {
  let bestId: string | null = null; let bestScore = -Infinity;
  for (const { id, sig, centroid } of sigs) {
    let score = 0; const bs = profile.behavioralSummary;
    if (bs.engagement_pattern) score += wordOverlap(bs.engagement_pattern, sig.engagement_pattern) * 3;
    if (bs.frustration_level) score += wordOverlap(bs.frustration_level, sig.frustration_level) * 2;
    if (centroid) score += Math.max(0, 50 - Math.abs(profile.engagementScore - centroid.avgEngagement) - Math.abs(profile.frustrationScore - centroid.avgFrustration)) / 10;
    if (score > bestScore) { bestScore = score; bestId = id; }
  }
  return bestId;
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  let n = 0; for (const w of wa) if (wb.has(w)) n++;
  return n;
}

export async function assignProfileToArchetype(profileId: string): Promise<void> {
  const p = await prisma.userProfile.findUnique({ where: { id: profileId }, select: { id: true, projectId: true, userType: true, behavioralSummary: true, engagementScore: true, frustrationScore: true, totalSessions: true, totalErrors: true, archetypeId: true } });
  if (!p) return;
  const churnType = p.userType === 'paid' ? 'paid' : 'unpaid';
  const archetypes = await prisma.churnArchetype.findMany({ where: { projectId: p.projectId, churnType, isActive: true } });
  if (archetypes.length === 0) return;
  const pf: ProfileForClustering = { id: p.id, behavioralSummary: parseSummary(p.behavioralSummary), engagementScore: p.engagementScore, frustrationScore: p.frustrationScore, totalSessions: p.totalSessions, totalErrors: p.totalErrors };
  const best = matchArchetype(pf, archetypes.map(a => ({ id: a.id, sig: JSON.parse(a.behavioralSignature) })));
  if (best && best !== p.archetypeId) {
    await prisma.userProfile.update({ where: { id: profileId }, data: { archetypeId: best } });
    if (p.archetypeId) { const c = await prisma.userProfile.count({ where: { archetypeId: p.archetypeId } }); await prisma.churnArchetype.update({ where: { id: p.archetypeId }, data: { userCount: c } }); }
    const c = await prisma.userProfile.count({ where: { archetypeId: best } }); await prisma.churnArchetype.update({ where: { id: best }, data: { userCount: c } });
  }
}
