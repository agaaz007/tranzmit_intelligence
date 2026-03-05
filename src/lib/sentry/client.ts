export interface SentryClientConfig { authToken: string; orgSlug: string; projectSlug: string; }
export interface SentryIssue { id: string; title: string; culprit: string; type: string; count: string; userCount: number; firstSeen: string; lastSeen: string; level: string; status: string; }
export interface SentryEvent { eventID: string; title: string; message: string; dateCreated: string; user?: { email?: string; id?: string; username?: string }; tags: Array<{ key: string; value: string }>; entries: Array<{ type: string; data: unknown }>; context?: Record<string, unknown>; }

const BASE = 'https://sentry.io/api/0';

export function createSentryClient(config: SentryClientConfig) {
  const headers: HeadersInit = { Authorization: `Bearer ${config.authToken}`, 'Content-Type': 'application/json' };

  async function get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers });
    if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`Sentry ${res.status}: ${body}`); }
    return res.json() as Promise<T>;
  }

  return {
    fetchIssues: (query?: string, limit = 25) => {
      const p = new URLSearchParams({ limit: String(limit) }); if (query) p.set('query', query);
      return get<SentryIssue[]>(`${BASE}/projects/${config.orgSlug}/${config.projectSlug}/issues/?${p}`);
    },
    fetchIssueEvents: (issueId: string, limit = 100) => get<SentryEvent[]>(`${BASE}/issues/${issueId}/events/?limit=${limit}`),
    fetchIssue: (issueId: string) => get<SentryIssue>(`${BASE}/issues/${issueId}/`),
  };
}
