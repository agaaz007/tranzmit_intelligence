'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  MessageCircle,
  PlayCircle,
  ArrowRight,
  Ticket as TicketIcon,
  Check,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

// Ticket type matching the Prisma Ticket model
interface TicketData {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  effort: 'low' | 'medium' | 'high';
  recommendation: string;
  evidence: {
    sessionIds: string[];
    conversationIds: string[];
    quotes: string[];
  };
  scoreBreakdown: {
    frequency: number;
    churn: number;
    severity: number;
    recency: number;
  };
  churnImpact?: {
    atRiskUsers: number;
    avgRiskScore: number;
    userIds: string[];
  } | null;
  trending?: {
    firstSeen: string;
    lastSeen: string;
    weeklyCounts: number[];
    direction: 'rising' | 'stable' | 'declining' | 'new';
  } | null;
  compositeScore: number;
  status: string;
  jiraMarkdown?: string | null;
  synthesizedAt: string;
}

interface TicketStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  lastSynthesized: string | null;
}

interface DashboardResponse {
  tickets: TicketData[];
  stats: TicketStats;
}

const categoryLabels: Record<string, string> = {
  ux_friction: 'UX Friction',
  feature_gap: 'Feature Gap',
  bug: 'Bug',
  confusion: 'Confusion',
  performance: 'Performance',
  onboarding: 'Onboarding',
  retention: 'Retention',
};

const trendIcon = (direction?: string) => {
  if (direction === 'rising') return <TrendingUp className="w-3.5 h-3.5 text-red-500" />;
  if (direction === 'declining') return <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />;
  if (direction === 'new') return <span className="text-xs text-[var(--info)] font-medium">NEW</span>;
  return <Minus className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />;
};

function TicketCard({ ticket, isExpanded, onToggle }: {
  ticket: TicketData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyJira = () => {
    const markdown = ticket.jiraMarkdown || `**${ticket.title}**\n\n${ticket.description}\n\n${ticket.recommendation}`;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const firstQuote = ticket.evidence.quotes[0];
  const sourceCount = ticket.evidence.sessionIds.length + ticket.evidence.conversationIds.length;

  return (
    <div className="bg-[var(--card)] rounded-lg overflow-hidden border border-[var(--border)]">
      <button
        onClick={onToggle}
        className="w-full p-5 text-left hover:bg-[var(--muted)] transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                ticket.severity === 'critical' ? 'bg-red-500' :
                ticket.severity === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
              }`} />
              <span className="text-[var(--foreground)] font-medium">{ticket.title}</span>
              <span className="text-[var(--foreground-subtle)] text-xs">{categoryLabels[ticket.category] || ticket.category}</span>
              {ticket.churnImpact && ticket.churnImpact.atRiskUsers > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-3 h-3" />
                  {ticket.churnImpact.atRiskUsers} at-risk
                </span>
              )}
              {trendIcon(ticket.trending?.direction)}
            </div>
            {firstQuote && (
              <p className="text-[var(--foreground-muted)] text-sm italic pl-4 border-l-2 border-[var(--border)] line-clamp-1">
                &ldquo;{firstQuote}&rdquo;
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <span className="text-lg font-medium text-[var(--foreground)]">{ticket.compositeScore}</span>
              <span className="text-[var(--foreground-subtle)] text-xs">/100</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-[var(--foreground-subtle)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-[var(--border)]">
              <p className="text-[var(--foreground-muted)] text-sm mt-4">{ticket.description}</p>

              {/* Score Breakdown */}
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { label: 'Frequency', value: ticket.scoreBreakdown.frequency, weight: '30%' },
                  { label: 'Churn Impact', value: ticket.scoreBreakdown.churn, weight: '30%' },
                  { label: 'Severity', value: ticket.scoreBreakdown.severity, weight: '20%' },
                  { label: 'Recency', value: ticket.scoreBreakdown.recency, weight: '20%' },
                ].map(({ label, value, weight }) => (
                  <div key={label} className="bg-[var(--muted)] rounded-lg p-2.5 text-center">
                    <p className="text-[var(--foreground-subtle)] text-[10px] uppercase tracking-wider">{label}</p>
                    <p className="text-[var(--foreground)] text-sm font-medium mt-0.5">{value}</p>
                    <p className="text-[var(--foreground-subtle)] text-[10px]">{weight}</p>
                  </div>
                ))}
              </div>

              {/* Churn Impact Detail */}
              {ticket.churnImpact && ticket.churnImpact.atRiskUsers > 0 && (
                <div className="mt-4 bg-[var(--error-bg)] rounded-lg p-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {ticket.churnImpact.atRiskUsers} at-risk user{ticket.churnImpact.atRiskUsers > 1 ? 's' : ''} affected
                    {ticket.churnImpact.avgRiskScore > 0 && ` (avg risk score: ${ticket.churnImpact.avgRiskScore})`}
                  </p>
                </div>
              )}

              {/* User Quotes */}
              {ticket.evidence.quotes.length > 0 && (
                <div className="mt-5">
                  <p className="text-[var(--foreground-subtle)] text-xs uppercase tracking-wide mb-3">Verbatim User Quotes</p>
                  <div className="space-y-2">
                    {ticket.evidence.quotes.map((quote, idx) => (
                      <div key={idx} className="border-l-2 border-[var(--brand-primary)] pl-4 py-2">
                        <p className="text-[var(--foreground)] text-sm">&ldquo;{quote}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className="mt-5 bg-[var(--success-bg)] rounded-lg p-4">
                <p className="text-[var(--foreground-muted)] text-xs uppercase tracking-wide mb-2">Recommendation</p>
                <p className="text-emerald-700 dark:text-emerald-400 text-sm">{ticket.recommendation}</p>
              </div>

              {/* Evidence & Actions */}
              <div className="mt-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {ticket.evidence.sessionIds.length > 0 && (
                    <Link
                      href={`/dashboard/session-insights?highlight=${ticket.evidence.sessionIds[0]}`}
                      className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] flex items-center gap-1.5 transition-colors"
                    >
                      <PlayCircle className="w-4 h-4" />
                      {ticket.evidence.sessionIds.length} Session{ticket.evidence.sessionIds.length > 1 ? 's' : ''}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                  {ticket.evidence.conversationIds.length > 0 && (
                    <Link
                      href={`/dashboard/hypotheses?conversationId=${ticket.evidence.conversationIds[0]}`}
                      className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] flex items-center gap-1.5 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {ticket.evidence.conversationIds.length} Conversation{ticket.evidence.conversationIds.length > 1 ? 's' : ''}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                  <span className="text-[var(--foreground-subtle)] text-xs">
                    {sourceCount} source{sourceCount !== 1 ? 's' : ''}
                  </span>
                </div>

                <Script
                  src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
                  data-api-key="eb_live_juno_sk_2026"
                  data-attach="#jira-btn"
                  data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
                  data-redirect-url="/dashboard"
                  data-churn-redirect-url="/cancel-confirmed"
                />
                <button
                  id="jira-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyJira();
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <TicketIcon className="w-4 h-4" />
                      Copy to Jira
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardPage() {
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const loadTickets = useCallback(async (projId: string) => {
    try {
      const response = await fetch(`/api/tickets?projectId=${projId}`);
      const result: DashboardResponse = await response.json();

      if (response.ok) {
        setTickets(result.tickets || []);
        setStats(result.stats || null);
        if (result.tickets?.[0]) {
          setExpandedTicket(result.tickets[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load tickets:', error);
    }
  }, []);

  useEffect(() => {
    const initializeProject = async () => {
      let currentProjectId = localStorage.getItem('currentProjectId');

      if (!currentProjectId) {
        try {
          const response = await fetch('/api/projects');
          const result = await response.json();
          if (result.projects && result.projects.length > 0) {
            currentProjectId = result.projects[0].id;
            localStorage.setItem('currentProjectId', currentProjectId as string);
          }
        } catch (err) {
          console.error('Failed to fetch projects:', err);
        }
      }

      if (currentProjectId) {
        setProjectId(currentProjectId);
        await loadTickets(currentProjectId);
      }
      setIsLoading(false);
    };

    initializeProject();
  }, [loadTickets]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleRefresh = async () => {
    if (!projectId || isSynthesizing || cooldownSeconds > 0) return;
    setIsSynthesizing(true);

    try {
      const response = await fetch('/api/tickets/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (response.status === 429) {
        const data = await response.json();
        setCooldownSeconds(data.retryAfter || 300);
      } else if (response.ok) {
        // Re-fetch tickets after synthesis
        await loadTickets(projectId);
        setCooldownSeconds(300); // 5 min cooldown
      }
    } catch (error) {
      console.error('Synthesis failed:', error);
    } finally {
      setIsSynthesizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--foreground)]" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] p-8">
        <h1 className="text-xl font-medium text-[var(--foreground)] mb-2">Product Insights</h1>
        <p className="text-[var(--foreground-muted)] text-sm mb-12">Prioritized tickets from user sessions and conversations</p>

        <div className="max-w-sm">
          <p className="text-[var(--foreground-muted)] text-sm mb-6">
            {projectId
              ? 'No tickets synthesized yet. Generate insights from your existing sessions and conversations, or sync new data.'
              : 'No data yet. Sync sessions or upload conversations to get started.'}
          </p>
          <div className="flex flex-col gap-3">
            {projectId && (
              <button
                onClick={handleRefresh}
                disabled={isSynthesizing || cooldownSeconds > 0}
                className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-[var(--brand-primary)] text-white rounded-full hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isSynthesizing ? 'animate-spin' : ''}`} />
                {isSynthesizing
                  ? 'Generating insights...'
                  : cooldownSeconds > 0
                  ? `${Math.floor(cooldownSeconds / 60)}:${String(cooldownSeconds % 60).padStart(2, '0')}`
                  : 'Generate Insights'}
              </button>
            )}
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/session-insights"
                className="px-5 py-2.5 text-sm font-medium bg-[var(--card)] text-[var(--foreground)] rounded-full hover:bg-[var(--muted)] transition-colors border border-[var(--border)]"
              >
                Sync Sessions
              </Link>
              <Link
                href="/dashboard/interviews"
                className="px-5 py-2.5 text-sm font-medium bg-[var(--card)] text-[var(--foreground)] rounded-full hover:bg-[var(--muted)] transition-colors border border-[var(--border)]"
              >
                Upload Conversations
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const criticalCount = stats?.critical || 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="px-8 pt-8 pb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-[var(--foreground)]">Product Insights</h1>
            <p className="text-[var(--foreground-muted)] text-sm mt-1">Prioritized tickets from user sessions and conversations</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isSynthesizing || cooldownSeconds > 0}
            className="px-5 py-2.5 text-sm font-medium bg-[var(--brand-primary)] text-white rounded-full hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSynthesizing ? 'animate-spin' : ''}`} />
            {isSynthesizing ? 'Synthesizing...' : cooldownSeconds > 0 ? `${Math.floor(cooldownSeconds / 60)}:${String(cooldownSeconds % 60).padStart(2, '0')}` : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-8 pb-8">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[var(--card)] rounded-lg p-5 border border-[var(--border)]">
            <p className="text-[var(--foreground-muted)] text-sm mb-2">Total Tickets</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-[var(--foreground)]">{stats?.total || 0}</span>
            </div>
          </div>
          <div className="bg-[var(--card)] rounded-lg p-5 border border-[var(--border)]">
            <p className="text-[var(--foreground-muted)] text-sm mb-2">Critical Issues</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-[var(--foreground)]">{criticalCount}</span>
              {criticalCount > 0 && <span className="text-red-500 text-sm">needs attention</span>}
            </div>
          </div>
          <div className="bg-[var(--card)] rounded-lg p-5 border border-[var(--border)]">
            <p className="text-[var(--foreground-muted)] text-sm mb-2">High Priority</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-medium text-[var(--foreground)]">{stats?.high || 0}</span>
              <span className="text-orange-500 text-sm">tickets</span>
            </div>
          </div>
          <div className="bg-[var(--card)] rounded-lg p-5 border border-[var(--border)]">
            <p className="text-[var(--foreground-muted)] text-sm mb-2">Last Synthesized</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--foreground)] text-sm font-medium">
                {stats?.lastSynthesized
                  ? new Date(stats.lastSynthesized).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ticket List */}
      <div className="px-8 pb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--brand-primary)]" />
            <h2 className="text-[var(--foreground)] font-medium">Prioritized Tickets</h2>
          </div>
          <span className="text-xs text-[var(--foreground-subtle)]">Sorted by composite score</span>
        </div>
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              isExpanded={expandedTicket === ticket.id}
              onToggle={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
