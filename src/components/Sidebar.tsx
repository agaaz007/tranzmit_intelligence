'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Users,
    Settings,
    Lightbulb,
    Home,
    Radio,
    MessageCircle,
    Target,
    PlayCircle,
} from 'lucide-react';

const navItems = [
    { href: '/dashboard', icon: Home, label: 'Overview', exact: true },
    { href: '/dashboard/funnels', icon: Target, label: 'Journey Map' },
    { href: '/dashboard/session-insights', icon: PlayCircle, label: 'Session Insights' },
    { href: '/dashboard/cohorts', icon: Users, label: 'Smart Cohorts' },
    { href: '/dashboard/hypotheses', icon: Lightbulb, label: 'Studies' },
    { href: '/dashboard/interviews', icon: MessageCircle, label: 'Interviews' },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-[220px] h-screen bg-white border-r border-[#e5e5e5] flex flex-col">
            {/* Logo */}
            <div className="px-4 py-5">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#1a56db] flex items-center justify-center">
                        <Radio className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-[#1a1a1a] text-[15px] tracking-tight leading-none">Tranzmit</span>
                    </div>
                </Link>
            </div>

            {/* Workspace Label */}
            <div className="px-4 py-2">
                <span className="text-[11px] font-medium text-[#999] uppercase tracking-wider">Workspace</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 space-y-0.5">
                {navItems.map((item) => {
                    const isActive = item.exact 
                        ? pathname === item.href
                        : pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard');

                    return (
                        <Link key={item.href} href={item.href}>
                            <div
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] ${
                                    isActive
                                        ? 'bg-[#1a56db] text-white'
                                        : 'text-[#666] hover:bg-[#f5f5f5] hover:text-[#1a1a1a]'
                                }`}
                            >
                                <item.icon className="w-4 h-4" strokeWidth={1.75} />
                                <span className="font-medium">{item.label}</span>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Section */}
            <div className="border-t border-[#e5e5e5]">
                {/* Usage & Billing */}
                <div className="px-2 py-2">
                    <Link href="/dashboard/settings">
                        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] ${
                            pathname === '/dashboard/settings'
                                ? 'bg-[#f5f5f5] text-[#1a1a1a]'
                                : 'text-[#666] hover:bg-[#f5f5f5] hover:text-[#1a1a1a]'
                        }`}>
                            <Settings className="w-4 h-4" strokeWidth={1.75} />
                            <span className="font-medium">Settings</span>
                        </div>
                    </Link>
                </div>

                {/* User Account */}
                <div className="px-3 py-3 border-t border-[#e5e5e5]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-white text-xs font-semibold">
                            T
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-[#1a1a1a] truncate">Tranzmit</div>
                            <div className="text-[11px] text-[#999] truncate">contact@tranzmit.com</div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
