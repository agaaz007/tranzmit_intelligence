'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Sparkles, ArrowRight, ArrowLeft, Loader2, Building2, BarChart3, Rocket, Check, Copy, Share2 } from 'lucide-react';

type Step = 'join' | 'company' | 'analytics' | 'ready';
const STEPS: Step[] = ['join', 'company', 'analytics', 'ready'];

interface OrgData {
  orgId: string;
  orgName: string;
  projectId: string;
  projectName: string;
  apiKey: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('join');

  // Step 1 state
  const [orgId, setOrgId] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Org/project data (set after creating workspace)
  const [orgData, setOrgData] = useState<OrgData | null>(null);

  // Step 2 state (creating new workspace)
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 3 state
  const [platform, setPlatform] = useState<'posthog' | 'amplitude' | 'mixpanel'>('posthog');
  const [analytics, setAnalytics] = useState({
    posthogKey: '', posthogProjId: '', posthogHost: 'https://us.posthog.com',
    amplitudeKey: '', amplitudeSecret: '', amplitudeProjId: '',
    mixpanelKey: '', mixpanelProjId: '',
  });
  const [savingAnalytics, setSavingAnalytics] = useState(false);

  // Step 4 state
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedOrgId, setCopiedOrgId] = useState(false);

  const stepIndex = STEPS.indexOf(step);

  // No longer auto-load existing org on step 2 — we always create a NEW workspace

  // Step 1: Join existing org
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    let trimmed = orgId.trim();
    if (!trimmed) { setError('Please enter an Organization ID'); return; }
    if (trimmed.toLowerCase() === 'juno') trimmed = 'juno-demo';

    setIsJoining(true);
    setError('');
    try {
      const res = await fetch('/api/organizations/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to join organization'); setIsJoining(false); return; }
      if (data.projects?.length > 0) localStorage.setItem('currentProjectId', data.projects[0].id);
      localStorage.setItem('onboardingComplete', 'true');
      router.push('/dashboard');
    } catch {
      setError('Something went wrong. Please try again.');
      setIsJoining(false);
    }
  };

  // Step 2: Create new workspace
  const handleSaveCompany = async () => {
    if (!companyName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/organizations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create workspace');
        setSaving(false);
        return;
      }
      setOrgData({
        orgId: data.organization.id,
        orgName: data.organization.name,
        projectId: data.project.id,
        projectName: data.project.name,
        apiKey: data.project.apiKey,
      });
      setStep('analytics');
    } catch {
      setError('Failed to create workspace. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Step 3: Save analytics
  const handleSaveAnalytics = async () => {
    if (!orgData?.projectId) return;
    setSavingAnalytics(true);
    setError('');
    try {
      // Determine replay source from which platform has data
      let replaySource = '';
      if (analytics.posthogKey) replaySource = 'posthog';
      else if (analytics.amplitudeKey) replaySource = 'amplitude';
      else if (analytics.mixpanelKey) replaySource = 'mixpanel';

      await fetch(`/api/projects/${orgData.projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posthogKey: analytics.posthogKey || undefined,
          posthogProjId: analytics.posthogProjId || undefined,
          posthogHost: analytics.posthogHost || undefined,
          amplitudeKey: analytics.amplitudeKey || undefined,
          amplitudeSecret: analytics.amplitudeSecret || undefined,
          amplitudeProjId: analytics.amplitudeProjId || undefined,
          mixpanelKey: analytics.mixpanelKey || undefined,
          mixpanelProjId: analytics.mixpanelProjId || undefined,
          ...(replaySource ? { replaySource } : {}),
        }),
      });
      setStep('ready');
    } catch {
      setError('Failed to save analytics. Please try again.');
    } finally {
      setSavingAnalytics(false);
    }
  };

  const handleFinish = () => {
    if (orgData?.projectId) localStorage.setItem('currentProjectId', orgData.projectId);
    localStorage.setItem('onboardingComplete', 'true');
    router.push('/dashboard');
  };

  const copyText = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const inputClass = "w-full px-4 py-3 bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent text-[var(--foreground)] font-mono text-sm";
  const labelClass = "block text-sm font-semibold text-[var(--foreground-muted)] mb-2";

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary)] flex items-center justify-center shadow-lg">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-[var(--foreground)] text-lg tracking-tight leading-none">Tranzmit</span>
            <span className="text-[10px] text-[var(--foreground-subtle)] mt-0.5 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              AI Platform
            </span>
          </div>
        </div>

        {/* Progress dots (hidden on step 1) */}
        {step !== 'join' && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {STEPS.slice(1).map((s, i) => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= stepIndex - 1 ? 'w-8 bg-[var(--brand-primary)]' : 'w-4 bg-[var(--border)]'
              }`} />
            ))}
          </div>
        )}

        {/* Card */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">

          {/* ===== STEP 1: JOIN OR CREATE ===== */}
          {step === 'join' && (
            <>
              <h1 className="text-2xl font-bold text-[var(--foreground)] text-center mb-2">
                Join your team
              </h1>
              <p className="text-[var(--foreground-subtle)] text-center text-sm mb-8">
                Enter the Organization ID shared by your team admin to access the workspace.
              </p>

              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className={labelClass}>Organization ID</label>
                  <input
                    type="text"
                    value={orgId}
                    onChange={(e) => { setOrgId(e.target.value); setError(''); }}
                    className={inputClass}
                    placeholder="cm1abc2de3fg4hi5jk..."
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isJoining}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] disabled:opacity-50 font-semibold transition-all"
                >
                  {isJoining ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Joining...</>
                  ) : (
                    <>Join Organization <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)]" /></div>
                <div className="relative flex justify-center"><span className="bg-[var(--card)] px-3 text-xs text-[var(--foreground-subtle)]">or</span></div>
              </div>

              <button
                onClick={() => { setError(''); setStep('company'); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border)] hover:border-[var(--brand-primary)] text-[var(--foreground)] rounded-xl font-medium transition-all text-sm hover:bg-[var(--background-subtle)]"
              >
                <Building2 className="w-4 h-4" />
                Create my own workspace
              </button>
            </>
          )}

          {/* ===== STEP 2: COMPANY DETAILS ===== */}
          {step === 'company' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-400" />
                </div>
                <h1 className="text-xl font-bold text-[var(--foreground)]">Your workspace</h1>
              </div>
              <p className="text-[var(--foreground-subtle)] text-sm mb-6">
                What's your company or team name?
              </p>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Company Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={inputClass.replace('font-mono', '')}
                    placeholder="Acme Inc."
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('join')}
                    className="px-4 py-3 border border-[var(--border)] rounded-xl text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSaveCompany}
                    disabled={!companyName.trim() || saving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl disabled:opacity-50 font-semibold transition-all"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Create Workspace <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ===== STEP 3: CONNECT ANALYTICS ===== */}
          {step === 'analytics' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                </div>
                <h1 className="text-xl font-bold text-[var(--foreground)]">Connect analytics</h1>
              </div>
              <p className="text-[var(--foreground-subtle)] text-sm mb-6">
                Connect your analytics platform to sync session recordings.
              </p>

              {/* Platform tabs */}
              <div className="flex gap-1 p-1 bg-[var(--background-subtle)] rounded-xl mb-5">
                {(['posthog', 'amplitude', 'mixpanel'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      platform === p
                        ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                        : 'text-[var(--foreground-subtle)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {p === 'posthog' ? 'PostHog' : p === 'amplitude' ? 'Amplitude' : 'Mixpanel'}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {platform === 'posthog' && (
                  <>
                    <div>
                      <label className={labelClass}>API Key</label>
                      <input type="password" value={analytics.posthogKey} onChange={e => setAnalytics({...analytics, posthogKey: e.target.value})} className={inputClass} placeholder="phx_..." />
                      <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Personal API Key (starts with phx_)</p>
                    </div>
                    <div>
                      <label className={labelClass}>Project ID</label>
                      <input type="text" value={analytics.posthogProjId} onChange={e => setAnalytics({...analytics, posthogProjId: e.target.value})} className={inputClass} placeholder="12345" />
                    </div>
                    <div>
                      <label className={labelClass}>Host URL</label>
                      <input type="text" value={analytics.posthogHost} onChange={e => setAnalytics({...analytics, posthogHost: e.target.value})} className={inputClass} placeholder="https://us.posthog.com" />
                    </div>
                  </>
                )}

                {platform === 'amplitude' && (
                  <>
                    <div>
                      <label className={labelClass}>API Key</label>
                      <input type="password" value={analytics.amplitudeKey} onChange={e => setAnalytics({...analytics, amplitudeKey: e.target.value})} className={inputClass} placeholder="Your Amplitude API Key" />
                    </div>
                    <div>
                      <label className={labelClass}>Secret Key</label>
                      <input type="password" value={analytics.amplitudeSecret} onChange={e => setAnalytics({...analytics, amplitudeSecret: e.target.value})} className={inputClass} placeholder="Your Amplitude Secret Key" />
                    </div>
                    <div>
                      <label className={labelClass}>Project ID</label>
                      <input type="text" value={analytics.amplitudeProjId} onChange={e => setAnalytics({...analytics, amplitudeProjId: e.target.value})} className={inputClass} placeholder="123456" />
                      <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Settings → Projects → Your Project → General</p>
                    </div>
                  </>
                )}

                {platform === 'mixpanel' && (
                  <>
                    <div>
                      <label className={labelClass}>API Secret</label>
                      <input type="password" value={analytics.mixpanelKey} onChange={e => setAnalytics({...analytics, mixpanelKey: e.target.value})} className={inputClass} placeholder="Your Mixpanel API Secret" />
                      <p className="text-xs text-[var(--foreground-subtle)] mt-1.5">Project Settings → API Secret</p>
                    </div>
                    <div>
                      <label className={labelClass}>Project ID</label>
                      <input type="text" value={analytics.mixpanelProjId} onChange={e => setAnalytics({...analytics, mixpanelProjId: e.target.value})} className={inputClass} placeholder="2195XXX" />
                    </div>
                  </>
                )}

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('company')}
                    className="px-4 py-3 border border-[var(--border)] rounded-xl text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleSaveAnalytics}
                    disabled={savingAnalytics}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl disabled:opacity-50 font-semibold transition-all"
                  >
                    {savingAnalytics ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                  </button>
                </div>

                <button
                  onClick={() => setStep('ready')}
                  className="w-full text-center text-xs text-[var(--foreground-subtle)] hover:text-[var(--foreground-muted)] transition-colors py-1"
                >
                  Skip for now — I'll configure this later
                </button>
              </div>
            </>
          )}

          {/* ===== STEP 4: READY / API KEY ===== */}
          {step === 'ready' && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-amber-400" />
                </div>
                <h1 className="text-xl font-bold text-[var(--foreground)]">You're all set</h1>
              </div>
              <p className="text-[var(--foreground-subtle)] text-sm mb-6">
                Here's everything you need to get started.
              </p>

              <div className="space-y-4">
                {/* API Key */}
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-widest mb-2">Your API Key</label>
                  <div className="relative">
                    <div className="bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl px-4 py-3 font-mono text-sm text-[var(--foreground)] pr-20 truncate">
                      {orgData?.apiKey || 'Loading...'}
                    </div>
                    <button
                      onClick={() => orgData?.apiKey && copyText(orgData.apiKey, setCopiedKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--brand-primary)] transition-colors"
                    >
                      {copiedKey ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Org ID for sharing */}
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-widest mb-2">Org ID — share with your team</label>
                  <div className="relative">
                    <div className="bg-[var(--background-subtle)] border border-[var(--border)] rounded-xl px-4 py-3 font-mono text-sm text-[var(--foreground)] pr-20 truncate">
                      {orgData?.orgId || 'Loading...'}
                    </div>
                    <button
                      onClick={() => orgData?.orgId && copyText(orgData.orgId, setCopiedOrgId)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--brand-primary)] transition-colors"
                    >
                      {copiedOrgId ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Share2 className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>

                {/* Embed snippet */}
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-widest mb-2">Embed Snippet</label>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto leading-relaxed">
{`<!-- Tranzmit Session Replay -->
<script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js"></script>
<script>
  window.TRANZMIT_CONFIG = {
    apiKey: '${orgData?.apiKey || 'your-api-key'}',
    endpoint: '${typeof window !== 'undefined' ? window.location.origin : 'https://app.tranzmit.com'}'
  };
</script>
<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://app.tranzmit.com'}/tranzmit-replay.js"></script>`}
                    </pre>
                    <button
                      onClick={() => {
                        const snippet = `<!-- Tranzmit Session Replay -->\n<script src="https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb-all.min.js"></script>\n<script>\n  window.TRANZMIT_CONFIG = {\n    apiKey: '${orgData?.apiKey || ''}',\n    endpoint: '${typeof window !== 'undefined' ? window.location.origin : 'https://app.tranzmit.com'}'\n  };\n</script>\n<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://app.tranzmit.com'}/tranzmit-replay.js"></script>`;
                        copyText(snippet, setCopiedSnippet);
                      }}
                      className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-slate-200 text-xs font-medium transition-colors"
                    >
                      {copiedSnippet ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleFinish}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white rounded-xl hover:shadow-lg hover:shadow-[var(--brand-glow)] font-semibold transition-all mt-2"
                >
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
