'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Users,
    Settings,
    Zap,
    Lightbulb,
    Home,
    Radio,
    MessageCircle,
    Target,
} from 'lucide-react';

// Only features that ADD VALUE beyond PostHog
// PostHog already handles: sessions, retention, data explorer, basic insights
const navItems = [
    { href: '/dashboard', icon: Home, label: 'Overview', exact: true },
    { href: '/dashboard/funnels', icon: Target, label: 'Journey Map' },
    { href: '/dashboard/priority-queue', icon: Zap, label: 'Signal Detection' },
    { href: '/dashboard/cohorts', icon: Users, label: 'Smart Cohorts' },
    { href: '/dashboard/hypotheses', icon: Lightbulb, label: 'Hypotheses' },
    { href: '/dashboard/interviews', icon: MessageCircle, label: 'Interviews' },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-[260px] h-screen bg-white border-r border-slate-200 flex flex-col">
            {/* Logo */}
            <div className="p-5 border-b border-slate-100">
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
                            <Radio className="w-5 h-5 text-white" />
                        </div>
                    </div>
                    <div>
                        <span className="font-bold text-slate-900 text-lg tracking-tight">TRANZMIT</span>
                        <div className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">AI Interview Platform</div>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = item.exact 
                        ? pathname === item.href
                        : pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard');

                    return (
                        <Link key={item.href} href={item.href}>
                            <motion.div
                                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                                    isActive
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                                whileHover={{ x: isActive ? 0 : 2 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <item.icon className={`w-[18px] h-[18px] ${isActive ? '' : 'group-hover:scale-110 transition-transform'}`} />
                                <span className="font-medium text-[13px]">{item.label}</span>
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* Settings */}
            <div className="p-3 border-t border-slate-100">
                <Link href="/dashboard/settings">
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                        pathname === '/dashboard/settings'
                            ? 'bg-slate-100 text-slate-900'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}>
                        <Settings className="w-[18px] h-[18px]" />
                        <span className="font-medium text-[13px]">Settings</span>
                    </div>
                </Link>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100">
                <div className="text-[10px] text-slate-400 text-center uppercase tracking-wider">
                    Powered by PostHog & AI
                </div>
            </div>
        </aside>
    );
}
