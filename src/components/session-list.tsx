"use client";

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, PlayCircle, Trash2, RefreshCw, Cloud, Upload, ChevronLeft, ChevronRight, BarChart3, Eye } from 'lucide-react';
import type { SessionListItem, SessionsListResponse, RRWebEvent } from '@/types/session';

interface SessionListProps {
  projectId: string;
  onSelectSession: (session: SessionListItem | null, events?: RRWebEvent[]) => void;
  selectedSessionId?: string;
  onSessionsChange?: () => void;
  distinctId?: string; // Filter sessions by PostHog distinct_id
}

export function SessionList({ projectId, onSelectSession, selectedSessionId, onSessionsChange, distinctId }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState<string | null>(null);
  const [eventsCache, setEventsCache] = useState<Map<string, RRWebEvent[]>>(new Map());
  const [filter, setFilter] = useState<'all' | 'upload' | 'posthog' | 'mixpanel'>('all');
  const limit = 20;

  const fetchSessions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        projectId,
        page: page.toString(),
        limit: limit.toString(),
        source: filter,
      });
      if (distinctId) {
        params.set('distinctId', distinctId);
      }
      const res = await fetch(`/api/sessions?${params}`);
      if (res.ok) {
        const data: SessionsListResponse = await res.json();
        setSessions(data.sessions);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, page, filter, distinctId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadEventsAndSelect = async (session: SessionListItem) => {
    // If already cached, use cache
    if (eventsCache.has(session.id)) {
      onSelectSession(session, eventsCache.get(session.id));
      return;
    }

    // Load events
    setLoadingEvents(session.id);
    try {
      const res = await fetch(`/api/sessions/${session.id}/events`);
      if (res.ok) {
        const { events } = await res.json();
        setEventsCache(prev => new Map(prev).set(session.id, events));
        onSelectSession(session, events);
      } else {
        onSelectSession(session, []);
      }
    } catch (err) {
      console.error('Failed to load events:', err);
      onSelectSession(session, []);
    } finally {
      setLoadingEvents(null);
    }
  };

  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session?')) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        setTotal(prev => prev - 1);
        if (selectedSessionId === sessionId) {
          onSelectSession(null);
        }
        onSessionsChange?.();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleAnalyze = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/sessions/${sessionId}/analyze`, { method: 'POST' });
      if (res.ok) {
        fetchSessions();
      }
    } catch (err) {
      console.error('Failed to analyze session:', err);
    }
  };

  const handleMultimodalAnalyze = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistically update the status
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, multimodalStatus: 'analyzing' as const } : s
    ));
    try {
      const res = await fetch(`/api/sessions/${sessionId}/multimodal-analyze`, { method: 'POST' });
      if (res.ok) {
        fetchSessions();
      } else {
        // Revert on failure
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, multimodalStatus: 'failed' as const } : s
        ));
      }
    } catch (err) {
      console.error('Failed to run multimodal analysis:', err);
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, multimodalStatus: 'failed' as const } : s
      ));
    }
  };

  const totalPages = Math.ceil(total / limit);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading && sessions.length === 0) {
    return (
      <Card className="p-8 text-center bg-[var(--card)] border-[var(--border)]">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--muted-foreground)]" />
        <p className="text-sm text-[var(--muted-foreground)]">Loading sessions...</p>
      </Card>
    );
  }

  if (sessions.length === 0 && !loading) {
    return (
      <Card className="p-8 text-center bg-[var(--card)] border-[var(--border)]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--muted)] flex items-center justify-center mx-auto mb-4">
          <PlayCircle className="w-8 h-8 text-[var(--muted-foreground)]" />
        </div>
        <h3 className="font-semibold text-[var(--foreground)] mb-1">No Sessions Yet</h3>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Upload session recordings or sync from PostHog to get started
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('all'); setPage(1); }}
          >
            All ({total})
          </Button>
          <Button
            variant={filter === 'upload' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('upload'); setPage(1); }}
            className="gap-1"
          >
            <Upload className="w-3 h-3" />
            Uploads
          </Button>
          <Button
            variant={filter === 'posthog' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('posthog'); setPage(1); }}
            className="gap-1"
          >
            <Cloud className="w-3 h-3" />
            PostHog
          </Button>
          <Button
            variant={filter === 'mixpanel' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter('mixpanel'); setPage(1); }}
            className="gap-1"
          >
            <BarChart3 className="w-3 h-3" />
            Mixpanel
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchSessions}
          disabled={loading}
          className="gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Session Table */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
            <tr>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">Source</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">Date</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">Duration</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">UX Rating</th>
              <th className="text-right text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sessions.map((session) => (
              <tr
                key={session.id}
                onClick={() => loadEventsAndSelect(session)}
                className={`cursor-pointer transition-colors ${
                  selectedSessionId === session.id
                    ? 'bg-blue-500/10 dark:bg-blue-500/15'
                    : 'hover:bg-[var(--muted)]/40'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {loadingEvents === session.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    )}
                    <span className="font-medium text-[var(--foreground)] text-sm truncate max-w-[200px]">
                      {session.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={
                    session.source === 'posthog' ? 'border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5' :
                    session.source === 'mixpanel' ? 'border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/5' :
                    session.source === 'amplitude' ? 'border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/5' :
                    'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  }>
                    {session.source === 'posthog' ? (
                      <><Cloud className="w-3 h-3 mr-1" />PostHog</>
                    ) : session.source === 'mixpanel' ? (
                      <><BarChart3 className="w-3 h-3 mr-1" />Mixpanel</>
                    ) : session.source === 'amplitude' ? (
                      <><BarChart3 className="w-3 h-3 mr-1" />Amplitude</>
                    ) : (
                      <><Upload className="w-3 h-3 mr-1" />Upload</>
                    )}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {formatDate(session.startTime || session.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                  {formatDuration(session.duration)}
                </td>
                <td className="px-4 py-3">
                  {session.analysisStatus === 'completed' ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Analyzed</Badge>
                  ) : session.analysisStatus === 'analyzing' ? (
                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      Analyzing
                    </Badge>
                  ) : session.analysisStatus === 'failed' ? (
                    <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">Failed</Badge>
                  ) : (
                    <Badge className="bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]">Pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {session.analysis?.ux_rating ? (
                    <span className={`font-semibold text-sm ${
                      session.analysis.ux_rating >= 7 ? 'text-emerald-600 dark:text-emerald-400' :
                      session.analysis.ux_rating >= 4 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {session.analysis.ux_rating}/10
                    </span>
                  ) : (
                    <span className="text-[var(--foreground-subtle)]">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {session.analysisStatus === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleAnalyze(session.id, e)}
                        className="h-8 px-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-500/10"
                      >
                        Analyze
                      </Button>
                    )}
                    {session.analysisStatus === 'completed' && session.multimodalStatus !== 'completed' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleMultimodalAnalyze(session.id, e)}
                        disabled={session.multimodalStatus === 'analyzing'}
                        className="h-8 px-2 gap-1 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-500/10"
                      >
                        {session.multimodalStatus === 'analyzing' ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                        ) : (
                          <><Eye className="w-3 h-3" /> Multimodal</>
                        )}
                      </Button>
                    )}
                    {session.multimodalStatus === 'completed' && (
                      <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-xs">
                        <Eye className="w-3 h-3 mr-1" />
                        MM
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDelete(session.id, e)}
                      className="h-8 px-2 text-[var(--muted-foreground)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-[var(--muted-foreground)]">
            Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-[var(--muted-foreground)]">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
