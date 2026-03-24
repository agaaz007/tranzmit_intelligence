'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-blue-500/5 via-indigo-500/3 to-transparent blur-[150px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Logo + Brand */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="text-[22px] font-semibold tracking-tight">tranzmit</span>
        </div>

        <p className="text-white/40 text-sm mb-12">Vercel Intelligence</p>

        {/* Buttons */}
        <div className="flex flex-col gap-3 w-72">
          <Link
            href="/sign-in"
            className="flex items-center justify-center h-12 text-[15px] font-medium rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
          >
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="flex items-center justify-center h-12 text-[15px] font-medium rounded-xl border border-white/10 text-white/70 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-all"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
