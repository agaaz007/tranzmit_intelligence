"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Target, CheckCircle2, ChevronDown, RefreshCw, Sparkles, TrendingUp, Zap, ExternalLink } from 'lucide-react';
import type { SynthesizedInsightData, EnhancedCriticalIssue } from '@/types/session';

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
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20 dark:border-red-500/30',
    badge: 'bg-red-500 text-white',
    glow: 'shadow-red-500/10',
    indicator: 'bg-red-500'
  },
  high: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/20 dark:border-orange-500/30',
    badge: 'bg-orange-500 text-white',
    glow: 'shadow-orange-500/10',
    indicator: 'bg-orange-500'
  },
  medium: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20 dark:border-amber-500/30',
    badge: 'bg-amber-500 text-white',
    glow: 'shadow-amber-500/10',
    indicator: 'bg-amber-500'
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

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border ${config.border} bg-[var(--card)] transition-all duration-300 ${isExpanded ? 'shadow-lg' : ''} ${config.glow}`}
    >
      {/* Severity indicator bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.indicator}`} />

      {/* Clickable header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-4 pl-5 flex items-center justify-between gap-4 hover:bg-[var(--muted)]/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 ${config.badge}`}>
            {issue.severity}
          </span>
          <h4 className="font-semibold text-[15px] text-[var(--foreground)] leading-tight truncate">
            {issue.title}
          </h4>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {sessionCount > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-[var(--muted)]/50 text-xs font-medium text-[var(--muted-foreground)]">
              {sessionCount} session{sessionCount !== 1 ? 's' : ''}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Expandable content */}
      <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-5 pb-5 pt-0 border-t border-[var(--border)]">
          {/* Description - factual observation */}
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed my-4">
            {issue.description}
          </p>

          {/* Frequency indicator */}
          {issue.frequency && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mb-4">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{issue.frequency}</span>
            </div>
          )}

          {/* Affected sessions */}
          {sessionCount > 0 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <p className="text-xs font-medium text-[var(--muted-foreground)] mb-2.5 uppercase tracking-wide">
                Affected Sessions
              </p>
              <div className="flex flex-wrap gap-2">
                {(issue.sessionIds || []).map((sid, i) => (
                  <button
                    key={sid}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSessionClick(sid);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors font-medium"
                  >
                    {issue.sessionNames?.[i] || sid.substring(0, 8)}
                    <ExternalLink className="w-3 h-3 opacity-50" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function IssuesPanel({ insights, isLoading, onSessionClick, onRefresh, isRefreshing, lastSyncTime }: IssuesPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('issues');

  if (isLoading && !insights) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-12">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
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

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Issues Overview
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
              {insights.sessionCount} sessions analyzed
              {lastSyncTime && ` · Synced ${formatTimeAgo(lastSyncTime)}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-2 mt-4">
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-xs font-medium text-red-600 dark:text-red-400">{criticalCount} Critical</span>
            </div>
          )}
          {highCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400">{highCount} High</span>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{mediumCount} Medium</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab('issues')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all relative ${
            activeTab === 'issues'
              ? 'text-[var(--foreground)] bg-[var(--muted)]/30'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/20'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 ${activeTab === 'issues' ? 'text-red-500' : ''}`} />
          <span>Issues</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'issues'
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-[var(--muted)]/50 text-[var(--muted-foreground)]'
          }`}>
            {insights.criticalIssues.length}
          </span>
          {activeTab === 'issues' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('goals')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all relative ${
            activeTab === 'goals'
              ? 'text-[var(--foreground)] bg-[var(--muted)]/30'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/20'
          }`}
        >
          <Target className={`w-4 h-4 ${activeTab === 'goals' ? 'text-blue-500' : ''}`} />
          <span>Goals</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'goals'
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : 'bg-[var(--muted)]/50 text-[var(--muted-foreground)]'
          }`}>
            {insights.topUserGoals.length}
          </span>
          {activeTab === 'goals' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('actions')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-medium transition-all relative ${
            activeTab === 'actions'
              ? 'text-[var(--foreground)] bg-[var(--muted)]/30'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/20'
          }`}
        >
          <CheckCircle2 className={`w-4 h-4 ${activeTab === 'actions' ? 'text-emerald-500' : ''}`} />
          <span>Actions</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
            activeTab === 'actions'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-[var(--muted)]/50 text-[var(--muted-foreground)]'
          }`}>
            {insights.immediateActions.length}
          </span>
          {activeTab === 'actions' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'issues' && (
          <div className="space-y-3">
            {insights.criticalIssues.map((issue, i) => (
              <IssueCard key={i} issue={issue} onSessionClick={onSessionClick} />
            ))}
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="space-y-3">
            {insights.topUserGoals.map((goal, i) => {
              const isLowSuccess = goal.success_rate.toLowerCase().includes('fail') ||
                                   goal.success_rate.toLowerCase().includes('low') ||
                                   goal.success_rate.toLowerCase().includes('0%');
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 rounded-xl bg-[var(--muted)]/30 border border-[var(--border)] hover:border-blue-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Target className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="text-sm font-medium text-[var(--foreground)]">{goal.goal}</span>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                    isLowSuccess
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
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
            {/* Issue-specific recommendations */}
            {insights.criticalIssues.filter(issue => issue.recommendation).length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                  Issue Recommendations
                </p>
                {insights.criticalIssues.filter(issue => issue.recommendation).map((issue, i) => (
                  <div
                    key={`rec-${i}`}
                    className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 hover:border-emerald-500/30 transition-colors"
                  >
                    <Zap className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 leading-relaxed">
                        {issue.recommendation}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
                        For: {issue.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* General immediate actions */}
            {insights.immediateActions.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                  Immediate Actions
                </p>
                {insights.immediateActions.map((action, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 p-4 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 hover:border-emerald-500/30 transition-colors"
                  >
                    <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm text-[var(--foreground)] leading-relaxed pt-0.5">{action}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pattern summary */}
        {insights.patternSummary && (
          <div className="mt-6 pt-5 border-t border-[var(--border)]">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--muted)]/30">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">
                  Key Patterns
                </p>
                <p className="text-sm text-[var(--foreground)] leading-relaxed">
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
