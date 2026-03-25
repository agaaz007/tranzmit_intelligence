'use client';

import { useState, useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';
import Script from 'next/script';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Save, Globe, Bell, Shield, Loader2, Plus, Bot, Users, Copy, Check, Code, Activity, X, ChevronDown, ChevronUp, LogOut } from 'lucide-react';

// PostHog hedgehog logo (simplified)
function PostHogLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#1D4AFF" />
      <path d="M8 24L24 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 17L17 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 10L10 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M15 24L24 15" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M22 24L24 22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Amplitude logo (simplified A mark)
function AmplitudeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#1C1E21" />
      <path d="M16 7L7 25h4.5l1.5-3h5l1.5 3H24L16 7zm0 7l2.5 5h-5L16 14z" fill="white" />
    </svg>
  );
}

// Mixpanel logo (simplified)
function MixpanelLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill="#7856FF" />
      <path d="M8 22V14l4 4 4-6 4 4 4-6v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const { signOut } = useClerk();
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [projectId, setProjectId] = useState<string>('');
  const [noProjectExists, setNoProjectExists] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Which integration section is expanded
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

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

      const storedProjectId = localStorage.getItem('currentProjectId');

      if (storedProjectId) {
        setProjectId(storedProjectId);
        await loadProject(storedProjectId);
      } else {
        try {
          const response = await fetch('/api/projects');
          const data = await response.json();

          if (data.projects && data.projects.length > 0) {
            const firstProject = data.projects[0];
            localStorage.setItem('currentProjectId', firstProject.id);
            setProjectId(firstProject.id);
            await loadProject(firstProject.id);
          } else {
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

        // Auto-expand the active integration
        if (data.project.posthogKey) setExpandedSection('posthog');
        else if (data.project.amplitudeKey) setExpandedSection('amplitude');
        else if (data.project.mixpanelKey) setExpandedSection('mixpanel');
      } else {
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
        // Clear the onboarding cache so dashboard re-checks
        sessionStorage.removeItem('onboardingVerified');
        loadProject(projectId);
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('currentProjectId');
    sessionStorage.removeItem('onboardingVerified');
    sessionStorage.removeItem('onboardingComplete');
    await signOut({ redirectUrl: '/sign-in' });
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
      setMessage({ type: 'error', text: 'Please configure at least one analytics integration' });
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
    } catch {
      setMessage({ type: 'error', text: 'Failed to create project' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => (prev === section ? null : section));
  };

  const isPostHogConfigured = !!(formData.posthogKey && formData.posthogProjId);
  const isAmplitudeConfigured = !!(formData.amplitudeKey && formData.amplitudeSecret && formData.amplitudeProjId);
  const isMixpanelConfigured = !!(formData.mixpanelKey && formData.mixpanelProjId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[var(--brand-primary)] flex items-center justify-center shadow-lg">
            <SettingsIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-[var(--foreground)] tracking-tight">Settings</h1>
            <p className="text-[var(--foreground-muted)] mt-1">
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
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Users className="w-6 h-6 text-[var(--brand-primary)]" />
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Organization ID</h2>
            </div>
            <p className="text-sm text-[var(--foreground-subtle)] mb-4">
              Share this ID with team members so they can join your workspace.
            </p>
            <div className="flex items-center gap-3">
              <code className="flex-1 px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl text-[var(--foreground)] font-mono text-sm select-all">
                {project.organizationId}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(project.organizationId!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--background-subtle)] hover:bg-[var(--muted)] border border-[var(--border)] rounded-xl text-[var(--foreground-muted)] font-medium text-sm transition-colors"
              >
                {copied ? (
                  <><Check className="w-4 h-4 text-green-600" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Project Settings */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-6 h-6 text-[var(--brand-primary)]" />
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Project Settings</h2>
            {noProjectExists && (
              <span className="ml-auto text-xs bg-amber-100 px-3 py-1 rounded-full font-semibold text-amber-700 border border-amber-300">
                New Project
              </span>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)]"
              placeholder="My Project"
            />
          </div>
        </div>

        {/* Session Replay Source Toggle */}
        {!noProjectExists && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-6 h-6 text-[var(--brand-primary)]" />
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Session Replay Source</h2>
            </div>
            <p className="text-sm text-[var(--foreground-subtle)] mb-5">
              Choose which platform to sync session replays from.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleInputChange('replaySource', 'posthog')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  formData.replaySource === 'posthog'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-light)] shadow-md'
                    : 'border-[var(--border)] bg-[var(--background-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                {formData.replaySource === 'posthog' && (
                  <div className="absolute top-2 right-2"><Check className="w-4 h-4 text-[var(--brand-primary)]" /></div>
                )}
                <PostHogLogo className="w-8 h-8" />
                <span className={`font-semibold text-sm ${formData.replaySource === 'posthog' ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>PostHog</span>
                {isPostHogConfigured ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                ) : (
                  <span className="text-xs bg-[var(--muted)] text-[var(--foreground-subtle)] px-2 py-0.5 rounded-full font-medium">Not connected</span>
                )}
              </button>

              <button
                onClick={() => handleInputChange('replaySource', 'mixpanel')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  formData.replaySource === 'mixpanel'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-light)] shadow-md'
                    : 'border-[var(--border)] bg-[var(--background-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                {formData.replaySource === 'mixpanel' && (
                  <div className="absolute top-2 right-2"><Check className="w-4 h-4 text-[var(--brand-primary)]" /></div>
                )}
                <MixpanelLogo className="w-8 h-8" />
                <span className={`font-semibold text-sm ${formData.replaySource === 'mixpanel' ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>Mixpanel</span>
                {isMixpanelConfigured ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                ) : (
                  <span className="text-xs bg-[var(--muted)] text-[var(--foreground-subtle)] px-2 py-0.5 rounded-full font-medium">Not connected</span>
                )}
              </button>

              <button
                onClick={() => handleInputChange('replaySource', 'amplitude')}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  formData.replaySource === 'amplitude'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-light)] shadow-md'
                    : 'border-[var(--border)] bg-[var(--background-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                {formData.replaySource === 'amplitude' && (
                  <div className="absolute top-2 right-2"><Check className="w-4 h-4 text-[var(--brand-primary)]" /></div>
                )}
                <AmplitudeLogo className="w-8 h-8" />
                <span className={`font-semibold text-sm ${formData.replaySource === 'amplitude' ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>Amplitude</span>
                {isAmplitudeConfigured ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Connected</span>
                ) : (
                  <span className="text-xs bg-[var(--muted)] text-[var(--foreground-subtle)] px-2 py-0.5 rounded-full font-medium">Not connected</span>
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

        {/* Integrations — collapsible cards with logos */}
        <div className="space-y-3">
          {/* PostHog */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('posthog')}
              className="w-full flex items-center gap-4 p-6 text-left hover:bg-[var(--background-subtle)] transition-colors"
            >
              <PostHogLogo className="w-10 h-10 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-[var(--foreground)]">PostHog</h2>
                  {isPostHogConfigured ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium border border-green-200">Connected</span>
                  ) : (
                    <span className="text-xs bg-[var(--muted)] text-[var(--foreground-subtle)] px-2.5 py-1 rounded-full font-medium border border-[var(--border)]">Not connected</span>
                  )}
                </div>
                <p className="text-sm text-[var(--foreground-subtle)] mt-0.5">Session recordings & product analytics</p>
              </div>
              {expandedSection === 'posthog' ? (
                <ChevronUp className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              )}
            </button>

            {expandedSection === 'posthog' && (
              <div className="px-6 pb-6 pt-0 space-y-4 border-t border-[var(--border)]">
                <div className="pt-4">
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">API Key</label>
                  <input
                    type="password"
                    value={formData.posthogKey}
                    onChange={(e) => handleInputChange('posthogKey', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="phx_..."
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Personal API Key from Settings &rarr; Personal API Keys</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Project ID</label>
                  <input
                    type="text"
                    value={formData.posthogProjId}
                    onChange={(e) => handleInputChange('posthogProjId', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="12345"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Found in Project Settings</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Host URL</label>
                  <input
                    type="text"
                    value={formData.posthogHost}
                    onChange={(e) => handleInputChange('posthogHost', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="https://us.posthog.com"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Use https://eu.posthog.com for EU instances</p>
                </div>
              </div>
            )}
          </div>

          {/* Amplitude */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('amplitude')}
              className="w-full flex items-center gap-4 p-6 text-left hover:bg-[var(--background-subtle)] transition-colors"
            >
              <AmplitudeLogo className="w-10 h-10 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-[var(--foreground)]">Amplitude</h2>
                  {isAmplitudeConfigured ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium border border-green-200">Connected</span>
                  ) : (
                    <span className="text-xs bg-[var(--muted)] text-[var(--foreground-subtle)] px-2.5 py-1 rounded-full font-medium border border-[var(--border)]">Not connected</span>
                  )}
                </div>
                <p className="text-sm text-[var(--foreground-subtle)] mt-0.5">Event-based analytics platform</p>
              </div>
              {expandedSection === 'amplitude' ? (
                <ChevronUp className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              )}
            </button>

            {expandedSection === 'amplitude' && (
              <div className="px-6 pb-6 pt-0 space-y-4 border-t border-[var(--border)]">
                <div className="pt-4">
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">API Key</label>
                  <input
                    type="password"
                    value={formData.amplitudeKey}
                    onChange={(e) => handleInputChange('amplitudeKey', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="Your Amplitude API Key"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Settings &rarr; Projects &rarr; General</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Secret Key</label>
                  <input
                    type="password"
                    value={formData.amplitudeSecret}
                    onChange={(e) => handleInputChange('amplitudeSecret', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="Your Amplitude Secret Key"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Found next to the API Key in project settings</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Project ID</label>
                  <input
                    type="text"
                    value={formData.amplitudeProjId}
                    onChange={(e) => handleInputChange('amplitudeProjId', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="123456"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Numeric Project ID from project settings</p>
                </div>
              </div>
            )}
          </div>

          {/* Mixpanel */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('mixpanel')}
              className="w-full flex items-center gap-4 p-6 text-left hover:bg-[var(--background-subtle)] transition-colors"
            >
              <MixpanelLogo className="w-10 h-10 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-[var(--foreground)]">Mixpanel</h2>
                  {isMixpanelConfigured ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium border border-green-200">Connected</span>
                  ) : (
                    <span className="text-xs bg-[var(--muted)] text-[var(--foreground-subtle)] px-2.5 py-1 rounded-full font-medium border border-[var(--border)]">Not connected</span>
                  )}
                </div>
                <p className="text-sm text-[var(--foreground-subtle)] mt-0.5">Event-based user analytics</p>
              </div>
              {expandedSection === 'mixpanel' ? (
                <ChevronUp className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              )}
            </button>

            {expandedSection === 'mixpanel' && (
              <div className="px-6 pb-6 pt-0 space-y-4 border-t border-[var(--border)]">
                <div className="pt-4">
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">API Secret</label>
                  <input
                    type="password"
                    value={formData.mixpanelKey}
                    onChange={(e) => handleInputChange('mixpanelKey', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="Your Mixpanel API Secret"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Project Settings &rarr; Project Details &rarr; API Secret</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Project ID</label>
                  <input
                    type="text"
                    value={formData.mixpanelProjId}
                    onChange={(e) => handleInputChange('mixpanelProjId', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="2195XXX"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Numeric Project ID (not the Project Token)</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Service Account Secret <span className="font-normal text-[var(--foreground-subtle)]">(optional)</span></label>
                  <input
                    type="password"
                    value={formData.mixpanelSecret}
                    onChange={(e) => handleInputChange('mixpanelSecret', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Host URL</label>
                  <input
                    type="text"
                    value={formData.mixpanelHost}
                    onChange={(e) => handleInputChange('mixpanelHost', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="https://mixpanel.com"
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Use https://eu.mixpanel.com for EU data residency</p>
                </div>
              </div>
            )}
          </div>

          {/* Mixpanel Session Replay Snippet */}
          {project && (formData.mixpanelKey || formData.mixpanelProjId) && expandedSection === 'mixpanel' && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm ml-4 border-l-4 border-l-[#7856FF]">
              <div className="flex items-center gap-3 mb-4">
                <Code className="w-5 h-5 text-[var(--brand-primary)]" />
                <h3 className="text-lg font-bold text-[var(--foreground)]">Real Session Replay Snippet</h3>
                <span className="ml-auto text-xs bg-[var(--background-subtle)] px-2 py-0.5 rounded-full text-[var(--foreground-subtle)] border border-[var(--border)]">Optional</span>
              </div>
              <p className="text-sm text-[var(--foreground-subtle)] mb-3">
                Add this to your site for real DOM session replays instead of timeline reconstructions.
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
                    <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /> Copy</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ElevenLabs */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection('elevenlabs')}
              className="w-full flex items-center gap-4 p-6 text-left hover:bg-[var(--background-subtle)] transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-[var(--foreground)]">ElevenLabs</h2>
                  <span className="text-xs bg-[var(--background-subtle)] px-2.5 py-1 rounded-full text-[var(--foreground-subtle)] border border-[var(--border)]">Optional</span>
                </div>
                <p className="text-sm text-[var(--foreground-subtle)] mt-0.5">Voice AI for qualitative interviews</p>
              </div>
              {expandedSection === 'elevenlabs' ? (
                <ChevronUp className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[var(--foreground-subtle)] flex-shrink-0" />
              )}
            </button>

            {expandedSection === 'elevenlabs' && (
              <div className="px-6 pb-6 pt-0 border-t border-[var(--border)]">
                <div className="pt-4">
                  <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">Agent ID</label>
                  <input
                    type="text"
                    value={formData.elevenlabsAgentId}
                    onChange={(e) => handleInputChange('elevenlabsAgentId', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                    placeholder="agent_abc123..."
                  />
                  <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Your Conversational AI Agent ID for syncing voice interviews</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Placeholder sections */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm opacity-60">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="w-6 h-6 text-[var(--foreground-subtle)]" />
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Notifications</h2>
            <span className="ml-auto text-xs bg-[var(--background-subtle)] px-3 py-1 rounded-full font-semibold text-[var(--foreground-subtle)] border border-[var(--border)]">Coming Soon</span>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
            Configure email and webhook notifications for friction points, completed interviews, and insights.
          </p>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm opacity-60">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-[var(--foreground-subtle)]" />
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Security</h2>
            <span className="ml-auto text-xs bg-[var(--background-subtle)] px-3 py-1 rounded-full font-semibold text-[var(--foreground-subtle)] border border-[var(--border)]">Coming Soon</span>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
            Manage API keys, access tokens, and team member permissions.
          </p>
        </div>

        {/* Save/Create & Cancel */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--card)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-2xl hover:bg-[var(--muted)] hover:border-[var(--border-hover)] font-semibold transition-all"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
          <button
            id="cancel-btn"
            onClick={() => {
              const exitButton = (window as Window & {
                ExitButton?: { start?: () => void };
              }).ExitButton;

              if (exitButton?.start) {
                exitButton.start();
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-[var(--card)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-2xl hover:bg-[var(--muted)] hover:border-[var(--border-hover)] font-semibold transition-all"
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
                <><Loader2 className="w-5 h-5 animate-spin" /> Creating...</>
              ) : (
                <><Plus className="w-5 h-5" /> Create Project</>
              )}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-2xl hover:shadow-lg hover:shadow-[var(--brand-glow)] disabled:opacity-50 font-semibold transition-all"
            >
              {isSaving ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-5 h-5" /> Save Settings</>
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
        data-prefetch-url="/dashboard/settings"
        strategy="afterInteractive"
      />
    </div>
  );
}
