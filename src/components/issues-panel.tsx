"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Target, CheckCircle2, ChevronDown, RefreshCw, Sparkles, TrendingUp, Zap, ExternalLink, Quote, Lightbulb } from 'lucide-react';
import type { SynthesizedInsightData, EnhancedCriticalIssue } from '@/types/session';

interface QuoteBlock {
  speaker: string;
  context: string;
  quote: string;
  notes: string[];
}

interface ParsedDescription {
  intro: string;
  quotes: QuoteBlock[];
}

function parseIssueDescription(description: string): ParsedDescription {
  const sepIdx = description.indexOf('KEY EVIDENCE:');
  if (sepIdx === -1) return { intro: description.trim(), quotes: [] };

  const intro = description.substring(0, sepIdx).trim();
  const evidencePart = description.substring(sepIdx + 'KEY EVIDENCE:'.length);

  const quotes: QuoteBlock[] = [];
  const lines = evidencePart.split('\n');

  let current: QuoteBlock | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('━') || line === 'ROOT CAUSE ANALYSIS:' || line === 'CHURN IMPACT:' || line === 'CONTRAST WITH RETAINED USERS:') continue;

    // Stop at section headers that aren't quotes
    if (/^[A-Z][A-Z\s]+:$/.test(line) && !line.startsWith('[')) {
      if (current) { quotes.push(current); current = null; }
      continue;
    }

    if (line.startsWith('[')) {
      if (current) quotes.push(current);
      const labelMatch = line.match(/^\[([^\]]+)\]\s*(.*)/);
      current = { speaker: labelMatch?.[1] || '', context: labelMatch?.[2]?.replace(/:$/, '').trim() || '', quote: '', notes: [] };
    } else if (current && line.startsWith('"')) {
      current.quote += (current.quote ? ' ' : '') + line;
    } else if (current && line.startsWith('→')) {
      current.notes.push(line.substring(1).trim());
    } else if (current && line.startsWith('User:')) {
      current.notes.push(line);
    }
  }
  if (current) quotes.push(current);

  return { intro, quotes };
}

interface IssuesPanelProps {
  insights: SynthesizedInsightData | null;
  isLoading: boolean;
  onSessionClick: (sessionId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastSyncTime: Date | null;
}

type PanelTab = 'issues' | 'goals' | 'actions';

const severityConfig = {
  critical: {
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border border-red-500/20',
    glow: 'shadow-[inset_2px_0_0_0_rgb(239,68,68)]',
    sessionBtn: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/15',
  },
  high: {
    dot: 'bg-orange-500',
    badge: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
    glow: 'shadow-[inset_2px_0_0_0_rgb(249,115,22)]',
    sessionBtn: 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border border-orange-500/15',
  },
  medium: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    glow: 'shadow-[inset_2px_0_0_0_rgb(234,179,8)]',
    sessionBtn: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/15',
  },
};

function formatTimeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

function IssueCard({ issue, onSessionClick }: {
  issue: EnhancedCriticalIssue;
  onSessionClick: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = severityConfig[issue.severity];
  const sessionCount = issue.sessionIds?.length || 0;
  const parsed = parseIssueDescription(issue.description);

  return (
    <div className={`group relative rounded-xl border border-[var(--border)] bg-[var(--card)] transition-all duration-200 ${config.glow} ${isExpanded ? 'border-[var(--border-hover)]' : 'hover:border-[var(--border-hover)]'}`}>
      {/* Clickable header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-widest ${config.badge}`}>
            {issue.severity}
          </span>
          <h4 className="font-medium text-[14px] text-[var(--foreground)] leading-snug truncate">
            {issue.title}
          </h4>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {sessionCount > 0 && (
            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
              {sessionCount} session{sessionCount !== 1 ? 's' : ''}
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-[var(--muted-foreground)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-[var(--border)]">
          {/* Summary */}
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mt-4">
            {parsed.intro}
          </p>

          {issue.frequency && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mt-2.5">
              <TrendingUp className="w-3 h-3 opacity-60" />
              <span>{issue.frequency}</span>
            </div>
          )}

          {/* Verbatim Quotes */}
          {parsed.quotes.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Quote className="w-3 h-3" />
                User Quotes
              </p>
              <div className="space-y-3">
                {parsed.quotes.filter(q => q.quote).map((q, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--background-subtle,var(--muted))/30] overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--muted)]/40">
                      <span className="text-[11px] font-semibold text-[var(--foreground-muted,var(--muted-foreground))]">
                        {q.speaker}
                      </span>
                      {q.context && (
                        <span className="text-[11px] text-[var(--muted-foreground)] ml-1.5 opacity-70">
                          · {q.context}
                        </span>
                      )}
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-sm text-[var(--foreground)] leading-relaxed italic">
                        {q.quote}
                      </p>
                      {q.notes.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {q.notes.map((note, j) => (
                            <p key={j} className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                              {note}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          {issue.recommendation && (
            <div className="mt-5">
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                <Lightbulb className="w-3 h-3" />
                Recommendation
              </p>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3">
                <p className="text-sm text-emerald-300 leading-relaxed whitespace-pre-line">
                  {issue.recommendation}
                </p>
              </div>
            </div>
          )}

          {/* Affected Sessions */}
          {sessionCount > 0 && (
            <div className="mt-5 pt-4 border-t border-[var(--border)]">
              <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2.5">
                Affected Sessions
              </p>
              <div className="flex flex-col gap-1.5">
                {(issue.sessionIds || []).map((sid, i) => (
                  <button
                    key={sid}
                    onClick={(e) => { e.stopPropagation(); onSessionClick(sid); }}
                    className={`inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors font-medium text-left ${config.sessionBtn}`}
                  >
                    <span className="flex-1">{issue.sessionNames?.[i] || sid}</span>
                    <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function IssuesPanel({ insights, isLoading, onSessionClick, onRefresh, isRefreshing, lastSyncTime }: IssuesPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('issues');

  if (isLoading && !insights) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400 animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--muted-foreground)]" />
            <span className="text-sm text-[var(--muted-foreground)]">Analyzing sessions...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!insights || insights.criticalIssues.length === 0) {
    return null;
  }

  const criticalCount = insights.criticalIssues.filter(i => i.severity === 'critical').length;
  const highCount = insights.criticalIssues.filter(i => i.severity === 'high').length;
  const mediumCount = insights.criticalIssues.filter(i => i.severity === 'medium').length;

  const tabs = [
    { id: 'issues' as PanelTab, label: 'Issues', count: insights.criticalIssues.length, icon: AlertTriangle, color: 'text-red-400' },
    { id: 'goals' as PanelTab, label: 'Goals', count: insights.topUserGoals.length, icon: Target, color: 'text-blue-400' },
    { id: 'actions' as PanelTab, label: 'Actions', count: insights.immediateActions.length, icon: CheckCircle2, color: 'text-emerald-400' },
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)] tracking-tight">
              Issues Overview
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {insights.sessionCount} sessions analyzed
              {lastSyncTime && (
                <span className="ml-1.5 opacity-60">· Synced {formatTimeAgo(lastSyncTime)}</span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-7 w-7 p-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Severity summary chips */}
        <div className="flex items-center gap-2 mt-3.5">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/8 border border-red-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[11px] font-medium text-red-400">{criticalCount} Critical</span>
            </div>
          )}
          {highCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500/8 border border-orange-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              <span className="text-[11px] font-medium text-orange-400">{highCount} High</span>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/8 border border-amber-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-[11px] font-medium text-amber-400">{mediumCount} Medium</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] bg-[var(--muted)]/20">
        {tabs.map(({ id, label, count, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-colors ${
              activeTab === id
                ? 'text-[var(--foreground)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${activeTab === id ? color : 'opacity-50'}`} />
            <span>{label}</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums ${
              activeTab === id
                ? 'bg-[var(--muted)] text-[var(--foreground)]'
                : 'bg-[var(--muted)]/50 text-[var(--muted-foreground)]'
            }`}>
              {count}
            </span>
            {activeTab === id && (
              <span className="absolute bottom-0 left-4 right-4 h-px bg-[var(--foreground)] opacity-20 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {activeTab === 'issues' && (
          <div className="space-y-2">
            {insights.criticalIssues.map((issue, i) => (
              <IssueCard key={i} issue={issue} onSessionClick={onSessionClick} />
            ))}
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="space-y-2">
            {insights.topUserGoals.map((goal, i) => {
              const isLowSuccess = goal.success_rate.toLowerCase().includes('fail') ||
                                   goal.success_rate.toLowerCase().includes('low') ||
                                   goal.success_rate.toLowerCase().includes('0%');
              return (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--card)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center shrink-0">
                      <Target className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <span className="text-sm text-[var(--foreground)] truncate">{goal.goal}</span>
                  </div>
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-lg shrink-0 ml-3 ${
                    isLowSuccess
                      ? 'bg-red-500/10 text-red-400 border border-red-500/15'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                  }`}>
                    {goal.success_rate}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-4">
            {insights.criticalIssues.filter(issue => issue.recommendation).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-widest px-1">
                  Issue Recommendations
                </p>
                {insights.criticalIssues.filter(issue => issue.recommendation).map((issue, i) => (
                  <div
                    key={`rec-${i}`}
                    className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-emerald-500/15 bg-emerald-500/5 hover:border-emerald-500/25 transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-emerald-300 leading-relaxed">
                        {issue.recommendation}
                      </p>
                      <p className="text-[11px] text-[var(--muted-foreground)] mt-1 opacity-70">
                        For: {issue.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insights.immediateActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-widest px-1">
                  Immediate Actions
                </p>
                {insights.immediateActions.map((action, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-hover)] transition-colors"
                  >
                    <span className="w-5 h-5 rounded-md bg-[var(--muted)] text-[var(--foreground)] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-[var(--foreground)] leading-relaxed">{action}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pattern summary */}
        {insights.patternSummary && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-[var(--muted)]/30 border border-[var(--border)]">
              <div className="w-6 h-6 rounded-md bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3 h-3 text-violet-400" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-1.5">
                  Key Patterns
                </p>
                <p className="text-sm text-[var(--foreground)] leading-relaxed opacity-80">
                  {insights.patternSummary}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
