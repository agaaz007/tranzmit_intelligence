'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, TrendingDown, ArrowRight, Zap, Plus, ChevronDown, UserPlus, Loader2, CheckCircle, TrendingUp, X, Search, BarChart3, AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  dropOffCount: number;
  avgTimeToConvert?: number;
}

interface CohortData {
  converted: {
    userCount: number;
    userIds: string[];
    loading: boolean;
  };
  droppedOff: {
    userCount: number;
    userIds: string[];
    loading: boolean;
  };
}

interface CorrelationEvent {
  event: string;
  success_count: number;
  failure_count: number;
  odds_ratio: number;
  correlation_type: 'success' | 'failure';
  success_percentage: number;
  failure_percentage: number;
}

interface CorrelationData {
  events: CorrelationEvent[];
  loading: boolean;
  error?: string;
}

interface PostHogConfig {
  apiKey: string;
  projectId: string;
  host: string;
}

interface FunnelMapProps {
  steps: FunnelStep[];
  funnelId?: string | number;
  posthogConfig?: PostHogConfig;
  onAnalyzeDropOff: (step: FunnelStep, stepIndex: number) => void;
  onCreateCohort?: (stepIndex: number, cohortType: 'converted' | 'dropped') => void;
}

// Simulated breakdown data based on step name
const getBreakdownForStep = (stepName: string | undefined) => {
  const breakdowns: Record<string, { name: string; type: string; percentage: number }[]> = {
    default: [
      { name: 'Primary Path', type: 'Event', percentage: 55 },
      { name: 'Secondary Path', type: 'Event', percentage: 30 },
      { name: 'Other', type: 'Event', percentage: 15 },
    ],
  };
  
  if (!stepName) return breakdowns.default;
  
  // Generate some realistic-looking breakdown based on step name
  const hash = stepName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const variations = [
    [
      { name: 'Form', type: 'Event', percentage: 45 },
      { name: 'Survey', type: 'Event', percentage: 25 },
      { name: 'Quiz', type: 'Event', percentage: 20 },
      { name: 'Test', type: 'Event', percentage: 5 },
      { name: 'Poll', type: 'Event', percentage: 5 },
    ],
    [
      { name: 'Desktop', type: 'Device', percentage: 62 },
      { name: 'Mobile', type: 'Device', percentage: 35 },
      { name: 'Tablet', type: 'Device', percentage: 3 },
    ],
    [
      { name: 'Direct', type: 'Source', percentage: 48 },
      { name: 'Organic', type: 'Source', percentage: 32 },
      { name: 'Referral', type: 'Source', percentage: 15 },
      { name: 'Paid', type: 'Source', percentage: 5 },
    ],
  ];
  
  return variations[hash % variations.length] || breakdowns.default;
};

// Determine step type based on name
const getStepType = (name: string | undefined): string => {
  if (!name) return 'Event';
  const lowerName = name.toLowerCase();
  if (lowerName.includes('click') || lowerName.includes('select') || lowerName.includes('submit') || lowerName.includes('button')) {
    return 'Action';
  }
  if (lowerName.includes('view') || lowerName.includes('page') || lowerName.includes('screen')) {
    return 'Pageview';
  }
  return 'Event';
};

export default function FunnelMap({ steps, funnelId, posthogConfig, onAnalyzeDropOff, onCreateCohort }: FunnelMapProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [expandedCohort, setExpandedCohort] = useState<{ stepIndex: number; type: 'converted' | 'dropped' } | null>(null);
  const [cohortData, setCohortData] = useState<Record<string, CohortData>>({});
  const [creatingCohort, setCreatingCohort] = useState<{ stepIndex: number; type: 'converted' | 'dropped' } | null>(null);
  const [cohortCreated, setCohortCreated] = useState<{ stepIndex: number; type: 'converted' | 'dropped'; userCount: number } | null>(null);
  const [fullScreenCohort, setFullScreenCohort] = useState<{ stepIndex: number; type: 'converted' | 'dropped' } | null>(null);
  const [correlationData, setCorrelationData] = useState<Record<string, CorrelationData>>({});

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  const fetchCohortUsers = useCallback(async (stepIndex: number, type: 'converted' | 'dropped') => {
    const key = `${stepIndex}-${type}`;

    // Skip if already loaded
    if (cohortData[key]?.converted.userIds.length > 0 || cohortData[key]?.droppedOff.userIds.length > 0) {
      return;
    }

    setCohortData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [type === 'converted' ? 'converted' : 'droppedOff']: {
          userCount: type === 'converted' ? steps[stepIndex + 1]?.count || 0 : steps[stepIndex].dropOffCount,
          userIds: [],
          loading: true,
        }
      }
    }));

    try {
      const response = await fetch('/api/posthog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-posthog-key': posthogConfig?.apiKey || '',
          'x-posthog-project': posthogConfig?.projectId || '',
          'x-posthog-host': posthogConfig?.host || '',
        },
        body: JSON.stringify({
          action: 'get-funnel-user-ids',
          funnelId,
          stepIndex,
          cohortType: type,
        }),
      });

      const data = await response.json();

      setCohortData(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          [type === 'converted' ? 'converted' : 'droppedOff']: {
            userCount: data.userIds?.length || 0,
            userIds: data.userIds || [],
            loading: false,
          }
        }
      }));
    } catch (error) {
      console.error('Failed to fetch cohort users:', error);
      setCohortData(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          [type === 'converted' ? 'converted' : 'droppedOff']: {
            userCount: type === 'converted' ? steps[stepIndex + 1]?.count || 0 : steps[stepIndex].dropOffCount,
            userIds: [],
            loading: false,
          }
        }
      }));
    }
  }, [funnelId, steps, cohortData, posthogConfig]);

  const fetchCorrelationData = useCallback(async (stepIndex: number) => {
    const key = `${stepIndex}`;
    
    // Skip if already loaded or loading
    if (correlationData[key]?.events?.length > 0 || correlationData[key]?.loading) {
      return;
    }

    setCorrelationData(prev => ({
      ...prev,
      [key]: { events: [], loading: true }
    }));

    try {
      const response = await fetch('/api/posthog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-posthog-key': posthogConfig?.apiKey || '',
          'x-posthog-project': posthogConfig?.projectId || '',
          'x-posthog-host': posthogConfig?.host || '',
        },
        body: JSON.stringify({
          action: 'funnel-correlation',
          funnelId,
          stepIndex,
        }),
      });

      const data = await response.json();

      setCorrelationData(prev => ({
        ...prev,
        [key]: {
          events: data.correlations || [],
          loading: false,
          error: data.error,
        }
      }));
    } catch (error) {
      console.error('Failed to fetch correlation data:', error);
      setCorrelationData(prev => ({
        ...prev,
        [key]: {
          events: [],
          loading: false,
          error: 'Failed to fetch correlation data'
        }
      }));
    }
  }, [funnelId, posthogConfig, correlationData]);

  const handleCohortClick = (stepIndex: number, type: 'converted' | 'dropped') => {
    const currentKey = expandedCohort ? `${expandedCohort.stepIndex}-${expandedCohort.type}` : null;
    const newKey = `${stepIndex}-${type}`;

    if (currentKey === newKey) {
      setExpandedCohort(null);
    } else {
      setExpandedCohort({ stepIndex, type });
      fetchCohortUsers(stepIndex, type);
    }
  };

  const openFullScreen = (stepIndex: number, type: 'converted' | 'dropped') => {
    setFullScreenCohort({ stepIndex, type });
    setExpandedCohort(null);
    fetchCohortUsers(stepIndex, type);
    // Fetch correlation data for both types
    fetchCorrelationData(stepIndex);
  };

  const handleCreateCohort = async (stepIndex: number, type: 'converted' | 'dropped') => {
    if (!funnelId || !posthogConfig) {
      console.error('Missing funnelId or posthogConfig');
      return;
    }

    setCreatingCohort({ stepIndex, type });

    try {
      const stepName = steps[stepIndex]?.name || `Step ${stepIndex + 1}`;
      const cohortName = `${type === 'converted' ? 'Converted' : 'Dropped'} at ${stepName} - ${new Date().toLocaleDateString()}`;

      const response = await fetch('/api/posthog', {
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
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Show success state
        setCohortCreated({ stepIndex, type, userCount: data.userCount || 0 });
        setCreatingCohort(null);

        // Keep success message visible longer so user can click the link
        setTimeout(() => {
          setCohortCreated(null);
        }, 10000);
      } else {
        console.error('Failed to create cohort:', data.error);
        setCreatingCohort(null);
      }
    } catch (error) {
      console.error('Failed to create cohort:', error);
      setCreatingCohort(null);
    }
  };

  return (
    <div className="w-full overflow-x-auto py-4">
      <div className="flex items-start min-w-max gap-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isActive = activeStep === index;
          const stepType = getStepType(step.name);
          const breakdown = getBreakdownForStep(step.name);
          
          // Calculate conversion rate FROM this step TO the next step
          // This is shown on the connector between steps
          const nextStepCount = !isLast ? (steps[index + 1]?.count || 0) : 0;
          const conversionToNext = step.count > 0 && !isLast
            ? (nextStepCount / step.count * 100)
            : 0;
          
          // Calculate drop-off FROM this step TO the next step
          // dropOffCount = users at this step - users at next step
          const dropOffToNext = !isLast ? (step.count - nextStepCount) : 0;
          const dropOffFromThis = step.count > 0 && !isLast
            ? (dropOffToNext / step.count * 100)
            : 0;

          return (
            <React.Fragment key={index}>
              {/* Step Card */}
              <div className="relative">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    w-52 bg-white rounded-xl border-2 transition-all duration-200 cursor-pointer
                    ${isActive 
                      ? 'border-slate-400 shadow-lg' 
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    }
                  `}
                  onClick={() => setActiveStep(isActive ? null : index)}
                >
                  {/* Card Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-base truncate" title={step.name || 'Unnamed Step'}>
                          {step.name || 'Unnamed Step'}
                        </h3>
                        <span className="text-xs text-slate-500 font-medium">
                          {stepType}
                        </span>
                      </div>
                      <ChevronDown 
                        className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ml-2 ${isActive ? 'rotate-180' : ''}`} 
                      />
                    </div>
                    
                    {/* Separator */}
                    <div className="h-px bg-slate-100 my-3" />
                    
                    {/* User Count */}
                    <div className="flex items-center gap-2 text-slate-600">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">{formatNumber(step.count)} users</span>
                    </div>
                  </div>
                </motion.div>

                {/* Dropdown Panel */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -10, height: 0 }}
                      className="absolute top-full left-0 right-0 mt-1 z-50"
                    >
                      <div className="bg-white rounded-xl border-2 border-slate-200 shadow-xl overflow-hidden">
                        {/* Breakdown Items */}
                        <div className="py-2">
                          {breakdown.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-default"
                            >
                              <div>
                                <div className="font-medium text-slate-900 text-sm">{item.name}</div>
                                <div className="text-xs text-slate-500">{item.type}</div>
                              </div>
                              <div className="text-sm font-semibold text-slate-700">
                                {item.percentage}%
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Add More Button */}
                        <div className="px-4 py-2 border-t border-slate-100">
                          <button className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {/* Analyze Drop-off */}
                        {step.dropOffRate > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnalyzeDropOff(step, index);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 border-t border-slate-100 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-50 text-slate-700 transition-all group"
                          >
                            <Zap className="w-4 h-4 text-purple-600" />
                            <span className="font-medium text-sm">Analyze Drop-off</span>
                            <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-purple-600" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connector with Cohort Split */}
              {!isLast && (
                <div className="relative flex flex-col items-center justify-center w-32 self-start" style={{ marginTop: '1rem' }}>
                  {/* Converted Cohort - Top Branch */}
                  <div
                    className="relative mb-2 cursor-pointer group"
                    onClick={() => handleCohortClick(index, 'converted')}
                  >
                    <div className="flex items-center">
                      <div className="w-8 h-[2px] bg-emerald-300" />
                      <div
                        className={`
                          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${expandedCohort?.stepIndex === index && expandedCohort?.type === 'converted'
                            ? 'bg-emerald-500 text-white shadow-md'
                            : 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200'
                          }
                        `}
                      >
                        <TrendingUp className="w-3 h-3" />
                        <span>{formatNumber(steps[index + 1]?.count || 0)}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${expandedCohort?.stepIndex === index && expandedCohort?.type === 'converted' ? 'rotate-180' : ''}`} />
                      </div>
                      <div className="w-8 h-[2px] bg-emerald-300" />
                    </div>
                    <div className="text-[10px] text-emerald-600 text-center mt-0.5 font-medium">
                      {conversionToNext.toFixed(0)}% converted
                    </div>
                  </div>

                  {/* Center Line */}
                  <div className="h-6 w-[2px] bg-slate-200" />

                  {/* Dropped Off Cohort - Bottom Branch */}
                  <div
                    className="relative mt-2 cursor-pointer group"
                    onClick={() => handleCohortClick(index, 'dropped')}
                  >
                    <div className="flex items-center">
                      <div className="w-8 h-[2px] bg-red-300" />
                      <div
                        className={`
                          flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${expandedCohort?.stepIndex === index && expandedCohort?.type === 'dropped'
                            ? 'bg-red-500 text-white shadow-md'
                            : 'bg-red-100 text-red-700 group-hover:bg-red-200'
                          }
                        `}
                      >
                        <TrendingDown className="w-3 h-3" />
                        <span>{formatNumber(dropOffToNext)}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${expandedCohort?.stepIndex === index && expandedCohort?.type === 'dropped' ? 'rotate-180' : ''}`} />
                      </div>
                      <div className="w-8 h-[2px] bg-red-300" />
                    </div>
                    <div className="text-[10px] text-red-600 text-center mt-0.5 font-medium">
                      {dropOffFromThis.toFixed(0)}% dropped
                    </div>
                  </div>

                  {/* Expanded Cohort Panel */}
                  <AnimatePresence>
                    {expandedCohort?.stepIndex === index && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`
                          absolute z-[100] w-72 bg-white rounded-xl border-2 shadow-2xl overflow-hidden
                          left-1/2 -translate-x-1/2
                          ${expandedCohort.type === 'converted' ? '-top-4 -translate-y-full border-emerald-200' : '-bottom-4 translate-y-full border-red-200'}
                        `}
                      >
                        {/* Header */}
                        <div className={`px-4 py-3 ${expandedCohort.type === 'converted' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {expandedCohort.type === 'converted' ? (
                                <TrendingUp className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-red-600" />
                              )}
                              <span className={`font-semibold text-sm ${expandedCohort.type === 'converted' ? 'text-emerald-800' : 'text-red-800'}`}>
                                {expandedCohort.type === 'converted' ? 'Converted Users' : 'Dropped Off Users'}
                              </span>
                            </div>
                            <span className={`text-xs font-medium ${expandedCohort.type === 'converted' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatNumber(expandedCohort.type === 'converted' ? (steps[index + 1]?.count || 0) : (step.count - (steps[index + 1]?.count || 0)))}
                            </span>
                          </div>
                        </div>

                        {/* User IDs */}
                        <div className="p-3">
                          <div className="text-xs font-medium text-slate-500 mb-2">User IDs</div>
                          {cohortData[`${index}-${expandedCohort.type}`]?.[expandedCohort.type === 'converted' ? 'converted' : 'droppedOff']?.loading ? (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                            </div>
                          ) : (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {(cohortData[`${index}-${expandedCohort.type}`]?.[expandedCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds || []).slice(0, 10).map((userId, userIdx) => (
                                <div key={userIdx} className="flex items-center gap-2 text-sm">
                                  <span className="w-5 h-5 rounded bg-slate-100 text-slate-500 text-xs flex items-center justify-center font-medium flex-shrink-0">
                                    {userIdx + 1}
                                  </span>
                                  <span className="truncate text-slate-700 font-mono text-xs" title={userId}>{userId}</span>
                                </div>
                              ))}
                              {(cohortData[`${index}-${expandedCohort.type}`]?.[expandedCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds?.length || 0) > 10 && (
                                <div className="text-xs text-slate-400 text-center py-1">
                                  +{(cohortData[`${index}-${expandedCohort.type}`]?.[expandedCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds?.length || 0) - 10} more users
                                </div>
                              )}
                              {(!cohortData[`${index}-${expandedCohort.type}`]?.[expandedCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds?.length) && (
                                <div className="text-sm text-slate-400 text-center py-2">No users found</div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                          {cohortCreated?.stepIndex === index && cohortCreated?.type === expandedCohort.type ? (
                            <div className="space-y-2">
                              <div className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-100 text-emerald-700">
                                <CheckCircle className="w-4 h-4" />
                                Cohort created with {cohortCreated.userCount} users!
                              </div>
                              <Link
                                href="/dashboard/cohorts"
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-all"
                              >
                                <ExternalLink className="w-4 h-4" />
                                View in Smart Cohorts
                              </Link>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openFullScreen(index, expandedCohort.type);
                                }}
                                className={`
                                  w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                                  ${expandedCohort.type === 'converted'
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                                  }
                                `}
                              >
                                <Search className="w-4 h-4" />
                                {expandedCohort.type === 'dropped' ? 'Analyze Drop-off Causes' : 'Analyze Success Factors'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreateCohort(index, expandedCohort.type);
                                }}
                                disabled={creatingCohort?.stepIndex === index && creatingCohort?.type === expandedCohort.type}
                                className={`
                                  w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                                  ${creatingCohort?.stepIndex === index && creatingCohort?.type === expandedCohort.type
                                    ? 'bg-slate-100 text-slate-500'
                                    : expandedCohort.type === 'converted'
                                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                      : 'bg-red-600 text-white hover:bg-red-700'
                                  }
                                `}
                              >
                                {creatingCohort?.stepIndex === index && creatingCohort?.type === expandedCohort.type ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Creating cohort...
                                  </>
                                ) : (
                                  <>
                                    <UserPlus className="w-4 h-4" />
                                    Add to Cohort for Interview
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-6 mt-8 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
          <span>Converted users</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-red-100 border border-red-200" />
          <span>Dropped off users</span>
        </div>
        <div className="text-xs text-slate-400 ml-auto">
          Click on cohort badges to see user IDs and add to interview list
        </div>
      </div>

      {/* Full Screen Modal */}
      <AnimatePresence>
        {fullScreenCohort && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setFullScreenCohort(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className={`px-6 py-4 border-b ${fullScreenCohort.type === 'converted' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {fullScreenCohort.type === 'converted' ? (
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      </div>
                    )}
                    <div>
                      <h2 className={`text-xl font-bold ${fullScreenCohort.type === 'converted' ? 'text-emerald-900' : 'text-red-900'}`}>
                        {fullScreenCohort.type === 'converted' ? 'Converted Users' : 'Dropped Off Users'}
                      </h2>
                      <p className="text-sm text-slate-600">
                        Step {fullScreenCohort.stepIndex + 1}: {steps[fullScreenCohort.stepIndex]?.name || 'Unknown'}
                        {!steps[fullScreenCohort.stepIndex + 1] ? '' : ` → ${steps[fullScreenCohort.stepIndex + 1]?.name}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFullScreenCohort(null)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* User IDs Section */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-5 h-5 text-slate-600" />
                      <h3 className="font-semibold text-slate-900">User IDs</h3>
                      <span className="ml-auto text-sm text-slate-500">
                        {cohortData[`${fullScreenCohort.stepIndex}-${fullScreenCohort.type}`]?.[fullScreenCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds?.length || 0} users
                      </span>
                    </div>
                    
                    {cohortData[`${fullScreenCohort.stepIndex}-${fullScreenCohort.type}`]?.[fullScreenCohort.type === 'converted' ? 'converted' : 'droppedOff']?.loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {(cohortData[`${fullScreenCohort.stepIndex}-${fullScreenCohort.type}`]?.[fullScreenCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds || []).map((userId, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-200">
                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-medium">
                              {idx + 1}
                            </span>
                            <span className="font-mono text-sm text-slate-700 truncate flex-1" title={userId}>
                              {userId}
                            </span>
                          </div>
                        ))}
                        {(!cohortData[`${fullScreenCohort.stepIndex}-${fullScreenCohort.type}`]?.[fullScreenCohort.type === 'converted' ? 'converted' : 'droppedOff']?.userIds?.length) && (
                          <div className="text-center py-8 text-slate-400">No users found</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Correlation Analysis Section (for both dropped and converted) */}
                  <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-5 h-5 text-slate-600" />
                      <h3 className="font-semibold text-slate-900">
                        {fullScreenCohort.type === 'dropped' ? 'Drop-off Analysis' : 'Success Factors'}
                      </h3>
                    </div>
                    
                    {correlationData[`${fullScreenCohort.stepIndex}`]?.loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        <span className="ml-2 text-slate-500">Analyzing correlations...</span>
                      </div>
                    ) : correlationData[`${fullScreenCohort.stepIndex}`]?.error ? (
                      <div className="text-center py-8">
                        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                        <p className="text-slate-600">{correlationData[`${fullScreenCohort.stepIndex}`]?.error}</p>
                        <button
                          onClick={() => fetchCorrelationData(fullScreenCohort.stepIndex)}
                          className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Try again
                        </button>
                      </div>
                    ) : (() => {
                      // Filter and sort events based on cohort type
                      const allEvents = correlationData[`${fullScreenCohort.stepIndex}`]?.events || [];
                      const filteredEvents = fullScreenCohort.type === 'dropped'
                        // For dropped: show events with odds_ratio > 1 (correlate with drop-off), sorted highest first
                        ? allEvents
                            .filter(e => e.odds_ratio > 1)
                            .sort((a, b) => b.odds_ratio - a.odds_ratio)
                        // For converted: show events with odds_ratio <= 1 (correlate with success), sorted lowest first
                        : allEvents
                            .filter(e => e.odds_ratio <= 1)
                            .sort((a, b) => a.odds_ratio - b.odds_ratio);
                      
                      return filteredEvents.length > 0 ? (
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                          <p className="text-sm text-slate-600 mb-3">
                            {fullScreenCohort.type === 'dropped' 
                              ? 'Events that correlate with drop-off (friction points):'
                              : 'Events that correlate with conversion (success patterns):'}
                          </p>
                          {filteredEvents.map((event, idx) => (
                            <div key={idx} className={`p-3 bg-white rounded-lg border ${
                              fullScreenCohort.type === 'dropped' ? 'border-red-200' : 'border-emerald-200'
                            }`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-slate-900 truncate" title={event.event}>
                                  {event.event}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  fullScreenCohort.type === 'dropped'
                                    ? 'bg-red-100 text-red-700' 
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {event.odds_ratio.toFixed(2)}x
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Dropped users:</span>
                                  <span className="font-medium text-red-600">{event.failure_count} ({event.failure_percentage?.toFixed(0)}%)</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Converted users:</span>
                                  <span className="font-medium text-emerald-600">{event.success_count} ({event.success_percentage?.toFixed(0)}%)</span>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
                                {fullScreenCohort.type === 'dropped' ? (
                                  <span className="text-red-600">
                                    ⚠️ Users who did this event are <strong>{event.odds_ratio.toFixed(1)}x more likely</strong> to drop off
                                  </span>
                                ) : (
                                  <span className="text-emerald-600">
                                    ✓ Users who did this event are <strong>{(1/event.odds_ratio).toFixed(1)}x more likely</strong> to convert
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-slate-500">
                            {fullScreenCohort.type === 'dropped' 
                              ? 'No significant drop-off patterns found'
                              : 'No significant success patterns found'}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            This may require more user data to analyze patterns
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <button
                  onClick={() => setFullScreenCohort(null)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Close
                </button>
                {cohortCreated?.stepIndex === fullScreenCohort.stepIndex && cohortCreated?.type === fullScreenCohort.type ? (
                  <Link
                    href="/dashboard/cohorts"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    View in Smart Cohorts
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      handleCreateCohort(fullScreenCohort.stepIndex, fullScreenCohort.type);
                    }}
                    disabled={creatingCohort?.stepIndex === fullScreenCohort.stepIndex && creatingCohort?.type === fullScreenCohort.type}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                      ${creatingCohort?.stepIndex === fullScreenCohort.stepIndex && creatingCohort?.type === fullScreenCohort.type
                        ? 'bg-slate-200 text-slate-500'
                        : fullScreenCohort.type === 'converted'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }
                    `}
                  >
                    {creatingCohort?.stepIndex === fullScreenCohort.stepIndex && creatingCohort?.type === fullScreenCohort.type ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Add to Cohort for Interview
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
