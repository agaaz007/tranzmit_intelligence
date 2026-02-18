"use client";

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, PlayCircle, Trash2, RefreshCw, Cloud, Upload, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
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
        // Refresh the list to show updated status
        fetchSessions();
      }
    } catch (err) {
      console.error('Failed to analyze session:', err);
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
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
        <p className="text-sm text-slate-500">Loading sessions...</p>
      </Card>
    );
  }

  if (sessions.length === 0 && !loading) {
    return (
      <Card className="p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <PlayCircle className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-900 mb-1">No Sessions Yet</h3>
        <p className="text-sm text-slate-500 mb-4">
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
          className="gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Session Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Source</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Date</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Duration</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">UX Rating</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <tr
                key={session.id}
                onClick={() => loadEventsAndSelect(session)}
                className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                  selectedSessionId === session.id ? 'bg-blue-50' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {loadingEvents === session.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    )}
                    <span className="font-medium text-slate-900 text-sm truncate max-w-[200px]">
                      {session.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={
                    session.source === 'posthog' ? 'border-blue-200 text-blue-700' :
                    session.source === 'mixpanel' ? 'border-orange-200 text-orange-700' :
                    session.source === 'amplitude' ? 'border-violet-200 text-violet-700' :
                    'border-emerald-200 text-emerald-700'
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
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDate(session.startTime || session.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatDuration(session.duration)}
                </td>
                <td className="px-4 py-3">
                  {session.analysisStatus === 'completed' ? (
                    <Badge className="bg-green-100 text-green-700 border-0">Analyzed</Badge>
                  ) : session.analysisStatus === 'analyzing' ? (
                    <Badge className="bg-blue-100 text-blue-700 border-0">
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      Analyzing
                    </Badge>
                  ) : session.analysisStatus === 'failed' ? (
                    <Badge className="bg-red-100 text-red-700 border-0">Failed</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-600 border-0">Pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {session.analysis?.ux_rating ? (
                    <span className={`font-semibold ${
                      session.analysis.ux_rating >= 7 ? 'text-green-600' :
                      session.analysis.ux_rating >= 4 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {session.analysis.ux_rating}/10
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {session.analysisStatus === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleAnalyze(session.id, e)}
                        className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        Analyze
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDelete(session.id, e)}
                      className="h-8 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50"
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
          <p className="text-sm text-slate-500">
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
            <span className="text-sm text-slate-600">
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
