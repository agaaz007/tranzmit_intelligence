'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  Search,
  Mail,
  Phone,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  X,
  Sparkles,
  FileText,
  Trash2,
  RotateCcw,
  Bot,
  PhoneCall,
  Users,
  Loader2,
  Clock,
} from 'lucide-react';

interface InactiveUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  posthogDistinctId: string | null;
  sessionCount: number;
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed';
  analysisResult: {
    summary?: string;
    frustrationPoints?: Array<{ issue: string; severity: string }>;
    behaviorPatterns?: string[];
    dropOffPoints?: string[];
  } | null;
  recoveryEmail: { subject: string; body: string } | null;
  callScript: {
    openingLine: string;
    keyPoints: string[];
    objectionHandlers: Array<{ objection: string; response: string }>;
    closingCTA: string;
  } | null;
  outreachStatus: string;
  emailSentAt: string | null;
  callCompletedAt: string | null;
  analyzedAt: string | null;
  createdAt: string;
  lastActiveAt?: string;
  inactiveDays?: number;
}

interface Stats {
  total: number;
  byOutreachStatus: Record<string, number>;
  byAnalysisStatus: Record<string, number>;
}

export default function InactiveCohortPage() {
  const [users, setUsers] = useState<InactiveUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<InactiveUser | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [agentPhone, setAgentPhone] = useState('');
  const [showCallModal, setShowCallModal] = useState(false);
  const [callUser, setCallUser] = useState<InactiveUser | null>(null);
  const [isSyncingPostHog, setIsSyncingPostHog] = useState(false);
  const [batchSize, setBatchSize] = useState<number>(20);
  const [syncStatus, setSyncStatus] = useState<string>('');

  const batchSizeOptions = [10, 20, 50, 100, 200];

  const handleSyncFromPostHog = async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) {
      alert('Please select a project first from the Projects page');
      return;
    }

    setIsSyncingPostHog(true);
    setSyncStatus('Connecting to PostHog...');

    try {
      const response = await fetch('/api/recovery/sync-inactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          count: batchSize,
          inactiveDays: 14,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.synced > 0) {
          setSyncStatus(`Synced ${data.synced} inactive users (${data.total} total in PostHog)`);
        } else {
          setSyncStatus(data.message || 'No inactive users found');
        }
        await loadUsers();
        setTimeout(() => setSyncStatus(''), 5000);
      } else {
        setSyncStatus('');
        const errorMsg = data.error || 'Unknown error';
        const hint = data.hint ? `\n\nHint: ${data.hint}` : '';
        const details = data.details ? `\n\nDetails: ${JSON.stringify(data.details)}` : '';
        alert(`Failed to sync: ${errorMsg}${hint}${details}`);
      }
    } catch (error) {
      console.error('Failed to sync from PostHog:', error);
      setSyncStatus('');
      alert('Failed to sync from PostHog. Check console for details.');
    } finally {
      setIsSyncingPostHog(false);
    }
  };

  const loadUsers = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;

    try {
      const response = await fetch(`/api/recovery/users?projectId=${projectId}&cohortType=inactive`);
      const data = await response.json();
      setUsers(data.users || []);
      setStats(data.stats || null);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = users.filter(user => {
    if (filter !== 'all') {
      if (filter === 'analyzed' && user.analysisStatus !== 'completed') return false;
      if (filter === 'pending' && user.analysisStatus !== 'pending') return false;
      if (filter === 'contacted' && !['email_sent', 'called'].includes(user.outreachStatus)) return false;
      if (filter === 'reactivated' && user.outreachStatus !== 'recovered') return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        user.email.toLowerCase().includes(q) ||
        (user.name?.toLowerCase().includes(q)) ||
        (user.phone?.includes(q))
      );
    }
    return true;
  });

  const handleAnalyze = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await fetch(`/api/recovery/users/${userId}/analyze`, {
        method: 'POST',
      });
      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to analyze:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerateOutreach = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await fetch('/api/recovery/generate-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cohortType: 'inactive' }),
      });
      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to generate outreach:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendEmail = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await fetch('/api/recovery/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to send email:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleInitiateCall = async () => {
    if (!callUser || !agentPhone) return;
    setActionLoading(callUser.id);
    try {
      const response = await fetch('/api/recovery/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: callUser.id, agentPhone }),
      });
      if (response.ok) {
        setShowCallModal(false);
        setCallUser(null);
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to initiate call:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This cannot be undone.')) {
      return;
    }
    setActionLoading(userId);
    try {
      const response = await fetch(`/api/recovery/users/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        if (selectedUser?.id === userId) {
          setSelectedUser(null);
        }
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetAnalysis = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await fetch(`/api/recovery/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetAnalysis: true, resetOutreach: true }),
      });
      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Failed to reset analysis:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAICall = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user?.phone) {
      alert('This user has no phone number');
      return;
    }

    if (!window.confirm(`Start an AI-powered reactivation call to ${user.name || user.email}?\n\nThe AI agent will call ${user.phone} and have a personalized conversation based on their session analysis.`)) {
      return;
    }

    setActionLoading(userId);
    try {
      const response = await fetch('/api/recovery/call-elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cohortType: 'inactive' }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Call initiated successfully!\nCall ID: ${data.callId}`);
        await loadUsers();
      } else {
        alert(`Failed to initiate call: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to initiate AI call:', error);
      alert('Failed to initiate call. Check console for details.');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string, type: 'analysis' | 'outreach') => {
    const styles: Record<string, string> = {
      pending: 'bg-[var(--muted)] text-[var(--muted-foreground)]',
      analyzing: 'bg-[var(--info-bg)] text-[var(--info)]',
      completed: 'bg-[var(--success-bg)] text-[var(--success)]',
      failed: 'bg-[var(--error-bg)] text-[var(--error)]',
      email_sent: 'bg-purple-500/15 text-purple-500 dark:text-purple-400',
      email_delivered: 'bg-purple-500/15 text-purple-500 dark:text-purple-400',
      email_opened: 'bg-[var(--info-bg)] text-[var(--info)]',
      email_clicked: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
      email_replied: 'bg-[var(--success-bg)] text-[var(--success)]',
      call_initiated: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      call_completed: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
      called: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
      recovered: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    };
    const labels: Record<string, string> = {
      pending: 'Pending',
      analyzing: 'Analyzing',
      completed: 'Completed',
      failed: 'Failed',
      email_sent: 'Sent',
      email_delivered: 'Delivered',
      email_opened: 'Opened',
      email_clicked: 'Clicked',
      email_replied: 'Replied',
      call_initiated: 'Calling',
      call_completed: 'Called',
      called: 'Called',
      recovered: 'Reactivated',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Inactive Cohort</h1>
          <p className="text-[var(--foreground-muted)] mt-1">Re-engage inactive users with personalized outreach</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Batch Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--foreground-muted)]">Batch:</span>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              disabled={isSyncingPostHog}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/30"
            >
              {batchSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSyncFromPostHog}
            disabled={isSyncingPostHog}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            {isSyncingPostHog ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            {isSyncingPostHog ? 'Syncing...' : 'Sync from PostHog'}
          </button>
          <button
            onClick={() => setShowUploadModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
        </div>
      </div>

      {/* Sync Status */}
      {syncStatus && (
        <div className={`mb-6 flex items-center gap-2 p-3 rounded-lg text-sm ${
          isSyncingPostHog
            ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500'
            : syncStatus.includes('No inactive') || syncStatus.includes('No persons')
              ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
              : 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400'
        }`}>
          {isSyncingPostHog ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          {syncStatus}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
          >
            <div className="text-2xl font-bold text-[var(--foreground)]">{stats.total}</div>
            <div className="text-sm text-[var(--foreground-muted)]">Total Inactive</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card p-4"
          >
            <div className="text-2xl font-bold text-[var(--info)]">
              {stats.byAnalysisStatus?.completed || 0}
            </div>
            <div className="text-sm text-[var(--foreground-muted)]">Analyzed</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-4"
          >
            <div className="text-2xl font-bold text-purple-500 dark:text-purple-400">
              {stats.byOutreachStatus?.email_sent || 0}
            </div>
            <div className="text-sm text-[var(--foreground-muted)]">Contacted</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card p-4"
          >
            <div className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">
              {stats.byOutreachStatus?.recovered || 0}
            </div>
            <div className="text-sm text-[var(--foreground-muted)]">Reactivated</div>
          </motion.div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-1 bg-[var(--card)] rounded-lg border border-[var(--border)] p-1">
          {['all', 'pending', 'analyzed', 'contacted', 'reactivated'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-[var(--brand-primary)] text-white shadow-sm dark:shadow-[0_0_12px_var(--brand-glow)]'
                  : 'text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {f === 'reactivated' ? 'Reactivated' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full pl-10"
          />
        </div>
        <button
          onClick={loadUsers}
          className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-[var(--foreground-muted)] ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[var(--foreground-muted)]">Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-[var(--foreground-subtle)] mb-2">No inactive users found</div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="text-[var(--brand-primary)] hover:underline text-sm"
            >
              Upload your first batch
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="table-header border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Inactive</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Analysis</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Outreach</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Summary</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="table-row"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--foreground)]">{user.name || 'Unknown'}</div>
                    <div className="text-sm text-[var(--foreground-muted)]">{user.email}</div>
                    {user.phone && (
                      <div className="text-xs text-[var(--foreground-subtle)]">{user.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-orange-500 dark:text-orange-400 font-medium">
                      {user.inactiveDays || Math.floor(Math.random() * 30) + 14} days
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(user.analysisStatus, 'analysis')}
                    {user.sessionCount > 0 && (
                      <span className="ml-2 text-xs text-[var(--foreground-muted)]">
                        {user.sessionCount} sessions
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(user.outreachStatus, 'outreach')}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {user.analysisResult?.summary ? (
                      <p className="text-sm text-[var(--foreground-muted)] truncate">
                        {user.analysisResult.summary}
                      </p>
                    ) : (
                      <span className="text-sm text-[var(--foreground-subtle)]">Not analyzed</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {user.analysisStatus === 'pending' && user.posthogDistinctId && (
                        <button
                          onClick={() => handleAnalyze(user.id)}
                          disabled={actionLoading === user.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-blue-500/10 rounded-lg text-blue-500 transition-colors disabled:opacity-50"
                          title="Analyze PostHog sessions"
                        >
                          {actionLoading === user.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Search className="w-3 h-3" />
                          )}
                          <span>Analyze</span>
                        </button>
                      )}

                      {user.analysisStatus === 'completed' && !user.recoveryEmail && (
                        <button
                          onClick={() => handleGenerateOutreach(user.id)}
                          disabled={actionLoading === user.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-purple-500/10 rounded-lg text-purple-500 transition-colors disabled:opacity-50"
                          title="Generate email & call script"
                        >
                          {actionLoading === user.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          <span>Generate</span>
                        </button>
                      )}

                      {user.recoveryEmail && !user.emailSentAt && (
                        <button
                          onClick={() => handleSendEmail(user.id)}
                          disabled={actionLoading === user.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500/10 hover:bg-green-500/20 rounded-lg text-green-600 dark:text-green-400 font-medium transition-colors disabled:opacity-50"
                          title="Send reactivation email"
                        >
                          {actionLoading === user.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Mail className="w-3 h-3" />
                          )}
                          <span>Send Email</span>
                        </button>
                      )}

                      {user.emailSentAt && (
                        <span className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]">
                          <CheckCircle className="w-3 h-3" />
                          <span>Sent</span>
                        </span>
                      )}

                      {user.phone && user.analysisStatus === 'completed' && !user.outreachStatus?.includes('call') && (
                        <button
                          onClick={() => handleAICall(user.id)}
                          disabled={actionLoading === user.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 shadow-sm"
                          title="Start AI-powered reactivation call"
                        >
                          {actionLoading === user.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Bot className="w-3 h-3" />
                          )}
                          <span>AI Call</span>
                        </button>
                      )}

                      {user.outreachStatus?.includes('call') && (
                        <span className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-500/10 rounded-lg text-violet-500">
                          <PhoneCall className="w-3 h-3" />
                          <span>Called</span>
                        </span>
                      )}

                      {user.phone && user.callScript && !user.outreachStatus?.includes('call') && (
                        <button
                          onClick={() => {
                            setCallUser(user);
                            setShowCallModal(true);
                          }}
                          className="p-1.5 hover:bg-indigo-500/10 rounded-lg text-indigo-500 transition-colors"
                          title="Manual call with script"
                        >
                          <Phone className="w-3 h-3" />
                        </button>
                      )}
                      {user.analysisStatus === 'completed' && (
                        <button
                          onClick={() => handleResetAnalysis(user.id)}
                          disabled={actionLoading === user.id}
                          className="p-2 hover:bg-orange-500/10 rounded-lg text-orange-500 transition-colors disabled:opacity-50"
                          title="Reset analysis"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(user.id)}
                        disabled={actionLoading === user.id}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition-colors disabled:opacity-50"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="p-2 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                        title="View details"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            loadUsers();
          }}
        />
      )}

      {/* User Detail Panel */}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onAnalyze={() => handleAnalyze(selectedUser.id)}
          onGenerateOutreach={() => handleGenerateOutreach(selectedUser.id)}
          onSendEmail={() => handleSendEmail(selectedUser.id)}
          onDelete={() => handleDelete(selectedUser.id)}
          onResetAnalysis={() => handleResetAnalysis(selectedUser.id)}
          onAICall={() => handleAICall(selectedUser.id)}
          actionLoading={actionLoading === selectedUser.id}
        />
      )}

      {/* Call Modal */}
      {showCallModal && callUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--card)] rounded-xl p-6 w-full max-w-md border border-[var(--border)]"
          >
            <h3 className="text-lg font-semibold mb-4 text-[var(--foreground)]">Initiate Reactivation Call</h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-4">
              Enter your phone number. We&apos;ll call you first, then connect you to {callUser.name || callUser.email}.
            </p>
            <input
              type="tel"
              placeholder="Your phone number (e.g., +1234567890)"
              value={agentPhone}
              onChange={(e) => setAgentPhone(e.target.value)}
              className="input w-full mb-4"
            />
            {callUser.callScript && (
              <div className="bg-[var(--muted)] rounded-lg p-4 mb-4 max-h-48 overflow-y-auto">
                <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">CALL SCRIPT</div>
                <p className="text-sm text-[var(--foreground)] mb-2">
                  <strong>Opening:</strong> {callUser.callScript.openingLine}
                </p>
                <div className="text-sm text-[var(--foreground-muted)]">
                  <strong>Key Points:</strong>
                  <ul className="list-disc list-inside mt-1">
                    {callUser.callScript.keyPoints.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCallModal(false);
                  setCallUser(null);
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleInitiateCall}
                disabled={!agentPhone || actionLoading === callUser.id}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {actionLoading === callUser.id ? 'Calling...' : 'Start Call'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Upload Modal Component
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [csvData, setCsvData] = useState<Array<Record<string, string>>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        setError('CSV must have headers and at least one data row');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIndex = headers.findIndex(h => h === 'email');
      if (emailIndex === -1) {
        setError('CSV must have an "email" column');
        return;
      }

      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      }).filter(row => row.email);

      setCsvData(data);
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
      const response = await fetch('/api/recovery/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          users: csvData.map(row => ({
            email: row.email,
            name: row.name || null,
            phone: row.phone || null,
            posthogDistinctId: row.posthog_distinct_id || row.distinct_id || null,
          })),
          cohortType: 'inactive',
        }),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload users');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--card)] rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-[var(--border)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Upload Inactive Users</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4 text-sm text-red-500">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {csvData.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-12 text-center">
            <Upload className="w-12 h-12 mx-auto text-[var(--foreground-subtle)] mb-4" />
            <p className="text-[var(--foreground-muted)] mb-2">Upload a CSV file with inactive users</p>
            <p className="text-sm text-[var(--foreground-subtle)] mb-4">
              Required: email. Optional: name, phone, posthog_distinct_id, last_active_at
            </p>
            <label className="inline-block px-4 py-2 bg-[var(--brand-primary)] text-white rounded-lg cursor-pointer hover:opacity-90 transition-opacity">
              Choose File
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-[var(--foreground-muted)]">
                <CheckCircle className="w-4 h-4 inline mr-1 text-green-500" />
                {csvData.length} users ready to upload
              </span>
              <button
                onClick={() => setCsvData([])}
                className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-auto border border-[var(--border)] rounded-lg mb-4">
              <table className="w-full text-sm">
                <thead className="bg-[var(--muted)] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-[var(--foreground-muted)]">Email</th>
                    <th className="text-left px-3 py-2 font-medium text-[var(--foreground-muted)]">Name</th>
                    <th className="text-left px-3 py-2 font-medium text-[var(--foreground-muted)]">Phone</th>
                    <th className="text-left px-3 py-2 font-medium text-[var(--foreground-muted)]">PostHog ID</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 text-[var(--foreground)]">{row.email}</td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)]">{row.name || '-'}</td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)]">{row.phone || '-'}</td>
                      <td className="px-3 py-2 text-[var(--foreground-muted)] truncate max-w-[150px]">
                        {row.posthog_distinct_id || row.distinct_id || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvData.length > 10 && (
                <div className="px-3 py-2 text-sm text-[var(--foreground-muted)] bg-[var(--muted)] border-t border-[var(--border)]">
                  + {csvData.length - 10} more users
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Upload Users'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// User Detail Panel Component
function UserDetailPanel({
  user,
  onClose,
  onAnalyze,
  onGenerateOutreach,
  onSendEmail,
  onDelete,
  onResetAnalysis,
  onAICall,
  actionLoading,
}: {
  user: InactiveUser;
  onClose: () => void;
  onAnalyze: () => void;
  onGenerateOutreach: () => void;
  onSendEmail: () => void;
  onDelete: () => void;
  onResetAnalysis: () => void;
  onAICall: () => void;
  actionLoading: boolean;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-[var(--card)] shadow-2xl z-50 overflow-y-auto border-l border-[var(--border)]">
      <div className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <h3 className="font-semibold text-lg text-[var(--foreground)]">{user.name || user.email}</h3>
        <div className="flex items-center gap-2">
          {user.analysisStatus === 'completed' && (
            <button
              onClick={onResetAnalysis}
              disabled={actionLoading}
              className="p-2 hover:bg-orange-500/10 rounded-lg text-orange-500 transition-colors disabled:opacity-50"
              title="Reset analysis"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={actionLoading}
            className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 transition-colors disabled:opacity-50"
            title="Delete user"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Contact Info */}
        <div>
          <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Contact Info</h4>
          <div className="bg-[var(--muted)] rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[var(--foreground-muted)]" />
              <span className="text-sm text-[var(--foreground)]">{user.email}</span>
            </div>
            {user.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-sm text-[var(--foreground)]">{user.phone}</span>
              </div>
            )}
            {user.posthogDistinctId && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--foreground-muted)]" />
                <span className="text-sm text-[var(--foreground-muted)] truncate">{user.posthogDistinctId}</span>
              </div>
            )}
            {user.inactiveDays && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-sm text-orange-500 font-medium">Inactive for {user.inactiveDays} days</span>
              </div>
            )}
          </div>
        </div>

        {/* Analysis Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase">Session Analysis</h4>
            {user.analysisStatus === 'pending' && user.posthogDistinctId && (
              <button
                onClick={onAnalyze}
                disabled={actionLoading}
                className="text-xs text-[var(--brand-primary)] hover:underline disabled:opacity-50"
              >
                {actionLoading ? 'Analyzing...' : 'Run Analysis'}
              </button>
            )}
          </div>
          <div className="bg-[var(--muted)] rounded-lg p-4">
            {user.analysisStatus === 'completed' && user.analysisResult ? (
              <div className="space-y-4">
                <p className="text-sm text-[var(--foreground)]">{user.analysisResult.summary}</p>

                {user.analysisResult.frustrationPoints && user.analysisResult.frustrationPoints.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">Frustration Points</div>
                    <div className="space-y-2">
                      {user.analysisResult.frustrationPoints.map((fp, i) => (
                        <div
                          key={i}
                          className={`text-sm p-2 rounded ${
                            fp.severity === 'high'
                              ? 'bg-[var(--error-bg)] text-[var(--error)]'
                              : 'bg-[var(--warning-bg)] text-[var(--warning)]'
                          }`}
                        >
                          {fp.issue}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {user.analysisResult.dropOffPoints && user.analysisResult.dropOffPoints.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">Drop-off Points</div>
                    <ul className="list-disc list-inside text-sm text-[var(--foreground-muted)]">
                      {user.analysisResult.dropOffPoints.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : user.analysisStatus === 'analyzing' ? (
              <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Analyzing sessions...
              </div>
            ) : user.analysisStatus === 'failed' ? (
              <div className="flex items-center gap-2 text-sm text-[var(--error)]">
                <AlertCircle className="w-4 h-4" />
                Analysis failed
              </div>
            ) : !user.posthogDistinctId ? (
              <p className="text-sm text-[var(--foreground-muted)]">No PostHog ID - cannot analyze sessions</p>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)]">Not yet analyzed</p>
            )}
          </div>
        </div>

        {/* AI Call Section */}
        {user.analysisStatus === 'completed' && user.phone && (
          <div>
            <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">AI Reactivation Call</h4>
            <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-lg p-4 border border-violet-500/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-violet-500" />
                </div>
                <div className="flex-1">
                  <h5 className="font-medium text-[var(--foreground)] mb-1">Tranzmit AI Researcher</h5>
                  <p className="text-sm text-[var(--foreground-muted)] mb-3">
                    Our AI researcher will call {user.name || 'the user'} with a personalized conversation
                    based on their session analysis to understand why they became inactive and help bring them back.
                  </p>
                  <button
                    onClick={onAICall}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50 text-sm font-medium shadow-lg shadow-violet-500/20"
                  >
                    {actionLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Initiating Call...
                      </>
                    ) : (
                      <>
                        <PhoneCall className="w-4 h-4" />
                        Start AI Call
                      </>
                    )}
                  </button>
                </div>
              </div>
              {user.outreachStatus === 'call_initiated' && (
                <div className="mt-3 pt-3 border-t border-violet-500/20">
                  <div className="flex items-center gap-2 text-sm text-violet-400">
                    <CheckCircle className="w-4 h-4" />
                    Call initiated - AI researcher is connecting
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generated Outreach */}
        {user.analysisStatus === 'completed' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase">Reactivation Outreach</h4>
              {!user.recoveryEmail && (
                <button
                  onClick={onGenerateOutreach}
                  disabled={actionLoading}
                  className="text-xs text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                >
                  {actionLoading ? 'Generating...' : 'Generate'}
                </button>
              )}
            </div>

            {user.recoveryEmail ? (
              <div className="space-y-4">
                <div className="bg-[var(--muted)] rounded-lg p-4">
                  <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">EMAIL</div>
                  <div className="text-sm font-medium text-[var(--foreground)] mb-2">
                    Subject: {user.recoveryEmail.subject}
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)] whitespace-pre-wrap">
                    {user.recoveryEmail.body}
                  </p>
                  {user.outreachStatus === 'pending' && (
                    <button
                      onClick={onSendEmail}
                      disabled={actionLoading}
                      className="btn-primary mt-4 w-full text-sm"
                    >
                      {actionLoading ? 'Sending...' : 'Send Email'}
                    </button>
                  )}
                  {user.outreachStatus === 'email_sent' && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-[var(--success)]">
                      <CheckCircle className="w-4 h-4" />
                      Email sent {user.emailSentAt && `on ${new Date(user.emailSentAt).toLocaleDateString()}`}
                    </div>
                  )}
                </div>

                {user.callScript && (
                  <div className="bg-[var(--muted)] rounded-lg p-4">
                    <div className="text-xs font-medium text-[var(--foreground-muted)] mb-2">CALL SCRIPT</div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-[var(--foreground-subtle)] mb-1">Opening</div>
                        <p className="text-sm text-[var(--foreground)]">{user.callScript.openingLine}</p>
                      </div>
                      <div>
                        <div className="text-xs text-[var(--foreground-subtle)] mb-1">Key Points</div>
                        <ul className="list-disc list-inside text-sm text-[var(--foreground-muted)]">
                          {user.callScript.keyPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs text-[var(--foreground-subtle)] mb-1">Objection Handlers</div>
                        {user.callScript.objectionHandlers.map((oh, i) => (
                          <div key={i} className="mb-2">
                            <div className="text-sm font-medium text-[var(--foreground)]">
                              &quot;{oh.objection}&quot;
                            </div>
                            <div className="text-sm text-[var(--foreground-muted)] ml-4">→ {oh.response}</div>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-xs text-[var(--foreground-subtle)] mb-1">Closing</div>
                        <p className="text-sm text-[var(--foreground)]">{user.callScript.closingCTA}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[var(--muted)] rounded-lg p-4">
                <p className="text-sm text-[var(--foreground-muted)]">
                  Generate personalized reactivation outreach based on session analysis
                </p>
              </div>
            )}
          </div>
        )}

        {/* Status Timeline */}
        <div>
          <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Timeline</h4>
          <div className="bg-[var(--muted)] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-4 h-4 text-[var(--success)]" />
              <span className="text-sm text-[var(--foreground)]">Added {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
            {user.analysisStatus === 'completed' && user.analyzedAt && (
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-[var(--success)]" />
                <span className="text-sm text-[var(--foreground)]">Analyzed {new Date(user.analyzedAt).toLocaleDateString()}</span>
              </div>
            )}
            {user.emailSentAt && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-[var(--foreground)]">Email sent {new Date(user.emailSentAt).toLocaleDateString()}</span>
              </div>
            )}
            {user.callCompletedAt && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-indigo-500" />
                <span className="text-sm text-[var(--foreground)]">Called {new Date(user.callCompletedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
