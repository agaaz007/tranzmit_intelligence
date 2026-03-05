'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Sparkles,
  ChevronDown,
  Eye,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  ShieldAlert,
} from 'lucide-react';

interface Evidence {
  sourceType: string;
  sourceId: string;
  excerpt: string;
  relevance: number;
}

interface AffectedArchetype {
  archetypeId: string;
  archetypeName: string;
  count: number;
}

interface Pattern {
  id: string;
  churnType: string | null;
  patternType: string;
  title: string;
  description: string;
  confidence: number;
  evidence: Evidence[];
  sourceTypes: string[];
  suggestion: string | null;
  affectedArchetypes: AffectedArchetype[];
  priority: string;
  status: string;
  affectedUserCount: number;
  createdAt: string;
}

const patternTypeConfig: Record<string, { icon: typeof AlertTriangle; label: string; color: string }> = {
  conversion_blocker: { icon: AlertTriangle, label: 'Conversion Blocker', color: 'text-red-500' },
  behavioral_cluster: { icon: TrendingUp, label: 'Behavioral Cluster', color: 'text-blue-500' },
  feature_suggestion: { icon: Lightbulb, label: 'Feature Suggestion', color: 'text-amber-500' },
  risk_indicator: { icon: ShieldAlert, label: 'Risk Indicator', color: 'text-orange-500' },
};

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

function PatternCard({ pattern, onStatusChange }: { pattern: Pattern; onStatusChange: (id: string, status: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const config = patternTypeConfig[pattern.patternType] || patternTypeConfig.behavioral_cluster;
  const Icon = config.icon;

  return (
    <div className="bg-white dark:bg-[#141414] rounded-xl border border-gray-200 dark:border-transparent overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full p-5 text-left hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${priorityColors[pattern.priority]}`} />
              <span className="font-medium text-gray-900 dark:text-white">{pattern.title}</span>
              <span className="text-xs text-gray-400 dark:text-[#666]">{config.label}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-[#888] line-clamp-1">{pattern.description}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-400 dark:text-[#666]">{(pattern.confidence * 100).toFixed(0)}% confidence</span>
            <span className="text-xs text-gray-400 dark:text-[#666]">{pattern.affectedUserCount} users</span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-gray-200 dark:border-[#222] space-y-4">
              <p className="text-sm text-gray-600 dark:text-[#888] mt-4">{pattern.description}</p>

              {/* Evidence Chain */}
              {pattern.evidence.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide mb-2">Evidence Chain</p>
                  <div className="space-y-2">
                    {pattern.evidence.map((e, i) => (
                      <div key={i} className="border-l-2 border-blue-500 pl-3 py-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase">{e.sourceType}</span>
                          <span className="text-xs text-gray-400 dark:text-[#666]">{(e.relevance * 100).toFixed(0)}% relevant</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-[#888]">{e.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestion */}
              {pattern.suggestion && (
                <div className="bg-emerald-50 dark:bg-[#0d1f17] rounded-lg p-3">
                  <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide mb-1">Suggestion</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{pattern.suggestion}</p>
                </div>
              )}

              {/* Affected Archetypes */}
              {pattern.affectedArchetypes.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide mb-2">Affected Archetypes</p>
                  <div className="flex flex-wrap gap-2">
                    {pattern.affectedArchetypes.map((a, i) => (
                      <span key={i} className="text-xs bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-[#ccc] px-2 py-1 rounded">
                        {a.archetypeName} ({a.count})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => onStatusChange(pattern.id, 'reviewed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-[#1a1a1a] text-gray-600 dark:text-[#888] hover:bg-gray-200 dark:hover:bg-[#222] transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" /> Reviewed
                </button>
                <button
                  onClick={() => onStatusChange(pattern.id, 'accepted')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Accept
                </button>
                <button
                  onClick={() => onStatusChange(pattern.id, 'dismissed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" /> Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    const id = localStorage.getItem('currentProjectId');
    if (id) {
      setProjectId(id);
      loadPatterns(id);
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadPatterns = async (projId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/patterns?projectId=${projId}`);
      const data = await res.json();
      if (data.patterns) setPatterns(data.patterns);
    } catch (e) {
      console.error('Failed to load patterns:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscover = async () => {
    if (!projectId) return;
    setIsDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await fetch('/api/patterns/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.errors?.length > 0) {
        setDiscoverResult(`Errors: ${data.errors.join(', ')}`);
      } else {
        setDiscoverResult(`Created ${data.patternsCreated || 0}, updated ${data.patternsUpdated || 0}`);
      }
      await loadPatterns(projectId);
    } catch (e) {
      console.error('Discovery failed:', e);
      setDiscoverResult(`Failed: ${e}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/patterns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setPatterns(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  const filtered = patterns.filter(p => {
    if (p.status === 'dismissed') return false;
    if (activeTab === 'all') return true;
    return p.churnType === activeTab;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      <div className="px-8 pt-8 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--brand-primary)]" />
              <h1 className="text-xl font-medium text-gray-900 dark:text-white">Discoveries</h1>
            </div>
            <p className="text-gray-500 dark:text-[#666] text-sm mt-1">AI-discovered patterns across sessions, interviews, and errors</p>
          </div>
          <button
            onClick={handleDiscover}
            disabled={isDiscovering}
            className="px-5 py-2.5 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-black rounded-full hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isDiscovering ? 'animate-spin' : ''}`} />
            {isDiscovering ? 'Discovering...' : 'Run Discovery'}
          </button>
        </div>
      </div>

      {/* Discovery Result */}
      {discoverResult && (
        <div className="px-8 pb-2">
          <p className={`text-sm px-4 py-2 rounded-lg ${
            discoverResult.startsWith('Errors') || discoverResult.startsWith('Failed')
              ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          }`}>
            {discoverResult}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="px-8 pb-4">
        <div className="flex gap-1 bg-gray-100 dark:bg-[#141414] rounded-lg p-1 w-fit">
          {(['all', 'unpaid', 'paid'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-white dark:bg-[#222] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-[#666] hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'unpaid' ? 'Unpaid Churn' : 'Paid Churn'}
            </button>
          ))}
        </div>
      </div>

      {/* Pattern List */}
      <div className="px-8 pb-8">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <Sparkles className="w-8 h-8 text-gray-300 dark:text-[#333] mx-auto mb-3" />
            <p className="text-gray-500 dark:text-[#666] text-sm">No patterns discovered yet. Click &quot;Run Discovery&quot; to analyze your data.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <PatternCard key={p.id} pattern={p} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
