"use client";

import { useState, useCallback, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Uploader } from '@/components/ui/uploader';
import { AnalysisTable, AnalysisEntry } from '@/components/analysis-table';
import { SessionPlayer } from '@/components/session-player';
import { SessionList } from '@/components/session-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2, PlayCircle, AlertTriangle, CheckCircle2, X, RefreshCw, Upload, Cloud, Check, Trash2, Database, User, BarChart3, MessageCircle, Quote } from 'lucide-react';
import { IssuesPanel } from '@/components/issues-panel';
import type { SessionListItem, RRWebEvent, SynthesizedInsightData } from '@/types/session';

type InputMode = 'upload' | 'sync' | 'all-sessions';
type SyncStatus = 'idle' | 'fetching-list' | 'fetching-sessions' | 'analyzing' | 'complete' | 'error';

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

function SessionInsightsContent() {
    const [analyses, setAnalyses] = useState<AnalysisEntry[]>([]);
    const [selectedEntry, setSelectedEntry] = useState<AnalysisEntry | null>(null);
    const [analyzingCount, setAnalyzingCount] = useState(0);
    const [synthesizedInsights, setSynthesizedInsights] = useState<SynthesizedInsights | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [lastSynthesizedCount, setLastSynthesizedCount] = useState(0);
    const [isHydrated, setIsHydrated] = useState(false);

    // New state for input mode
    const [inputMode, setInputMode] = useState<InputMode>('all-sessions');
    const [sessionCount, setSessionCount] = useState<number>(5);
    const [syncProgress, setSyncProgress] = useState<SyncProgress>({
        status: 'idle',
        message: '',
        current: 0,
        total: 0,
    });

    // State for database-backed sessions
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [dbSelectedSession, setDbSelectedSession] = useState<SessionListItem | null>(null);
    const [dbSessionEvents, setDbSessionEvents] = useState<RRWebEvent[]>([]);
    const [dbSessionCount, setDbSessionCount] = useState(0);

    // State for conversation transcripts (qualitative data)
    const [selectedConversation, setSelectedConversation] = useState<any>(null);

    // Project replay source preference
    const [replaySource, setReplaySource] = useState<string | null>(null);

    // Auto-sync state
    const [persistedInsights, setPersistedInsights] = useState<SynthesizedInsightData | null>(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(true);
    const [autoSyncStatus, setAutoSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
    const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
    const [sessionListRefreshKey, setSessionListRefreshKey] = useState(0);

    // Get URL params (for filtering by user from Recovery tab, or loading specific conversation)
    const searchParams = useSearchParams();
    const distinctIdFilter = searchParams.get('distinctId');
    const conversationIdParam = searchParams.get('conversationId');

    // Load current project ID and replay source preference
    useEffect(() => {
        const projectId = localStorage.getItem('currentProjectId');
        setCurrentProjectId(projectId);

        if (projectId) {
            fetch(`/api/projects/${projectId}`)
                .then(res => res.json())
                .then(data => {
                    if (data.project?.replaySource) {
                        setReplaySource(data.project.replaySource);
                    }
                })
                .catch(() => {});
        }
    }, []);

    // Load persisted insights from database on mount
    useEffect(() => {
        if (!currentProjectId) {
            setIsLoadingInsights(false);
            return;
        }

        async function loadInsights() {
            setIsLoadingInsights(true);
            try {
                const res = await fetch(`/api/sessions/insights?projectId=${currentProjectId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data) {
                        setPersistedInsights(data);
                        if (data.lastSyncedAt) setLastSyncTime(new Date(data.lastSyncedAt));
                    }
                }
            } catch (err) {
                console.error('Failed to load insights:', err);
            } finally {
                setIsLoadingInsights(false);
            }
        }

        loadInsights();
    }, [currentProjectId]);

    // Load conversation from URL parameter (for deep linking from dashboard)
    useEffect(() => {
        if (!conversationIdParam) return;

        const loadConversationFromParam = async () => {
            try {
                const convoRes = await fetch(`/api/conversations/${conversationIdParam}`);
                if (convoRes.ok) {
                    const { conversation } = await convoRes.json();
                    if (conversation) {
                        setDbSelectedSession(null);
                        setDbSessionEvents([]);
                        setSelectedConversation(conversation);
                        // Scroll to detail area after a short delay
                        setTimeout(() => {
                            document.getElementById('conversation-detail-area')?.scrollIntoView({ behavior: 'smooth' });
                        }, 300);
                    }
                }
            } catch (err) {
                console.error('Failed to load conversation from URL param:', err);
            }
        };

        loadConversationFromParam();
    }, [conversationIdParam]);

    // Auto-sync trigger
    const triggerAutoSync = useCallback(async () => {
        if (!currentProjectId || autoSyncStatus === 'syncing') return;

        setAutoSyncStatus('syncing');
        try {
            const res = await fetch('/api/sessions/auto-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: currentProjectId }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.insight) {
                    setPersistedInsights(data.insight);
                }
                setLastSyncTime(new Date());
                setAutoSyncStatus('idle');
                setSessionListRefreshKey(prev => prev + 1);
            } else {
                setAutoSyncStatus('error');
            }
        } catch {
            setAutoSyncStatus('error');
        }
    }, [currentProjectId, autoSyncStatus]);

    // Hourly auto-sync interval
    useEffect(() => {
        if (!currentProjectId) return;

        // Sync on mount if never synced or synced more than 1 hour ago
        const shouldSyncNow = !lastSyncTime || (Date.now() - lastSyncTime.getTime() > 60 * 60 * 1000);
        if (shouldSyncNow) {
            triggerAutoSync();
        }

        const intervalId = setInterval(triggerAutoSync, 60 * 60 * 1000);
        return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProjectId]);

    // Handler for clicking a session from the issues panel
    const handleIssueSessionClick = useCallback(async (sessionId: string) => {
        if (!currentProjectId) return;

        // Clear any previous selection
        setSelectedConversation(null);

        try {
            // First try loading as a session
            const res = await fetch(`/api/sessions/${sessionId}/events`);
            if (res.ok) {
                const { events } = await res.json();
                // We need to fetch session metadata too
                const metaRes = await fetch(`/api/sessions?projectId=${currentProjectId}&page=1&limit=100`);
                if (metaRes.ok) {
                    const metaData = await metaRes.json();
                    const session = metaData.sessions?.find((s: SessionListItem) => s.id === sessionId);
                    if (session) {
                        handleDbSessionSelect(session, events || []);
                        // Scroll to detail area
                        setTimeout(() => {
                            document.getElementById('session-detail-area')?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                        return;
                    }
                }
            }

            // If session not found, try loading as a conversation (for qualitative data like Juno demo)
            const convoRes = await fetch(`/api/conversations/${sessionId}`);
            if (convoRes.ok) {
                const { conversation } = await convoRes.json();
                if (conversation) {
                    setDbSelectedSession(null);
                    setDbSessionEvents([]);
                    setSelectedConversation(conversation);
                    // Scroll to detail area
                    setTimeout(() => {
                        document.getElementById('conversation-detail-area')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                    return;
                }
            }
        } catch (err) {
            console.error('Failed to load session/conversation from issue click:', err);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProjectId]);

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

    // Sync from PostHog - now saves directly to database
    const syncFromPostHog = useCallback(async () => {
        if (!currentProjectId) {
            setSyncProgress({
                status: 'error',
                message: 'No project selected',
                current: 0,
                total: 0,
                error: 'Please select a project first',
            });
            return;
        }

        setSyncProgress({
            status: 'fetching-list',
            message: 'Syncing sessions from PostHog to database...',
            current: 0,
            total: sessionCount,
        });

        try {
            // Use the new sync endpoint that saves directly to database
            const response = await fetch('/api/sessions/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: currentProjectId,
                    count: sessionCount,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                const errorMsg = result.error || 'Sync failed';
                const hint = result.hint ? ` (${result.hint})` : '';
                throw new Error(`${errorMsg}${hint}`);
            }

            const hasResults = result.imported > 0 || result.skipped > 0;
            setSyncProgress({
                status: 'complete',
                message: hasResults
                    ? `Imported ${result.imported} sessions${result.skipped > 0 ? `, ${result.skipped} skipped (already exists)` : ''}${result.failed > 0 ? `, ${result.failed} failed` : ''}`
                    : result.message || 'No sessions found in PostHog',
                current: result.imported + result.skipped,
                total: result.imported + result.skipped + result.failed,
            });

            // Update session count
            setDbSessionCount(prev => prev + result.imported);

            // Switch to All Sessions tab to show imported sessions
            if (result.imported > 0) {
                setInputMode('all-sessions');
            }

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
    }, [sessionCount, currentProjectId]);

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

        // Also save to database if we have a project ID
        let dbSessionId: string | null = null;
        if (currentProjectId) {
            try {
                const saveRes = await fetch('/api/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: currentProjectId,
                        name: fileName,
                        events,
                        source: 'upload',
                    }),
                });
                if (saveRes.ok) {
                    const { session } = await saveRes.json();
                    dbSessionId = session.id;
                    setDbSessionCount(prev => prev + 1);
                }
            } catch (err) {
                console.error('Failed to save session to database:', err);
            }
        }

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

            // Update DB session with analysis
            if (dbSessionId) {
                await fetch(`/api/sessions/${dbSessionId}/analyze`, { method: 'POST' });
            }
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
    }, [currentProjectId]);

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
        setDbSelectedSession(null);
        setDbSessionEvents([]);
        setSelectedConversation(null);
    };

    // Handler for selecting a session from the database list
    const handleDbSessionSelect = (session: SessionListItem | null, events?: RRWebEvent[]) => {
        setDbSelectedSession(session);
        setDbSessionEvents(events || []);
        // Clear localStorage-based selection
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
        <div className="min-h-screen bg-[var(--background)]">
            {/* Header */}
            <div className="bg-[var(--card)] border-b border-[var(--border)] px-8 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[var(--muted-foreground)] text-sm mb-0.5">Tranzmit / Session Insights</div>
                        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Session Insights</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {autoSyncStatus === 'syncing' && (
                            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Syncing...
                            </div>
                        )}
                        {lastSyncTime && autoSyncStatus !== 'syncing' && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                                Last synced: {(() => { const mins = Math.floor((Date.now() - lastSyncTime.getTime()) / 60000); if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(mins / 60); return `${hours}h ${mins % 60}m ago`; })()}
                            </span>
                        )}
                        {analyses.length > 0 && (
                            <>
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
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-8 max-w-7xl mx-auto space-y-8">

                {/* Issues Panel - powered by persisted insights from auto-sync */}
                <IssuesPanel
                    insights={persistedInsights}
                    isLoading={isLoadingInsights}
                    onSessionClick={handleIssueSessionClick}
                    onRefresh={triggerAutoSync}
                    isRefreshing={autoSyncStatus === 'syncing'}
                    lastSyncTime={lastSyncTime}
                />

                <section>
                    {/* Mode Selector Tabs */}
                    <div className="flex items-center gap-2 mb-4">
                        <Button
                            variant={inputMode === 'all-sessions' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setInputMode('all-sessions')}
                            className="gap-2"
                        >
                            <Database className="w-4 h-4" />
                            All Sessions
                            {dbSessionCount > 0 && (
                                <Badge variant="secondary" className="ml-1 text-xs">{dbSessionCount}</Badge>
                            )}
                        </Button>
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
                            {replaySource === 'mixpanel' ? <BarChart3 className="w-4 h-4" /> :
                             replaySource === 'amplitude' ? <BarChart3 className="w-4 h-4" /> :
                             <Cloud className="w-4 h-4" />}
                            Sync from {replaySource === 'mixpanel' ? 'Mixpanel' : replaySource === 'amplitude' ? 'Amplitude' : 'PostHog'}
                        </Button>
                    </div>

                    {/* All Sessions Mode */}
                    {inputMode === 'all-sessions' && currentProjectId && (
                        <>
                            {/* User Filter Banner */}
                            {distinctIdFilter && (
                                <div className="mb-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <User className="w-4 h-4 text-indigo-500" />
                                        <span className="text-sm text-[var(--foreground)]">
                                            Filtering sessions for user: <span className="font-mono text-indigo-600 dark:text-indigo-400">{distinctIdFilter}</span>
                                        </span>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.location.href = '/dashboard/session-insights'}
                                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-500/10"
                                    >
                                        <X className="w-4 h-4 mr-1" />
                                        Clear filter
                                    </Button>
                                </div>
                            )}
                            <SessionList
                                key={sessionListRefreshKey}
                                projectId={currentProjectId}
                                onSelectSession={handleDbSessionSelect}
                                selectedSessionId={dbSelectedSession?.id}
                                onSessionsChange={() => setDbSessionCount(prev => Math.max(0, prev - 1))}
                                distinctId={distinctIdFilter || undefined}
                            />
                        </>
                    )}

                    {inputMode === 'all-sessions' && !currentProjectId && (
                        <Card className="border-2 border-dashed p-8 bg-[var(--card)]">
                            <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="w-16 h-16 rounded-2xl bg-[var(--muted)] flex items-center justify-center">
                                    <Database className="w-8 h-8 text-[var(--muted-foreground)]" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-[var(--foreground)]">No Project Selected</h3>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                        Please select a project from the Projects page to view stored sessions
                                    </p>
                                </div>
                                <Button onClick={() => window.location.href = '/dashboard/projects'}>
                                    Go to Projects
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* Upload Mode */}
                    {inputMode === 'upload' && (
                        <Uploader onUpload={handleUpload} isAnalyzing={isAnalyzing} analyzingCount={analyzingCount} />
                    )}

                    {/* Sync Mode */}
                    {inputMode === 'sync' && (
                        <Card className="border-2 border-dashed p-8 bg-[var(--card)]">
                            <div className="flex flex-col items-center justify-center space-y-6">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                    <Cloud className="w-8 h-8 text-white" />
                                </div>

                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                                        Sync Sessions from {replaySource === 'mixpanel' ? 'Mixpanel' : replaySource === 'amplitude' ? 'Amplitude' : 'PostHog'}
                                    </h3>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                        Automatically fetch and analyze recent session recordings
                                    </p>
                                </div>

                                {/* Session Count Selector */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-[var(--muted-foreground)]">Fetch last</span>
                                    <select
                                        value={sessionCount}
                                        onChange={(e) => setSessionCount(Number(e.target.value))}
                                        disabled={syncProgress.status !== 'idle' && syncProgress.status !== 'error' && syncProgress.status !== 'complete'}
                                        className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                                <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all duration-300"
                                                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-[var(--muted-foreground)] mt-1 text-center">
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

                                <p className="text-xs text-[var(--muted-foreground)] text-center max-w-sm">
                                    Sessions will be fetched from your {replaySource === 'mixpanel' ? 'Mixpanel' : replaySource === 'amplitude' ? 'Amplitude' : 'PostHog'} account and automatically analyzed using AI
                                </p>
                            </div>
                        </Card>
                    )}
                </section>

                {analyses.length > 0 && (
                    <section>
                        <h2 className="text-xl font-semibold mb-4 text-[var(--foreground)]">Recent Analyses</h2>
                        <AnalysisTable analyses={analyses} selectedId={selectedEntry?.id} onView={handleView} onDelete={handleDelete} />
                    </section>
                )}

                {/* Database session detail view */}
                {dbSelectedSession && dbSelectedSession.analysis && (
                    <section id="session-detail-area" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="border-0 shadow-lg ring-1 ring-[var(--border)] bg-[var(--card)]">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-[var(--foreground)]">
                                        <PlayCircle className="w-5 h-5 text-blue-500" />
                                        Session Replay
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{dbSelectedSession.name}</span>
                                        <Badge variant="outline" className={
                                            dbSelectedSession.source === 'posthog' ? 'border-blue-200 text-blue-700' :
                                            dbSelectedSession.source === 'mixpanel' ? 'border-orange-200 text-orange-700' :
                                            dbSelectedSession.source === 'amplitude' ? 'border-violet-200 text-violet-700' :
                                            'border-emerald-200 text-emerald-700'
                                        }>
                                            {dbSelectedSession.source === 'posthog' ? 'PostHog' :
                                             dbSelectedSession.source === 'mixpanel' ? 'Mixpanel' :
                                             dbSelectedSession.source === 'amplitude' ? 'Amplitude' : 'Upload'}
                                        </Badge>
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={handleCloseDetail}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <div className="p-4 pt-0">
                                    {dbSessionEvents && dbSessionEvents.length > 0 ? (
                                        <SessionPlayer
                                            key={dbSelectedSession.id}
                                            events={dbSessionEvents}
                                            autoPlay={false}
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center bg-[var(--muted)] rounded-lg border border-dashed border-[var(--border)] py-12 px-4">
                                            <Loader2 className="w-12 h-12 text-[var(--muted-foreground)] mb-3 animate-spin" />
                                            <p className="text-sm text-[var(--muted-foreground)] text-center">
                                                Loading session replay...
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                            {dbSelectedSession.analysis.description && (
                                <Card className="p-6 bg-[var(--card)] border-[var(--border)]">
                                    <h3 className="font-semibold mb-2 text-[var(--foreground)]">Detailed Narrative</h3>
                                    <p className="text-[var(--muted-foreground)] leading-relaxed">{dbSelectedSession.analysis.description}</p>
                                </Card>
                            )}
                        </div>
                        <div className="space-y-6">
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader><CardTitle className="text-[var(--foreground)]">User Intent</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-lg font-medium text-blue-500">&ldquo;{dbSelectedSession.analysis.user_intent}&rdquo;</p>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-2">{dbSelectedSession.analysis.summary}</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-red-500/20 dark:border-red-500/30">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-red-500">
                                        <AlertTriangle className="w-5 h-5" />
                                        Friction Points
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[200px] w-full px-6 pb-6">
                                        <div className="space-y-3">
                                            {dbSelectedSession.analysis.frustration_points?.map((pt: any, i: number) => (
                                                <div key={i} onClick={() => jumpToTime(pt.timestamp)} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors group">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <Badge variant="outline" className="bg-[var(--card)] text-red-500 border-red-500/30 group-hover:border-red-500/50">{pt.timestamp}</Badge>
                                                    </div>
                                                    <p className="text-sm text-[var(--foreground)]">{pt.issue}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-emerald-500/20 dark:border-emerald-500/30">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-emerald-500">
                                        <CheckCircle2 className="w-5 h-5" />
                                        Went Well
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-[var(--muted-foreground)]">
                                        {dbSelectedSession.analysis.went_well?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </section>
                )}

                {selectedEntry && selectedEntry.analysis && !selectedEntry.analysis.error && (
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="border-0 shadow-lg ring-1 ring-[var(--border)] bg-[var(--card)]">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-[var(--foreground)]">
                                        <PlayCircle className="w-5 h-5 text-blue-500" />
                                        Session Replay
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{selectedEntry.fileName}</span>
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
                                        <div className="flex flex-col items-center justify-center bg-[var(--muted)] rounded-lg border border-dashed border-[var(--border)] py-12 px-4">
                                            <PlayCircle className="w-12 h-12 text-[var(--muted-foreground)] mb-3" />
                                            <p className="text-sm text-[var(--muted-foreground)] text-center">
                                                Session replay not available
                                            </p>
                                            <p className="text-xs text-[var(--muted-foreground)] text-center mt-1">
                                                Re-sync from PostHog to view replay
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                            <Card className="p-6 bg-[var(--card)] border-[var(--border)]">
                                <h3 className="font-semibold mb-2 text-[var(--foreground)]">Detailed Narrative</h3>
                                <p className="text-[var(--muted-foreground)] leading-relaxed">{selectedEntry.analysis.description}</p>
                            </Card>
                        </div>
                        <div className="space-y-6">
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader><CardTitle className="text-[var(--foreground)]">User Intent</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-lg font-medium text-blue-500">&ldquo;{selectedEntry.analysis.user_intent}&rdquo;</p>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-2">{selectedEntry.analysis.summary}</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-red-500/20 dark:border-red-500/30">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-red-500">
                                        <AlertTriangle className="w-5 h-5" />
                                        Friction Points
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[200px] w-full px-6 pb-6">
                                        <div className="space-y-3">
                                            {selectedEntry.analysis.frustration_points?.map((pt: any, i: number) => (
                                                <div key={i} onClick={() => jumpToTime(pt.timestamp)} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors group">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <Badge variant="outline" className="bg-[var(--card)] text-red-500 border-red-500/30 group-hover:border-red-500/50">{pt.timestamp}</Badge>
                                                    </div>
                                                    <p className="text-sm text-[var(--foreground)]">{pt.issue}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-emerald-500/20 dark:border-emerald-500/30">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-emerald-500">
                                        <CheckCircle2 className="w-5 h-5" />
                                        Went Well
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-[var(--muted-foreground)]">
                                        {selectedEntry.analysis.went_well?.map((item: string, i: number) => (
                                            <li key={i}>{item}</li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </section>
                )}

                {/* Conversation transcript detail view (for qualitative research data) */}
                {selectedConversation && (
                    <section id="conversation-detail-area" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="border-0 shadow-lg ring-1 ring-[var(--border)] bg-[var(--card)]">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-[var(--foreground)]">
                                        <MessageCircle className="w-5 h-5 text-violet-500" />
                                        Conversation Transcript
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{selectedConversation.participantName}</span>
                                        <Badge variant="outline" className="border-violet-200 text-violet-700 dark:border-violet-700 dark:text-violet-400">
                                            {selectedConversation.metadata?.user_type || 'Interview'}
                                        </Badge>
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={() => setSelectedConversation(null)}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-[500px] pr-4">
                                        <div className="space-y-4">
                                            {selectedConversation.transcript?.map((msg: { role: string; message: string }, i: number) => (
                                                <div key={i} className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                                        msg.role === 'agent'
                                                            ? 'bg-[var(--muted)] text-[var(--foreground)]'
                                                            : 'bg-violet-500 text-white'
                                                    }`}>
                                                        <p className="text-xs font-semibold mb-1 opacity-70">
                                                            {msg.role === 'agent' ? 'Maya (Researcher)' : 'User'}
                                                        </p>
                                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-6">
                            {/* Analysis Summary */}
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader>
                                    <CardTitle className="text-[var(--foreground)]">Analysis Summary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                                        {selectedConversation.analysis?.summary}
                                    </p>
                                    <div className="flex items-center gap-2 mt-4">
                                        <Badge variant={selectedConversation.analysis?.churn_status === 'churned' ? 'destructive' : 'default'}>
                                            {selectedConversation.analysis?.churn_status === 'churned' ? 'Churned' : 'Active'}
                                        </Badge>
                                        {selectedConversation.analysis?.winback_outcome && (
                                            <Badge variant={selectedConversation.analysis.winback_outcome === 'accepted' ? 'default' : 'secondary'}>
                                                Win-back: {selectedConversation.analysis.winback_outcome}
                                            </Badge>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Pain Points */}
                            {selectedConversation.analysis?.pain_points?.length > 0 && (
                                <Card className="bg-[var(--card)] border-red-500/20 dark:border-red-500/30">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-red-500">
                                            <AlertTriangle className="w-5 h-5" />
                                            Pain Points
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {selectedConversation.analysis.pain_points.map((point: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                                    {point}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Key Quotes */}
                            {selectedConversation.analysis?.key_quotes?.length > 0 && (
                                <Card className="bg-[var(--card)] border-violet-500/20 dark:border-violet-500/30">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-violet-500">
                                            <Quote className="w-5 h-5" />
                                            Key Quotes
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {selectedConversation.analysis.key_quotes.map((quote: string, i: number) => (
                                                <blockquote key={i} className="border-l-2 border-violet-500 pl-3 italic text-sm text-[var(--muted-foreground)]">
                                                    &ldquo;{quote}&rdquo;
                                                </blockquote>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Feature Requests */}
                            {selectedConversation.analysis?.feature_requests?.length > 0 && (
                                <Card className="bg-[var(--card)] border-emerald-500/20 dark:border-emerald-500/30">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-emerald-500">
                                            <CheckCircle2 className="w-5 h-5" />
                                            Feature Requests
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {selectedConversation.analysis.feature_requests.map((fr: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                    {fr}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

export default function SessionInsightsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--muted-foreground)]" />
            </div>
        }>
            <SessionInsightsContent />
        </Suspense>
    );
}
