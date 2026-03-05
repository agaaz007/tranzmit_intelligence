'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  X,
  FileText,
  Loader2,
  UserX,
  Clock,
  Star,
  AlertTriangle,
  CheckCircle2,
  PlayCircle,
  Pause,
  Play,
  Timer,
} from 'lucide-react';
import { IssuesPanel } from '@/components/issues-panel';
import { SessionPlayer } from '@/components/session-player';
import type { SynthesizedInsightData, RRWebEvent } from '@/types/session';

interface EmailResult {
  email: string;
  status: string;
  recordingCount: number;
  personName: string | null;
}

interface Batch {
  id: string;
  fileName: string | null;
  totalEmails: number;
  processedEmails: number;
  emailsFound: number;
  emailsNotFound: number;
  sessionsImported: number;
  status: string;
  emailResults: string | null;
  error: string | null;
  rateLimitedUntil: string | null;
  createdAt: string;
}

interface ChurnedSession {
  id: string;
  name: string;
  source: string;
  distinctId: string | null;
  startTime: string | null;
  endTime: string | null;
  duration: number | null;
  eventCount: number;
  analysis: {
    summary?: string;
    user_intent?: string;
    ux_rating?: number;
    frustration_points?: Array<{ timestamp: string; issue: string }>;
    went_well?: string[];
    tags?: string[];
    description?: string;
  } | null;
  analysisStatus: string;
  analyzedAt: string | null;
  metadata: {
    batchId?: string;
    email?: string;
    personName?: string;
  } | null;
  createdAt: string;
}

export default function ChurnedSessionsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sessions, setSessions] = useState<ChurnedSession[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ChurnedSession | null>(null);
  const [page, setPage] = useState(1);
  const [filterBatchId, setFilterBatchId] = useState<string | null>(null);
  const [churnedInsights, setChurnedInsights] = useState<SynthesizedInsightData | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [lastSynthesizedAt, setLastSynthesizedAt] = useState<Date | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [replayEvents, setReplayEvents] = useState<RRWebEvent[]>([]);
  const [isLoadingReplay, setIsLoadingReplay] = useState(false);

  const handleSessionReplay = useCallback(async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    setSelectedSession(session);
    setReplayEvents([]);
    setIsLoadingReplay(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/events`);
      if (res.ok) {
        const data = await res.json();
        setReplayEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to load session events:', err);
    } finally {
      setIsLoadingReplay(false);
    }
  }, [sessions]);

  const synthesizeChurnedInsights = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;

    setIsSynthesizing(true);
    try {
      const res = await fetch('/api/churned-sessions/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setChurnedInsights(data);
        setLastSynthesizedAt(new Date());
      }
    } catch (err) {
      console.error('Failed to synthesize churned insights:', err);
    } finally {
      setIsSynthesizing(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;

    try {
      const res = await fetch(`/api/churned-sessions/batches?projectId=${projectId}`);
      const data = await res.json();
      setBatches(data.batches || []);
    } catch (err) {
      console.error('Failed to load batches:', err);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;

    try {
      let url = `/api/churned-sessions?projectId=${projectId}&page=${page}&limit=20`;
      if (filterBatchId) {
        url += `&batchId=${filterBatchId}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setSessions(data.sessions || []);
      setTotalSessions(data.total || 0);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, [page, filterBatchId]);

  useEffect(() => {
    Promise.all([loadBatches(), loadSessions()]).finally(() => setIsLoading(false));
  }, [loadBatches, loadSessions]);

  // Auto-synthesize when we have analyzed sessions but no insights yet
  useEffect(() => {
    const analyzedCount = sessions.filter(s => s.analysisStatus === 'completed').length;
    if (analyzedCount > 0 && !churnedInsights && !isSynthesizing && !isLoading) {
      synthesizeChurnedInsights();
    }
  }, [sessions, churnedInsights, isSynthesizing, isLoading, synthesizeChurnedInsights]);

  // Check if any batch is actively processing
  const hasActiveBatch = batches.some(
    (b) => b.status === 'processing' || b.status === 'pending'
  );

  // Poll for updates while any batch is processing or analysis is running
  useEffect(() => {
    if (!hasActiveBatch && !isAnalyzing) return;
    const interval = setInterval(() => {
      loadBatches();
      loadSessions();
    }, 5000);
    return () => clearInterval(interval);
  }, [hasActiveBatch, isAnalyzing, loadBatches, loadSessions]);

  // Detect when analysis finishes (no more pending sessions)
  const pendingAnalysisCount = sessions.filter(s => s.analysisStatus === 'pending').length;
  useEffect(() => {
    if (isAnalyzing && pendingAnalysisCount === 0) {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, pendingAnalysisCount]);

  const handleUploadComplete = async (batchId: string) => {
    setShowUploadModal(false);
    await loadBatches();
    // Fire-and-forget: trigger backend processing, it continues via after() + cron
    fetch('/api/churned-sessions/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId }),
    }).catch((err) => console.error('Failed to trigger processing:', err));
  };

  const handleStopBatch = async (batchId: string) => {
    try {
      await fetch('/api/churned-sessions/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      await loadBatches();
    } catch (err) {
      console.error('Failed to stop batch:', err);
    }
  };

  const handleRunAnalysis = async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId || isAnalyzing) return;

    setIsAnalyzing(true);
    try {
      await fetch('/api/churned-sessions/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
    } catch (err) {
      console.error('Failed to trigger analysis:', err);
    }
    // Don't setIsAnalyzing(false) here — let polling detect when sessions flip to analyzed
  };

  const handleResumeBatch = async (batchId: string) => {
    try {
      await fetch('/api/churned-sessions/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      await loadBatches();
    } catch (err) {
      console.error('Failed to resume batch:', err);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 7) return 'text-emerald-500';
    if (rating >= 4) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Churned Sessions</h1>
          <p className="text-[var(--foreground-muted)] mt-1">
            Analyze session recordings from churned users
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload CSV
        </button>
      </div>

      {/* Processing Progress Banners */}
      {batches
        .filter((b) => b.status === 'processing' || b.status === 'pending')
        .map((batch) => (
          <motion.div
            key={batch.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4 mb-6 border-l-4 border-l-[var(--brand-primary)]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-primary)]" />
                <span className="font-medium text-[var(--foreground)]">
                  Processing {batch.fileName || 'churned users'}...
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--foreground-muted)]">
                  {batch.processedEmails} / {batch.totalEmails} emails
                </span>
                <button
                  onClick={() => handleStopBatch(batch.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--muted)] hover:bg-[var(--border)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                >
                  <Pause className="w-3 h-3" />
                  Stop
                </button>
              </div>
            </div>
            <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--brand-primary)] transition-all duration-300"
                style={{
                  width: `${batch.totalEmails > 0 ? (batch.processedEmails / batch.totalEmails) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-[var(--foreground-muted)]">
              <span>{batch.emailsFound} users found in PostHog</span>
              <span>{batch.sessionsImported} sessions imported</span>
              {batch.rateLimitedUntil && new Date(batch.rateLimitedUntil) > new Date() && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <Timer className="w-3 h-3" />
                  Rate limited — will resume automatically
                </span>
              )}
            </div>
          </motion.div>
        ))}

      {/* Issues Overview Panel */}
      <IssuesPanel
        insights={churnedInsights}
        isLoading={isLoadingInsights || isSynthesizing}
        onSessionClick={handleSessionReplay}
        onRefresh={synthesizeChurnedInsights}
        isRefreshing={isSynthesizing}
        lastSyncTime={lastSynthesizedAt}
      />

      {/* Stats Cards */}
      {batches.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
            <div className="text-2xl font-bold text-[var(--foreground)]">{totalSessions}</div>
            <div className="text-sm text-[var(--foreground-muted)]">Total Sessions</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-4">
            <div className="text-2xl font-bold text-[var(--info)]">{batches.length}</div>
            <div className="text-sm text-[var(--foreground-muted)]">CSV Batches</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-4">
            <div className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">
              {sessions.filter((s) => s.analysisStatus === 'completed').length}
            </div>
            <div className="text-sm text-[var(--foreground-muted)]">Analyzed</div>
            {pendingAnalysisCount > 0 && (
              <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-[var(--brand-primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-3 h-3" />
                    Analyze {pendingAnalysisCount} pending
                  </>
                )}
              </button>
            )}
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card p-4">
            <div className="text-2xl font-bold text-purple-500 dark:text-purple-400">
              {batches.reduce((sum, b) => sum + b.emailsFound, 0)}
            </div>
            <div className="text-sm text-[var(--foreground-muted)]">Users Found</div>
          </motion.div>
        </div>
      )}

      {/* Batches Section */}
      {batches.length > 0 && (
        <div className="space-y-4 mb-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Upload Batches</h2>
          {batches.map((batch) => {
            let emailResults: EmailResult[] = [];
            try {
              emailResults = batch.emailResults ? JSON.parse(batch.emailResults) : [];
            } catch { /* ignore */ }

            return (
              <div key={batch.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-[var(--foreground)]">
                      {batch.fileName || 'CSV Upload'}
                    </span>
                    <span className="text-sm text-[var(--foreground-muted)] ml-3">
                      {new Date(batch.createdAt).toLocaleDateString()} — {batch.totalEmails} emails
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      batch.status === 'completed' ? 'bg-[var(--success-bg)] text-[var(--success)]' :
                      batch.status === 'processing' ? 'bg-[var(--info-bg)] text-[var(--info)]' :
                      batch.status === 'paused' ? 'bg-yellow-500/15 text-yellow-500' :
                      batch.status === 'failed' ? 'bg-[var(--error-bg)] text-[var(--error)]' :
                      'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }`}>
                      {batch.status}
                    </span>
                    {batch.status === 'processing' && (
                      <button
                        onClick={() => handleStopBatch(batch.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--muted)] hover:bg-[var(--border)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                      >
                        <Pause className="w-3 h-3" />
                        Stop
                      </button>
                    )}
                    {(batch.status === 'paused' || batch.status === 'failed') && (
                      <button
                        onClick={() => handleResumeBatch(batch.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--muted)] hover:bg-[var(--border)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        Resume
                      </button>
                    )}
                    {batch.status === 'completed' && (
                      <button
                        onClick={() => handleResumeBatch(batch.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--muted)] hover:bg-[var(--border)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reprocess
                      </button>
                    )}
                    <button
                      onClick={() => { setFilterBatchId(filterBatchId === batch.id ? null : batch.id); setPage(1); }}
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                        filterBatchId === batch.id
                          ? 'bg-[var(--brand-primary)] text-white'
                          : 'bg-[var(--muted)] hover:bg-[var(--border)] text-[var(--foreground-muted)]'
                      }`}
                    >
                      <Search className="w-3 h-3" />
                      {filterBatchId === batch.id ? 'Showing' : 'Filter'}
                    </button>
                  </div>
                </div>
                {/* Batch stats */}
                <div className="flex items-center gap-6 text-sm text-[var(--foreground-muted)]">
                  <span>Processed: {batch.processedEmails}/{batch.totalEmails}</span>
                  <span className="text-emerald-500">Found: {batch.emailsFound}</span>
                  <span className="text-[var(--foreground-subtle)]">Not found: {batch.emailsNotFound}</span>
                  <span className="text-[var(--brand-primary)]">Sessions: {batch.sessionsImported}</span>
                </div>
                {/* Per-email results (collapsed by default, show first few) */}
                {emailResults.length > 0 && (
                  <BatchEmailResults emailResults={emailResults} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sessions Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[var(--foreground-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center">
            <UserX className="w-12 h-12 mx-auto text-[var(--foreground-subtle)] mb-4" />
            <div className="text-[var(--foreground-muted)] mb-2">No churned sessions yet</div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="text-[var(--brand-primary)] hover:underline text-sm"
            >
              Upload a CSV of churned user emails
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="table-header border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Email / Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">UX Rating</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--foreground)]">
                      {session.metadata?.email || session.distinctId || 'Unknown'}
                    </div>
                    {session.metadata?.personName && (
                      <div className="text-sm text-[var(--foreground-muted)]">
                        {session.metadata.personName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--foreground-muted)]">
                    {session.startTime
                      ? new Date(session.startTime).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--foreground-muted)]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(session.duration)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {session.analysis?.ux_rating ? (
                      <div className={`flex items-center gap-1 font-semibold ${getRatingColor(session.analysis.ux_rating)}`}>
                        <Star className="w-3.5 h-3.5" />
                        {session.analysis.ux_rating}/10
                      </div>
                    ) : (
                      <span className="text-sm text-[var(--foreground-subtle)]">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        session.analysisStatus === 'completed'
                          ? 'bg-[var(--success-bg)] text-[var(--success)]'
                          : session.analysisStatus === 'analyzing'
                          ? 'bg-[var(--info-bg)] text-[var(--info)]'
                          : session.analysisStatus === 'failed'
                          ? 'bg-[var(--error-bg)] text-[var(--error)]'
                          : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      {session.analysisStatus === 'completed'
                        ? 'Analyzed'
                        : session.analysisStatus === 'analyzing'
                        ? 'Analyzing'
                        : session.analysisStatus === 'failed'
                        ? 'Failed'
                        : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleSessionReplay(session.id)}
                        className="p-2 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                        title="View replay"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalSessions > 20 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--border)] disabled:opacity-50 hover:bg-[var(--muted)]"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--foreground-muted)]">
            Page {page} of {Math.ceil(totalSessions / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(totalSessions / 20)}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--border)] disabled:opacity-50 hover:bg-[var(--muted)]"
          >
            Next
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {/* Session Replay Panel */}
      {selectedSession && (
        <SessionReplayPanel
          session={selectedSession}
          events={replayEvents}
          isLoading={isLoadingReplay}
          onClose={() => { setSelectedSession(null); setReplayEvents([]); }}
        />
      )}
    </div>
  );
}

// Upload Modal Component
function UploadModal({
  onClose,
  onUploadComplete,
}: {
  onClose: () => void;
  onUploadComplete: (batchId: string) => void;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        setError('CSV must have headers and at least one data row');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const emailIndex = headers.findIndex((h) => h === 'email');
      if (emailIndex === -1) {
        setError('CSV must have an "email" column');
        return;
      }

      const parsedEmails = lines
        .slice(1)
        .map((line) => {
          const values = line.split(',').map((v) => v.trim());
          return values[emailIndex];
        })
        .filter((email) => email && email.includes('@'));

      if (parsedEmails.length === 0) {
        setError('No valid emails found in CSV');
        return;
      }

      setEmails(parsedEmails);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) {
      setError('No project selected');
      return;
    }

    setIsUploading(true);
    try {
      const response = await fetch('/api/churned-sessions/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, emails, fileName }),
      });

      if (response.ok) {
        const data = await response.json();
        onUploadComplete(data.batchId);
      } else {
        const data = await response.json();
        setError(data.error || 'Upload failed');
      }
    } catch {
      setError('Failed to upload');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--card)] rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col border border-[var(--border)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Upload Churned User Emails</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-[var(--error-bg)] border border-[var(--error)]/20 rounded-lg mb-4 text-sm text-[var(--error)]">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {emails.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-12 text-center">
            <Upload className="w-12 h-12 mx-auto text-[var(--foreground-subtle)] mb-4" />
            <p className="text-[var(--foreground-muted)] mb-2">Upload a CSV file with churned user emails</p>
            <p className="text-sm text-[var(--foreground-subtle)] mb-4">
              CSV must have an &quot;email&quot; column
            </p>
            <label className="inline-block px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg cursor-pointer hover:opacity-90 transition-opacity">
              Choose File
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-[var(--foreground-muted)]">
                <CheckCircle className="w-4 h-4 inline mr-1 text-[var(--success)]" />
                {emails.length} emails found in {fileName}
              </span>
              <button onClick={() => setEmails([])} className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg mb-4 max-h-60">
              <div className="divide-y divide-[var(--border)]">
                {emails.slice(0, 20).map((email, i) => (
                  <div key={i} className="px-3 py-2 text-sm text-[var(--foreground)]">
                    {email}
                  </div>
                ))}
              </div>
              {emails.length > 20 && (
                <div className="px-3 py-2 text-sm text-[var(--foreground-muted)] bg-[var(--muted)] border-t border-[var(--border)]">
                  + {emails.length - 20} more emails
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </span>
                ) : (
                  `Upload & Process ${emails.length} Emails`
                )}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// Session Replay Panel Component
function SessionReplayPanel({
  session,
  events,
  isLoading,
  onClose,
}: {
  session: ChurnedSession;
  events: RRWebEvent[];
  isLoading: boolean;
  onClose: () => void;
}) {
  const analysis = session.analysis;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-[var(--card)] shadow-2xl z-50 overflow-y-auto border-l border-[var(--border)]">
      <div className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
        <div>
          <h3 className="font-semibold text-lg text-[var(--foreground)]">
            {session.metadata?.email || session.name}
          </h3>
          <div className="flex items-center gap-3 mt-0.5">
            {session.metadata?.personName && (
              <span className="text-sm text-[var(--foreground-muted)]">{session.metadata.personName}</span>
            )}
            {session.startTime && (
              <span className="text-xs text-[var(--foreground-subtle)]">
                {new Date(session.startTime).toLocaleString()}
              </span>
            )}
            {session.duration && (
              <span className="text-xs text-[var(--foreground-subtle)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {Math.floor(session.duration / 60)}m {session.duration % 60}s
              </span>
            )}
            {analysis?.ux_rating && (
              <span className={`text-xs font-semibold flex items-center gap-1 ${
                analysis.ux_rating >= 7 ? 'text-emerald-500' :
                analysis.ux_rating >= 4 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                <Star className="w-3 h-3" />
                {analysis.ux_rating}/10
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Replay Viewer */}
        <div>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center bg-[var(--muted)] rounded-lg border border-dashed border-[var(--border)] py-16">
              <Loader2 className="w-10 h-10 text-[var(--foreground-subtle)] mb-3 animate-spin" />
              <p className="text-sm text-[var(--foreground-muted)]">Loading session replay...</p>
            </div>
          ) : events.length > 0 ? (
            <SessionPlayer key={session.id} events={events} autoPlay={false} />
          ) : (
            <div className="flex flex-col items-center justify-center bg-[var(--muted)] rounded-lg border border-dashed border-[var(--border)] py-16">
              <PlayCircle className="w-10 h-10 text-[var(--foreground-subtle)] mb-3" />
              <p className="text-sm text-[var(--foreground-muted)]">No replay events available for this session</p>
            </div>
          )}
        </div>

        {/* Analysis below replay */}
        {analysis ? (
          <>
            {analysis.summary && (
              <div>
                <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Summary</h4>
                <div className="bg-[var(--muted)] rounded-lg p-4">
                  <p className="text-sm text-[var(--foreground)]">{analysis.summary}</p>
                </div>
              </div>
            )}

            {analysis.user_intent && (
              <div>
                <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">User Intent</h4>
                <div className="bg-[var(--muted)] rounded-lg p-4">
                  <p className="text-sm text-[var(--brand-primary)] font-medium">
                    &ldquo;{analysis.user_intent}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {analysis.tags && analysis.tags.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-1 rounded-full text-xs font-medium bg-[var(--muted)] text-[var(--foreground-muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.frustration_points && analysis.frustration_points.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-red-500 uppercase mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Friction Points
                </h4>
                <div className="space-y-2">
                  {analysis.frustration_points.map((fp, i) => (
                    <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
                          {fp.timestamp}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--foreground)]">{fp.issue}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.went_well && analysis.went_well.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-emerald-500 uppercase mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Went Well
                </h4>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                  <ul className="list-disc list-inside space-y-1 text-sm text-[var(--foreground)]">
                    {analysis.went_well.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        ) : session.analysisStatus === 'analyzing' ? (
          <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] p-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing session...
          </div>
        ) : session.analysisStatus === 'failed' ? (
          <div className="flex items-center gap-2 text-sm text-[var(--error)] p-4">
            <AlertCircle className="w-4 h-4" />
            Analysis failed
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Batch Email Results Component (expandable)
function BatchEmailResults({ emailResults }: { emailResults: EmailResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const found = emailResults.filter((r) => r.status === 'found');
  const notFound = emailResults.filter((r) => r.status === 'not_found');
  const pending = emailResults.filter((r) => r.status === 'pending');
  const rateLimited = emailResults.filter((r) => r.status === 'rate_limited');
  const displayResults = expanded ? emailResults : emailResults.slice(0, 5);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--border)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] mb-2 flex items-center gap-1"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        Per-email results ({found.length} found, {notFound.length} not found{pending.length > 0 ? `, ${pending.length} pending` : ''}{rateLimited.length > 0 ? `, ${rateLimited.length} waiting` : ''})
      </button>
      {expanded && (
        <div className="max-h-60 overflow-y-auto space-y-1">
          {displayResults.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-2 py-1 text-xs rounded hover:bg-[var(--muted)]">
              <span className="text-[var(--foreground)] truncate flex-1 mr-2">{r.email}</span>
              <div className="flex items-center gap-2 shrink-0">
                {r.personName && <span className="text-[var(--foreground-muted)]">{r.personName}</span>}
                {r.recordingCount > 0 && (
                  <span className="text-[var(--brand-primary)]">{r.recordingCount} rec</span>
                )}
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  r.status === 'found' ? 'bg-emerald-500/15 text-emerald-500' :
                  r.status === 'not_found' ? 'bg-[var(--muted)] text-[var(--foreground-subtle)]' :
                  r.status === 'rate_limited' ? 'bg-yellow-500/15 text-yellow-500' :
                  r.status === 'error' ? 'bg-red-500/15 text-red-500' :
                  'bg-[var(--muted)] text-[var(--foreground-muted)]'
                }`}>
                  {r.status === 'not_found' ? 'not found' : r.status === 'rate_limited' ? 'waiting' : r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
