import { prisma } from '@/lib/prisma';
import { createSentryClient, type SentryEvent } from './client';
import { resolveOrCreateProfile } from '@/lib/identity-resolver';

interface SentrySyncResult { issuesProcessed: number; errorsCreated: number; profilesUpdated: number; errors: string[]; }

function extractStackTrace(event: SentryEvent): string | null {
  for (const entry of event.entries) {
    if (entry.type !== 'exception' || !entry.data) continue;
    const data = entry.data as { values?: Array<{ type?: string; value?: string; stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineNo?: number; colNo?: number }> } }> };
    if (!data.values?.length) continue;
    const parts: string[] = [];
    for (const exc of data.values) {
      parts.push(`${exc.type || 'Error'}: ${exc.value || ''}`);
      for (const f of [...(exc.stacktrace?.frames || [])].reverse()) {
        parts.push(`    at ${f.function || '<anonymous>'} (${f.filename || '?'}:${f.lineNo ?? ''}:${f.colNo ?? ''})`);
      }
    }
    if (parts.length > 0) return parts.join('\n');
  }
  return null;
}

function classifyErrorType(event: SentryEvent): string {
  const mech = event.tags.find(t => t.key === 'mechanism');
  if (mech?.value === 'onunhandledrejection') return 'unhandled_rejection';
  if (mech?.value === 'onerror') return 'javascript';
  const text = `${event.title} ${event.message}`.toLowerCase();
  if (text.includes('fetch') || text.includes('network') || text.includes('api')) return 'api';
  return 'javascript';
}

export async function syncErrorsFromSentry(projectId: string): Promise<SentrySyncResult> {
  const result: SentrySyncResult = { issuesProcessed: 0, errorsCreated: 0, profilesUpdated: 0, errors: [] };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) { result.errors.push('Project not found'); return result; }
  if (!project.sentryAuthToken || !project.sentryOrgSlug || !project.sentryProjectSlug) { result.errors.push('Sentry not configured'); return result; }

  const client = createSentryClient({ authToken: project.sentryAuthToken, orgSlug: project.sentryOrgSlug, projectSlug: project.sentryProjectSlug });
  let issues;
  try { issues = await client.fetchIssues('is:unresolved', 50); } catch (e) { result.errors.push(`Fetch issues failed: ${e}`); return result; }

  const updatedProfiles = new Set<string>();
  for (const issue of issues) {
    result.issuesProcessed++;
    let events;
    try { events = await client.fetchIssueEvents(issue.id, 100); } catch (e) { result.errors.push(`Events for ${issue.id}: ${e}`); continue; }

    for (const event of events) {
      if (!event.user?.email && !event.user?.id) continue;
      const existing = await prisma.userErrorEvent.findFirst({ where: { projectId, sentryEventId: event.eventID } });
      if (existing) continue;

      try {
        const profile = await resolveOrCreateProfile(projectId, { email: event.user.email, distinctId: event.user.id, source: 'sentry', displayName: event.user.username });
        if (!profile) continue;
        if (!updatedProfiles.has(profile.id)) { updatedProfiles.add(profile.id); result.profilesUpdated++; }

        await prisma.userErrorEvent.create({
          data: { projectId, userProfileId: profile.id, sentryEventId: event.eventID, sentryIssueId: issue.id, errorType: classifyErrorType(event), errorMessage: event.title || event.message || 'Unknown', stackTrace: extractStackTrace(event), url: event.tags.find(t => t.key === 'url')?.value, occurredAt: new Date(event.dateCreated) },
        });
        result.errorsCreated++;
        await prisma.userProfile.update({ where: { id: profile.id }, data: { totalErrors: { increment: 1 } } });
      } catch (e) { result.errors.push(`Event ${event.eventID}: ${e}`); }
    }
  }
  return result;
}
