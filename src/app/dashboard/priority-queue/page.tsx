'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Loader2,
  Mail,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  AlertCircle,
  MousePointer,
  Bug,
  HelpCircle,
  UserX,
  Star,
  Copy,
  Send,
  MapPin,
  Globe,
  Clock,
  Link2,
  Repeat,
  TrendingDown,
  Zap,
  Navigation,
  Timer,
  Activity,
  RotateCcw,
} from 'lucide-react';

type InterviewCohortType = 'technical_victim' | 'confused_browser' | 'wrong_fit' | 'high_value';

interface ClassifiedUser {
  distinctId: string;
  email?: string;
  name?: string;
  properties: Record<string, any>;
  signals: Array<{
    type: string;
    description: string;
    weight: number;
    metadata?: Record<string, any>;
  }>;
  priorityScore: number;
  signalSummary: string;
  cohortType: InterviewCohortType;
  cohortReason: string;
  correlationSignals: Array<{
    event: { event: string; properties?: Record<string, any> };
    odds_ratio: number;
    correlation_type: string;
  }>;
  recommendedAction: 'interview' | 'bug_report' | 'ignore' | 'follow_up';
  // User context from PostHog
  initialReferrer?: string;
  cityName?: string;
  countryName?: string;
  createdAt?: string;
}

interface ContextualOutreach {
  userId: string;
  email?: string;
  cohortType: InterviewCohortType;
  subject: string;
  body: string;
  contextualDetails: {
    dropoffStep: string;
    correlationSignal?: string;
    sessionInsight?: string;
  };
}


interface CorrelationWithFunnel {
  event: { event: string; properties?: Record<string, any> };
  odds_ratio: number;
  correlation_type: string;
  success_count: number;
  failure_count: number;
  funnelName: string;
  dropoffStep: string;
}

interface FunnelCorrelationSummary {
  funnelName: string;
  funnelId: number;
  dropoffStep: string;
  dropoffStepIndex: number;
  dropoffRate: number;
  correlations: Array<{
    event: { event: string; properties?: Record<string, any> };
    odds_ratio: number;
    correlation_type: string;
  }>;
}

interface CorrelationAnalysis {
  funnels: FunnelCorrelationSummary[];
  topCorrelations: CorrelationWithFunnel[];
  hasErrorCorrelations: boolean;
  hasBrowserCorrelations: boolean;
}

// Advanced signal user type (from new API)
interface AdvancedSignalUser {
  distinctId: string;
  email?: string;
  name?: string;
  properties: Record<string, any>;
  signals: Array<{
    type: string;
    description: string;
    weight: number;
    metadata?: Record<string, any>;
  }>;
  priorityScore: number;
  signalSummary: string;
}

interface AdvancedSignalStats {
  totalUsers: number;
  totalSignals: number;
  avgPriorityScore: number;
  signalBreakdown: Record<string, number>;
  topSignalTypes: Array<{ type: string; count: number }>;
}

export default function PriorityQueuePage() {
  const [users, setUsers] = useState<ClassifiedUser[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [projectId, setProjectId] = useState<string>('');
  const [cohortFilter, setCohortFilter] = useState<InterviewCohortType | 'all'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [posthogHost, setPosthogHost] = useState<string>('https://us.posthog.com');
  const [posthogProjectId, setPosthogProjectId] = useState<string>('');
  const [outreachModal, setOutreachModal] = useState<{ user: ClassifiedUser; outreach?: ContextualOutreach } | null>(null);
  const [generatingOutreach, setGeneratingOutreach] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [correlationAnalysis, setCorrelationAnalysis] = useState<CorrelationAnalysis | null>(null);
  
  // Advanced signals state
  const [advancedUsers, setAdvancedUsers] = useState<AdvancedSignalUser[]>([]);
  const [advancedStats, setAdvancedStats] = useState<AdvancedSignalStats | null>(null);
  const [isLoadingAdvanced, setIsLoadingAdvanced] = useState(false);
  const [advancedSignalFilter, setAdvancedSignalFilter] = useState<string>('all');

  useEffect(() => {
    const initializeProject = async () => {
      let currentProjectId = localStorage.getItem('currentProjectId');

      if (!currentProjectId) {
        try {
          const response = await fetch('/api/projects');
          const data = await response.json();
          if (data.projects && data.projects.length > 0) {
            currentProjectId = data.projects[0].id;
            localStorage.setItem('currentProjectId', currentProjectId as string);
          }
        } catch (err) {
          console.error('Failed to fetch projects:', err);
        }
      }

      if (currentProjectId) {
        setProjectId(currentProjectId);
        loadClassifiedUsers(currentProjectId);
      } else {
        setIsLoading(false);
      }
    };

    initializeProject();
  }, []);

  const loadClassifiedUsers = async (projId: string, cohort?: InterviewCohortType | 'all') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ projectId: projId, limit: '50' });
      if (cohort && cohort !== 'all') {
        params.append('cohort', cohort);
      }

      const response = await fetch(`/api/classified-cohorts?${params}`);
      const data = await response.json();

      setUsers(data.users || []);
      if (data.posthogHost) setPosthogHost(data.posthogHost);
      if (data.posthogProjectId) setPosthogProjectId(data.posthogProjectId);
      if (data.correlationAnalysis) setCorrelationAnalysis(data.correlationAnalysis);
    } catch (error) {
      console.error('Failed to load users:', error);
      setMessage({ type: 'error', text: 'Failed to load classified users' });
    } finally {
      setIsLoading(false);
    }
  };

  const classifyUsers = async () => {
    if (!projectId) return;

    setIsClassifying(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/classified-cohorts?projectId=${projectId}&limit=50`);
      const data = await response.json();

      if (response.ok) {
        setUsers(data.users || []);
        if (data.correlationAnalysis) setCorrelationAnalysis(data.correlationAnalysis);

        const correlationCount = data.correlationAnalysis?.topCorrelations?.length || 0;
        setMessage({
          type: 'success',
          text: `Classified ${data.stats?.total || 0} users with ${correlationCount} correlation signals: ${data.stats?.technicalVictims || 0} technical victims, ${data.stats?.confusedBrowsers || 0} confused browsers, ${data.stats?.highValue || 0} interview candidates`,
        });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to classify users' });
      }
    } catch (error) {
      console.error('Failed to classify:', error);
      setMessage({ type: 'error', text: 'Failed to classify users' });
    } finally {
      setIsClassifying(false);
    }
  };

  // NEW: Load advanced friction signals
  const loadAdvancedSignals = async (projId?: string, signalType?: string) => {
    const pid = projId || projectId;
    if (!pid) return;

    setIsLoadingAdvanced(true);
    try {
      const params = new URLSearchParams({ projectId: pid, limit: '50' });
      if (signalType && signalType !== 'all') {
        params.append('signalType', signalType);
      }

      const response = await fetch(`/api/advanced-signals?${params}`);
      const data = await response.json();

      if (response.ok) {
        setAdvancedUsers(data.users || []);
        setAdvancedStats(data.stats || null);
        if (data.posthogHost) setPosthogHost(data.posthogHost);
        if (data.posthogProjectId) setPosthogProjectId(data.posthogProjectId);
        setMessage({
          type: 'success',
          text: `Found ${data.stats?.totalUsers || 0} users with ${data.stats?.totalSignals || 0} signals`,
        });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load advanced signals' });
      }
    } catch (error) {
      console.error('Failed to load advanced signals:', error);
      setMessage({ type: 'error', text: 'Failed to load advanced signals' });
    } finally {
      setIsLoadingAdvanced(false);
    }
  };

  // Signal type metadata
  const signalTypeInfo: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    step_retry: { label: 'Step Retries', icon: <Repeat className="w-4 h-4" />, color: 'text-orange-600 bg-orange-100 border-orange-200' },
    step_loop: { label: 'Step Loops', icon: <RotateCcw className="w-4 h-4" />, color: 'text-red-600 bg-red-100 border-red-200' },
    time_variance: { label: 'High Time Variance', icon: <Timer className="w-4 h-4" />, color: 'text-purple-600 bg-purple-100 border-purple-200' },
    feature_abandoned: { label: 'Feature Abandoned', icon: <TrendingDown className="w-4 h-4" />, color: 'text-amber-600 bg-amber-100 border-amber-200' },
    feature_regression: { label: 'Feature Regression', icon: <TrendingDown className="w-4 h-4" />, color: 'text-rose-600 bg-rose-100 border-rose-200' },
    engagement_decay: { label: 'Engagement Decay', icon: <Activity className="w-4 h-4" />, color: 'text-blue-600 bg-blue-100 border-blue-200' },
    power_user_churning: { label: 'Power User Churning', icon: <Star className="w-4 h-4" />, color: 'text-yellow-600 bg-yellow-100 border-yellow-200' },
    activated_abandoned: { label: 'Activated & Abandoned', icon: <UserX className="w-4 h-4" />, color: 'text-slate-600 bg-slate-100 border-slate-200' },
    excessive_navigation: { label: 'Excessive Navigation', icon: <Navigation className="w-4 h-4" />, color: 'text-indigo-600 bg-indigo-100 border-indigo-200' },
    idle_after_action: { label: 'Idle After Action', icon: <Clock className="w-4 h-4" />, color: 'text-cyan-600 bg-cyan-100 border-cyan-200' },
    rage_click: { label: 'Rage Clicks', icon: <MousePointer className="w-4 h-4" />, color: 'text-red-600 bg-red-100 border-red-200' },
    error_encounter: { label: 'Errors', icon: <Bug className="w-4 h-4" />, color: 'text-red-600 bg-red-100 border-red-200' },
    high_intent_friction: { label: 'High-Intent Friction', icon: <Zap className="w-4 h-4" />, color: 'text-fuchsia-600 bg-fuchsia-100 border-fuchsia-200' },
    funnel_dropoff: { label: 'Funnel Drop-off', icon: <TrendingDown className="w-4 h-4" />, color: 'text-orange-600 bg-orange-100 border-orange-200' },
    churn_risk: { label: 'Churn Risk', icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-600 bg-red-100 border-red-200' },
  };

  const getSignalInfo = (type: string) => {
    return signalTypeInfo[type] || { label: type.replace(/_/g, ' '), icon: <Zap className="w-4 h-4" />, color: 'text-slate-600 bg-slate-100 border-slate-200' };
  };

  // Get direct link to PostHog person page
  const getPostHogPersonUrl = (distinctId: string) => {
    return `${posthogHost}/project/${posthogProjectId}/person/${encodeURIComponent(distinctId)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'Copied to clipboard!' });
    setTimeout(() => setMessage(null), 2000);
  };


  const formatAccountAge = (dateStr: string) => {
    try {
      const created = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - created.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays < 1) return 'New today';
      if (diffDays === 1) return '1 day old';
      if (diffDays < 7) return `${diffDays} days old`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks old`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months old`;
      return `${Math.floor(diffDays / 365)} years old`;
    } catch {
      return '';
    }
  };

  const getCohortIcon = (type: InterviewCohortType) => {
    switch (type) {
      case 'technical_victim': return <Bug className="w-4 h-4" />;
      case 'confused_browser': return <HelpCircle className="w-4 h-4" />;
      case 'wrong_fit': return <UserX className="w-4 h-4" />;
      case 'high_value': return <Star className="w-4 h-4" />;
    }
  };

  const getCohortColor = (type: InterviewCohortType) => {
    switch (type) {
      case 'technical_victim': return 'bg-red-100 text-red-700 border-red-300';
      case 'confused_browser': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'wrong_fit': return 'bg-slate-100 text-slate-600 border-slate-300';
      case 'high_value': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    }
  };

  const getCohortLabel = (type: InterviewCohortType) => {
    switch (type) {
      case 'technical_victim': return 'Technical Victim';
      case 'confused_browser': return 'Confused Browser';
      case 'wrong_fit': return 'Wrong Fit';
      case 'high_value': return 'High Value';
    }
  };


  const stats = {
    total: users.length,
    technicalVictims: users.filter(u => u.cohortType === 'technical_victim').length,
    confusedBrowsers: users.filter(u => u.cohortType === 'confused_browser').length,
    wrongFit: users.filter(u => u.cohortType === 'wrong_fit').length,
    highValue: users.filter(u => u.cohortType === 'high_value').length,
  };

  // Journey step state
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Auto-advance journey when data loads
  useEffect(() => {
    if (advancedUsers.length > 0 || users.length > 0) {
      setActiveStep(2);
    }
  }, [advancedUsers.length, users.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <Zap className="w-10 h-10 text-indigo-600" />
              Signal Detection
            </h1>
            <p className="text-slate-600 mt-2">
              Detect → Classify → Interview
            </p>
          </div>
        </div>

        {/* Journey Progress */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            {/* Step 1: Detect */}
            <button
              onClick={() => setActiveStep(1)}
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl transition-all ${
                activeStep === 1 
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/25' 
                  : activeStep > 1
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-50 text-slate-600'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                activeStep === 1 ? 'bg-white/20' : activeStep > 1 ? 'bg-emerald-200' : 'bg-slate-200'
              }`}>
                {activeStep > 1 ? '✓' : '1'}
              </div>
              <div className="text-left">
                <div className="font-semibold">Detect Signals</div>
                <div className={`text-sm ${activeStep === 1 ? 'text-white/80' : 'opacity-70'}`}>
                  {advancedStats ? `${advancedStats.totalSignals} signals found` : 'Analyze user behavior'}
                </div>
              </div>
            </button>

            {/* Arrow */}
            <div className="px-2 text-slate-300">→</div>

            {/* Step 2: Classify */}
            <button
              onClick={() => setActiveStep(2)}
              disabled={advancedUsers.length === 0 && users.length === 0}
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl transition-all ${
                activeStep === 2 
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25' 
                  : activeStep > 2
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-slate-50 text-slate-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                activeStep === 2 ? 'bg-white/20' : activeStep > 2 ? 'bg-emerald-200' : 'bg-slate-200'
              }`}>
                {activeStep > 2 ? '✓' : '2'}
              </div>
              <div className="text-left">
                <div className="font-semibold">Review Users</div>
                <div className={`text-sm ${activeStep === 2 ? 'text-white/80' : 'opacity-70'}`}>
                  {users.length > 0 ? `${users.length} users classified` : 'See who needs attention'}
                </div>
              </div>
            </button>

            {/* Arrow */}
            <div className="px-2 text-slate-300">→</div>

            {/* Step 3: Act */}
            <button
              onClick={() => setActiveStep(3)}
              disabled={advancedUsers.length === 0 && users.length === 0}
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl transition-all ${
                activeStep === 3 
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/25' 
                  : 'bg-slate-50 text-slate-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                activeStep === 3 ? 'bg-white/20' : 'bg-slate-200'
              }`}>
                3
              </div>
              <div className="text-left">
                <div className="font-semibold">Take Action</div>
                <div className={`text-sm ${activeStep === 3 ? 'text-white/80' : 'opacity-70'}`}>
                  Generate outreach & schedule
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Message */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`p-4 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* STEP 1: DETECT */}
        {activeStep === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Detection Panel */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="max-w-md mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-100 to-fuchsia-100 rounded-2xl flex items-center justify-center">
                  <Zap className="w-10 h-10 text-purple-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Detect Behavioral Signals</h2>
                <p className="text-slate-600 mb-6">
                  Analyze your PostHog data to find users showing friction signals like rage clicks, 
                  step retries, engagement decay, and feature abandonment.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      loadAdvancedSignals();
                    }}
                    disabled={isLoadingAdvanced || !projectId}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all font-semibold disabled:opacity-50"
                  >
                    {isLoadingAdvanced ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Zap className="w-5 h-5" />
                    )}
                    {isLoadingAdvanced ? 'Detecting...' : 'Detect Advanced Signals'}
                  </button>
                  <button
                    onClick={() => {
                      classifyUsers();
                    }}
                    disabled={isClassifying || !projectId}
                    className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:border-slate-300 transition-all font-semibold disabled:opacity-50"
                  >
                    {isClassifying ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Users className="w-5 h-5" />
                    )}
                    {isClassifying ? 'Classifying...' : 'Classify by Cohort'}
                  </button>
                </div>
              </div>
            </div>

            {/* Signal Types Explanation */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Repeat className="w-5 h-5" />, label: 'Step Retries', desc: 'Users struggling with steps', color: 'text-orange-600 bg-orange-50 border-orange-200' },
                { icon: <TrendingDown className="w-5 h-5" />, label: 'Engagement Decay', desc: 'Declining activity over time', color: 'text-blue-600 bg-blue-50 border-blue-200' },
                { icon: <MousePointer className="w-5 h-5" />, label: 'Rage Clicks', desc: 'Frustrated clicking patterns', color: 'text-red-600 bg-red-50 border-red-200' },
                { icon: <Activity className="w-5 h-5" />, label: 'Feature Abandoned', desc: 'Tried once, never returned', color: 'text-amber-600 bg-amber-50 border-amber-200' },
              ].map((item, idx) => (
                <div key={idx} className={`p-4 rounded-xl border ${item.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {item.icon}
                    <span className="font-semibold text-sm">{item.label}</span>
                  </div>
                  <p className="text-xs opacity-80">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* STEP 2: REVIEW USERS */}
        {activeStep === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Stats Summary */}
            {advancedStats && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-slate-600 text-sm mb-2 font-medium">
                    <Users className="w-4 h-4" />
                    Users Detected
                  </div>
                  <div className="text-3xl font-bold text-slate-900">{advancedStats.totalUsers}</div>
                </div>
                <div className="bg-white border border-purple-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-purple-600 text-sm mb-2 font-medium">
                    <Zap className="w-4 h-4" />
                    Total Signals
                  </div>
                  <div className="text-3xl font-bold text-purple-600">{advancedStats.totalSignals}</div>
                </div>
                <div className="bg-white border border-fuchsia-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-fuchsia-600 text-sm mb-2 font-medium">
                    <Activity className="w-4 h-4" />
                    Avg Priority
                  </div>
                  <div className="text-3xl font-bold text-fuchsia-600">{advancedStats.avgPriorityScore}</div>
                </div>
                <div className="bg-white border border-indigo-200 rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-indigo-600 text-sm mb-2 font-medium">
                    <Sparkles className="w-4 h-4" />
                    Signal Types
                  </div>
                  <div className="text-3xl font-bold text-indigo-600">{advancedStats.topSignalTypes.length}</div>
                </div>
              </div>
            )}

            {/* Signal Type Filters */}
            {advancedStats?.topSignalTypes && advancedStats.topSignalTypes.length > 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-fuchsia-50 border-2 border-purple-200 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-xl">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-purple-900">Filter by Signal Type</h2>
                    <p className="text-purple-700 text-sm">Click to filter users by specific signals</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setAdvancedSignalFilter('all');
                      loadAdvancedSignals(projectId);
                    }}
                    className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                      advancedSignalFilter === 'all'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-white/80 text-purple-700 border border-purple-200 hover:border-purple-300'
                    }`}
                  >
                    All ({advancedStats.totalUsers})
                  </button>
                  {advancedStats.topSignalTypes.map((sig) => {
                    const info = getSignalInfo(sig.type);
                    return (
                      <button
                        key={sig.type}
                        onClick={() => {
                          setAdvancedSignalFilter(sig.type);
                          loadAdvancedSignals(projectId, sig.type);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                          advancedSignalFilter === sig.type
                            ? info.color + ' shadow-md border-2 border-current'
                            : 'bg-white/80 text-slate-700 border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {info.icon}
                        {info.label} ({sig.count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cohort Classification (if available) */}
            {users.length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {[
                  { type: 'technical_victim' as InterviewCohortType, label: 'Technical Victims', count: stats.technicalVictims, color: 'bg-red-50 text-red-700 border-red-200', icon: Bug },
                  { type: 'confused_browser' as InterviewCohortType, label: 'Confused Browsers', count: stats.confusedBrowsers, color: 'bg-amber-50 text-amber-700 border-amber-200', icon: HelpCircle },
                  { type: 'high_value' as InterviewCohortType, label: 'High Value', count: stats.highValue, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Star },
                  { type: 'wrong_fit' as InterviewCohortType, label: 'Wrong Fit', count: stats.wrongFit, color: 'bg-slate-50 text-slate-500 border-slate-200', icon: UserX },
                ].map(({ type, label, count, color, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => {
                      setCohortFilter(type);
                      loadClassifiedUsers(projectId, type);
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all ${
                      cohortFilter === type
                        ? `${color} border-current shadow-md`
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="font-medium text-sm">{label}</span>
                    </div>
                    <div className="text-2xl font-bold">{count}</div>
                  </button>
                ))}
              </div>
            )}

            {/* User List - Advanced Signals */}
            {isLoadingAdvanced ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              </div>
            ) : advancedUsers.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                <Zap className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-600 mb-2">No users detected yet.</p>
                <p className="text-slate-500 text-sm">Go back to Step 1 to detect signals.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {advancedUsers.map((user, idx) => (
                  <motion.div
                    key={user.distinctId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all"
                  >
                    <div
                      className="p-5 cursor-pointer"
                      onClick={() => {
                        setExpandedUser(expandedUser === user.distinctId ? null : user.distinctId);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {/* Priority Score Badge */}
                          <div className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${
                            user.priorityScore >= 50
                              ? 'bg-red-100 text-red-700 border-red-300'
                              : user.priorityScore >= 35
                              ? 'bg-orange-100 text-orange-700 border-orange-300'
                              : user.priorityScore >= 20
                              ? 'bg-amber-100 text-amber-700 border-amber-300'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}>
                            <Zap className="w-4 h-4" />
                            <span className="font-bold">{user.priorityScore}</span>
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">
                                {user.name || user.email || user.distinctId.slice(0, 16)}
                              </span>
                              <span className="text-xs text-slate-500">
                                {user.signals.length} signal{user.signals.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {user.email && (
                              <div className="text-sm text-slate-600 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </div>
                            )}

                            {/* Signal Tags */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {user.signals.slice(0, 4).map((signal, i) => {
                                const info = getSignalInfo(signal.type);
                                return (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${info.color}`}
                                  >
                                    {info.icon}
                                    {info.label}
                                  </span>
                                );
                              })}
                              {user.signals.length > 4 && (
                                <span className="text-xs text-slate-500 px-2 py-0.5">
                                  +{user.signals.length - 4} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {expandedUser === user.distinctId ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {expandedUser === user.distinctId && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-200 overflow-hidden"
                    >
                      <div className="p-5 bg-slate-50">
                        {/* User Context */}
                        {(user.properties?.$geoip_city_name || user.properties?.$initial_referrer || user.properties?.created_at) && (
                          <>
                            <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                              <Globe className="w-4 h-4 text-blue-600" />
                              User Context
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                              {/* Location */}
                              {(user.properties?.$geoip_city_name || user.properties?.$geoip_country_name) && (
                                <div className="p-3 bg-white rounded-xl border border-slate-200">
                                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                    <MapPin className="w-3 h-3" />
                                    Location
                                  </div>
                                  <div className="font-medium text-slate-900 text-sm">
                                    {[user.properties?.$geoip_city_name, user.properties?.$geoip_country_name].filter(Boolean).join(', ') || 'Unknown'}
                                  </div>
                                </div>
                              )}
                              {/* Referrer */}
                              {user.properties?.$initial_referrer && (
                                <div className="p-3 bg-white rounded-xl border border-slate-200">
                                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                    <Link2 className="w-3 h-3" />
                                    Acquisition Source
                                  </div>
                                  <div className="font-medium text-slate-900 text-sm truncate" title={user.properties.$initial_referrer}>
                                    {user.properties.$initial_referrer === '$direct' 
                                      ? 'Direct traffic'
                                      : (() => {
                                          try {
                                            return new URL(user.properties.$initial_referrer).hostname.replace('www.', '');
                                          } catch {
                                            return user.properties.$initial_referrer;
                                          }
                                        })()
                                    }
                                  </div>
                                </div>
                              )}
                              {/* Account Age */}
                              {user.properties?.created_at && (
                                <div className="p-3 bg-white rounded-xl border border-slate-200">
                                  <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                    <Clock className="w-3 h-3" />
                                    Account Age
                                  </div>
                                  <div className="font-medium text-slate-900 text-sm">
                                    {formatAccountAge(user.properties.created_at)}
                                    <span className="text-slate-400 text-xs ml-1">
                                      ({new Date(user.properties.created_at).toLocaleDateString()})
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* All Signals Detail */}
                        <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-purple-600" />
                          Detected Signals
                        </h4>
                        <div className="space-y-2 mb-4">
                          {user.signals.map((signal, i) => {
                            const info = getSignalInfo(signal.type);
                            return (
                              <div
                                key={i}
                                className={`flex items-start gap-3 p-3 bg-white rounded-xl border ${info.color}`}
                              >
                                <div className="mt-0.5">{info.icon}</div>
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{info.label}</div>
                                  <p className="text-sm text-slate-600 mt-0.5">{signal.description}</p>
                                </div>
                                <div className="text-sm font-semibold text-slate-600">
                                  {`+${signal.weight}`}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* View in PostHog */}
                        <a
                          href={getPostHogPersonUrl(user.distinctId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm hover:bg-slate-200 transition-colors w-fit"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View full profile & sessions in PostHog
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
          </motion.div>
        )}

        {/* Outreach Modal */}
        <AnimatePresence>
          {outreachModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-8"
              onClick={() => setOutreachModal(null)}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-200">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Send className="w-5 h-5 text-indigo-600" />
                    Contextual Outreach
                  </h3>
                  <p className="text-slate-600 mt-1">
                    Personalized message for {outreachModal.user.name || outreachModal.user.email || 'this user'}
                  </p>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  {generatingOutreach ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    </div>
                  ) : outreachModal.outreach ? (
                    <div className="space-y-4">
                      {/* Cohort context */}
                      <div className={`p-3 rounded-xl border ${getCohortColor(outreachModal.outreach.cohortType)}`}>
                        <div className="flex items-center gap-2 mb-1">
                          {getCohortIcon(outreachModal.outreach.cohortType)}
                          <span className="font-medium">{getCohortLabel(outreachModal.outreach.cohortType)}</span>
                        </div>
                        <p className="text-sm opacity-80">
                          {outreachModal.outreach.contextualDetails.sessionInsight}
                        </p>
                      </div>

                      {/* Subject */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-slate-700">Subject</label>
                          <button
                            onClick={() => copyToClipboard(outreachModal.outreach!.subject)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-900">
                          {outreachModal.outreach.subject}
                        </div>
                      </div>

                      {/* Body */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-slate-700">Message</label>
                          <button
                            onClick={() => copyToClipboard(outreachModal.outreach!.body)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copy
                          </button>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-slate-900 whitespace-pre-wrap text-sm">
                          {outreachModal.outreach.body}
                        </div>
                      </div>

                      {/* Contextual details */}
                      {outreachModal.outreach.contextualDetails.correlationSignal && (
                        <div className="text-sm text-slate-600 bg-purple-50 border border-purple-200 rounded-xl p-3">
                          <span className="font-medium">Correlation signal used:</span>{' '}
                          {outreachModal.outreach.contextualDetails.correlationSignal}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center py-8">Failed to generate outreach</p>
                  )}
                </div>

                <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
                  <button
                    onClick={() => setOutreachModal(null)}
                    className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Close
                  </button>
                  {outreachModal.outreach?.email && (
                    <a
                      href={`mailto:${outreachModal.outreach.email}?subject=${encodeURIComponent(outreachModal.outreach.subject)}&body=${encodeURIComponent(outreachModal.outreach.body)}`}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Open in Email
                    </a>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
