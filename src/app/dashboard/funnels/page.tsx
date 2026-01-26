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

export default function FunnelsPage() {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [selectedFunnel, setSelectedFunnel] = useState<Funnel | null>(null);
  const [posthogHost, setPosthogHost] = useState<string>('https://us.posthog.com');
  const [posthogProjectId, setPosthogProjectId] = useState<string>('');
  const [posthogKey, setPosthogKey] = useState<string>('');

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
        loadFunnels(currentProjectId);
      } else {
        setIsLoading(false);
      }
    };

    initializeProject();
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

  const loadFunnels = async (projId: string) => {
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

      const response = await fetch(`/api/posthog?action=funnels`, {
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

  const getPostHogFunnelUrl = (funnelId: number | string) => {
    return `${posthogHost}/project/${posthogProjectId}/insights/${funnelId}`;
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e5e5e5] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[#999] text-sm mb-0.5">Tranzmit / Journey Map</div>
            <h1 className="text-2xl font-semibold text-[#1a1a1a]">Journey Map</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadFunnels(projectId)}
              disabled={isLoading || !projectId}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#e5e5e5] text-[#666] rounded-lg hover:bg-[#f5f5f5] transition-all font-medium disabled:opacity-50 text-sm"
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
          <div className="text-center py-20 bg-white rounded-xl border border-[#e5e5e5]">
            <Target className="w-12 h-12 mx-auto mb-4 text-[#d1d5db]" />
            <p className="text-[#666] mb-2">No funnels found in PostHog.</p>
            <p className="text-[#999] text-sm mb-4">Create funnels in PostHog to see them here.</p>
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
                className="bg-white border border-[#e5e5e5] rounded-xl overflow-hidden cursor-pointer hover:border-[#1a56db] hover:shadow-sm transition-all"
                onClick={() => setSelectedFunnel(funnel)}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-[#dbeafe] rounded-lg">
                        <Target className="w-5 h-5 text-[#1a56db]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[#1a1a1a]">{funnel.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-[#999]">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            {funnel.totalUsers.toLocaleString()} users
                          </span>
                          <span className="text-[#e5e5e5]">•</span>
                          <span>{funnel.steps.length} steps</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-indigo-600">
                          {(funnel.overallConversion || 0).toFixed(1)}%
                        </div>
                        <div className="text-xs text-slate-500 font-medium">overall conversion</div>
                      </div>

                      <a
                        href={getPostHogFunnelUrl(funnel.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="View in PostHog"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>

                      <div className="p-1 rounded-lg">
                        <ChevronDown className="w-5 h-5 text-slate-400" />
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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] h-[95vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <Target className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{selectedFunnel.name}</h2>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-4 h-4" />
                          {selectedFunnel.totalUsers.toLocaleString()} users
                        </span>
                        <span className="text-slate-300">•</span>
                        <span>{selectedFunnel.steps.length} steps</span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 text-indigo-600 font-medium">
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
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium shadow-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View in PostHog
                    </a>
                    <button
                      onClick={() => setSelectedFunnel(null)}
                      className="p-2 hover:bg-white/80 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Funnel Summary Stats */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center gap-6">
                  {selectedFunnel.steps.map((step, idx) => (
                    <React.Fragment key={idx}>
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-indigo-100 text-indigo-700' : 
                          idx === selectedFunnel.steps.length - 1 ? 'bg-emerald-100 text-emerald-700' : 
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-slate-900 truncate max-w-[120px]" title={step.name}>
                            {step.name}
                          </div>
                          <div className="text-slate-500">{step.count.toLocaleString()} users</div>
                        </div>
                      </div>
                      {idx < selectedFunnel.steps.length - 1 && (
                        <div className="flex items-center gap-1 text-xs">
                          <ArrowRight className="w-4 h-4 text-slate-300" />
                          <span className={`font-medium ${
                            (selectedFunnel.steps[idx + 1]?.count / step.count * 100) >= 50 
                              ? 'text-emerald-600' 
                              : 'text-red-500'
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
              <div className="flex-1 overflow-hidden bg-gradient-to-br from-slate-100 via-white to-indigo-50/30" style={{ minHeight: '60vh' }}>
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
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-500">
                    Click on <span className="text-emerald-600 font-medium">converted</span> or <span className="text-red-500 font-medium">dropped</span> badges to analyze user cohorts
                  </div>
                  <button
                    onClick={() => setSelectedFunnel(null)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-medium"
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
