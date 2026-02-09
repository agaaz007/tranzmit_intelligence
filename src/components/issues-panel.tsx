"use client";

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Target, CheckCircle2, ChevronDown, RefreshCw, Sparkles } from 'lucide-react';
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
  critical: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  medium: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
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

  return (
    <div className={`p-4 rounded-lg border ${config.border} bg-[var(--card)] hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className={`text-[10px] font-semibold px-2 py-1 rounded uppercase tracking-wide shrink-0 mt-0.5 ${config.bg} ${config.text}`}>
            {issue.severity}
          </span>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm text-[var(--foreground)]">{issue.title}</h4>
            <p className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-2">{issue.description}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2">→ {issue.recommendation}</p>
          </div>
        </div>
        {issue.sessionIds.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium shrink-0 flex items-center gap-1"
          >
            {issue.sessionIds.length} session{issue.sessionIds.length !== 1 ? 's' : ''}
            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {isExpanded && issue.sessionIds.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-2">
          {issue.sessionIds.map((sid, i) => (
            <button
              key={sid}
              onClick={() => onSessionClick(sid)}
              className="text-xs px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-800"
            >
              {issue.sessionNames[i] || sid.substring(0, 8)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function IssuesPanel({ insights, isLoading, onSessionClick, onRefresh, isRefreshing, lastSyncTime }: IssuesPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('issues');

  if (isLoading && !insights) {
    return (
      <Card className="p-8 border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--muted-foreground)]" />
          <span className="text-sm text-[var(--muted-foreground)]">Loading insights...</span>
        </div>
      </Card>
    );
  }

  if (!insights || insights.criticalIssues.length === 0) {
    return null;
  }

  const criticalCount = insights.criticalIssues.filter(i => i.severity === 'critical').length;
  const highCount = insights.criticalIssues.filter(i => i.severity === 'high').length;

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">Issues Overview</h2>
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span>{insights.sessionCount} sessions analyzed</span>
              {lastSyncTime && (
                <>
                  <span>·</span>
                  <span>Synced {formatTimeAgo(lastSyncTime)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Summary badges */}
      <div className="flex items-center gap-2">
        {criticalCount > 0 && (
          <Badge className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
            {criticalCount} Critical
          </Badge>
        )}
        {highCount > 0 && (
          <Badge className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800">
            {highCount} High
          </Badge>
        )}
        <Badge variant="secondary">
          {insights.criticalIssues.length} Total Issues
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab('issues')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'issues'
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
          Issues ({insights.criticalIssues.length})
        </button>
        <button
          onClick={() => setActiveTab('goals')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'goals'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Target className="w-3.5 h-3.5 inline mr-1.5" />
          Goals ({insights.topUserGoals.length})
        </button>
        <button
          onClick={() => setActiveTab('actions')}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'actions'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />
          Actions ({insights.immediateActions.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'issues' && (
        <div className="space-y-3">
          {insights.criticalIssues.map((issue, i) => (
            <IssueCard key={i} issue={issue} onSessionClick={onSessionClick} />
          ))}
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="space-y-2">
          {insights.topUserGoals.map((goal, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[var(--card)] border border-blue-100 dark:border-blue-800">
              <span className="text-sm text-[var(--foreground)]">{goal.goal}</span>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                goal.success_rate.toLowerCase().includes('fail') || goal.success_rate.toLowerCase().includes('low')
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
              }`}>
                {goal.success_rate}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="space-y-2">
          {insights.immediateActions.map((action, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--card)] border border-emerald-100 dark:border-emerald-800">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-[var(--foreground)]">{action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pattern summary */}
      {insights.patternSummary && (
        <p className="text-xs text-[var(--muted-foreground)] leading-relaxed pt-2 border-t border-[var(--border)]">
          {insights.patternSummary}
        </p>
      )}
    </section>
  );
}
