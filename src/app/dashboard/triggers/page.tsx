'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mic, Send, RefreshCw, Clock, CheckCircle, XCircle, Eye, Loader2 } from 'lucide-react';

interface WidgetTrigger {
  id: string;
  distinctId: string;
  userName: string | null;
  interviewApiKey: string | null;
  status: string;
  createdAt: string;
  shownAt: string | null;
  expiresAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-amber-500' },
  shown: { label: 'Shown', icon: Eye, color: 'text-blue-500' },
  clicked: { label: 'Started', icon: CheckCircle, color: 'text-green-500' },
  dismissed: { label: 'Dismissed', icon: XCircle, color: 'text-[var(--foreground-muted)]' },
};

export default function TriggersPage() {
  const [distinctIds, setDistinctIds] = useState('');
  const [userName, setUserName] = useState('');
  const [interviewApiKey, setInterviewApiKey] = useState('');
  const [triggers, setTriggers] = useState<WidgetTrigger[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadTriggers = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/widget/trigger?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.triggers || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers]);

  async function handleTrigger() {
    setError('');
    setSuccess('');
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) {
      setError('No project selected. Complete onboarding first.');
      return;
    }

    const ids = distinctIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      setError('Enter at least one distinct ID.');
      return;
    }

    setTriggering(true);
    try {
      const res = await fetch('/api/widget/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          distinctIds: ids,
          userName: userName || undefined,
          interviewApiKey: interviewApiKey || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to trigger widget.');
        return;
      }

      const data = await res.json();
      setSuccess(`Widget triggered for ${data.count} user${data.count !== 1 ? 's' : ''}. They'll see it within 5 seconds.`);
      setDistinctIds('');
      setUserName('');
      await loadTriggers();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setTriggering(false);
    }
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Mic className="w-5 h-5 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Voice Widget Triggers</h1>
        </div>
        <p className="text-[var(--foreground-muted)] text-sm ml-12">
          Target specific users by distinct ID — a voice interview invite will pop up on their screen within 5 seconds.
        </p>
      </div>

      {/* Trigger Form */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Trigger Widget</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1.5">
              Distinct ID(s) <span className="text-orange-500">*</span>
            </label>
            <textarea
              value={distinctIds}
              onChange={(e) => setDistinctIds(e.target.value)}
              placeholder="user_abc123, user_def456&#10;(comma-separated for multiple users)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1.5">
                User Name <span className="text-[var(--foreground-subtle)]">(optional)</span>
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Sarah"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1.5">
                Interview API Key <span className="text-[var(--foreground-subtle)]">(optional)</span>
              </label>
              <input
                type="text"
                value={interviewApiKey}
                onChange={(e) => setInterviewApiKey(e.target.value)}
                placeholder="YOUR_API_KEY"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">{success}</p>
          )}

          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {triggering ? 'Triggering...' : 'Trigger Widget'}
          </button>
        </div>
      </div>

      {/* SDK Snippet */}
      <div className="card p-5 mb-6 bg-[var(--background-subtle,var(--background))]">
        <h2 className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-widest mb-3">SDK Setup</h2>
        <p className="text-xs text-[var(--foreground-muted)] mb-3">Add this to your site or iOS WebView to enable the widget:</p>
        <pre className="text-xs bg-[var(--muted)] p-4 rounded-lg overflow-x-auto text-[var(--foreground)] leading-relaxed">{`<script>
  window.TRANZMIT_WIDGET_CONFIG = {
    apiKey: 'tranzmit_...',       // Your Tranzmit API key
    endpoint: 'https://app.tranzmit.com',
    distinctId: currentUser.id   // Set to the logged-in user's distinct ID
  };
</script>
<script src="https://app.tranzmit.com/tranzmit-widget.js"></script>`}</pre>
      </div>

      {/* Recent Triggers */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Recent Triggers</h2>
          <button
            onClick={loadTriggers}
            className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && triggers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--foreground-muted)]" />
          </div>
        ) : triggers.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] text-center py-8">No triggers yet. Trigger your first widget above.</p>
        ) : (
          <div className="space-y-2">
            {triggers.map((t) => {
              const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const isExpired = t.status === 'pending' && new Date(t.expiresAt) < new Date();
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-3 px-4 rounded-lg bg-[var(--background)] border border-[var(--border)]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--foreground)] truncate">
                      {t.userName ? `${t.userName} ` : ''}
                      <span className="font-mono text-xs text-[var(--foreground-muted)]">{t.distinctId}</span>
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)] mt-0.5">{timeAgo(t.createdAt)}</div>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs font-medium ml-4 shrink-0 ${isExpired ? 'text-[var(--foreground-muted)]' : cfg.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {isExpired ? 'Expired' : cfg.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
