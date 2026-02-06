'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
    Users,
    Settings,
    Lightbulb,
    Home,
    Radio,
    MessageCircle,
    Target,
    PlayCircle,
    PhoneCall,
    Sun,
    Moon,
    Sparkles,
} from 'lucide-react';

const navItems = [
    { href: '/dashboard', icon: Home, label: 'Overview', exact: true },
    { href: '/dashboard/funnels', icon: Target, label: 'Journey Map' },
    { href: '/dashboard/session-insights', icon: PlayCircle, label: 'Session Insights' },
    { href: '/dashboard/cohorts', icon: Users, label: 'Inactive Cohort' },
    { href: '/dashboard/hypotheses', icon: Lightbulb, label: 'Studies' },
    { href: '/dashboard/interviews', icon: MessageCircle, label: 'Interviews' },
    { href: '/dashboard/recovery', icon: PhoneCall, label: 'Recovery' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <aside className="sidebar w-[220px] h-screen flex flex-col relative">
            {/* Subtle gradient overlay for dark mode */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5 dark:to-black/20 pointer-events-none" />

            {/* Logo */}
            <div className="px-4 py-5 relative">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <div className="w-9 h-9 rounded-xl bg-[var(--brand-primary)] flex items-center justify-center shadow-lg dark:shadow-[0_0_20px_var(--brand-glow)] transition-all group-hover:scale-105">
                        <Radio className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-[var(--foreground)] text-[15px] tracking-tight leading-none">
                            Tranzmit
                        </span>
                        <span className="text-[10px] text-[var(--foreground-subtle)] mt-0.5 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            AI Platform
                        </span>
                    </div>
                </Link>
            </div>

            {/* Divider with accent */}
            <div className="mx-4 h-px bg-[var(--border)] dark:bg-gradient-to-r dark:from-transparent dark:via-[var(--border)] dark:to-transparent" />

            {/* Workspace Label */}
            <div className="px-4 py-3">
                <span className="text-[10px] font-semibold text-[var(--foreground-subtle)] uppercase tracking-widest">
                    Workspace
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2.5 space-y-0.5 relative">
                {navItems.map((item) => {
                    const isActive = item.exact
                        ? pathname === item.href
                        : pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard');

                    return (
                        <Link key={item.href} href={item.href}>
                            <div
                                className={`sidebar-item flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] relative overflow-hidden ${
                                    isActive
                                        ? 'sidebar-item-active text-white'
                                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                                }`}
                            >
                                {/* Active indicator glow */}
                                {isActive && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-[var(--brand-primary)] to-blue-600 dark:from-[var(--brand-primary)] dark:to-blue-500" />
                                )}
                                <item.icon className={`w-4 h-4 relative z-10 ${isActive ? '' : ''}`} strokeWidth={1.75} />
                                <span className="font-medium relative z-10">{item.label}</span>
                                {/* Hover highlight */}
                                {!isActive && (
                                    <div className="absolute inset-0 bg-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Section */}
            <div className="border-t border-[var(--border)] dark:border-[var(--border)]/50 relative">
                {/* Theme Toggle & Settings Row */}
                <div className="px-2.5 py-2 flex items-center gap-1">
                    <Link href="/dashboard/settings" className="flex-1">
                        <div className={`sidebar-item flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] ${
                            pathname === '/dashboard/settings'
                                ? 'bg-[var(--muted)] text-[var(--foreground)]'
                                : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                        }`}>
                            <Settings className="w-4 h-4" strokeWidth={1.75} />
                            <span className="font-medium">Settings</span>
                        </div>
                    </Link>

                    {/* Theme Toggle */}
                    {mounted && (
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="relative p-2.5 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-all group"
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            <div className="relative w-4 h-4">
                                {theme === 'dark' ? (
                                    <Sun className="w-4 h-4 transition-transform group-hover:rotate-45" strokeWidth={1.75} />
                                ) : (
                                    <Moon className="w-4 h-4 transition-transform group-hover:-rotate-12" strokeWidth={1.75} />
                                )}
                            </div>
                            {/* Glow effect on hover in dark mode */}
                            {theme === 'dark' && (
                                <div className="absolute inset-0 rounded-lg bg-yellow-500/0 group-hover:bg-yellow-500/10 transition-colors" />
                            )}
                        </button>
                    )}
                </div>

                {/* User Account */}
                <div className="px-3 py-3 border-t border-[var(--border)] dark:border-[var(--border)]/50">
                    <div className="flex items-center gap-2.5 group cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-md dark:shadow-[0_0_12px_var(--brand-glow)] transition-shadow group-hover:shadow-lg">
                            T
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-[var(--foreground)] truncate">Tranzmit</div>
                            <div className="text-[11px] text-[var(--foreground-subtle)] truncate">contact@tranzmit.com</div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
