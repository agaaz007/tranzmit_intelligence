'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Users,
  ExternalLink,
} from 'lucide-react';
import FunnelMap from '@/components/FunnelMap';

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
  const [expandedFunnel, setExpandedFunnel] = useState<number | string | null>(null);
  const [posthogHost, setPosthogHost] = useState<string>('https://us.posthog.com');
  const [posthogProjectId, setPosthogProjectId] = useState<string>('');

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
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <Target className="w-8 h-8 text-indigo-600" />
              Journey Map
            </h1>
            <p className="text-slate-500 mt-1">
              Your funnels from PostHog — click any step to explore breakdowns
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadFunnels(projectId)}
              disabled={isLoading || !projectId}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Funnels List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : funnels.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Target className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 mb-2">No funnels found in PostHog.</p>
            <p className="text-slate-500 text-sm mb-4">Create funnels in PostHog to see them here.</p>
            <a
              href={`${posthogHost}/project/${posthogProjectId}/insights/new`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all"
            >
              Create Funnel in PostHog
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {funnels.map((funnel) => (
              <motion.div
                key={funnel.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
              >
                {/* Funnel Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => setExpandedFunnel(expandedFunnel === funnel.id ? null : funnel.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 bg-indigo-50 rounded-xl">
                        <Target className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 text-lg">{funnel.name}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            {funnel.totalUsers.toLocaleString()} users
                          </span>
                          <span className="text-slate-300">•</span>
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

                      <div className={`p-1 rounded-lg transition-colors ${expandedFunnel === funnel.id ? 'bg-slate-100' : ''}`}>
                        {expandedFunnel === funnel.id ? (
                          <ChevronUp className="w-5 h-5 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Funnel Map */}
                <AnimatePresence>
                  {expandedFunnel === funnel.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-100"
                    >
                      <div className="p-6 bg-slate-50/50">
                        <FunnelMap 
                          steps={funnel.steps}
                          onAnalyzeDropOff={(step, stepIndex) => {
                            window.location.href = `/dashboard/priority-queue?funnelId=${funnel.id}&step=${stepIndex}`;
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
