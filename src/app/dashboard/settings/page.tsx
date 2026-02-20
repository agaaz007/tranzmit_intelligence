'use client';

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Save, Key, Globe, Bell, Shield, Loader2, Plus, Bot, Users, Copy, Check, Code, BarChart3, Cloud, Activity, X } from 'lucide-react';

interface ProjectSettings {
  id: string;
  name: string;
  organizationId: string | null;
  apiKey: string;
  posthogKey: string;
  posthogHost: string;
  posthogProjId: string;
  mixpanelKey: string;
  mixpanelSecret: string;
  mixpanelProjId: string;
  mixpanelHost: string;
  amplitudeKey: string;
  amplitudeSecret: string;
  amplitudeProjId: string;
  elevenlabsAgentId: string;
  replaySource: string | null;
}

export default function SettingsPage() {
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [noProjectExists, setNoProjectExists] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    posthogKey: '',
    posthogHost: 'https://us.posthog.com',
    posthogProjId: '',
    mixpanelKey: '',
    mixpanelSecret: '',
    mixpanelProjId: '',
    mixpanelHost: 'https://mixpanel.com',
    amplitudeKey: '',
    amplitudeSecret: '',
    amplitudeProjId: '',
    elevenlabsAgentId: '',
    replaySource: '',
  });

  useEffect(() => {
    const initializeProject = async () => {
      setIsLoading(true);
      
      // First check if there's a stored project ID
      const storedProjectId = localStorage.getItem('currentProjectId');
      
      if (storedProjectId) {
        setProjectId(storedProjectId);
        await loadProject(storedProjectId);
      } else {
        // No stored project - try to load existing projects from database
        try {
          const response = await fetch('/api/projects');
          const data = await response.json();
          
          if (data.projects && data.projects.length > 0) {
            // Use the first project
            const firstProject = data.projects[0];
            localStorage.setItem('currentProjectId', firstProject.id);
            setProjectId(firstProject.id);
            await loadProject(firstProject.id);
          } else {
            // No projects exist - show create form
            setNoProjectExists(true);
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Failed to fetch projects:', error);
          setNoProjectExists(true);
          setIsLoading(false);
        }
      }
    };
    
    initializeProject();
  }, []);

  const loadProject = async (projId: string) => {
    try {
      const response = await fetch(`/api/projects/${projId}`);
      const data = await response.json();

      if (data.project) {
        setProject(data.project);
        setFormData({
          name: data.project.name,
          posthogKey: data.project.posthogKey || '',
          posthogHost: data.project.posthogHost || 'https://us.posthog.com',
          posthogProjId: data.project.posthogProjId || '',
          mixpanelKey: data.project.mixpanelKey || '',
          mixpanelSecret: data.project.mixpanelSecret || '',
          mixpanelProjId: data.project.mixpanelProjId || '',
          mixpanelHost: data.project.mixpanelHost || 'https://mixpanel.com',
          amplitudeKey: data.project.amplitudeKey || '',
          amplitudeSecret: data.project.amplitudeSecret || '',
          amplitudeProjId: data.project.amplitudeProjId || '',
          elevenlabsAgentId: data.project.elevenlabsAgentId || '',
          replaySource: data.project.replaySource || '',
        });
        setNoProjectExists(false);
      } else {
        // Project not found - might be stale ID
        localStorage.removeItem('currentProjectId');
        setNoProjectExists(true);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      setMessage({ type: 'error', text: 'Failed to load project settings' });
      setNoProjectExists(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        loadProject(projectId);
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    const hasPostHog = formData.posthogKey && formData.posthogProjId;
    const hasMixpanel = formData.mixpanelKey && formData.mixpanelProjId;
    const hasAmplitude = formData.amplitudeKey && formData.amplitudeSecret && formData.amplitudeProjId;

    if (!formData.name) {
      setMessage({ type: 'error', text: 'Project name is required' });
      return;
    }

    if (!hasPostHog && !hasMixpanel && !hasAmplitude) {
      setMessage({ type: 'error', text: 'Please configure at least one analytics integration (PostHog, Mixpanel, or Amplitude)' });
      return;
    }

    setIsCreating(true);
    setMessage(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.project) {
        localStorage.setItem('currentProjectId', data.project.id);
        setProjectId(data.project.id);
        setProject(data.project);
        setNoProjectExists(false);
        setMessage({ type: 'success', text: 'Project created successfully!' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create project' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to create project' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
            <SettingsIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Settings</h1>
            <p className="text-slate-600 mt-1">
              {noProjectExists ? 'Set up your project to get started' : 'Manage your project configuration'}
            </p>
          </div>
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-2xl border ${
              message.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        {/* Organization ID */}
        {project?.organizationId && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-6 h-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-slate-900">Organization ID</h2>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Share this ID with team members so they can join your workspace.
            </p>
            <div className="flex items-center gap-3">
              <code className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-mono text-sm select-all">
                {project.organizationId}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(project.organizationId!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-700 font-medium text-sm transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Project Settings */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-900">Project Settings</h2>
            {noProjectExists && (
              <span className="ml-auto text-xs bg-amber-100 px-3 py-1 rounded-full font-semibold text-amber-700 border border-amber-300">
                New Project
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900"
                placeholder="My Project"
              />
            </div>
          </div>
        </div>

        {/* Session Replay Source Toggle */}
        {!noProjectExists && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-6 h-6 text-indigo-600" />
              <h2 className="text-2xl font-bold text-slate-900">Session Replay Source</h2>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Choose which analytics platform to use for fetching and syncing session replays. Only sessions from the selected source will be synced.
            </p>

            <div className="grid grid-cols-3 gap-3">
              {/* PostHog */}
              <button
                onClick={() => handleInputChange('replaySource', 'posthog')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  formData.replaySource === 'posthog'
                    ? 'border-purple-500 bg-purple-50 shadow-md shadow-purple-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                {formData.replaySource === 'posthog' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-purple-600" />
                  </div>
                )}
                <Cloud className={`w-8 h-8 ${formData.replaySource === 'posthog' ? 'text-purple-600' : 'text-slate-400'}`} />
                <span className={`font-semibold text-sm ${formData.replaySource === 'posthog' ? 'text-purple-900' : 'text-slate-600'}`}>PostHog</span>
                <span className="text-xs text-slate-500 text-center">Real DOM session recordings</span>
                {formData.posthogKey && formData.posthogProjId ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Configured</span>
                ) : (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Not configured</span>
                )}
              </button>

              {/* Mixpanel */}
              <button
                onClick={() => handleInputChange('replaySource', 'mixpanel')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  formData.replaySource === 'mixpanel'
                    ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                {formData.replaySource === 'mixpanel' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-orange-600" />
                  </div>
                )}
                <BarChart3 className={`w-8 h-8 ${formData.replaySource === 'mixpanel' ? 'text-orange-600' : 'text-slate-400'}`} />
                <span className={`font-semibold text-sm ${formData.replaySource === 'mixpanel' ? 'text-orange-900' : 'text-slate-600'}`}>Mixpanel</span>
                <span className="text-xs text-slate-500 text-center">Event-based activity timeline</span>
                {formData.mixpanelKey && formData.mixpanelProjId ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Configured</span>
                ) : (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Not configured</span>
                )}
              </button>

              {/* Amplitude */}
              <button
                onClick={() => handleInputChange('replaySource', 'amplitude')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  formData.replaySource === 'amplitude'
                    ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                {formData.replaySource === 'amplitude' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                <BarChart3 className={`w-8 h-8 ${formData.replaySource === 'amplitude' ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className={`font-semibold text-sm ${formData.replaySource === 'amplitude' ? 'text-blue-900' : 'text-slate-600'}`}>Amplitude</span>
                <span className="text-xs text-slate-500 text-center">Event-based activity timeline</span>
                {formData.amplitudeKey && formData.amplitudeProjId ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Configured</span>
                ) : (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Not configured</span>
                )}
              </button>
            </div>

            {!formData.replaySource && (
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No source selected — the system will auto-detect based on which integration is configured.
              </p>
            )}
          </div>
        )}

        {/* PostHog Integration */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Key className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-slate-900">PostHog Integration</h2>
          </div>

          <p className="text-sm text-slate-500 mb-5 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            Configure PostHog to sync session recordings. You only need <strong>either</strong> PostHog or Mixpanel, not both.
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={formData.posthogKey}
                onChange={(e) => handleInputChange('posthogKey', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="phx_••••••••••••••••••••"
              />
              <p className="text-xs text-slate-500 mt-2">
                Your PostHog Personal API Key (starts with phx_)
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Project ID
              </label>
              <input
                type="text"
                value={formData.posthogProjId}
                onChange={(e) => handleInputChange('posthogProjId', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="12345"
              />
              <p className="text-xs text-slate-500 mt-2">
                Your PostHog Project ID (found in PostHog project settings)
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Host URL
              </label>
              <input
                type="text"
                value={formData.posthogHost}
                onChange={(e) => handleInputChange('posthogHost', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="https://us.posthog.com"
              />
              <p className="text-xs text-slate-500 mt-2">
                PostHog instance URL (default: https://us.posthog.com)
              </p>
            </div>
          </div>
        </div>

        {/* Mixpanel Integration */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Key className="w-6 h-6 text-orange-600" />
            <h2 className="text-2xl font-bold text-slate-900">Mixpanel Integration</h2>
          </div>

          <p className="text-sm text-slate-500 mb-5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            Configure Mixpanel to sync user sessions. You only need <strong>either</strong> PostHog or Mixpanel, not both.
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                API Secret <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.mixpanelKey}
                onChange={(e) => handleInputChange('mixpanelKey', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="Your Mixpanel API Secret"
              />
              <p className="text-xs text-slate-500 mt-2">
                Found in Mixpanel → Project Settings → Project Details → API Secret
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Project ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.mixpanelProjId}
                onChange={(e) => handleInputChange('mixpanelProjId', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="2195XXX"
              />
              <p className="text-xs text-slate-500 mt-2">
                Numeric Project ID (e.g., 2195XXX). Found in Mixpanel → Settings → Project Settings → Overview. <strong>Not</strong> the Project Token.
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Service Account Secret
              </label>
              <input
                type="password"
                value={formData.mixpanelSecret}
                onChange={(e) => handleInputChange('mixpanelSecret', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="Optional - only for Service Account auth"
              />
              <p className="text-xs text-slate-500 mt-2">
                Only needed if using Service Account instead of API Secret
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Host URL
              </label>
              <input
                type="text"
                value={formData.mixpanelHost}
                onChange={(e) => handleInputChange('mixpanelHost', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="https://mixpanel.com"
              />
              <p className="text-xs text-slate-500 mt-2">
                Use https://eu.mixpanel.com for EU data residency
              </p>
            </div>
          </div>
        </div>

        {/* Mixpanel Session Replay Snippet */}
        {project && (formData.mixpanelKey || formData.mixpanelProjId) && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <Code className="w-6 h-6 text-orange-600" />
              <h2 className="text-2xl font-bold text-slate-900">Real Session Replay</h2>
              <span className="ml-auto text-xs bg-orange-100 px-3 py-1 rounded-full font-semibold text-orange-700 border border-orange-300">
                Optional
              </span>
            </div>

            <p className="text-sm text-slate-500 mb-4 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              Without this snippet, Mixpanel sessions show a <strong>timeline reconstruction</strong> from analytics events.
              Add this snippet to your site for <strong>real DOM session replays</strong> powered by rrweb.
            </p>

            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
{`<!-- Tranzmit Real Session Replay -->
<script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js"></script>
<script>
  window.TRANZMIT_CONFIG = {
    apiKey: '${project.apiKey}',
    endpoint: '${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}'
  };
</script>
<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/tranzmit-replay.js"></script>`}
              </pre>
              <button
                onClick={() => {
                  const snippet = `<!-- Tranzmit Real Session Replay -->\n<script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js"></script>\n<script>\n  window.TRANZMIT_CONFIG = {\n    apiKey: '${project.apiKey}',\n    endpoint: '${window.location.origin}'\n  };\n</script>\n<script src="${window.location.origin}/tranzmit-replay.js"></script>`;
                  navigator.clipboard.writeText(snippet);
                  setCopiedSnippet(true);
                  setTimeout(() => setCopiedSnippet(false), 2000);
                }}
                className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-slate-200 text-xs font-medium transition-colors"
              >
                {copiedSnippet ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-3">
              Add this snippet to your site&apos;s {'<head>'} or before {'</body>'}. Make sure the Mixpanel SDK is loaded first so session IDs are correlated.
            </p>
          </div>
        )}

        {/* Amplitude Integration */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Key className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-900">Amplitude Integration</h2>
          </div>

          <p className="text-sm text-slate-500 mb-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            Configure Amplitude to sync session events. You only need <strong>one</strong> analytics integration (PostHog, Mixpanel, or Amplitude).
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                API Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.amplitudeKey}
                onChange={(e) => handleInputChange('amplitudeKey', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="Your Amplitude API Key"
              />
              <p className="text-xs text-slate-500 mt-2">
                Found in Amplitude → Settings → Projects → Your Project → General
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Secret Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.amplitudeSecret}
                onChange={(e) => handleInputChange('amplitudeSecret', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="Your Amplitude Secret Key"
              />
              <p className="text-xs text-slate-500 mt-2">
                Found in Amplitude → Settings → Projects → Your Project → General (next to API Key)
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Project ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.amplitudeProjId}
                onChange={(e) => handleInputChange('amplitudeProjId', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="123456"
              />
              <p className="text-xs text-slate-500 mt-2">
                Numeric Project ID found in Amplitude → Settings → Projects → Your Project
              </p>
            </div>
          </div>
        </div>

        {/* ElevenLabs Integration */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Bot className="w-6 h-6 text-violet-600" />
            <h2 className="text-2xl font-bold text-slate-900">ElevenLabs Integration</h2>
            <span className="ml-auto text-xs bg-violet-100 px-3 py-1 rounded-full font-semibold text-violet-700 border border-violet-300">
              Optional
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Agent ID
              </label>
              <input
                type="text"
                value={formData.elevenlabsAgentId}
                onChange={(e) => handleInputChange('elevenlabsAgentId', e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-900 font-mono"
                placeholder="agent_abc123..."
              />
              <p className="text-xs text-slate-500 mt-2">
                Your ElevenLabs Conversational AI Agent ID. Used by the Qualitative tab to sync conversations.
              </p>
            </div>
          </div>
        </div>

        {/* Notification Settings (Placeholder) */}
        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-6 shadow-sm opacity-60">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-6 h-6 text-amber-600" />
            <h2 className="text-2xl font-bold text-slate-900">Notifications</h2>
            <span className="ml-auto text-xs bg-white px-3 py-1 rounded-full font-semibold text-amber-700 border border-amber-300">Coming Soon</span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            Configure email and webhook notifications for friction points, completed interviews, and insights.
          </p>
        </div>

        {/* Security Settings (Placeholder) */}
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-6 shadow-sm opacity-60">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-emerald-600" />
            <h2 className="text-2xl font-bold text-slate-900">Security</h2>
            <span className="ml-auto text-xs bg-white px-3 py-1 rounded-full font-semibold text-emerald-700 border border-emerald-300">Coming Soon</span>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            Manage API keys, access tokens, and team member permissions.
          </p>
        </div>

        {/* Save/Create & Cancel Buttons */}
        <div className="flex justify-end gap-3">
          <button
            id="cancel-btn"
            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-2xl hover:bg-slate-50 hover:border-slate-400 font-semibold transition-all"
          >
            <X className="w-5 h-5" />
            Cancel
          </button>
          {noProjectExists ? (
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-2xl hover:shadow-lg hover:shadow-green-500/30 disabled:opacity-50 font-semibold transition-all"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Create Project
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-50 font-semibold transition-all"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Settings
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <Script
        src="https://tranzmit-button-sdk-react-app.vercel.app/embed.js"
        data-api-key="eb_live_trnzmit_sk_2026"
        data-attach="#cancel-btn"
        data-backend-url="https://tranzmit-button-sdk-react-app.vercel.app"
        strategy="lazyOnload"
      />
    </div>
  );
}
