'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  RefreshCw,
  ChevronRight,
  X,
  Bot,
  User,
  Loader2,
  Upload,
  MessageCircle,
} from 'lucide-react';

interface ConversationSummary {
  id: string;
  source: string;
  externalId: string | null;
  participantName: string | null;
  participantEmail: string | null;
  participantPhone: string | null;
  status: string;
  duration: number | null;
  analysisStatus: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  conversedAt: string | null;
}

interface ConversationDetail extends ConversationSummary {
  transcript: Array<{ role: string; message: string; timestamp?: number }> | string | null;
  analysis: Record<string, unknown> | null;
}

export default function QualitativePage() {
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'elevenlabs' | 'manual'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showAgentIdPrompt, setShowAgentIdPrompt] = useState(false);
  const [agentIdInput, setAgentIdInput] = useState('');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    participantName: '',
    participantEmail: '',
    transcript: '',
    notes: '',
    conversedAt: '',
  });
  const [isUploading, setIsUploading] = useState(false);

  const loadData = useCallback(async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/conversations?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-open conversation from URL parameter (deep linking from dashboard)
  useEffect(() => {
    if (!conversationIdParam) return;

    const loadConversationFromParam = async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/conversations/${conversationIdParam}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedConversation(data.conversation);
        }
      } catch (error) {
        console.error('Failed to load conversation from URL param:', error);
      } finally {
        setDetailLoading(false);
      }
    };

    loadConversationFromParam();
  }, [conversationIdParam]);

  const handleSync = async (agentId?: string) => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) return;

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const res = await fetch('/api/conversations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, agentId }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If no agent ID configured, prompt for it
        if (data.error?.includes('No agent ID')) {
          setShowAgentIdPrompt(true);
          setIsSyncing(false);
          return;
        }
        setSyncMessage(`Error: ${data.error}`);
      } else {
        setSyncMessage(`Synced ${data.synced} new conversation${data.synced !== 1 ? 's' : ''} (${data.alreadyExists} already existed)`);
        setShowAgentIdPrompt(false);
        setAgentIdInput('');
        loadData();
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncMessage('Failed to sync. Check your ElevenLabs API key.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpload = async () => {
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId || !uploadForm.transcript.trim()) return;

    setIsUploading(true);
    try {
      const res = await fetch('/api/conversations/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          participantName: uploadForm.participantName || undefined,
          participantEmail: uploadForm.participantEmail || undefined,
          transcript: uploadForm.transcript,
          notes: uploadForm.notes || undefined,
          conversedAt: uploadForm.conversedAt || undefined,
        }),
      });

      if (res.ok) {
        setShowUploadModal(false);
        setUploadForm({ participantName: '', participantEmail: '', transcript: '', notes: '', conversedAt: '' });
        loadData();
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data.conversation);
      }
    } catch (error) {
      console.error('Failed to load conversation detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = conversations.filter((c) => {
    if (filter !== 'all' && c.source !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        c.participantName?.toLowerCase().includes(q) ||
        c.participantEmail?.toLowerCase().includes(q) ||
        c.participantPhone?.includes(q) ||
        c.externalId?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalConversations = conversations.length;
  const elevenlabsCount = conversations.filter((c) => c.source === 'elevenlabs').length;
  const manualCount = conversations.filter((c) => c.source === 'manual').length;
  const totalDuration = conversations.reduce((sum, c) => sum + (c.duration || 0), 0);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      in_progress: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
      failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
        {status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
      </span>
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Qualitative</h1>
          <p className="text-[var(--foreground-muted)] mt-1">
            Conversation transcripts from ElevenLabs and manual uploads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Transcript
          </button>
          <button
            onClick={() => handleSync()}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync from ElevenLabs
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMessage && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${syncMessage.startsWith('Error') ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
          {syncMessage}
        </div>
      )}

      {/* Agent ID Prompt */}
      {showAgentIdPrompt && (
        <div className="mb-6 card p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Enter your ElevenLabs Agent ID</h3>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">
            This will be saved to your project for future syncs.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={agentIdInput}
              onChange={(e) => setAgentIdInput(e.target.value)}
              placeholder="e.g. abc123..."
              className="input flex-1"
            />
            <button
              onClick={() => {
                if (agentIdInput.trim()) handleSync(agentIdInput.trim());
              }}
              disabled={!agentIdInput.trim() || isSyncing}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Sync'}
            </button>
            <button
              onClick={() => setShowAgentIdPrompt(false)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
          <div className="text-2xl font-bold text-[var(--foreground)]">{totalConversations}</div>
          <div className="text-sm text-[var(--foreground-muted)]">Total Conversations</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-4">
          <div className="text-2xl font-bold text-violet-500 dark:text-violet-400">{elevenlabsCount}</div>
          <div className="text-sm text-[var(--foreground-muted)]">ElevenLabs Synced</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card p-4">
          <div className="text-2xl font-bold text-blue-500 dark:text-blue-400">{manualCount}</div>
          <div className="text-sm text-[var(--foreground-muted)]">Manual Uploads</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card p-4">
          <div className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">
            {totalDuration > 0 ? formatDuration(totalDuration) : '—'}
          </div>
          <div className="text-sm text-[var(--foreground-muted)]">Total Duration</div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-1 bg-[var(--card)] rounded-lg border border-[var(--border)] p-1">
          {(['all', 'elevenlabs', 'manual'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-[var(--brand-primary)] text-white shadow-sm dark:shadow-[0_0_12px_var(--brand-glow)]'
                  : 'text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {f === 'all' ? 'All' : f === 'elevenlabs' ? 'ElevenLabs' : 'Manual'}
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 card">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 text-[var(--foreground-subtle)]" />
          <p className="text-[var(--foreground)] font-medium mb-2">No conversations yet</p>
          <p className="text-[var(--foreground-muted)] text-sm">
            Sync conversations from ElevenLabs or upload a transcript manually.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="table-header border-b border-[var(--border)]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Participant</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Source</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase">Date</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((conv) => (
                <tr key={conv.id} className="table-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        conv.source === 'elevenlabs' ? 'bg-violet-500/10' : 'bg-blue-500/10'
                      }`}>
                        {conv.source === 'elevenlabs' ? (
                          <Bot className="w-4 h-4 text-violet-500" />
                        ) : (
                          <User className="w-4 h-4 text-blue-500" />
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-[var(--foreground)] text-sm">
                          {conv.participantName || conv.participantEmail || 'Unknown'}
                        </div>
                        {conv.participantEmail && conv.participantName && (
                          <div className="text-xs text-[var(--foreground-muted)]">{conv.participantEmail}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      conv.source === 'elevenlabs'
                        ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    }`}>
                      {conv.source === 'elevenlabs' ? 'ElevenLabs' : 'Manual'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(conv.status)}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-[var(--foreground-muted)]">
                      {formatDuration(conv.duration)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      {conv.conversedAt
                        ? new Date(conv.conversedAt).toLocaleDateString()
                        : new Date(conv.createdAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => loadDetail(conv.id)}
                      className="p-2 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)] transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Conversation Detail Panel */}
      <AnimatePresence>
        {(selectedConversation || detailLoading) && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 w-full max-w-xl bg-[var(--card)] shadow-2xl z-50 overflow-y-auto border-l border-[var(--border)]"
          >
            <div className="sticky top-0 bg-[var(--card)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedConversation?.source === 'elevenlabs' ? 'bg-violet-500/10' : 'bg-blue-500/10'
                }`}>
                  {selectedConversation?.source === 'elevenlabs' ? (
                    <Bot className="w-5 h-5 text-violet-500" />
                  ) : (
                    <User className="w-5 h-5 text-blue-500" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--foreground)]">
                    {selectedConversation?.participantName || selectedConversation?.participantEmail || 'Conversation'}
                  </h3>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {selectedConversation?.source === 'elevenlabs' ? 'ElevenLabs' : 'Manual Upload'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedConversation(null)}
                className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-primary)]" />
              </div>
            ) : selectedConversation ? (
              <div className="p-6 space-y-6">
                {/* Info */}
                <div>
                  <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Details</h4>
                  <div className="bg-[var(--muted)] rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--foreground-subtle)]">Status</span>
                      {getStatusBadge(selectedConversation.status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--foreground-subtle)]">Duration</span>
                      <span className="text-sm text-[var(--foreground)]">{formatDuration(selectedConversation.duration)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--foreground-subtle)]">Date</span>
                      <span className="text-sm text-[var(--foreground)]">
                        {selectedConversation.conversedAt
                          ? new Date(selectedConversation.conversedAt).toLocaleString()
                          : new Date(selectedConversation.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {selectedConversation.participantEmail && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--foreground-subtle)]">Email</span>
                        <span className="text-sm text-[var(--foreground)]">{selectedConversation.participantEmail}</span>
                      </div>
                    )}
                    {selectedConversation.externalId && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--foreground-subtle)]">External ID</span>
                        <span className="text-xs text-[var(--foreground-muted)] font-mono">{selectedConversation.externalId}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcript */}
                {selectedConversation.transcript && (
                  <div>
                    <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Transcript</h4>
                    <div className="bg-[var(--muted)] rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">
                      {Array.isArray(selectedConversation.transcript) ? (
                        selectedConversation.transcript.map((entry, i) => (
                          <div
                            key={i}
                            className={`text-sm ${
                              entry.role === 'agent' ? 'text-violet-600 dark:text-violet-400' : 'text-[var(--foreground)]'
                            }`}
                          >
                            <span className="font-medium">{entry.role === 'agent' ? 'Agent' : 'User'}:</span>{' '}
                            {entry.message}
                          </div>
                        ))
                      ) : (
                        <pre className="text-sm text-[var(--foreground)] whitespace-pre-wrap font-sans">
                          {selectedConversation.transcript}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                {/* Analysis */}
                {selectedConversation.analysis && (
                  <div>
                    <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Analysis</h4>
                    <div className="bg-[var(--muted)] rounded-lg p-4">
                      <pre className="text-sm text-[var(--foreground)] whitespace-pre-wrap font-sans">
                        {JSON.stringify(selectedConversation.analysis, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedConversation.metadata && (
                  <div>
                    <h4 className="text-xs font-medium text-[var(--foreground-subtle)] uppercase mb-2">Metadata</h4>
                    <div className="bg-[var(--muted)] rounded-lg p-4">
                      {selectedConversation.metadata.notes ? (
                        <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                          {String(selectedConversation.metadata.notes)}
                        </p>
                      ) : (
                        <pre className="text-xs text-[var(--foreground-muted)] whitespace-pre-wrap font-mono">
                          {JSON.stringify(selectedConversation.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowUploadModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--card)] rounded-xl shadow-2xl w-full max-w-lg border border-[var(--border)]"
            >
              <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">Upload Transcript</h3>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-1 hover:bg-[var(--muted)] rounded-lg text-[var(--foreground-muted)]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground-muted)] block mb-1">Participant Name</label>
                    <input
                      type="text"
                      value={uploadForm.participantName}
                      onChange={(e) => setUploadForm((f) => ({ ...f, participantName: e.target.value }))}
                      placeholder="John Doe"
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground-muted)] block mb-1">Participant Email</label>
                    <input
                      type="email"
                      value={uploadForm.participantEmail}
                      onChange={(e) => setUploadForm((f) => ({ ...f, participantEmail: e.target.value }))}
                      placeholder="john@example.com"
                      className="input w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--foreground-muted)] block mb-1">Date of Conversation</label>
                  <input
                    type="datetime-local"
                    value={uploadForm.conversedAt}
                    onChange={(e) => setUploadForm((f) => ({ ...f, conversedAt: e.target.value }))}
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--foreground-muted)] block mb-1">
                    Transcript <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-[var(--foreground-subtle)] mb-2">
                    Paste JSON array ([&#123;&quot;role&quot;: &quot;user&quot;, &quot;message&quot;: &quot;...&quot;&#125;, ...]) or plain text.
                  </p>
                  <textarea
                    value={uploadForm.transcript}
                    onChange={(e) => setUploadForm((f) => ({ ...f, transcript: e.target.value }))}
                    placeholder={'[{"role": "user", "message": "Hello"}, {"role": "agent", "message": "Hi there!"}]'}
                    rows={8}
                    className="input w-full font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--foreground-muted)] block mb-1">Notes</label>
                  <textarea
                    value={uploadForm.notes}
                    onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Additional context or notes..."
                    rows={3}
                    className="input w-full"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--muted)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!uploadForm.transcript.trim() || isUploading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--brand-primary)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Upload'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
