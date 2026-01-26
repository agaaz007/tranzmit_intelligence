"use client";

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Uploader } from '@/components/ui/uploader';
import { AnalysisTable, AnalysisEntry } from '@/components/analysis-table';
import { SessionPlayer } from '@/components/session-player';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2, PlayCircle, AlertTriangle, CheckCircle2, X, Target, Sparkles, RefreshCw, ChevronDown, Upload, Cloud, Check, Trash2 } from 'lucide-react';

type InputMode = 'upload' | 'sync';
type SyncStatus = 'idle' | 'fetching-list' | 'fetching-sessions' | 'analyzing' | 'complete' | 'error';

interface PostHogSession {
    id: string;
    distinctId: string;
    startTime: string;
    duration: number;
    clickCount: number;
}

interface SyncProgress {
    status: SyncStatus;
    message: string;
    current: number;
    total: number;
    error?: string;
}

interface SynthesizedInsights {
    critical_issues: Array<{
        title: string;
        description: string;
        frequency: string;
        severity: "critical" | "high" | "medium";
        recommendation: string;
    }>;
    pattern_summary: string;
    top_user_goals: Array<{
        goal: string;
        success_rate: string;
    }>;
    immediate_actions: string[];
}

type InsightTab = 'issues' | 'goals' | 'actions' | null;

const SESSION_COUNT_OPTIONS = [5, 10, 20, 30, 40, 50] as const;
const STORAGE_KEY = 'session-insights-data';
const MAX_STORED_SESSIONS = 50; // Limit to prevent localStorage overflow

// Stored analysis entry - excludes large events array
interface StoredAnalysisEntry {
    id: string;
    fileName: string;
    timestamp: string;
    analysis: unknown;
    isAnalyzing?: boolean;
    // events are NOT stored - too large for localStorage
}

interface StoredData {
    analyses: StoredAnalysisEntry[];
    synthesizedInsights: SynthesizedInsights | null;
    lastSynthesizedCount: number;
    savedAt: number;
}

// Helper to safely parse stored data
function loadFromStorage(): StoredData | null {
    if (typeof window === 'undefined') return null;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return null;
        const data = JSON.parse(stored) as StoredData;
        // Validate structure
        if (data && Array.isArray(data.analyses)) {
            console.log('[SessionInsights] Loaded from storage:', data.analyses.length, 'analyses');
            return data;
        }
    } catch (e) {
        console.warn('[SessionInsights] Failed to load from storage:', e);
    }
    return null;
}

// Helper to save data to storage - strips out events to save space
function saveToStorage(data: { analyses: AnalysisEntry[]; synthesizedInsights: SynthesizedInsights | null; lastSynthesizedCount: number; savedAt: number }): void {
    if (typeof window === 'undefined') return;
    try {
        // Strip out events array from each analysis (too large for localStorage)
        const strippedAnalyses: StoredAnalysisEntry[] = data.analyses
            .slice(0, MAX_STORED_SESSIONS)
            .map(({ id, fileName, timestamp, analysis, isAnalyzing }) => ({
                id,
                fileName,
                timestamp,
                analysis,
                isAnalyzing,
            }));

        const storageData: StoredData = {
            analyses: strippedAnalyses,
            synthesizedInsights: data.synthesizedInsights,
            lastSynthesizedCount: data.lastSynthesizedCount,
            savedAt: data.savedAt,
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
        console.log('[SessionInsights] Saved to storage:', strippedAnalyses.length, 'analyses');
    } catch (e) {
        // Handle quota exceeded - clear old data and try again
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            console.warn('[SessionInsights] Storage quota exceeded, reducing data');
            try {
                const reducedAnalyses: StoredAnalysisEntry[] = data.analyses
                    .slice(0, 10)
                    .map(({ id, fileName, timestamp, analysis, isAnalyzing }) => ({
                        id,
                        fileName,
                        timestamp,
                        analysis,
                        isAnalyzing,
                    }));

                const reducedData: StoredData = {
                    analyses: reducedAnalyses,
                    synthesizedInsights: data.synthesizedInsights,
                    lastSynthesizedCount: data.lastSynthesizedCount,
                    savedAt: data.savedAt,
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedData));
            } catch {
                // If still failing, clear everything
                localStorage.removeItem(STORAGE_KEY);
            }
        } else {
            console.warn('[SessionInsights] Failed to save to storage:', e);
        }
    }
}

export default function SessionInsightsPage() {
    const [analyses, setAnalyses] = useState<AnalysisEntry[]>([]);
    const [selectedEntry, setSelectedEntry] = useState<AnalysisEntry | null>(null);
    const [analyzingCount, setAnalyzingCount] = useState(0);
    const [synthesizedInsights, setSynthesizedInsights] = useState<SynthesizedInsights | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [lastSynthesizedCount, setLastSynthesizedCount] = useState(0);
    const [expandedTab, setExpandedTab] = useState<InsightTab>(null);
    const [isHydrated, setIsHydrated] = useState(false);

    // New state for input mode
    const [inputMode, setInputMode] = useState<InputMode>('upload');
    const [sessionCount, setSessionCount] = useState<number>(5);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle',
        message: '',
        current: 0,
        total: 0,
    });

    // Load from localStorage on mount
    useEffect(() => {
        const stored = loadFromStorage();
        if (stored) {
            // Filter out any entries that were still analyzing when saved
            // Add empty events array since we don't store events (too large)
            const restoredAnalyses: AnalysisEntry[] = stored.analyses
                .filter(a => !a.isAnalyzing && a.analysis)
                .map(a => ({
                    ...a,
                    events: [], // Events not persisted - replay won't be available
                }));
            setAnalyses(restoredAnalyses);
            setSynthesizedInsights(stored.synthesizedInsights);
            setLastSynthesizedCount(stored.lastSynthesizedCount);
        }
        setIsHydrated(true);
    }, []);

    // Save to localStorage when analyses change (debounced)
    useEffect(() => {
        if (!isHydrated) return; // Don't save during initial hydration

        // Only save completed analyses (not currently analyzing)
        const completedAnalyses = analyses.filter(a => !a.isAnalyzing);

        // Debounce saves to avoid excessive writes
        const timeoutId = setTimeout(() => {
            saveToStorage({
                analyses: completedAnalyses,
                synthesizedInsights,
                lastSynthesizedCount,
                savedAt: Date.now(),
            });
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [analyses, synthesizedInsights, lastSynthesizedCount, isHydrated]);

    // Sync from PostHog
    const syncFromPostHog = useCallback(async () => {
        setSyncProgress({
            status: 'fetching-list',
            message: 'Fetching session list from PostHog...',
            current: 0,
            total: sessionCount,
        });

        try {
            // First, get project credentials
            const projectId = localStorage.getItem('currentProjectId');
            let posthogHeaders: Record<string, string> = {};
            
            if (projectId) {
                const projectRes = await fetch(`/api/projects/${projectId}`);
                if (projectRes.ok) {
                    const projectData = await projectRes.json();
                    if (projectData.project?.posthogKey) {
                        posthogHeaders = {
                            'x-posthog-key': projectData.project.posthogKey,
                            'x-posthog-project': projectData.project.posthogProjId,
                            'x-posthog-host': projectData.project.posthogHost || 'https://us.posthog.com',
                        };
                    }
                }
            }

            // Step 1: Fetch list of recent sessions
            const listResponse = await fetch(`/api/posthog/sessions?limit=${sessionCount}`, {
                headers: posthogHeaders,
            });
            if (!listResponse.ok) {
                const errorData = await listResponse.json();
                throw new Error(errorData.error || 'Failed to fetch session list');
            }

            const { sessions } = await listResponse.json() as { sessions: PostHogSession[] };

            if (sessions.length === 0) {
                setSyncProgress({
                    status: 'error',
                    message: 'No sessions found in PostHog',
                    current: 0,
                    total: 0,
                    error: 'No recent sessions available',
                });
                return;
            }

            setSyncProgress({
                status: 'fetching-sessions',
                message: `Found ${sessions.length} sessions. Fetching replay data...`,
                current: 0,
                total: sessions.length,
            });

            // Step 2: Fetch rrweb data for each session and analyze
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < sessions.length; i++) {
                const session = sessions[i];
                const sessionName = `PostHog Session ${session.id.substring(0, 8)}`;

                setSyncProgress(prev => ({
                    ...prev,
                    status: 'fetching-sessions',
                    message: `Fetching session ${i + 1}/${sessions.length}...`,
                    current: i + 1,
                }));

                try {
                    // Fetch rrweb data
                    const dataResponse = await fetch('/api/posthog/sessions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...posthogHeaders },
                        body: JSON.stringify({ sessionId: session.id }),
                    });

                    if (!dataResponse.ok) {
                        console.error(`Failed to fetch session ${session.id}`);
                        failCount++;
                        continue;
                    }

                    const { events } = await dataResponse.json();

                    if (!events || events.length === 0) {
                        console.error(`No events for session ${session.id}`);
                        failCount++;
                        continue;
                    }

                    // Create entry and analyze
                    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                    const timestamp = new Date(session.startTime).toLocaleTimeString();
                    const fileName = `${sessionName} (${new Date(session.startTime).toLocaleDateString()})`;

                    const newEntry: AnalysisEntry = {
                        id,
                        fileName,
                        timestamp,
                        analysis: null,
                        events,
                        isAnalyzing: true,
                    };

                    setAnalyses(prev => [newEntry, ...prev]);
                    setAnalyzingCount(prev => prev + 1);

                    // Analyze in background
                    fetch('/api/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ events }),
                    })
                        .then(res => res.ok ? res.json() : Promise.reject('Analysis failed'))
                        .then(result => {
                            setAnalyses(prev => prev.map(entry =>
                                entry.id === id
                                    ? { ...entry, analysis: result, isAnalyzing: false }
                                    : entry
                            ));
                        })
                        .catch(() => {
                            setAnalyses(prev => prev.map(entry =>
                                entry.id === id
                                    ? { ...entry, analysis: { error: true, summary: 'Analysis failed' }, isAnalyzing: false }
                                    : entry
                            ));
                        })
                        .finally(() => {
                            setAnalyzingCount(prev => prev - 1);
                        });

                    successCount++;
                } catch (err) {
                    console.error(`Error processing session ${session.id}:`, err);
                    failCount++;
                }
            }

            setSyncProgress({
                status: 'complete',
                message: `Synced ${successCount} sessions${failCount > 0 ? ` (${failCount} failed)` : ''}`,
                current: sessions.length,
                total: sessions.length,
            });

            // Reset after delay
            setTimeout(() => {
                setSyncProgress({
                    status: 'idle',
                    message: '',
                    current: 0,
                    total: 0,
                });
            }, 3000);

        } catch (error) {
            console.error('Sync error:', error);
            setSyncProgress({
                status: 'error',
                message: 'Failed to sync sessions',
                current: 0,
                total: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }, [sessionCount]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpload = useCallback(async (json: any, fileName: string) => {
        const events = Array.isArray(json) ? json : (json?.events || []);
        const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const timestamp = new Date().toLocaleTimeString();

        const newEntry: AnalysisEntry = {
            id,
            fileName,
            timestamp,
            analysis: null,
            events,
            isAnalyzing: true,
        };

        setAnalyses(prev => [newEntry, ...prev]);
        setAnalyzingCount(prev => prev + 1);

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events }),
            });

            if (!response.ok) throw new Error('Analysis failed');

            const result = await response.json();

            setAnalyses(prev => prev.map(entry => 
                entry.id === id 
                    ? { ...entry, analysis: result, isAnalyzing: false }
                    : entry
            ));
        } catch (error) {
            console.error(error);
            setAnalyses(prev => prev.map(entry => 
                entry.id === id 
                    ? { ...entry, analysis: { error: true, summary: 'Analysis failed' }, isAnalyzing: false }
                    : entry
            ));
        } finally {
            setAnalyzingCount(prev => prev - 1);
        }
    }, []);

    const handleView = (entry: AnalysisEntry | null) => {
        setSelectedEntry(entry);
    };

    const handleDelete = (id: string) => {
        setAnalyses(prev => prev.filter(entry => entry.id !== id));
        if (selectedEntry?.id === id) {
            setSelectedEntry(null);
        }
    };

    const handleCloseDetail = () => {
        setSelectedEntry(null);
    };

    const handleClearAll = () => {
        if (window.confirm('Are you sure you want to clear all session analyses? This cannot be undone.')) {
            setAnalyses([]);
            setSelectedEntry(null);
            setSynthesizedInsights(null);
            setLastSynthesizedCount(0);
            localStorage.removeItem(STORAGE_KEY);
        }
    };

    const jumpToTime = (timestampStr: string) => {
        const parts = timestampStr.replace('[', '').replace(']', '').split(':');
        if (parts.length === 2) {
            const minutes = parseInt(parts[0], 10);
            const seconds = parseInt(parts[1], 10);
            const ms = (minutes * 60 + seconds) * 1000;

            const playerContainer = document.getElementById('rrweb-player-container');
            if (playerContainer && (playerContainer as any).player) {
                (playerContainer as any).player.goto(ms);
                (playerContainer as any).player.play();
            }
        }
    };

    const isAnalyzing = analyzingCount > 0;

    const aggregatedInsights = useMemo(() => {
        const completedAnalyses = analyses.filter(a => a.analysis && !a.analysis.error && !a.isAnalyzing);
        
        if (completedAnalyses.length === 0) return null;

        const frictionMap = new Map<string, number>();
        completedAnalyses.forEach(entry => {
            entry.analysis.frustration_points?.forEach((pt: any) => {
                const issue = pt.issue;
                frictionMap.set(issue, (frictionMap.get(issue) || 0) + 1);
            });
        });

        const intentMap = new Map<string, number>();
        completedAnalyses.forEach(entry => {
            const intent = entry.analysis.user_intent;
            if (intent) {
                intentMap.set(intent, (intentMap.get(intent) || 0) + 1);
            }
        });

        const tagMap = new Map<string, number>();
        completedAnalyses.forEach(entry => {
            entry.analysis.tags?.forEach((tag: string) => {
                tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
            });
        });

        return {
            frictions: Array.from(frictionMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
            intents: Array.from(intentMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
            tags: Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
            totalSessions: completedAnalyses.length,
            allFrictions: Array.from(frictionMap.entries()).sort((a, b) => b[1] - a[1]),
            allIntents: Array.from(intentMap.entries()).sort((a, b) => b[1] - a[1]),
            allTags: Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]),
        };
    }, [analyses]);

    const synthesizeInsights = useCallback(async () => {
        if (!aggregatedInsights || aggregatedInsights.totalSessions === 0) return;
        
        setIsSynthesizing(true);
        try {
            const response = await fetch('/api/synthesize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    frictionPoints: aggregatedInsights.allFrictions,
                    userIntents: aggregatedInsights.allIntents,
                    tags: aggregatedInsights.allTags,
                    sessionCount: aggregatedInsights.totalSessions,
                }),
            });

            if (!response.ok) throw new Error('Synthesis failed');

            const result = await response.json();
            setSynthesizedInsights(result);
            setLastSynthesizedCount(aggregatedInsights.totalSessions);
        } catch (error) {
            console.error('Failed to synthesize insights:', error);
        } finally {
            setIsSynthesizing(false);
        }
    }, [aggregatedInsights]);

    useEffect(() => {
        const completedCount = aggregatedInsights?.totalSessions || 0;
        if (completedCount > 0 && completedCount !== lastSynthesizedCount && !isSynthesizing) {
            synthesizeInsights();
        }
    }, [aggregatedInsights?.totalSessions, lastSynthesizedCount, isSynthesizing, synthesizeInsights]);

    return (
        <div className="min-h-screen bg-[#fafafa]">
            {/* Header */}
            <div className="bg-white border-b border-[#e5e5e5] px-8 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[#999] text-sm mb-0.5">Tranzmit / Session Insights</div>
                        <h1 className="text-2xl font-semibold text-[#1a1a1a]">Session Insights</h1>
                    </div>
                    {analyses.length > 0 && (
                        <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="text-sm">
                                {analyses.length} session{analyses.length !== 1 ? 's' : ''} analyzed
                            </Badge>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearAll}
                                className="text-slate-500 hover:text-red-600 hover:bg-red-50"
                            >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Clear All
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-8 max-w-7xl mx-auto space-y-8">

                {(synthesizedInsights || isSynthesizing) && (
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold tracking-tight">Synthesized Insights</h2>
                                    <p className="text-xs text-slate-500">{aggregatedInsights?.totalSessions || 0} sessions analyzed</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={synthesizeInsights} disabled={isSynthesizing} className="text-slate-500 hover:text-slate-900">
                                <RefreshCw className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>

                        {isSynthesizing && !synthesizedInsights && (
                            <div className="h-32 flex items-center justify-center border border-dashed border-slate-200 rounded-xl">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
                                <span className="text-sm text-slate-500">Synthesizing...</span>
                            </div>
                        )}

                        {synthesizedInsights && (
                            <div className="grid grid-cols-3 gap-3">
                                <div onClick={() => setExpandedTab(expandedTab === 'issues' ? null : 'issues')} className={`group cursor-pointer rounded-xl border transition-all duration-200 ${expandedTab === 'issues' ? 'col-span-3 border-red-200 bg-red-50/50' : 'border-slate-200 hover:border-red-200 hover:bg-red-50/30'}`}>
                                    <div className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-md bg-red-100 flex items-center justify-center">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                                </div>
                                                <span className="font-medium text-sm">Critical Issues</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-bold text-red-600">{synthesizedInsights.critical_issues.length}</span>
                                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedTab === 'issues' ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                        {expandedTab === 'issues' && (
                                            <div className="mt-4 pt-4 border-t border-red-200 space-y-3" onClick={e => e.stopPropagation()}>
                                                {synthesizedInsights.critical_issues.map((issue, i) => (
                                                    <div key={i} className="p-3 rounded-lg bg-white border border-red-100">
                                                        <div className="flex items-start justify-between gap-2 mb-1">
                                                            <span className="font-medium text-sm text-slate-900">{issue.title}</span>
                                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${issue.severity === 'critical' ? 'bg-red-100 text-red-700' : issue.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>{issue.severity}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mb-2">{issue.description}</p>
                                                        <p className="text-xs text-emerald-600">→ {issue.recommendation}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div onClick={() => setExpandedTab(expandedTab === 'goals' ? null : 'goals')} className={`group cursor-pointer rounded-xl border transition-all duration-200 ${expandedTab === 'goals' ? 'col-span-3 border-blue-200 bg-blue-50/50' : expandedTab === 'issues' ? 'hidden' : 'border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'}`}>
                                    <div className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center">
                                                    <Target className="w-3.5 h-3.5 text-blue-600" />
                                                </div>
                                                <span className="font-medium text-sm">User Goals</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-bold text-blue-600">{synthesizedInsights.top_user_goals.length}</span>
                                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedTab === 'goals' ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                        {expandedTab === 'goals' && (
                                            <div className="mt-4 pt-4 border-t border-blue-200 space-y-2" onClick={e => e.stopPropagation()}>
                                                {synthesizedInsights.top_user_goals.map((goal, i) => (
                                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white border border-blue-100">
                                                        <span className="text-sm text-slate-700">{goal.goal}</span>
                                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${goal.success_rate.toLowerCase().includes('fail') || goal.success_rate.toLowerCase().includes('low') ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{goal.success_rate}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div onClick={() => setExpandedTab(expandedTab === 'actions' ? null : 'actions')} className={`group cursor-pointer rounded-xl border transition-all duration-200 ${expandedTab === 'actions' ? 'col-span-3 border-emerald-200 bg-emerald-50/50' : (expandedTab === 'issues' || expandedTab === 'goals') ? 'hidden' : 'border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30'}`}>
                                    <div className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                </div>
                                                <span className="font-medium text-sm">Actions</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-2xl font-bold text-emerald-600">{synthesizedInsights.immediate_actions.length}</span>
                                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedTab === 'actions' ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                        {expandedTab === 'actions' && (
                                            <div className="mt-4 pt-4 border-t border-emerald-200 space-y-2" onClick={e => e.stopPropagation()}>
                                                {synthesizedInsights.immediate_actions.map((action, i) => (
                                                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white border border-emerald-100">
                                                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                                                        <span className="text-sm text-slate-700">{action}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {synthesizedInsights && !expandedTab && (
                            <p className="mt-3 text-xs text-slate-400 leading-relaxed">{synthesizedInsights.pattern_summary}</p>
                        )}
                    </section>
                )}

                <section>
                    {/* Mode Selector Tabs */}
                    <div className="flex items-center gap-2 mb-4">
                        <Button
                            variant={inputMode === 'upload' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('upload')}
                            className="gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            Manual Upload
                        </Button>
                        <Button
                            variant={inputMode === 'sync' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('sync')}
                            className="gap-2"
                        >
                            <Cloud className="w-4 h-4" />
                            Sync from PostHog
                        </Button>
                    </div>

                    {/* Upload Mode */}
                    {inputMode === 'upload' && (
                        <Uploader onUpload={handleUpload} isAnalyzing={isAnalyzing} analyzingCount={analyzingCount} />
                    )}

                    {/* Sync Mode */}
                    {inputMode === 'sync' && (
                        <Card className="border-2 border-dashed p-8 bg-white">
                            <div className="flex flex-col items-center justify-center space-y-6">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                    <Cloud className="w-8 h-8 text-white" />
                                </div>

                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-slate-900">
                                        Sync Sessions from PostHog
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Automatically fetch and analyze recent session recordings
                                    </p>
                                </div>

                                {/* Session Count Selector */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-slate-600">Fetch last</span>
                                    <select
                                        value={sessionCount}
                                        onChange={(e) => setSessionCount(Number(e.target.value))}
                                        disabled={syncProgress.status !== 'idle' && syncProgress.status !== 'error' && syncProgress.status !== 'complete'}
                                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        {SESSION_COUNT_OPTIONS.map((count) => (
                                            <option key={count} value={count}>
                                                {count} sessions
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Progress Display */}
                                {syncProgress.status !== 'idle' && (
                                    <div className="w-full max-w-md">
                                        {/* Progress Bar */}
                                        {(syncProgress.status === 'fetching-sessions' || syncProgress.status === 'analyzing') && (
                                            <div className="mb-3">
                                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all duration-300"
                                                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-slate-500 mt-1 text-center">
                                                    {syncProgress.current} / {syncProgress.total}
                                                </p>
                                            </div>
                                        )}

                                        {/* Status Message */}
                                        <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${
                                            syncProgress.status === 'error' ? 'bg-red-50 text-red-700' :
                                            syncProgress.status === 'complete' ? 'bg-green-50 text-green-700' :
                                            'bg-blue-50 text-blue-700'
                                        }`}>
                                            {syncProgress.status === 'fetching-list' && (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            )}
                                            {syncProgress.status === 'fetching-sessions' && (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            )}
                                            {syncProgress.status === 'analyzing' && (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            )}
                                            {syncProgress.status === 'complete' && (
                                                <Check className="w-4 h-4" />
                                            )}
                                            {syncProgress.status === 'error' && (
                                                <AlertTriangle className="w-4 h-4" />
                                            )}
                                            <span className="text-sm font-medium">{syncProgress.message}</span>
                                        </div>

                                        {syncProgress.error && (
                                            <p className="text-xs text-red-600 mt-2 text-center">{syncProgress.error}</p>
                                        )}
                                    </div>
                                )}

                                {/* Sync Button */}
                                <Button
                                    onClick={syncFromPostHog}
                                    disabled={syncProgress.status !== 'idle' && syncProgress.status !== 'error' && syncProgress.status !== 'complete'}
                                    className="gap-2"
                                    size="lg"
                                >
                                    {syncProgress.status === 'idle' || syncProgress.status === 'error' || syncProgress.status === 'complete' ? (
                                        <>
                                            <RefreshCw className="w-4 h-4" />
                                            Start Sync
                                        </>
                                    ) : (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Syncing...
                                        </>
                                    )}
                                </Button>

                                <p className="text-xs text-slate-400 text-center max-w-sm">
                                    Sessions will be fetched from your PostHog account and automatically analyzed using AI
                                </p>
                            </div>
                        </Card>
                    )}
                </section>

                {analyses.length > 0 && (
                    <section>
                        <h2 className="text-xl font-semibold mb-4">Recent Analyses</h2>
                        <AnalysisTable analyses={analyses} selectedId={selectedEntry?.id} onView={handleView} onDelete={handleDelete} />
                    </section>
                )}

                {selectedEntry && selectedEntry.analysis && !selectedEntry.analysis.error && (
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="border-0 shadow-lg ring-1 ring-slate-200 bg-white">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="flex items-center gap-2">
                                        <PlayCircle className="w-5 h-5 text-blue-500" />
                                        Session Replay
                                        <span className="text-sm font-normal text-slate-500 ml-2">{selectedEntry.fileName}</span>
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={handleCloseDetail}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <div className="p-4 pt-0">
                                    {selectedEntry.events && selectedEntry.events.length > 0 ? (
                                        <SessionPlayer
                                            key={selectedEntry.id}
                                            events={selectedEntry.events}
                                            autoPlay={false}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center bg-slate-50 rounded-lg border border-dashed border-slate-200 py-12 px-4">
                                            <PlayCircle className="w-12 h-12 text-slate-300 mb-3" />
                                            <p className="text-sm text-slate-500 text-center">
                                                Session replay not available
                                            </p>
                                            <p className="text-xs text-slate-400 text-center mt-1">
                                                Re-sync from PostHog to view replay
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                            <Card className="p-6">
                                <h3 className="font-semibold mb-2">Detailed Narrative</h3>
                                <p className="text-slate-600 leading-relaxed">{selectedEntry.analysis.description}</p>
                            </Card>
                        </div>
                        <div className="space-y-6">
                            <Card>
                                <CardHeader><CardTitle>User Intent</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-lg font-medium text-blue-600">&ldquo;{selectedEntry.analysis.user_intent}&rdquo;</p>
                                    <p className="text-sm text-slate-500 mt-2">{selectedEntry.analysis.summary}</p>
                                </CardContent>
                            </Card>
                            <Card className="border-red-100">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-red-600">
                                        <AlertTriangle className="w-5 h-5" />
                                        Friction Points
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[200px] w-full px-6 pb-6">
                                        <div className="space-y-3">
                                            {selectedEntry.analysis.frustration_points?.map((pt: any, i: number) => (
                                                <div key={i} onClick={() => jumpToTime(pt.timestamp)} className="p-3 rounded-lg bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors group">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <Badge variant="outline" className="bg-white text-red-500 border-red-200 group-hover:border-red-400">{pt.timestamp}</Badge>
                                                    </div>
                                                    <p className="text-sm text-slate-700">{pt.issue}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                            <Card className="border-green-100">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-green-600">
                                        <CheckCircle2 className="w-5 h-5" />
                                        Went Well
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
                                        {selectedEntry.analysis.went_well?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
