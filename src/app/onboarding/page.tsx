'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Sparkles, ArrowRight, ArrowLeft, Loader2, Check, Cloud, BarChart3 } from 'lucide-react';

type Step = 'welcome' | 'choose-source' | 'configure' | 'done';
type Source = 'posthog' | 'amplitude';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [source, setSource] = useState<Source | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // PostHog fields
  const [posthogKey, setPosthogKey] = useState('');
  const [posthogProjId, setPosthogProjId] = useState('');
  const [posthogHost, setPosthogHost] = useState('https://us.posthog.com');

  // Amplitude fields
  const [amplitudeKey, setAmplitudeKey] = useState('');
  const [amplitudeSecret, setAmplitudeSecret] = useState('');
  const [amplitudeProjId, setAmplitudeProjId] = useState('');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/onboarding/status');
        const data = await res.json();

        if (data.onboarded) {
          // Already set up — go straight to dashboard
          localStorage.setItem('currentProjectId', data.projectId);
          router.replace('/dashboard');
          return;
        }

        if (data.projectId) {
          setProjectId(data.projectId);
        }
      } catch {
        // Continue with onboarding even if check fails
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, [router]);

  const handleSaveIntegration = async () => {
    setError('');

    if (source === 'posthog') {
      if (!posthogKey || !posthogProjId) {
        setError('API Key and Project ID are required.');
        return;
      }
    } else if (source === 'amplitude') {
      if (!amplitudeKey || !amplitudeSecret || !amplitudeProjId) {
        setError('API Key, Secret Key, and Project ID are required.');
        return;
      }
    }

    setIsSaving(true);

    try {
      let targetProjectId = projectId;

      // If no project exists yet, fetch projects to find the default one
      if (!targetProjectId) {
        const projRes = await fetch('/api/projects');
        const projData = await projRes.json();
        if (projData.projects?.length > 0) {
          targetProjectId = projData.projects[0].id;
          setProjectId(targetProjectId);
        }
      }

      if (!targetProjectId) {
        setError('No project found. Please try again.');
        setIsSaving(false);
        return;
      }

      const body: Record<string, string> = { replaySource: source! };

      if (source === 'posthog') {
        body.posthogKey = posthogKey;
        body.posthogProjId = posthogProjId;
        body.posthogHost = posthogHost;
      } else {
        body.amplitudeKey = amplitudeKey;
        body.amplitudeSecret = amplitudeSecret;
        body.amplitudeProjId = amplitudeProjId;
      }

      const res = await fetch(`/api/projects/${targetProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save. Please try again.');
        setIsSaving(false);
        return;
      }

      localStorage.setItem('currentProjectId', targetProjectId);
      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary)] flex items-center justify-center shadow-lg">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-[var(--foreground)] text-lg tracking-tight leading-none">
              Tranzmit
            </span>
            <span className="text-[10px] text-[var(--foreground-subtle)] mt-0.5 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              AI Platform
            </span>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {['welcome', 'choose-source', 'configure', 'done'].map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i <= ['welcome', 'choose-source', 'configure', 'done'].indexOf(step)
                  ? 'w-8 bg-[var(--brand-primary)]'
                  : 'w-4 bg-[var(--border)]'
              }`}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-[var(--foreground)] text-center mb-3">
              Welcome to Tranzmit
            </h1>
            <p className="text-[var(--foreground-subtle)] text-center text-sm mb-8 leading-relaxed">
              Let&apos;s connect your analytics platform so we can start analyzing sessions
              and reducing churn. This takes about 2 minutes.
            </p>

            <button
              onClick={() => setStep('choose-source')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] font-semibold transition-all"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step: Choose Source */}
        {step === 'choose-source' && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-[var(--foreground)] text-center mb-2">
              Connect your analytics
            </h1>
            <p className="text-[var(--foreground-subtle)] text-center text-sm mb-8">
              Which platform do you use for session recordings?
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              {/* PostHog */}
              <button
                onClick={() => setSource('posthog')}
                className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                  source === 'posthog'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-light)] shadow-md'
                    : 'border-[var(--border)] bg-[var(--background-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                {source === 'posthog' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-[var(--brand-primary)]" />
                  </div>
                )}
                <Cloud className={`w-10 h-10 ${source === 'posthog' ? 'text-[var(--brand-primary)]' : 'text-[var(--foreground-subtle)]'}`} />
                <span className={`font-semibold text-sm ${source === 'posthog' ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>
                  PostHog
                </span>
                <span className="text-xs text-[var(--foreground-subtle)] text-center">
                  Session recordings & event analytics
                </span>
              </button>

              {/* Amplitude */}
              <button
                onClick={() => setSource('amplitude')}
                className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all ${
                  source === 'amplitude'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-light)] shadow-md'
                    : 'border-[var(--border)] bg-[var(--background-subtle)] hover:border-[var(--border-hover)]'
                }`}
              >
                {source === 'amplitude' && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-[var(--brand-primary)]" />
                  </div>
                )}
                <BarChart3 className={`w-10 h-10 ${source === 'amplitude' ? 'text-[var(--brand-primary)]' : 'text-[var(--foreground-subtle)]'}`} />
                <span className={`font-semibold text-sm ${source === 'amplitude' ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}`}>
                  Amplitude
                </span>
                <span className="text-xs text-[var(--foreground-subtle)] text-center">
                  Event-based analytics platform
                </span>
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('welcome')}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-xl hover:bg-[var(--muted)] font-medium transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => {
                  if (source) setStep('configure');
                }}
                disabled={!source}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-all"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Configure Integration */}
        {step === 'configure' && source === 'posthog' && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Cloud className="w-6 h-6 text-[var(--brand-primary)]" />
              <h1 className="text-2xl font-bold text-[var(--foreground)]">
                Connect PostHog
              </h1>
            </div>
            <p className="text-[var(--foreground-subtle)] text-sm mb-6">
              Enter your PostHog API credentials to start syncing session recordings.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={posthogKey}
                  onChange={(e) => { setPosthogKey(e.target.value); setError(''); }}
                  className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                  placeholder="phx_..."
                  autoFocus
                />
                <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">
                  Personal API Key from PostHog Settings &rarr; Personal API Keys
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
                  Project ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={posthogProjId}
                  onChange={(e) => { setPosthogProjId(e.target.value); setError(''); }}
                  className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                  placeholder="12345"
                />
                <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">
                  Found in PostHog &rarr; Project Settings
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
                  Host URL
                </label>
                <input
                  type="text"
                  value={posthogHost}
                  onChange={(e) => setPosthogHost(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                  placeholder="https://us.posthog.com"
                />
                <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">
                  Default: https://us.posthog.com. Use https://eu.posthog.com for EU.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-4">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('choose-source')}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-xl hover:bg-[var(--muted)] font-medium transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleSaveIntegration}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] disabled:opacity-50 font-semibold transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect PostHog
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'configure' && source === 'amplitude' && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-6 h-6 text-[var(--brand-primary)]" />
              <h1 className="text-2xl font-bold text-[var(--foreground)]">
                Connect Amplitude
              </h1>
            </div>
            <p className="text-[var(--foreground-subtle)] text-sm mb-6">
              Enter your Amplitude API credentials to start syncing session data.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={amplitudeKey}
                  onChange={(e) => { setAmplitudeKey(e.target.value); setError(''); }}
                  className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                  placeholder="Your Amplitude API Key"
                  autoFocus
                />
                <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">
                  Settings &rarr; Projects &rarr; Your Project &rarr; General
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
                  Secret Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={amplitudeSecret}
                  onChange={(e) => { setAmplitudeSecret(e.target.value); setError(''); }}
                  className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                  placeholder="Your Amplitude Secret Key"
                />
                <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">
                  Found next to the API Key in project settings
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--foreground-muted)] mb-2">
                  Project ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={amplitudeProjId}
                  onChange={(e) => { setAmplitudeProjId(e.target.value); setError(''); }}
                  className="w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm"
                  placeholder="123456"
                />
                <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">
                  Numeric Project ID from Amplitude project settings
                </p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-4">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('choose-source')}
                className="flex items-center gap-2 px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-xl hover:bg-[var(--muted)] font-medium transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleSaveIntegration}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] disabled:opacity-50 font-semibold transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Amplitude
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
              You&apos;re all set!
            </h1>
            <p className="text-[var(--foreground-subtle)] text-sm mb-8 leading-relaxed">
              Your {source === 'posthog' ? 'PostHog' : 'Amplitude'} integration is connected.
              We&apos;ll start syncing your session data and analyzing it for churn signals.
            </p>

            <button
              onClick={handleGoToDashboard}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] font-semibold transition-all"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Skip link — only on welcome and choose-source */}
        {(step === 'welcome' || step === 'choose-source') && (
          <div className="text-center mt-6">
            <button
              onClick={() => {
                sessionStorage.setItem('onboardingVerified', 'true');
                router.push('/dashboard/settings');
              }}
              className="text-sm text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] transition-colors"
            >
              Skip for now — I&apos;ll configure later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
