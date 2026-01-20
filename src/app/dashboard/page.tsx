'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    GitBranch,
    Mic,
    Lightbulb,
    TrendingUp,
    TrendingDown,
    Users,
    Clock,
    ArrowRight,
    Play,
    Zap,
    Loader2,
    AlertTriangle,
    Brain,
    Video,
    Sparkles,
    Target,
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

export default function DashboardPage() {
    const [data, setData] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

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
            }
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const stats = data?.stats ? [
        {
            label: 'Active Funnels',
            value: String(data.stats.funnels.value),
            change: data.stats.funnels.change || 'From PostHog',
            positive: data.stats.funnels.positive,
            icon: GitBranch,
            color: 'bg-blue-600',
            lightBg: 'bg-blue-50',
            href: '/dashboard/funnels',
        },
        {
            label: 'Interviews',
            value: String(data.stats.interviews.value),
            change: data.stats.interviews.change || 'Completed',
            positive: data.stats.interviews.positive,
            icon: Mic,
            color: 'bg-emerald-600',
            lightBg: 'bg-emerald-50',
            href: '/dashboard/interviews',
        },
        {
            label: 'Friction Points',
            value: String(data.stats.frictionPoints.value),
            change: data.stats.frictionPoints.value === 0 ? 'All clear!' : 'Active issues',
            positive: data.stats.frictionPoints.value === 0,
            icon: AlertTriangle,
            color: 'bg-amber-600',
            lightBg: 'bg-amber-50',
            href: '/dashboard/friction',
        },
        {
            label: 'AI Hypotheses',
            value: String(data.stats.hypotheses.value),
            change: 'Generated',
            positive: true,
            icon: Brain,
            color: 'bg-violet-600',
            lightBg: 'bg-violet-50',
            href: '/dashboard/hypotheses',
        },
        {
            label: 'Smart Cohorts',
            value: String(data.stats.cohorts.value),
            change: 'User segments',
            positive: true,
            icon: Users,
            color: 'bg-cyan-600',
            lightBg: 'bg-cyan-50',
            href: '/dashboard/cohorts',
        },
        {
            label: 'Sessions',
            value: String(data.stats.sessions.withErrors + data.stats.sessions.highActivity),
            change: `${data.stats.sessions.withErrors} errors`,
            positive: data.stats.sessions.withErrors === 0,
            icon: Video,
            color: 'bg-rose-600',
            lightBg: 'bg-rose-50',
            href: '/dashboard/sessions',
        },
    ] : [];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
                    <p className="text-slate-600 font-medium">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-slate-50 p-8">
                <div className="max-w-lg mx-auto text-center py-20">
                    <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle className="w-8 h-8 text-amber-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">No Project Selected</h2>
                    <p className="text-slate-600 mb-8">Configure a project in settings to see your dashboard.</p>
                    <Link
                        href="/dashboard/settings"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
                    >
                        Go to Settings
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                        <p className="text-slate-500 mt-1">
                            Your funnel analytics and interview insights at a glance
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link 
                            href="/dashboard/priority-queue"
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
                        >
                            <Zap className="w-4 h-4" />
                            Start Interviews
                        </Link>
                    </div>
                </div>
            </div>

            <div className="p-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                    {stats.map((stat, index) => (
                        <Link key={stat.label} href={stat.href}>
                            <motion.div
                                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer group"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                whileHover={{ y: -2 }}
                            >
                                <div className={`w-10 h-10 rounded-xl ${stat.lightBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                    <stat.icon className={`w-5 h-5 ${stat.color.replace('bg-', 'text-')}`} />
                                </div>

                                <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
                                <p className="text-sm font-medium text-slate-600 mb-2">{stat.label}</p>

                                <div className={`flex items-center gap-1 text-xs font-medium ${stat.positive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {stat.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {stat.change}
                                </div>
                            </motion.div>
                        </Link>
                    ))}
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Recent Insights */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between p-5 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                                        <Lightbulb className="w-5 h-5 text-violet-600" />
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-slate-900">Recent Insights</h2>
                                        <p className="text-xs text-slate-500">From user interviews</p>
                                    </div>
                                </div>
                                <Link href="/dashboard/insights" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                    View all <ArrowRight className="w-3 h-3" />
                                </Link>
                            </div>

                            {data.recentInsights.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                                        <Sparkles className="w-7 h-7 text-slate-400" />
                                    </div>
                                    <p className="text-slate-600 font-medium mb-1">No insights yet</p>
                                    <p className="text-slate-500 text-sm">Complete interviews to see AI-analyzed findings here.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {data.recentInsights.map((item, index) => (
                                        <motion.div
                                            key={item.id}
                                            className="p-5 hover:bg-slate-50 transition-colors cursor-pointer"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.1 }}
                                        >
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-slate-900">{item.funnel}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                            item.severity === 'high'
                                                                ? 'bg-rose-100 text-rose-700'
                                                                : item.severity === 'medium'
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {item.sentiment}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-600 leading-relaxed">{item.insight}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                                {item.satisfaction && (
                                                    <div className="flex items-center gap-1">
                                                        <Target className="w-3 h-3" />
                                                        {item.satisfaction.toFixed(1)}/10
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {item.time}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Side Panel */}
                    <div className="space-y-6">
                        {/* Quick Actions */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5">
                            <h3 className="text-sm font-bold text-slate-900 mb-4">Quick Actions</h3>
                            <div className="space-y-2">
                                <Link href="/dashboard/funnels" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                    <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                        <GitBranch className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Visual Funnel Builder</p>
                                        <p className="text-xs text-slate-500">Connect PostHog & view funnels</p>
                                    </div>
                                </Link>

                                <Link href="/dashboard/priority-queue" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                                        <Zap className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Interview Queue</p>
                                        <p className="text-xs text-slate-500">AI-prioritized users to talk to</p>
                                    </div>
                                </Link>

                                <Link href="/dashboard/cohorts" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                                        <Users className="w-4 h-4 text-violet-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Smart Cohorts</p>
                                        <p className="text-xs text-slate-500">Auto-generated user segments</p>
                                    </div>
                                </Link>

                                <Link href="/dashboard/sessions" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                                    <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center group-hover:bg-rose-200 transition-colors">
                                        <Video className="w-4 h-4 text-rose-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">Session Replays</p>
                                        <p className="text-xs text-slate-500">Watch-worthy friction sessions</p>
                                    </div>
                                </Link>
                            </div>
                        </div>

                        {/* Upcoming Interviews */}
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900">Upcoming Interviews</h3>
                                <Link 
                                    href="/dashboard/interviews" 
                                    className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                                >
                                    <Play className="w-3 h-3" />
                                </Link>
                            </div>

                            {data.upcomingInterviews.length === 0 ? (
                                <div className="p-6 text-center">
                                    <p className="text-slate-500 text-sm">No interviews scheduled</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {data.upcomingInterviews.map((item) => (
                                        <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium text-slate-900 truncate">{item.user}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                                    item.status === 'scheduled'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {item.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span>{item.cohort}</span>
                                                <span>•</span>
                                                <span>{item.time}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
