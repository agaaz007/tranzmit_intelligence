'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Save, Key, Globe, Bell, Shield, Loader2 } from 'lucide-react';

interface ProjectSettings {
  id: string;
  name: string;
  posthogKey: string;
  posthogHost: string;
  posthogProjId: string;
}

export default function SettingsPage() {
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [projectId, setProjectId] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    posthogKey: '',
    posthogHost: '',
    posthogProjId: '',
  });

  useEffect(() => {
    const storedProjectId = localStorage.getItem('currentProjectId');
    if (storedProjectId) {
      setProjectId(storedProjectId);
      loadProject(storedProjectId);
    }
  }, []);

  const loadProject = async (projId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projId}`);
      const data = await response.json();

      if (data.project) {
        setProject(data.project);
        setFormData({
          name: data.project.name,
          posthogKey: data.project.posthogKey,
          posthogHost: data.project.posthogHost,
          posthogProjId: data.project.posthogProjId,
        });
      }
    } catch (error) {
      console.error('Failed to load project:', error);
      setMessage({ type: 'error', text: 'Failed to load project settings' });
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
            <p className="text-slate-600 mt-1">Manage your project configuration</p>
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

        {/* Project Settings */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Globe className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-900">Project Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Project Name
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

        {/* PostHog Integration */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Key className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-slate-900">PostHog Integration</h2>
          </div>

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
                placeholder="phc_••••••••••••••••••••"
              />
              <p className="text-xs text-slate-500 mt-2">
                Your PostHog Personal API Key
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
                Your PostHog Project ID
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

        {/* Save Button */}
        <div className="flex justify-end">
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
        </div>
      </div>
    </div>
  );
}
