'use client';

import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Users, AlertTriangle, Monitor, Smartphone, Globe } from 'lucide-react';

interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  dropOffCount: number;
  avgTimeToConvert?: number;
}

interface PostHogConfig {
  apiKey: string;
  projectId: string;
  host: string;
}

interface InteractiveFunnelMapProps {
  steps: FunnelStep[];
  funnelId?: string | number;
  posthogConfig?: PostHogConfig;
  localProjectId?: string; // Local database project ID for cohort creation
  onAnalyzeDropOff: (step: FunnelStep, stepIndex: number) => void;
  onCreateCohort?: (stepIndex: number, cohortType: 'converted' | 'dropped') => void;
}

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
};

// Custom Step Node Component
function StepNode({ data }: { data: { step: FunnelStep; index: number; isFirst: boolean; isLast: boolean; maxCount: number; onSelect: (idx: number, type: 'converted' | 'dropped') => void } }) {
  const { step, index, isFirst, isLast, maxCount, onSelect } = data;
  const barHeight = Math.max(24, (step.count / maxCount) * 120);
  
  return (
    <div className="relative">
      {!isFirst && <Handle type="target" position={Position.Left} className="!bg-slate-300 !w-2 !h-2 !border-0" />}
      
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06 }}
        className="bg-white rounded-xl border border-slate-200 p-4 w-[180px] hover:shadow-md transition-shadow"
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
            isFirst ? 'text-indigo-600' : isLast ? 'text-emerald-600' : 'text-slate-400'
          }`}>
            Step {index + 1}
          </span>
        </div>
        
        {/* Step Name */}
        <h3 className="font-medium text-slate-900 text-sm mb-0.5 truncate" title={step.name}>
          {step.name || 'Unnamed Step'}
        </h3>
        
        {/* User Count */}
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-2xl font-semibold text-slate-900 tabular-nums">{formatNumber(step.count)}</span>
          <span className="text-xs text-slate-400">users</span>
        </div>
        
        {/* Visual Bar */}
        <div className="relative h-[130px] bg-slate-50 rounded-lg overflow-hidden mb-3">
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: barHeight }}
            transition={{ delay: index * 0.06 + 0.15, duration: 0.4, ease: 'easeOut' }}
            className={`absolute bottom-0 left-0 right-0 ${
              isFirst ? 'bg-indigo-500' : isLast ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          />
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            <span className={`text-sm font-semibold tabular-nums ${
              barHeight > 40 ? 'text-white' : 'text-slate-600'
            }`}>
              {step.conversionRate?.toFixed(1) || 0}%
            </span>
          </div>
        </div>
        
        {/* Action Buttons */}
        {!isLast && (
          <div className="flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(index, 'converted'); }}
              className="flex-1 px-2 py-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
            >
              Converted
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(index, 'dropped'); }}
              className="flex-1 px-2 py-1.5 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Dropped
            </button>
          </div>
        )}
      </motion.div>
      
      {!isLast && <Handle type="source" position={Position.Right} className="!bg-slate-300 !w-2 !h-2 !border-0" />}
    </div>
  );
}

// Custom Edge Label Component  
function ConversionEdge({ data }: { data: { converted: number; dropped: number; conversionRate: number; dropRate: number } }) {
  return (
    <div className="flex flex-col items-center gap-1 text-xs">
      <span className="text-slate-500 tabular-nums">{data.conversionRate.toFixed(0)}%</span>
      <div className="w-px h-3 bg-slate-200" />
      <span className="text-slate-400 tabular-nums">-{data.dropRate.toFixed(0)}%</span>
    </div>
  );
}

// Correlation Event Interface
interface CorrelationEvent {
  event: string;
  success_count: number;
  failure_count: number;
  odds_ratio: number;
  correlation_type: 'success' | 'failure';
  success_percentage: number;
  failure_percentage: number;
}

// Deep Analysis Interface
interface DeepAnalysis {
  lastEvents: Array<{ event: string; count: number }>;
  lastPages: Array<{ page: string; count: number }>;
  userJourneys: Record<string, Array<{ event: string; timestamp: string; url?: string; pathname?: string }>>;
  errors: Array<{ userId: string; event: string; message?: string; elementText?: string; timestamp: string }>;
  devices: Array<{ browser: string; deviceType: string; os: string; userCount: number }>;
  analyzedUsers: number;
}

// Cohort Analysis Panel
function CohortPanel({
  stepIndex,
  type,
  steps,
  onClose,
  posthogConfig,
  funnelId,
  localProjectId
}: {
  stepIndex: number;
  type: 'converted' | 'dropped';
  steps: FunnelStep[];
  onClose: () => void;
  onCreateCohort?: (stepIndex: number, type: 'converted' | 'dropped') => void;
  onAnalyzeDropOff: (step: FunnelStep, stepIndex: number) => void;
  posthogConfig?: PostHogConfig;
  funnelId?: string | number;
  localProjectId?: string;
}) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  
  // Tab state: 'users' | 'correlations' | 'analysis'
  const [activeTab, setActiveTab] = useState<'users' | 'correlations' | 'analysis'>('users');
  
  // Correlation analysis state
  const [correlations, setCorrelations] = useState<CorrelationEvent[]>([]);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  
  // Deep analysis state
  const [deepAnalysis, setDeepAnalysis] = useState<DeepAnalysis | null>(null);
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [deepAnalysisError, setDeepAnalysisError] = useState<string | null>(null);

  const step = steps[stepIndex];
  const nextStep = steps[stepIndex + 1];
  const count = type === 'converted' ? (nextStep?.count || 0) : (step.count - (nextStep?.count || 0));

  React.useEffect(() => {
    const fetchUsers = async () => {
      if (!posthogConfig?.apiKey) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/posthog', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-posthog-key': posthogConfig.apiKey,
            'x-posthog-project': posthogConfig.projectId,
            'x-posthog-host': posthogConfig.host,
          },
          body: JSON.stringify({ action: 'get-funnel-user-ids', funnelId, stepIndex, cohortType: type }),
        });
        const data = await res.json();
        setUserIds(data.userIds || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [stepIndex, type, posthogConfig, funnelId]);

  const handleAnalyze = async () => {
    if (!posthogConfig?.apiKey || !funnelId) return;
    
    setCorrelationLoading(true);
    setCorrelationError(null);
    setActiveTab('correlations');
    
    try {
      const res = await fetch('/api/posthog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-posthog-key': posthogConfig.apiKey,
          'x-posthog-project': posthogConfig.projectId,
          'x-posthog-host': posthogConfig.host,
        },
        body: JSON.stringify({ action: 'funnel-correlation', funnelId, stepIndex }),
      });
      const data = await res.json();
      
      if (data.error) {
        setCorrelationError(data.error);
      } else {
        setCorrelations(data.correlations || []);
      }
    } catch (e) {
      console.error(e);
      setCorrelationError('Failed to fetch correlation data');
    } finally {
      setCorrelationLoading(false);
    }
  };

  const handleDeepAnalysis = async () => {
    if (!posthogConfig?.apiKey || userIds.length === 0) return;
    
    setDeepAnalysisLoading(true);
    setDeepAnalysisError(null);
    setActiveTab('analysis');
    
    try {
      const res = await fetch('/api/posthog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-posthog-key': posthogConfig.apiKey,
          'x-posthog-project': posthogConfig.projectId,
          'x-posthog-host': posthogConfig.host,
        },
        body: JSON.stringify({ action: 'deep-analysis', userIds }),
      });
      const data = await res.json();
      
      if (data.error) {
        setDeepAnalysisError(data.error);
      } else {
        setDeepAnalysis(data);
      }
    } catch (e) {
      console.error(e);
      setDeepAnalysisError('Failed to run deep analysis');
    } finally {
      setDeepAnalysisLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!posthogConfig?.apiKey || !funnelId) return;
    setCreating(true);
    try {
      // Fetch correlation data if not already loaded
      let correlationData = correlations;
      if (correlationData.length === 0) {
        try {
          const res = await fetch('/api/posthog', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-posthog-key': posthogConfig.apiKey,
              'x-posthog-project': posthogConfig.projectId,
              'x-posthog-host': posthogConfig.host,
            },
            body: JSON.stringify({ action: 'funnel-correlation', funnelId, stepIndex }),
          });
          const data = await res.json();
          correlationData = data.correlations || [];
        } catch (e) {
          console.error('Failed to fetch correlations:', e);
        }
      }
      
      // Fetch deep analysis data if not already loaded
      let analysisData = deepAnalysis;
      if (!analysisData && userIds.length > 0) {
        try {
          const res = await fetch('/api/posthog', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-posthog-key': posthogConfig.apiKey,
              'x-posthog-project': posthogConfig.projectId,
              'x-posthog-host': posthogConfig.host,
            },
            body: JSON.stringify({ action: 'deep-analysis', userIds }),
          });
          const data = await res.json();
          if (!data.error) {
            analysisData = data;
          }
        } catch (e) {
          console.error('Failed to fetch analysis:', e);
        }
      }
      
      // Filter correlations based on type: <1 for converted, >1 for dropped (strict inequality)
      const relevantCorrelationData = correlationData.filter((c: CorrelationEvent) => 
        type === 'dropped' ? c.odds_ratio > 1 : c.odds_ratio < 1
      ).sort((a: CorrelationEvent, b: CorrelationEvent) => 
        type === 'dropped' ? b.odds_ratio - a.odds_ratio : a.odds_ratio - b.odds_ratio
      );
      
      const cohortName = `${type === 'converted' ? 'Converted' : 'Dropped'} at ${step.name} - ${new Date().toLocaleDateString()}`;
      await fetch('/api/posthog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-posthog-key': posthogConfig.apiKey,
          'x-posthog-project': posthogConfig.projectId,
          'x-posthog-host': posthogConfig.host,
        },
        body: JSON.stringify({ 
          action: 'create-funnel-cohort', 
          funnelId, 
          stepIndex, 
          cohortType: type, 
          cohortName, 
          localProjectId,
          correlations: relevantCorrelationData,
          analysis: analysisData,
          stepName: step.name,
          conversionRate: step.conversionRate,
          dropOffRate: step.dropOffRate,
        }),
      });
      setCreated(true);
      setTimeout(() => setCreated(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  // Filter correlations based on type: <1 for converted, >1 for dropped (strict inequality)
  const relevantCorrelations = correlations.filter(c => 
    type === 'dropped' ? c.odds_ratio > 1 : c.odds_ratio < 1
  ).sort((a, b) => 
    type === 'dropped' ? b.odds_ratio - a.odds_ratio : a.odds_ratio - b.odds_ratio
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-50"
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-h-[85vh] bg-white rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${type === 'converted' ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <h3 className="text-lg font-bold text-slate-900">
                {type === 'converted' ? 'Converted' : 'Dropped'} at Step {stepIndex + 1}
              </h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors group"
            >
              <X className="w-5 h-5 text-slate-400 group-hover:text-slate-600" />
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-2" title={step.name}>{step.name}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">{formatNumber(count)}</span>
            <span className="text-sm text-slate-400">users</span>
          </div>
        </div>

      {/* Tab Buttons */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'users'
              ? 'text-slate-900 border-b-2 border-slate-900' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Users ({userIds.length})
        </button>
        <button
          onClick={() => { if (activeTab !== 'correlations' && correlations.length === 0) handleAnalyze(); else setActiveTab('correlations'); }}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'correlations'
              ? 'text-slate-900 border-b-2 border-slate-900' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Correlations
        </button>
        <button
          onClick={() => { if (activeTab !== 'analysis' && !deepAnalysis) handleDeepAnalysis(); else setActiveTab('analysis'); }}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'analysis'
              ? 'text-slate-900 border-b-2 border-slate-900' 
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Analysis
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'users' ? (
          // User IDs Tab
          <>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : userIds.length > 0 ? (
              <div className="space-y-2">
                {userIds.slice(0, 50).map((id, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                    <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-sm text-slate-700 truncate">{id}</span>
                  </div>
                ))}
                {userIds.length > 50 && (
                  <p className="text-center text-sm text-slate-500 py-2">+{userIds.length - 50} more users</p>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No user data available</p>
              </div>
            )}
          </>
        ) : activeTab === 'correlations' ? (
          // Correlation Analysis Tab
          <>
            {correlationLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400 mb-3" />
                <p className="text-sm text-slate-500">Loading correlations...</p>
              </div>
            ) : correlationError ? (
              <div className="text-center py-16">
                <p className="text-sm text-slate-500 mb-3">{correlationError}</p>
                <button
                  onClick={handleAnalyze}
                  className="text-sm text-slate-900 underline hover:no-underline"
                >
                  Try again
                </button>
              </div>
            ) : relevantCorrelations.length > 0 ? (
              <div className="space-y-1">
                {/* Simple header */}
                <p className="text-xs text-slate-500 mb-4 font-medium tracking-wide uppercase">
                  {type === 'dropped' ? 'Events correlated with drop-off' : 'Events correlated with conversion'}
                </p>

                {/* Clean table-like list */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                    <span>Event</span>
                    <span className="text-right">Dropped</span>
                    <span className="text-right">Converted</span>
                    <span className="text-right">Ratio</span>
                  </div>
                  
                  {/* Rows */}
                  {relevantCorrelations.map((correlation, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.03 }}
                      className={`grid grid-cols-[1fr_80px_80px_60px] gap-2 px-3 py-3 items-center ${
                        idx !== relevantCorrelations.length - 1 ? 'border-b border-slate-100' : ''
                      } hover:bg-slate-50/50 transition-colors`}
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-sm text-slate-800 truncate block">
                          {correlation.event}
                        </span>
                      </div>
                      <span className="text-right text-sm tabular-nums text-slate-600">
                        {correlation.failure_percentage.toFixed(0)}%
                      </span>
                      <span className="text-right text-sm tabular-nums text-slate-600">
                        {correlation.success_percentage.toFixed(0)}%
                      </span>
                      <span className={`text-right text-sm font-semibold tabular-nums ${
                        type === 'dropped' ? 'text-red-600' : 'text-emerald-600'
                      }`}>
                        {correlation.odds_ratio.toFixed(2)}×
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Simple interpretation footer */}
                <p className="text-xs text-slate-400 mt-4 leading-relaxed">
                  {type === 'dropped' 
                    ? 'Higher ratio = stronger correlation with drop-off. Events above 1× indicate friction.'
                    : 'Lower ratio = stronger correlation with conversion. Events below 1× indicate success patterns.'}
                </p>
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-sm text-slate-400">
                  No significant correlations found for this step.
                </p>
              </div>
            )}
          </>
        ) : (
          // Deep Analysis Tab
          <>
            {deepAnalysisLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400 mb-4" />
                <p className="text-base font-medium text-slate-600">Running deep analysis...</p>
                <p className="text-sm text-slate-400 mt-1">Analyzing user journeys, errors & devices</p>
              </div>
            ) : deepAnalysisError ? (
              <div className="text-center py-16">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-red-300" />
                <p className="text-sm text-slate-500 mb-3">{deepAnalysisError}</p>
                <button
                  onClick={handleDeepAnalysis}
                  className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800"
                >
                  Try again
                </button>
              </div>
            ) : deepAnalysis ? (
              <div className="space-y-6">
                {/* Last Events Before Drop-off */}
                {deepAnalysis.lastEvents.length > 0 && (
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                    <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                      <span className="text-lg">⭐</span> Last Events Before {type === 'dropped' ? 'Drop-off' : 'Conversion'}
                    </h4>
                    <p className="text-xs text-amber-700 mb-3">What users did right before leaving</p>
                    <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                      {deepAnalysis.lastEvents.slice(0, 6).map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-4 py-3 ${idx !== Math.min(deepAnalysis.lastEvents.length, 6) - 1 ? 'border-b border-amber-100' : ''}`}>
                          <span className="font-mono text-sm text-slate-800">{item.event}</span>
                          <span className="text-sm font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{item.count} users</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last Pages */}
                {deepAnalysis.lastPages.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-200">
                    <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-600" /> Last Pages Visited
                    </h4>
                    <p className="text-xs text-blue-700 mb-3">Pages where users got stuck or left</p>
                    <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                      {deepAnalysis.lastPages.slice(0, 5).map((item, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-4 py-3 ${idx !== Math.min(deepAnalysis.lastPages.length, 5) - 1 ? 'border-b border-blue-100' : ''}`}>
                          <span className="font-mono text-xs text-slate-700 truncate max-w-[260px]" title={item.page}>{item.page}</span>
                          <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors & Frustration */}
                {deepAnalysis.errors.length > 0 && (
                  <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-4 border border-red-200">
                    <h4 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" /> Errors & Frustration Signals
                    </h4>
                    <p className="text-xs text-red-700 mb-3">Technical issues and UI frustrations detected</p>
                    <div className="space-y-2">
                      {deepAnalysis.errors.slice(0, 5).map((error, idx) => (
                        <div key={idx} className="bg-white rounded-lg border border-red-200 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                              error.event === '$exception' ? 'bg-red-500 text-white' :
                              error.event === '$rageclick' ? 'bg-orange-500 text-white' :
                              'bg-amber-500 text-white'
                            }`}>
                              {error.event === '$exception' ? '🔴 Error' : error.event === '$rageclick' ? '😤 Rage Click' : '👆 Dead Click'}
                            </span>
                          </div>
                          {error.message && (
                            <p className="text-sm text-red-800 font-mono bg-red-50 p-2 rounded truncate">{error.message}</p>
                          )}
                          {error.elementText && (
                            <p className="text-sm text-slate-600 mt-1">Clicked on: <span className="font-medium">&quot;{error.elementText}&quot;</span></p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Device Distribution */}
                {deepAnalysis.devices.length > 0 && (
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-200">
                    <h4 className="text-sm font-bold text-violet-800 mb-3 flex items-center gap-2">
                      <Monitor className="w-5 h-5 text-violet-600" /> Device & Browser Patterns
                    </h4>
                    <p className="text-xs text-violet-700 mb-3">Check for platform-specific issues</p>
                    <div className="bg-white rounded-lg border border-violet-200 overflow-hidden">
                      {deepAnalysis.devices.slice(0, 5).map((device, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-4 py-3 ${idx !== Math.min(deepAnalysis.devices.length, 5) - 1 ? 'border-b border-violet-100' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${device.deviceType === 'Mobile' ? 'bg-green-100' : 'bg-slate-100'}`}>
                              {device.deviceType === 'Mobile' ? (
                                <Smartphone className="w-4 h-4 text-green-600" />
                              ) : (
                                <Monitor className="w-4 h-4 text-slate-600" />
                              )}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-slate-800">{device.browser}</span>
                              <span className="text-xs text-slate-400 ml-2">on {device.os}</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded">{device.userCount} users</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sample User Journeys */}
                {Object.keys(deepAnalysis.userJourneys).length > 0 && (
                  <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl p-4 border border-slate-200">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Users className="w-5 h-5 text-slate-600" /> Sample User Journeys
                    </h4>
                    <p className="text-xs text-slate-600 mb-3">Step-by-step paths users took</p>
                    <div className="space-y-2">
                      {Object.entries(deepAnalysis.userJourneys).slice(0, 3).map(([, events], idx) => (
                        <details key={idx} className="bg-white rounded-lg border border-slate-200 overflow-hidden group">
                          <summary className="px-4 py-3 cursor-pointer font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between">
                            <span>👤 User {idx + 1}</span>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">{events.length} events</span>
                          </summary>
                          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 space-y-2 max-h-40 overflow-auto">
                            {events.slice(0, 8).map((event, eventIdx) => (
                              <div key={eventIdx} className="flex items-center gap-3 text-sm">
                                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-bold">{eventIdx + 1}</span>
                                <span className="font-mono text-slate-700">{event.event}</span>
                                {event.pathname && (
                                  <span className="text-slate-400 text-xs truncate max-w-[120px]">{event.pathname}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-center pt-2">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                    ✓ Analyzed {deepAnalysis.analyzedUsers} users
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Monitor className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-base font-medium text-slate-600">Deep Analysis</p>
                <p className="text-sm text-slate-400 mt-1 mb-4">Analyze user journeys, errors & device patterns</p>
                <button
                  onClick={handleDeepAnalysis}
                  disabled={userIds.length === 0}
                  className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  Run Analysis
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Action */}
      <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
        {activeTab === 'users' && (
          <button
            onClick={handleDeepAnalysis}
            disabled={deepAnalysisLoading || userIds.length === 0}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
              deepAnalysisLoading || userIds.length === 0
                ? 'bg-slate-200 text-slate-400'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {deepAnalysisLoading ? 'Analyzing...' : 'Run Deep Analysis'}
          </button>
        )}
        
        <button
          onClick={handleCreate}
          disabled={creating || created}
          className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
            created 
              ? 'bg-emerald-100 text-emerald-700' 
              : creating 
                ? 'bg-slate-200 text-slate-400'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {creating ? 'Creating...' : created ? '✓ Cohort Created' : 'Create Cohort'}
        </button>
      </div>
      </motion.div>
    </>
  );
}

const nodeTypes = { stepNode: StepNode };

export default function InteractiveFunnelMap({ steps, funnelId, posthogConfig, localProjectId, onAnalyzeDropOff, onCreateCohort }: InteractiveFunnelMapProps) {
  const [selectedCohort, setSelectedCohort] = useState<{ stepIndex: number; type: 'converted' | 'dropped' } | null>(null);
  
  const maxCount = Math.max(...steps.map(s => s.count));

  const initialNodes: Node[] = useMemo(() => 
    steps.map((step, index) => ({
      id: `step-${index}`,
      type: 'stepNode',
      position: { x: index * 320, y: 100 },
      data: { 
        step, 
        index, 
        isFirst: index === 0, 
        isLast: index === steps.length - 1,
        maxCount,
        onSelect: (idx: number, type: 'converted' | 'dropped') => setSelectedCohort({ stepIndex: idx, type })
      },
    }))
  , [steps, maxCount]);

  const initialEdges: Edge[] = useMemo(() => 
    steps.slice(0, -1).map((step, index) => {
      const nextCount = steps[index + 1]?.count || 0;
      const dropped = step.count - nextCount;
      const conversionRate = step.count > 0 ? (nextCount / step.count) * 100 : 0;
      const dropRate = step.count > 0 ? (dropped / step.count) * 100 : 0;
      
      return {
        id: `edge-${index}`,
        source: `step-${index}`,
        target: `step-${index + 1}`,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 3 },
        label: (
          <ConversionEdge data={{ converted: nextCount, dropped, conversionRate, dropRate }} />
        ),
        labelStyle: { fill: 'transparent' },
        labelBgStyle: { fill: 'transparent' },
      };
    })
  , [steps]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="w-full h-full relative" style={{ minHeight: '500px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#f1f5f9" />
        <Controls 
          showInteractive={false}
          className="!bg-white !shadow-sm !rounded-lg !border !border-slate-200"
        />
        <MiniMap 
          nodeColor={() => '#64748b'}
          className="!bg-white !shadow-sm !rounded-lg !border !border-slate-200"
          maskColor="rgba(0,0,0,0.05)"
        />
      </ReactFlow>

      {/* Cohort Analysis Panel */}
      <AnimatePresence>
        {selectedCohort && (
          <CohortPanel
            stepIndex={selectedCohort.stepIndex}
            type={selectedCohort.type}
            steps={steps}
            onClose={() => setSelectedCohort(null)}
            onCreateCohort={onCreateCohort}
            onAnalyzeDropOff={onAnalyzeDropOff}
            posthogConfig={posthogConfig}
            funnelId={funnelId}
            localProjectId={localProjectId}
          />
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 text-xs text-slate-400">
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
}
