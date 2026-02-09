'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Loader2,
  RefreshCw,
  ChevronDown,
  Users,
  ExternalLink,
  X,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import InteractiveFunnelMap from '@/components/InteractiveFunnelMap';

interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  dropOffCount: number;
  avgTimeToConvert?: number;
}

interface Funnel {
  id: number | string;
  name: string;
  steps: FunnelStep[];
  overallConversion: number;
  totalUsers: number;
}

const TIME_WINDOWS = [
  { label: 'Last 7 days', value: '-7d' },
  { label: 'Last 30 days', value: '-30d' },
  { label: 'Last 90 days', value: '-90d' },
  { label: 'Last 6 months', value: '-6m' },
  { label: 'Last 12 months', value: '-12m' },
  { label: 'All time', value: '' },
];

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [selectedFunnel, setSelectedFunnel] = useState<Funnel | null>(null);
  const [posthogHost, setPosthogHost] = useState<string>('https://us.posthog.com');
  const [posthogProjectId, setPosthogProjectId] = useState<string>('');
  const [posthogKey, setPosthogKey] = useState<string>('');
  const [timeWindow, setTimeWindow] = useState<string>('-30d');

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
        loadFunnels(currentProjectId, timeWindow);
      } else {
        setIsLoading(false);
      }
    };

    initializeProject();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedFunnel(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const loadFunnels = async (projId: string, dateFrom?: string) => {
    setIsLoading(true);
    try {
      const projectRes = await fetch(`/api/projects/${projId}`);
      const projectData = await projectRes.json();

      if (!projectData.project?.posthogKey) {
        console.error('PostHog not configured');
        setIsLoading(false);
        return;
      }

      const host = projectData.project.posthogHost || 'https://us.posthog.com';
      setPosthogHost(host);
      setPosthogProjectId(projectData.project.posthogProjId);
      setPosthogKey(projectData.project.posthogKey);

      const url = dateFrom
        ? `/api/posthog?action=funnels&date_from=${encodeURIComponent(dateFrom)}`
        : '/api/posthog?action=funnels';

      const response = await fetch(url, {
        headers: {
          'x-posthog-key': projectData.project.posthogKey,
          'x-posthog-project': projectData.project.posthogProjId,
          'x-posthog-host': host,
        },
      });
      const data = await response.json();

      setFunnels(data.funnels || []);
    } catch (error) {
      console.error('Failed to load funnels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Reload funnels when time window changes
  const handleTimeWindowChange = (newWindow: string) => {
    setTimeWindow(newWindow);
    if (projectId) {
      loadFunnels(projectId, newWindow);
    }
  };

  const getPostHogFunnelUrl = (funnelId: number | string) => {
    return `${posthogHost}/project/${posthogProjectId}/insights/${funnelId}`;
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[var(--muted-foreground)] text-sm mb-0.5">Tranzmit / Journey Map</div>
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">Journey Map</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Time Window Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--muted-foreground)]" />
              <select
                value={timeWindow}
                onChange={(e) => handleTimeWindowChange(e.target.value)}
                disabled={isLoading}
                className="px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              >
                {TIME_WINDOWS.map((window) => (
                  <option key={window.value} value={window.value}>
                    {window.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => loadFunnels(projectId, timeWindow)}
              disabled={isLoading || !projectId}
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] rounded-lg hover:bg-[var(--muted)] transition-all font-medium disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Funnels List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#1a56db]" />
          </div>
        ) : funnels.length === 0 ? (
          <div className="text-center py-20 bg-[var(--card)] rounded-xl border border-[var(--border)]">
            <Target className="w-12 h-12 mx-auto mb-4 text-[var(--muted-foreground)]" />
            <p className="text-[var(--muted-foreground)] mb-2">No funnels found in PostHog.</p>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">Create funnels in PostHog to see them here.</p>
            <a
              href={`${posthogHost}/project/${posthogProjectId}/insights/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a56db] text-white rounded-lg font-medium hover:bg-[#1e40af] transition-all text-sm"
            >
              Create Funnel in PostHog
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {funnels.map((funnel) => (
              <motion.div
                key={funnel.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden cursor-pointer hover:border-[#1a56db] hover:shadow-sm transition-all"
                onClick={() => setSelectedFunnel(funnel)}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                        <Target className="w-5 h-5 text-[#1a56db]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--foreground)]">{funnel.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-[var(--muted-foreground)]">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            {funnel.totalUsers.toLocaleString()} users
                          </span>
                          <span className="text-[var(--border)]">•</span>
                          <span>{funnel.steps.length} steps</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                          {(funnel.overallConversion || 0).toFixed(1)}%
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] font-medium">overall conversion</div>
                      </div>

                      <a
                        href={getPostHogFunnelUrl(funnel.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 text-[var(--muted-foreground)] hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-all"
                        title="View in PostHog"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>

                      <div className="p-1 rounded-lg">
                        <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Full Screen Funnel Modal */}
      <AnimatePresence>
        {selectedFunnel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedFunnel(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-[98vw] h-[95vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-[var(--border)] bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[var(--card)] rounded-xl shadow-sm">
                      <Target className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[var(--foreground)]">{selectedFunnel.name}</h2>
                      <div className="flex items-center gap-4 mt-1 text-sm text-[var(--muted-foreground)]">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" />
                          {selectedFunnel.totalUsers.toLocaleString()} users
                        </span>
                        <span className="text-[var(--border)]">•</span>
                        <span>{selectedFunnel.steps.length} steps</span>
                        <span className="text-[var(--border)]">•</span>
                        <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                          <TrendingUp className="w-4 h-4" />
                          {(selectedFunnel.overallConversion || 0).toFixed(1)}% conversion
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={getPostHogFunnelUrl(selectedFunnel.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--muted)] transition-all font-medium shadow-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View in PostHog
                    </a>
                    <button
                      onClick={() => setSelectedFunnel(null)}
                      className="p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-[var(--muted-foreground)]" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Funnel Summary Stats */}
              <div className="px-6 py-4 bg-[var(--muted)] border-b border-[var(--border)] flex-shrink-0">
                <div className="flex items-center gap-6">
                  {selectedFunnel.steps.map((step, idx) => (
                    <React.Fragment key={idx}>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' :
                          idx === selectedFunnel.steps.length - 1 ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' :
                          'bg-[var(--background)] text-[var(--muted-foreground)]'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-[var(--foreground)] truncate max-w-[120px]" title={step.name}>
                            {step.name}
                          </div>
                          <div className="text-[var(--muted-foreground)]">{step.count.toLocaleString()} users</div>
                        </div>
                      </div>
                      {idx < selectedFunnel.steps.length - 1 && (
                        <div className="flex items-center gap-1 text-xs">
                          <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
                          <span className={`font-medium ${
                            (selectedFunnel.steps[idx + 1]?.count / step.count * 100) >= 50
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500 dark:text-red-400'
                          }`}>
                            {step.count > 0
                              ? ((selectedFunnel.steps[idx + 1]?.count / step.count) * 100).toFixed(0)
                              : 0}%
                          </span>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Interactive Funnel Map */}
              <div className="flex-1 overflow-hidden bg-gradient-to-br from-[var(--muted)] via-[var(--card)] to-indigo-50/30 dark:to-indigo-950/20" style={{ minHeight: '60vh' }}>
                <InteractiveFunnelMap
                  steps={selectedFunnel.steps}
                  funnelId={selectedFunnel.id}
                  posthogConfig={{
                    apiKey: posthogKey,
                    projectId: posthogProjectId,
                    host: posthogHost,
                  }}
                  localProjectId={projectId}
                  onAnalyzeDropOff={(_, stepIndex) => {
                    window.location.href = `/dashboard/priority-queue?funnelId=${selectedFunnel.id}&step=${stepIndex}`;
                  }}
                  onCreateCohort={(stepIndex, cohortType) => {
                    window.location.href = `/dashboard/priority-queue?funnelId=${selectedFunnel.id}&step=${stepIndex}&cohort=${cohortType}`;
                  }}
                />
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-[var(--border)] bg-[var(--muted)] flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-[var(--muted-foreground)]">
                    Click on <span className="text-emerald-600 dark:text-emerald-400 font-medium">converted</span> or <span className="text-red-500 dark:text-red-400 font-medium">dropped</span> badges to analyze user cohorts
                  </div>
                  <button
                    onClick={() => setSelectedFunnel(null)}
                    className="px-4 py-2 bg-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--muted-foreground)]/20 transition-all font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
