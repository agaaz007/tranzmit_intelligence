'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    GitBranch,
    Mic,
    Lightbulb,
    Users,
    ArrowRight,
    Loader2,
    AlertTriangle,
    Video,
    Search,
    Plus,
    MoreHorizontal,
    FolderPlus,
} from 'lucide-react';

interface DashboardStats {
    stats: {
        funnels: { value: number; change: string | null; positive: boolean };
        interviews: { value: number; change: string | null; positive: boolean };
        frictionPoints: { value: number; change: string | null; positive: boolean };
        hypotheses: { value: number; change: string | null; positive: boolean };
        cohorts: { value: number; change: string | null; positive: boolean };
        sessions: { total: number; withErrors: number; highActivity: number };
    };
    recentInsights: Array<{
        id: string;
        funnel: string;
        insight: string;
        sentiment: string;
        severity: string;
        satisfaction: number | null;
        time: string;
    }>;
    upcomingInterviews: Array<{
        id: string;
        user: string;
        cohort: string;
        time: string;
        status: string;
    }>;
}

interface StudyItem {
    id: string;
    name: string;
    type: 'study' | 'cohort' | 'funnel';
    status: 'draft' | 'active' | 'completed';
    participants: number;
    lastEdited: string;
}

export default function DashboardPage() {
    const [data, setData] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [studies, setStudies] = useState<StudyItem[]>([]);

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
                loadDashboardStats(currentProjectId);
            } else {
                setIsLoading(false);
            }
        };

        initializeProject();
    }, []);

    const loadDashboardStats = async (projId: string) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/dashboard-stats?projectId=${projId}`);
            const result = await response.json();
            if (response.ok) {
                setData(result);
                // Transform data into studies format
                const transformedStudies: StudyItem[] = [];
                
                // Add hypotheses as studies
                if (result.stats.hypotheses.value > 0) {
                    transformedStudies.push({
                        id: '1',
                        name: 'User Research Study',
                        type: 'study',
                        status: 'active',
                        participants: result.stats.interviews.value,
                        lastEdited: 'Today',
                    });
                }
                
                // Add cohorts
                if (result.stats.cohorts.value > 0) {
                    transformedStudies.push({
                        id: '2',
                        name: 'Drop-off Analysis',
                        type: 'cohort',
                        status: 'draft',
                        participants: 0,
                        lastEdited: 'Yesterday',
                    });
                }
                
                setStudies(transformedStudies);
            }
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-[var(--success-bg)] text-[var(--success)]">Active</span>;
            case 'completed':
                return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-[var(--info-bg)] text-[var(--info)]">Completed</span>;
            default:
                return <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">Draft</span>;
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-primary)]" />
                    <p className="text-[var(--foreground-muted)] text-sm">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-[var(--background)] p-8">
                <div className="max-w-lg mx-auto text-center py-20">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--warning-bg)] flex items-center justify-center mx-auto mb-5">
                        <AlertTriangle className="w-7 h-7 text-[var(--warning)]" />
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">No Project Selected</h2>
                    <p className="text-[var(--foreground-muted)] mb-6 text-sm">Configure a project in settings to see your dashboard.</p>
                    <Link
                        href="/dashboard/settings"
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        Go to Settings
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        );
    }

    const totalStudies = (data.stats.hypotheses.value || 0) + (data.stats.cohorts.value || 0) + (data.stats.funnels.value || 0);

    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* Header */}
            <div className="bg-[var(--card)] border-b border-[var(--border)] px-8 py-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-[var(--foreground-subtle)] text-sm mb-0.5">Tranzmit / Studies</div>
                        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Studies</h1>
                    </div>
                </div>
            </div>

            <div className="p-8">
                {/* Search and Actions */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3 flex-1 max-w-xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-subtle)]" />
                            <input
                                type="text"
                                placeholder="Search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="input w-full pl-10 pr-4"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="btn-secondary">
                            Analyze Survey
                        </button>
                        <Link
                            href="/dashboard/hypotheses"
                            className="btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            New Study
                        </Link>
                    </div>
                </div>

                {/* Create Folder Card */}
                <div className="mb-6">
                    <button className="flex items-center gap-3 px-4 py-3 bg-[var(--card)] border border-dashed border-[var(--border)] rounded-xl hover:border-[var(--brand-primary)] hover:bg-[var(--muted)] transition-all w-full max-w-xs dark:hover:shadow-[0_0_20px_var(--brand-glow)]">
                        <FolderPlus className="w-5 h-5 text-[var(--foreground-subtle)]" />
                        <span className="text-sm text-[var(--foreground-muted)]">Create Folder</span>
                    </button>
                </div>

                {/* Studies Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Quick Stats Cards */}
                    <Link href="/dashboard/funnels">
                        <motion.div
                            className="card hover-card p-5 cursor-pointer group"
                            whileHover={{ y: -2 }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-xs">
                                    <GitBranch className="w-4 h-4" />
                                    <span>Journey Map</span>
                                </div>
                                {getStatusBadge('active')}
                            </div>
                            <h3 className="font-semibold text-[var(--foreground)] mb-1">Funnel Analysis</h3>
                            <p className="text-sm text-[var(--foreground-muted)] mb-4">Track user journeys and conversion paths</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-xs text-[var(--foreground-subtle)]">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{data.stats.funnels.value} funnels</span>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    </Link>

                    <Link href="/dashboard/interviews">
                        <motion.div
                            className="card hover-card p-5 cursor-pointer group"
                            whileHover={{ y: -2 }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-xs">
                                    <Mic className="w-4 h-4" />
                                    <span>Voice of Customer</span>
                                </div>
                                {getStatusBadge(data.stats.interviews.value > 0 ? 'active' : 'draft')}
                            </div>
                            <h3 className="font-semibold text-[var(--foreground)] mb-1">Voice of Customer</h3>
                            <p className="text-sm text-[var(--foreground-muted)] mb-4">Customer insights, verbatims & issue tracking</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-xs text-[var(--foreground-subtle)]">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{data.stats.interviews.value} completed</span>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    </Link>

                    <Link href="/dashboard/cohorts">
                        <motion.div
                            className="card hover-card p-5 cursor-pointer group"
                            whileHover={{ y: -2 }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-xs">
                                    <Users className="w-4 h-4" />
                                    <span>Cohorts</span>
                                </div>
                                {getStatusBadge(data.stats.cohorts.value > 0 ? 'active' : 'draft')}
                            </div>
                            <h3 className="font-semibold text-[var(--foreground)] mb-1">Smart Cohorts</h3>
                            <p className="text-sm text-[var(--foreground-muted)] mb-4">AI-detected user segments</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-xs text-[var(--foreground-subtle)]">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{data.stats.cohorts.value} cohorts</span>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    </Link>

                    <Link href="/dashboard/hypotheses">
                        <motion.div
                            className="card hover-card p-5 cursor-pointer group"
                            whileHover={{ y: -2 }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-xs">
                                    <Lightbulb className="w-4 h-4" />
                                    <span>Studies</span>
                                </div>
                                {getStatusBadge(data.stats.hypotheses.value > 0 ? 'active' : 'draft')}
                            </div>
                            <h3 className="font-semibold text-[var(--foreground)] mb-1">Research Studies</h3>
                            <p className="text-sm text-[var(--foreground-muted)] mb-4">Create and manage research studies</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-xs text-[var(--foreground-subtle)]">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{data.stats.hypotheses.value} studies</span>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    </Link>

                    <Link href="/dashboard/session-insights">
                        <motion.div
                            className="card hover-card p-5 cursor-pointer group"
                            whileHover={{ y: -2 }}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-xs">
                                    <Video className="w-4 h-4" />
                                    <span>Sessions</span>
                                </div>
                                {getStatusBadge('active')}
                            </div>
                            <h3 className="font-semibold text-[var(--foreground)] mb-1">Session Insights</h3>
                            <p className="text-sm text-[var(--foreground-muted)] mb-4">Watch and analyze session replays</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-xs text-[var(--foreground-subtle)]">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{data.stats.sessions.total} sessions</span>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    </Link>

                    {/* Example Card with striped pattern */}
                    <motion.div
                        className="card hover-card p-5 relative overflow-hidden group striped-pattern"
                        whileHover={{ y: -2 }}
                    >
                        <div className="relative">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-xs">
                                    <Lightbulb className="w-4 h-4" />
                                    <span>Analysis Demo</span>
                                </div>
                                <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-[var(--warning-bg)] text-[var(--warning)]">Example</span>
                            </div>
                            <h3 className="font-semibold text-[var(--foreground)] mb-1">Sample Analysis</h3>
                            <p className="text-sm text-[var(--foreground-muted)] mb-4">See how analysis works with sample data</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-xs text-[var(--foreground-subtle)]">
                                    <Users className="w-3.5 h-3.5" />
                                    <span>100 participants</span>
                                </div>
                                <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--foreground-subtle)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
