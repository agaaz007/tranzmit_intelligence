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
import { Loader2, PlayCircle, AlertTriangle, CheckCircle2, X, RefreshCw, Upload, Cloud, Check, Trash2, Database, User, BarChart3, MessageCircle, Quote, Target, Zap, ChevronDown, ExternalLink, TrendingUp } from 'lucide-react';
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


function CollapsibleCard({ title, count, defaultOpen = false, accent = 'blue', icon, children }: {
    title: string;
    count?: number;
    defaultOpen?: boolean;
    accent?: 'blue' | 'emerald' | 'amber';
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const accentColors = {
        blue: { border: 'border-l-blue-500', bg: 'bg-blue-500/5', pill: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
        emerald: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/5', pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
        amber: { border: 'border-l-amber-500', bg: 'bg-amber-500/5', pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    };
    const a = accentColors[accent];
    return (
        <div className={`rounded-xl border border-[var(--border)] border-l-[3px] ${a.border} overflow-hidden backdrop-blur-sm bg-[var(--card)]/80 dark:bg-[var(--card)]/60 shadow-sm dark:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.4)]`}>
            <button
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between px-5 py-4 text-left hover:${a.bg} transition-colors`}
            >
                <div className="flex items-center gap-2.5">
                    {icon}
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
                    {count !== undefined && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${a.pill} tabular-nums`}>{count}</span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-5 pb-5 border-t border-[var(--border)]/60">
                    <div className="pt-3">{children}</div>
                </div>
            )}
        </div>
    );
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
    const [expandedIssueIdx, setExpandedIssueIdx] = useState<number | null>(null);
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
    const highlightParam = searchParams.get('highlight');

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

    // Load session/conversation from highlight param (deep link from ticket)
    useEffect(() => {
        if (!highlightParam) return;

        const loadHighlighted = async () => {
            try {
                // Try as conversation first (covers juno-demo sessions)
                const convoRes = await fetch(`/api/conversations/${highlightParam}`);
                if (convoRes.ok) {
                    const { conversation } = await convoRes.json();
                    if (conversation) {
                        setDbSelectedSession(null);
                        setDbSessionEvents([]);
                        setSelectedConversation(conversation);
                        setTimeout(() => {
                            document.getElementById('conversation-detail-area')?.scrollIntoView({ behavior: 'smooth' });
                        }, 300);
                        return;
                    }
                }
            } catch (err) {
                console.error('Failed to load highlighted session:', err);
            }
        };

        loadHighlighted();
    }, [highlightParam]);

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

    // Auto-sync removed — sync only happens manually via the Sync tab

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

    const criticalIssueCount = persistedInsights?.criticalIssues.filter(i => i.severity === 'critical').length ?? 0;
    const totalIssueCount = persistedInsights?.criticalIssues.length ?? 0;
    const goalCount = persistedInsights?.topUserGoals.length ?? 0;
    const sessionCountStat = persistedInsights?.sessionCount ?? dbSessionCount;
    const hasInsights = !!persistedInsights && persistedInsights.criticalIssues.length > 0;

    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* Page Header */}
            <div className="border-b border-[var(--border)] px-8 py-5 backdrop-blur-md bg-[var(--background)]/80 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                        <h1 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">
                            Session Insights
                        </h1>
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
                                Synced {(() => { const mins = Math.floor((Date.now() - lastSyncTime.getTime()) / 60000); if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(mins / 60); return `${hours}h ${mins % 60}m ago`; })()}
                            </span>
                        )}
                        {analyses.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearAll}
                                className="text-[var(--muted-foreground)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 h-8 text-xs"
                            >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Clear All
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <div className="px-8 py-6 max-w-7xl mx-auto space-y-6">

                {/* Summary — Sierra-style overview card */}
                {hasInsights && persistedInsights && (
                    <div className="rounded-xl border border-[var(--border)] overflow-hidden backdrop-blur-sm bg-[var(--card)]/80 dark:bg-[var(--card)]/60 shadow-md dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
                        <div className="px-7 pt-6 pb-5">
                            <h2 className="text-base font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-blue-500" />
                                Summary
                            </h2>
                            <p className="text-[15px] text-[var(--muted-foreground)] leading-relaxed">
                                {persistedInsights.patternSummary || 'Analyzing session patterns...'}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 border-t border-[var(--border)]/60">
                            <div className="md:col-span-2 p-7 md:border-r border-b md:border-b-0 border-[var(--border)]/60">
                                <p className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider">Total Sessions</p>
                                <div className="flex items-baseline gap-3 mt-3">
                                    <span className="text-5xl font-bold text-[var(--foreground)] tracking-tight tabular-nums">{sessionCountStat.toLocaleString()}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-4 mt-8 pt-5 border-t border-[var(--border)]/60">
                                    <div className="rounded-lg bg-amber-500/8 dark:bg-amber-500/10 p-3">
                                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Issues</p>
                                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">{totalIssueCount}</p>
                                    </div>
                                    <div className="rounded-lg bg-red-500/8 dark:bg-red-500/10 p-3">
                                        <p className="text-xs font-medium text-red-500 uppercase tracking-wider">Critical</p>
                                        <p className={`text-2xl font-bold mt-1 tabular-nums ${criticalIssueCount > 0 ? 'text-red-500' : 'text-[var(--foreground)]'}`}>{criticalIssueCount}</p>
                                    </div>
                                    <div className="rounded-lg bg-blue-500/8 dark:bg-blue-500/10 p-3">
                                        <p className="text-xs font-medium text-blue-500 uppercase tracking-wider">Goals</p>
                                        <p className="text-2xl font-bold text-blue-500 mt-1 tabular-nums">{goalCount}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="md:col-span-3 p-7">
                                <p className="text-sm font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                    Top Issues
                                </p>
                                <div className="space-y-2">
                                    {persistedInsights.criticalIssues.slice(0, 5).map((issue, i) => {
                                        const isExpanded = expandedIssueIdx === i;
                                        const sessionCount = issue.sessionIds?.length || issue.evidenceSessionCount || 0;
                                        return (
                                            <div key={i} className={`rounded-lg border transition-all ${isExpanded ? 'border-[var(--border-hover)] bg-[var(--muted)]/20' : 'border-transparent hover:bg-[var(--muted)]/20'}`}>
                                                <button
                                                    onClick={() => setExpandedIssueIdx(isExpanded ? null : i)}
                                                    className="w-full flex items-center justify-between gap-3 py-3 px-3.5 text-left"
                                                >
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <span className={`mt-2 w-2.5 h-2.5 rounded-full shrink-0 ${
                                                            issue.severity === 'critical' ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]' :
                                                            issue.severity === 'high' ? 'bg-orange-500' :
                                                            'bg-amber-500'
                                                        }`} />
                                                        <span className="text-[15px] text-[var(--foreground)] leading-snug">{issue.title}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2.5 shrink-0">
                                                        <span className="text-sm text-[var(--muted-foreground)] tabular-nums">{sessionCount} session{sessionCount !== 1 ? 's' : ''}</span>
                                                        <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                                                            issue.severity === 'critical' ? 'bg-red-500/15 text-red-500 ring-1 ring-red-500/20' :
                                                            issue.severity === 'high' ? 'bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/20' :
                                                            'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/20'
                                                        }`}>{issue.severity}</span>
                                                        <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </div>
                                                </button>
                                                {isExpanded && (
                                                    <div className="px-4 pb-4 border-t border-[var(--border)]/60 mx-3.5 pt-3.5">
                                                        <p className="text-[15px] text-[var(--muted-foreground)] leading-relaxed">
                                                            {issue.description}
                                                        </p>
                                                        {issue.frequency && (
                                                            <div className="flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] mt-3">
                                                                <TrendingUp className="w-3.5 h-3.5 opacity-60" />
                                                                <span>{issue.frequency}</span>
                                                            </div>
                                                        )}
                                                        {sessionCount > 0 && (
                                                            <div className="mt-4 pt-4 border-t border-[var(--border)]/60">
                                                                <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-widest mb-2.5">
                                                                    Affected Sessions
                                                                </p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(issue.sessionIds || []).map((sid, j) => (
                                                                        <button
                                                                            key={sid}
                                                                            onClick={(e) => { e.stopPropagation(); handleIssueSessionClick(sid); }}
                                                                            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md font-medium transition-colors ${
                                                                                issue.severity === 'critical' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/15' :
                                                                                issue.severity === 'high' ? 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border border-orange-500/15' :
                                                                                'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/15'
                                                                            }`}
                                                                        >
                                                                            {issue.sessionNames?.[j] || sid.substring(0, 8)}
                                                                            <ExternalLink className="w-3 h-3 opacity-50" />
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading state */}
                {isLoadingInsights && !hasInsights && (
                    <div className="rounded-xl border border-[var(--border)] backdrop-blur-sm bg-[var(--card)]/80 dark:bg-[var(--card)]/60 p-12 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        <p className="text-sm text-[var(--muted-foreground)]">Analyzing sessions...</p>
                    </div>
                )}

                {/* Empty state */}
                {!isLoadingInsights && !hasInsights && (
                    <div className="rounded-xl border border-[var(--border)] border-dashed backdrop-blur-sm bg-[var(--card)]/80 dark:bg-[var(--card)]/60 px-6 py-10 text-center">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                            <BarChart3 className="w-5 h-5 text-blue-500" />
                        </div>
                        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1.5">No Insights Yet</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">Sync sessions to start seeing insights</p>
                    </div>
                )}

                {/* Goals & Actions — collapsible */}
                {hasInsights && persistedInsights && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {persistedInsights.topUserGoals.length > 0 && (
                            <CollapsibleCard title="User Goals" count={persistedInsights.topUserGoals.length} accent="blue" icon={<Target className="w-4 h-4 text-blue-500" />}>
                                <div className="space-y-2">
                                    {persistedInsights.topUserGoals.map((goal, i) => {
                                        const isLow = goal.success_rate.toLowerCase().includes('fail') || goal.success_rate.toLowerCase().includes('low') || goal.success_rate.toLowerCase().includes('0%');
                                        return (
                                            <div key={i} className="rounded-lg bg-[var(--muted)]/40 dark:bg-[var(--muted)]/20 p-3 hover:bg-[var(--muted)]/60 transition-colors">
                                                <div className="flex items-start gap-2.5">
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${isLow ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-[var(--foreground)] leading-snug">{goal.goal}</p>
                                                        <p className={`text-xs mt-1.5 leading-snug font-medium ${isLow ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{goal.success_rate}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CollapsibleCard>
                        )}
                        {(persistedInsights.criticalIssues.some(i => i.recommendation) || persistedInsights.immediateActions.length > 0) && (
                            <CollapsibleCard title="Recommended Actions" count={persistedInsights.criticalIssues.filter(i => i.recommendation).length + persistedInsights.immediateActions.length} accent="emerald" icon={<Zap className="w-4 h-4 text-emerald-500" />}>
                                <div className="space-y-2">
                                    {persistedInsights.criticalIssues.filter(i => i.recommendation).map((issue, i) => (
                                        <div key={`rec-${i}`} className="rounded-lg bg-emerald-500/5 dark:bg-emerald-500/8 p-3 border border-emerald-500/10">
                                            <div className="flex items-start gap-2.5">
                                                <Zap className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                <div className="min-w-0">
                                                    <p className="text-sm text-[var(--foreground)] leading-snug">{issue.recommendation}</p>
                                                    <p className="text-[11px] text-[var(--muted-foreground)] mt-1.5 flex items-center gap-1">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                                            issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'high' ? 'bg-orange-500' : 'bg-amber-500'
                                                        }`} />
                                                        {issue.title}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {persistedInsights.immediateActions.map((action, i) => (
                                        <div key={`act-${i}`} className="rounded-lg bg-[var(--muted)]/40 dark:bg-[var(--muted)]/20 p-3 hover:bg-[var(--muted)]/60 transition-colors">
                                            <div className="flex items-start gap-2.5">
                                                <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                                                <span className="text-sm text-[var(--foreground)] leading-snug">{action}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CollapsibleCard>
                        )}
                    </div>
                )}

                {/* Sessions */}
                <div>
                        {/* Mode selector tabs */}
                        <div className="flex items-center gap-1.5 mb-4 p-1 rounded-xl backdrop-blur-sm bg-[var(--muted)]/20 dark:bg-[var(--muted)]/10 border border-[var(--border)] w-fit">
                            {[
                                { mode: 'all-sessions' as InputMode, label: 'All Sessions', icon: <Database className="w-3.5 h-3.5" />, badge: dbSessionCount > 0 ? dbSessionCount : null },
                                { mode: 'upload' as InputMode, label: 'Manual Upload', icon: <Upload className="w-3.5 h-3.5" />, badge: null },
                                { mode: 'sync' as InputMode, label: `Sync from ${replaySource === 'mixpanel' ? 'Mixpanel' : replaySource === 'amplitude' ? 'Amplitude' : 'PostHog'}`, icon: replaySource === 'mixpanel' || replaySource === 'amplitude' ? <BarChart3 className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />, badge: null },
                            ].map(({ mode, label, icon, badge }) => (
                                <button
                                    key={mode}
                                    onClick={() => setInputMode(mode)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        inputMode === mode
                                            ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]'
                                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                    }`}
                                >
                                    {icon}
                                    {label}
                                    {badge !== null && badge !== undefined && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--muted)] text-[10px] font-semibold">{badge}</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* All Sessions */}
                        {inputMode === 'all-sessions' && currentProjectId && (
                            <>
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
                            <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-12 flex flex-col items-center justify-center gap-4 bg-[var(--card)]">
                                <div className="w-12 h-12 rounded-xl bg-[var(--muted)] flex items-center justify-center">
                                    <Database className="w-6 h-6 text-[var(--muted-foreground)]" />
                                </div>
                                <div className="text-center">
                                    <h3 className="font-medium text-[var(--foreground)]">No Project Selected</h3>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                        Select a project to view stored sessions
                                    </p>
                                </div>
                                <Button size="sm" onClick={() => window.location.href = '/dashboard/projects'}>
                                    Go to Projects
                                </Button>
                            </div>
                        )}

                        {/* Upload Mode */}
                        {inputMode === 'upload' && (
                            <>
                                <Uploader onUpload={handleUpload} isAnalyzing={isAnalyzing} analyzingCount={analyzingCount} />
                                {analyses.length > 0 && (
                                    <div className="mt-4">
                                        <AnalysisTable analyses={analyses} selectedId={selectedEntry?.id} onView={handleView} onDelete={handleDelete} />
                                    </div>
                                )}
                            </>
                        )}

                        {/* Sync Mode */}
                        {inputMode === 'sync' && (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
                                <div className="flex flex-col items-center justify-center gap-5 max-w-sm mx-auto">
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                        <Cloud className="w-6 h-6 text-blue-500" />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="font-medium text-[var(--foreground)]">
                                            Sync from {replaySource === 'mixpanel' ? 'Mixpanel' : replaySource === 'amplitude' ? 'Amplitude' : 'PostHog'}
                                        </h3>
                                        <p className="text-sm text-[var(--muted-foreground)] mt-1">
                                            Fetch and analyze recent session recordings
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-sm text-[var(--muted-foreground)]">Fetch last</span>
                                        <select
                                            value={sessionCount}
                                            onChange={(e) => setSessionCount(Number(e.target.value))}
                                            disabled={syncProgress.status !== 'idle' && syncProgress.status !== 'error' && syncProgress.status !== 'complete'}
                                            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {SESSION_COUNT_OPTIONS.map((count) => (
                                                <option key={count} value={count}>{count} sessions</option>
                                            ))}
                                        </select>
                                    </div>
                                    {syncProgress.status !== 'idle' && (
                                        <div className="w-full space-y-2">
                                            {(syncProgress.status === 'fetching-sessions' || syncProgress.status === 'analyzing') && (
                                                <div>
                                                    <div className="h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                                                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }} />
                                                    </div>
                                                    <p className="text-[11px] text-[var(--muted-foreground)] mt-1 text-center">{syncProgress.current} / {syncProgress.total}</p>
                                                </div>
                                            )}
                                            <div className={`flex items-center justify-center gap-2 p-2.5 rounded-lg text-sm ${
                                                syncProgress.status === 'error' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                                                syncProgress.status === 'complete' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                                'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                            }`}>
                                                {(syncProgress.status === 'fetching-list' || syncProgress.status === 'fetching-sessions' || syncProgress.status === 'analyzing') && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                {syncProgress.status === 'complete' && <Check className="w-3.5 h-3.5" />}
                                                {syncProgress.status === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                                                <span className="font-medium">{syncProgress.message}</span>
                                            </div>
                                            {syncProgress.error && <p className="text-xs text-red-600 text-center">{syncProgress.error}</p>}
                                        </div>
                                    )}
                                    <Button
                                        onClick={syncFromPostHog}
                                        disabled={syncProgress.status !== 'idle' && syncProgress.status !== 'error' && syncProgress.status !== 'complete'}
                                        className="gap-2 w-full"
                                    >
                                        {syncProgress.status === 'idle' || syncProgress.status === 'error' || syncProgress.status === 'complete' ? (
                                            <><RefreshCw className="w-4 h-4" />Start Sync</>
                                        ) : (
                                            <><Loader2 className="w-4 h-4 animate-spin" />Syncing...</>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                {/* Session detail view */}
                {dbSelectedSession && dbSelectedSession.analysis && (
                    <section id="session-detail-area" className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="border-0 shadow-lg ring-1 ring-[var(--border)] bg-[var(--card)]">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-[var(--foreground)]">
                                        <PlayCircle className="w-5 h-5 text-blue-500" />
                                        Session Replay
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{dbSelectedSession.name}</span>
                                        <Badge variant="outline" className={
                                            dbSelectedSession.source === 'posthog' ? 'border-blue-500/30 text-blue-500' :
                                            dbSelectedSession.source === 'mixpanel' ? 'border-orange-500/30 text-orange-500' :
                                            dbSelectedSession.source === 'amplitude' ? 'border-violet-500/30 text-violet-500' :
                                            'border-emerald-500/30 text-emerald-500'
                                        }>
                                            {dbSelectedSession.source === 'posthog' ? 'PostHog' : dbSelectedSession.source === 'mixpanel' ? 'Mixpanel' : dbSelectedSession.source === 'amplitude' ? 'Amplitude' : 'Upload'}
                                        </Badge>
                                    </CardTitle>
                                    <Button variant="ghost" size="sm" onClick={handleCloseDetail}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </CardHeader>
                                <div className="p-4 pt-0">
                                    {dbSessionEvents && dbSessionEvents.length > 0 ? (
                                        <SessionPlayer key={dbSelectedSession.id} events={dbSessionEvents} autoPlay={false} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center bg-[var(--muted)] rounded-lg border border-dashed border-[var(--border)] py-12 px-4">
                                            <Loader2 className="w-12 h-12 text-[var(--muted-foreground)] mb-3 animate-spin" />
                                            <p className="text-sm text-[var(--muted-foreground)] text-center">Loading session replay...</p>
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
                        <div className="space-y-4">
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader><CardTitle className="text-[var(--foreground)] text-sm">User Intent</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-base font-medium text-blue-500">&ldquo;{dbSelectedSession.analysis.user_intent}&rdquo;</p>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-2">{dbSelectedSession.analysis.summary}</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-red-500/20">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-red-500 text-sm">
                                        <AlertTriangle className="w-4 h-4" />Friction Points
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[200px] w-full px-6 pb-6">
                                        <div className="space-y-2">
                                            {dbSelectedSession.analysis.frustration_points?.map((pt: any, i: number) => (
                                                <div key={i} onClick={() => jumpToTime(pt.timestamp)} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors group">
                                                    <Badge variant="outline" className="bg-[var(--card)] text-red-500 border-red-500/30 mb-1">{pt.timestamp}</Badge>
                                                    <p className="text-sm text-[var(--foreground)]">{pt.issue}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-emerald-500/20">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-emerald-500 text-sm">
                                        <CheckCircle2 className="w-4 h-4" />Went Well
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-1.5">
                                        {dbSelectedSession.analysis.went_well?.map((item: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </section>
                )}

                {selectedEntry && selectedEntry.analysis && !selectedEntry.analysis.error && (
                    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
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
                                        <SessionPlayer key={selectedEntry.id} events={selectedEntry.events} autoPlay={false} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center bg-[var(--muted)] rounded-lg border border-dashed border-[var(--border)] py-12 px-4">
                                            <PlayCircle className="w-12 h-12 text-[var(--muted-foreground)] mb-3" />
                                            <p className="text-sm text-[var(--muted-foreground)] text-center">Session replay not available</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                            <Card className="p-6 bg-[var(--card)] border-[var(--border)]">
                                <h3 className="font-semibold mb-2 text-[var(--foreground)]">Detailed Narrative</h3>
                                <p className="text-[var(--muted-foreground)] leading-relaxed">{selectedEntry.analysis.description}</p>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader><CardTitle className="text-[var(--foreground)] text-sm">User Intent</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-base font-medium text-blue-500">&ldquo;{selectedEntry.analysis.user_intent}&rdquo;</p>
                                    <p className="text-sm text-[var(--muted-foreground)] mt-2">{selectedEntry.analysis.summary}</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-red-500/20">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-red-500 text-sm">
                                        <AlertTriangle className="w-4 h-4" />Friction Points
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <ScrollArea className="h-[200px] w-full px-6 pb-6">
                                        <div className="space-y-2">
                                            {selectedEntry.analysis.frustration_points?.map((pt: any, i: number) => (
                                                <div key={i} onClick={() => jumpToTime(pt.timestamp)} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors">
                                                    <Badge variant="outline" className="bg-[var(--card)] text-red-500 border-red-500/30 mb-1">{pt.timestamp}</Badge>
                                                    <p className="text-sm text-[var(--foreground)]">{pt.issue}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                            <Card className="bg-[var(--card)] border-emerald-500/20">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-emerald-500 text-sm">
                                        <CheckCircle2 className="w-4 h-4" />Went Well
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-1.5">
                                        {selectedEntry.analysis.went_well?.map((item: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />{item}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        </div>
                    </section>
                )}

                {/* Conversation transcript detail view */}
                {selectedConversation && (
                    <section id="conversation-detail-area" className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="border-0 shadow-lg ring-1 ring-[var(--border)] bg-[var(--card)]">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-[var(--foreground)]">
                                        <MessageCircle className="w-5 h-5 text-violet-500" />
                                        Conversation Transcript
                                        <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{selectedConversation.participantName}</span>
                                        <Badge variant="outline" className="border-violet-500/30 text-violet-500">
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
                                                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'agent' ? 'bg-[var(--muted)] text-[var(--foreground)]' : 'bg-violet-500 text-white'}`}>
                                                        <p className="text-xs font-semibold mb-1 opacity-70">{msg.role === 'agent' ? 'Maya (Researcher)' : 'User'}</p>
                                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </div>
                        <div className="space-y-4">
                            <Card className="bg-[var(--card)] border-[var(--border)]">
                                <CardHeader><CardTitle className="text-[var(--foreground)] text-sm">Analysis Summary</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{selectedConversation.analysis?.summary}</p>
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
                            {selectedConversation.analysis?.pain_points?.length > 0 && (
                                <Card className="bg-[var(--card)] border-red-500/20">
                                    <CardHeader><CardTitle className="flex items-center gap-2 text-red-500 text-sm"><AlertTriangle className="w-4 h-4" />Pain Points</CardTitle></CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {selectedConversation.analysis.pain_points.map((point: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />{point}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                            {selectedConversation.analysis?.key_quotes?.length > 0 && (
                                <Card className="bg-[var(--card)] border-violet-500/20">
                                    <CardHeader><CardTitle className="flex items-center gap-2 text-violet-500 text-sm"><Quote className="w-4 h-4" />Key Quotes</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {selectedConversation.analysis.key_quotes.map((quote: string, i: number) => (
                                                <blockquote key={i} className="border-l-2 border-violet-500 pl-3 italic text-sm text-[var(--muted-foreground)]">&ldquo;{quote}&rdquo;</blockquote>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                            {selectedConversation.analysis?.feature_requests?.length > 0 && (
                                <Card className="bg-[var(--card)] border-emerald-500/20">
                                    <CardHeader><CardTitle className="flex items-center gap-2 text-emerald-500 text-sm"><CheckCircle2 className="w-4 h-4" />Feature Requests</CardTitle></CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {selectedConversation.analysis.feature_requests.map((fr: string, i: number) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />{fr}
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

