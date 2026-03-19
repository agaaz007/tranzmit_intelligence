'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  TrendingDown,
  Users,
  Filter,
  ChevronDown,
  ShieldCheck,
  Mic,
} from 'lucide-react';

interface ChurnScore {
  id: string;
  distinctId: string;
  email: string | null;
  date: string;
  segment: string;
  isPro: boolean;
  subscriptionStatus: string | null;
  daysSinceLastEvent: number | null;
  daysSinceLastChatStarted: number | null;
  daysSinceLastMessageSent: number | null;
  sessionsLast7d: number;
  sessionsPrev7d: number;
  messageSentLast7d: number;
  messageSentPrev7d: number;
  chatStartedLast7d: number;
  chatStartedPrev7d: number;
  chatEndedLast7d: number;
  featureUsedLast7d: number;
  featureUsedPrev7d: number;
  chatCompletionRateLast7d: number | null;
  avgMessagesPerChatLast7d: number | null;
  paywallViewedLast7d: number;
  manageSubTappedLast30d: number;
  riskScore: number;
  riskLevel: string;
  riskReasons: string | null;
  recencyScore: number;
  usageDropScore: number;
  engagementQualityScore: number;
  frictionScore: number;
  featureAdoptionLossScore: number;
  createdAt: string;
}

const RISK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/15', text: 'text-red-500', border: 'border-red-500/30' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-500', border: 'border-orange-500/30' },
  medium: { bg: 'bg-yellow-500/15', text: 'text-yellow-500', border: 'border-yellow-500/30' },
  low: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', border: 'border-emerald-500/30' },
};

const SEGMENT_LABELS: Record<string, string> = {
  new_user: 'New User',
  active_user: 'Active User',
  paid_user: 'Paid User',
};

export default function ChurnScoresPage() {
  const [scores, setScores] = useState<ChurnScore[]>([]);
  const [total, setTotal] = useState(0);
  const [riskCounts, setRiskCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [page, setPage] = useState(1);
  const [filterRiskLevel, setFilterRiskLevel] = useState<string | null>(null);
  const [filterSegment, setFilterSegment] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [triggeringUser, setTriggeringUser] = useState<string | null>(null);
  const [userTriggerResults, setUserTriggerResults] = useState<Record<string, string>>({});
  const limit = 25;

  const loadScores = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;

    setLoadError(null);
    try {
      let url = `/api/churn-scores?projectId=${projectId}&limit=${limit}&offset=${(page - 1) * limit}`;
      if (filterRiskLevel) url += `&riskLevel=${filterRiskLevel}`;
      if (filterSegment) url += `&segment=${filterSegment}`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setScores(data.scores || []);
      setTotal(data.total || 0);
      if (data.riskCounts) setRiskCounts(data.riskCounts);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load churn scores');
    }
  }, [page, filterRiskLevel, filterSegment]);

  useEffect(() => {
    loadScores().finally(() => setIsLoading(false));
  }, [loadScores]);

  const handleTriggerForUser = async (score: ChurnScore) => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId || triggeringUser === score.id) return;
    setTriggeringUser(score.id);
    try {
      const res = await fetch('/api/widget/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, distinctIds: [score.distinctId] }),
      });
      const data = await res.json();
      setUserTriggerResults((prev) => ({
        ...prev,
        [score.id]: res.ok ? 'Triggered! Widget will appear within 5s.' : `Error: ${data.error}`,
      }));
    } catch {
      setUserTriggerResults((prev) => ({ ...prev, [score.id]: 'Network error. Please retry.' }));
    } finally {
      setTriggeringUser(null);
    }
  };

  const handleTriggerScoring = async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId || isTriggering) return;

    setIsTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch('/api/churn-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        setTriggerResult(`Scored ${data.usersScored} users in ${(data.durationMs / 1000).toFixed(1)}s`);
        await loadScores();
      } else {
        setTriggerResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setTriggerResult('Failed to trigger scoring');
    } finally {
      setIsTriggering(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters = filterRiskLevel !== null || filterSegment !== null;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Churn Risk Scores</h1>
          <p className="text-[var(--foreground-muted)] mt-1">
            Daily risk scores for all identified users
          </p>
        </div>
        <button
          onClick={handleTriggerScoring}
          disabled={isTriggering}
          className="btn-primary flex items-center gap-2"
        >
          {isTriggering ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scoring...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Run Scoring Now
            </>
          )}
        </button>
      </div>

      {/* Trigger result banner */}
      {triggerResult && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`card p-3 mb-6 text-sm ${
            triggerResult.startsWith('Error') || triggerResult.startsWith('Failed')
              ? 'border-l-4 border-l-red-500 text-red-500'
              : 'border-l-4 border-l-emerald-500 text-emerald-500'
          }`}
        >
          {triggerResult}
        </motion.div>
      )}

      {/* Load error banner */}
      {loadError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-3 mb-6 text-sm border-l-4 border-l-red-500 flex items-center justify-between"
        >
          <span className="text-red-500">{loadError}</span>
          <button
            onClick={() => { setIsLoading(true); loadScores().finally(() => setIsLoading(false)); }}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] underline ml-4"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-[var(--foreground-muted)]" />
            <span className="text-sm text-[var(--foreground-muted)]">Total Scored</span>
          </div>
          <div className="text-2xl font-bold text-[var(--foreground)]">{total}</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span className="text-sm text-[var(--foreground-muted)]">Critical</span>
          </div>
          <div className="text-2xl font-bold text-red-500">{riskCounts.critical || 0}</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-[var(--foreground-muted)]">High</span>
          </div>
          <div className="text-2xl font-bold text-orange-500">{riskCounts.high || 0}</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-[var(--foreground-muted)]">Low Risk</span>
          </div>
          <div className="text-2xl font-bold text-emerald-500">{riskCounts.low || 0}</div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <Filter className="w-4 h-4 text-[var(--foreground-muted)]" />
        <select
          value={filterRiskLevel || ''}
          onChange={(e) => { setFilterRiskLevel(e.target.value || null); setPage(1); }}
          aria-label="Filter by risk level"
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)]"
        >
          <option value="">All Risk Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterSegment || ''}
          onChange={(e) => { setFilterSegment(e.target.value || null); setPage(1); }}
          aria-label="Filter by segment"
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--foreground)]"
        >
          <option value="">All Segments</option>
          <option value="new_user">New User</option>
          <option value="active_user">Active User</option>
          <option value="paid_user">Paid User</option>
        </select>
      </div>

      {/* Scores Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[var(--foreground-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading...
          </div>
        ) : scores.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingDown className="w-12 h-12 mx-auto text-[var(--foreground-subtle)] mb-4" />
            {hasActiveFilters ? (
              <>
                <div className="text-[var(--foreground-muted)] mb-2">
                  No users match the current filters
                </div>
                <button
                  onClick={() => { setFilterRiskLevel(null); setFilterSegment(null); setPage(1); }}
                  className="text-[var(--brand-primary)] hover:underline text-sm"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <div className="text-[var(--foreground-muted)] mb-2">No churn scores yet</div>
                <button
                  onClick={handleTriggerScoring}
                  disabled={isTriggering}
                  className="text-[var(--brand-primary)] hover:underline text-sm"
                >
                  Run scoring to compute risk scores for all users
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="table-header border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Segment</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Risk</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Score</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Last Seen</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Sessions (7d)</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Messages (7d)</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {scores.map((score) => {
                const colors = RISK_COLORS[score.riskLevel] || RISK_COLORS.low;
                const reasons: string[] = score.riskReasons ? JSON.parse(score.riskReasons) : [];
                const isExpanded = expandedUser === score.id;

                return (
                  <>
                    <tr key={score.id} className="table-row">
                      <td className="px-4 py-3">
                        {score.email && (
                          <div className="font-medium text-[var(--foreground)] text-sm">
                            {score.email}
                          </div>
                        )}
                        <div className="text-xs text-[var(--foreground-muted)] truncate max-w-[220px]">
                          ID: {score.distinctId}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full bg-[var(--muted)] text-[var(--foreground-muted)]">
                          {SEGMENT_LABELS[score.segment] || score.segment}
                          {score.isPro && ' (Pro)'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
                          {score.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                score.riskScore >= 75 ? 'bg-red-500' :
                                score.riskScore >= 50 ? 'bg-orange-500' :
                                score.riskScore >= 25 ? 'bg-yellow-500' :
                                'bg-emerald-500'
                              }`}
                              style={{ width: `${score.riskScore}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-[var(--foreground)]">{score.riskScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--foreground-muted)]">
                        {score.daysSinceLastEvent != null ? `${score.daysSinceLastEvent}d ago` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[var(--foreground)]">
                          {score.sessionsLast7d}
                          {score.sessionsPrev7d > 0 && (
                            <span className={`text-xs ml-1 ${
                              score.sessionsLast7d < score.sessionsPrev7d ? 'text-red-500' : 'text-emerald-500'
                            }`}>
                              ({score.sessionsLast7d >= score.sessionsPrev7d ? '+' : ''}
                              {Math.round(((score.sessionsLast7d - score.sessionsPrev7d) / Math.max(score.sessionsPrev7d, 1)) * 100)}%)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[var(--foreground)]">
                          {score.messageSentLast7d}
                          {score.messageSentPrev7d > 0 && (
                            <span className={`text-xs ml-1 ${
                              score.messageSentLast7d < score.messageSentPrev7d ? 'text-red-500' : 'text-emerald-500'
                            }`}>
                              ({score.messageSentLast7d >= score.messageSentPrev7d ? '+' : ''}
                              {Math.round(((score.messageSentLast7d - score.messageSentPrev7d) / Math.max(score.messageSentPrev7d, 1)) * 100)}%)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setExpandedUser(isExpanded ? null : score.id)}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                          className="p-1.5 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${score.id}-detail`} className="bg-[var(--muted)]/50">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-2 gap-6">
                            {/* Sub-scores */}
                            <div>
                              <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-3">Score Breakdown</h4>
                              <div className="space-y-2">
                                <ScoreBar label="Recency" value={score.recencyScore} max={35} />
                                <ScoreBar label="Usage Drop" value={score.usageDropScore} max={30} />
                                <ScoreBar label="Engagement Quality" value={score.engagementQualityScore} max={20} />
                                <ScoreBar label="Friction" value={score.frictionScore} max={10} />
                                <ScoreBar label="Feature Adoption" value={score.featureAdoptionLossScore} max={5} />
                              </div>
                            </div>

                            {/* Risk Reasons & Metrics */}
                            <div>
                              {reasons.length > 0 && (
                                <div className="mb-4">
                                  <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Risk Reasons</h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {reasons.map((reason, i) => (
                                      <span key={i} className={`px-2 py-1 rounded text-xs ${colors.bg} ${colors.text}`}>
                                        {reason.replace(/_/g, ' ')}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Trigger Interview CTA */}
                              <div className="mb-4">
                                <button
                                  onClick={() => handleTriggerForUser(score)}
                                  disabled={triggeringUser === score.id}
                                  className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-500 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                >
                                  {triggeringUser === score.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Mic className="w-3.5 h-3.5" />
                                  )}
                                  {triggeringUser === score.id ? 'Triggering…' : 'Trigger Voice Interview'}
                                </button>
                                {userTriggerResults[score.id] && (
                                  <p className={`text-xs mt-1.5 ${userTriggerResults[score.id].startsWith('Error') || userTriggerResults[score.id].startsWith('Network') ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {userTriggerResults[score.id]}
                                  </p>
                                )}
                              </div>
                              <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Metrics</h4>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="text-[var(--foreground-muted)]">
                                  Chats started (7d): <span className="text-[var(--foreground)]">{score.chatStartedLast7d}</span>
                                  {score.chatStartedPrev7d > 0 && <span className="text-[var(--foreground-subtle)]"> (prev: {score.chatStartedPrev7d})</span>}
                                </div>
                                <div className="text-[var(--foreground-muted)]">
                                  Chat completion: <span className="text-[var(--foreground)]">
                                    {score.chatCompletionRateLast7d != null ? `${Math.round(score.chatCompletionRateLast7d * 100)}%` : '-'}
                                  </span>
                                </div>
                                <div className="text-[var(--foreground-muted)]">
                                  Avg msgs/chat: <span className="text-[var(--foreground)]">
                                    {score.avgMessagesPerChatLast7d != null ? score.avgMessagesPerChatLast7d.toFixed(1) : '-'}
                                  </span>
                                </div>
                                <div className="text-[var(--foreground-muted)]">
                                  Features used (7d): <span className="text-[var(--foreground)]">{score.featureUsedLast7d}</span>
                                  {score.featureUsedPrev7d > 0 && <span className="text-[var(--foreground-subtle)]"> (prev: {score.featureUsedPrev7d})</span>}
                                </div>
                                <div className="text-[var(--foreground-muted)]">
                                  Paywall views (7d): <span className="text-[var(--foreground)]">{score.paywallViewedLast7d}</span>
                                </div>
                                <div className="text-[var(--foreground-muted)]">
                                  Manage sub taps (30d): <span className="text-[var(--foreground)]">{score.manageSubTappedLast30d}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--border)] disabled:opacity-50 hover:bg-[var(--muted)]"
          >
            Previous
          </button>
          <span className="text-sm text-[var(--foreground-muted)]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--border)] disabled:opacity-50 hover:bg-[var(--muted)]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--foreground-muted)] w-32 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-orange-500' : pct >= 25 ? 'bg-yellow-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[var(--foreground)] w-12 text-right">{value}/{max}</span>
    </div>
  );
}
