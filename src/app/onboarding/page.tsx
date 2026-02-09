'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Sparkles, ArrowRight, Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgId.trim();
    if (!trimmed) {
      setError('Please enter an Organization ID');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      const res = await fetch('/api/organizations/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join organization');
        setIsJoining(false);
        return;
      }

      // Store the org's first project ID and redirect
      if (data.projects && data.projects.length > 0) {
        localStorage.setItem('currentProjectId', data.projects[0].id);
      }

      // Mark onboarding complete so dashboard doesn't redirect back
      sessionStorage.setItem('onboardingComplete', 'true');
      router.push('/dashboard');
    } catch {
      setError('Something went wrong. Please try again.');
      setIsJoining(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem('onboardingComplete', 'true');
    router.push('/dashboard/settings');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-slate-900 text-lg tracking-tight leading-none">
              Tranzmit
            </span>
            <span className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              AI Platform
            </span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900 text-center mb-2">
            Join your team
          </h1>
          <p className="text-slate-500 text-center text-sm mb-8">
            Enter the Organization ID shared by your team admin to access the workspace.
          </p>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Organization ID
              </label>
              <input
                type="text"
                value={orgId}
                onChange={(e) => {
                  setOrgId(e.target.value);
                  setError('');
                }}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-900 font-mono text-sm"
                placeholder="cm1abc2de3fg4hi5jk..."
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isJoining}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-indigo-500/30 disabled:opacity-50 font-semibold transition-all"
            >
              {isJoining ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  Join Organization
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={handleSkip}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip — create my own workspace
          </button>
        </div>
      </div>
    </div>
  );
}
