'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Mic, Activity, Zap, Users, GitBranch, Brain, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#08080c] text-white overflow-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-gradient-to-br from-orange-500/8 to-transparent blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-blue-600/8 to-transparent blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-purple-500/5 to-transparent blur-[150px]" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 opacity-30 blur-sm -z-10" />
          </div>
          <span className="font-semibold text-lg tracking-tight">trazmit</span>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
            Login
          </Link>
          <Link href="/dashboard" className="group relative px-5 py-2.5 text-sm font-medium">
            <span className="relative z-10 flex items-center gap-2">
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 opacity-90" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 blur-lg opacity-50 group-hover:opacity-70 transition-opacity" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative z-10 max-w-6xl mx-auto px-8 pt-24 pb-20">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Pill Badge */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-white/10 bg-white/[0.03]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-white/50 uppercase tracking-wider">Now with PostHog Integration</span>
          </motion.div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-[1.1] tracking-tight">
            <span className="text-white">Product analytics</span>
            <br />
            <span className="bg-gradient-to-r from-orange-400 via-rose-400 to-purple-400 bg-clip-text text-transparent">
              meets AI interviews
            </span>
          </h1>

          <p className="text-lg md:text-xl text-white/40 mb-10 max-w-2xl mx-auto leading-relaxed">
            Connect your PostHog funnels. Trigger voice interviews on drop-offs.
            Get the "what" and the "why" in one platform.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link href="/dashboard" className="group relative inline-flex items-center gap-3 px-8 py-4 text-base font-medium">
              <span className="relative z-10 flex items-center gap-3">
                <GitBranch className="w-5 h-5" />
                Connect PostHog
              </span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
            </Link>

            <Link href="/dashboard/funnels" className="flex items-center gap-3 px-8 py-4 text-base text-white/60 hover:text-white border border-white/10 rounded-2xl hover:border-white/20 hover:bg-white/[0.02] transition-all">
              <Zap className="w-5 h-5" />
              View Demo
            </Link>
          </div>
        </motion.div>
      </header>

      {/* Visual Funnel Preview */}
      <section className="relative z-10 max-w-5xl mx-auto px-8 pb-24">
        <motion.div
          className="relative rounded-3xl border border-white/10 bg-white/[0.02] p-1 overflow-hidden"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Glowing border effect */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/5 to-transparent" />

          <div className="relative rounded-[22px] bg-[#0c0c12] overflow-hidden">
            {/* Mock Dashboard Preview */}
            <div className="p-6 md:p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-semibold text-white/90">Onboarding Funnel</h3>
                  <p className="text-sm text-white/40">Last 30 days • 12,450 users</p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-400">Live</span>
                </div>
              </div>

              {/* Funnel Visualization */}
              <div className="space-y-3">
                {[
                  { step: 'Landing Page', users: 12450, rate: 100, color: 'from-blue-500 to-blue-400' },
                  { step: 'Sign Up Started', users: 7890, rate: 63, color: 'from-cyan-500 to-cyan-400', drop: 37 },
                  { step: 'Email Verified', users: 5230, rate: 42, color: 'from-emerald-500 to-emerald-400', drop: 33 },
                  { step: 'First Project', users: 2890, rate: 23, color: 'from-amber-500 to-amber-400', drop: 45 },
                  { step: 'Subscribed', users: 890, rate: 7, color: 'from-rose-500 to-rose-400', drop: 69 },
                ].map((item, i) => (
                  <motion.div
                    key={item.step}
                    className="group relative"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                      {/* Step number */}
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-sm text-white/40">
                        {i + 1}
                      </div>

                      {/* Step info */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-white/80">{item.step}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-white/40">{item.users.toLocaleString()} users</span>
                            <span className={`text-sm font-medium bg-gradient-to-r ${item.color} bg-clip-text text-transparent`}>
                              {item.rate}%
                            </span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full bg-gradient-to-r ${item.color}`}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${item.rate}%` }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 + 0.3, duration: 0.6 }}
                          />
                        </div>
                      </div>

                      {/* Drop-off indicator */}
                      {item.drop && (
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="text-right">
                            <p className="text-xs text-rose-400">-{item.drop}% dropped</p>
                          </div>
                          <button className="px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400 hover:bg-orange-500/20 transition-colors flex items-center gap-1.5">
                            <Mic className="w-3 h-3" />
                            Interview
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-8 py-24 border-t border-white/5">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white/80">The Visual Funnel Builder</span>
          </h2>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            Every feature works together. PostHog data powers AI interviews.
            Interviews reveal insights. Insights drive action.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          {[
            {
              icon: GitBranch,
              title: 'Funnel Visualization',
              desc: 'See conversion rates at each step. Color-coded drop-off severity. Click any step to dig deeper.',
              gradient: 'from-blue-500 to-cyan-500'
            },
            {
              icon: Brain,
              title: 'AI Drop-off Analysis',
              desc: 'Automatically identify patterns in where and why users leave. No manual analysis needed.',
              gradient: 'from-purple-500 to-pink-500'
            },
            {
              icon: Users,
              title: 'Cohort Analytics',
              desc: 'Track retention across different user segments. Compare behaviors. Find your power users.',
              gradient: 'from-emerald-500 to-teal-500'
            },
            {
              icon: Mic,
              title: 'AI Voice Interviews',
              desc: 'Trigger automated voice calls to users who dropped off. Natural conversation. Real insights.',
              gradient: 'from-orange-500 to-rose-500'
            }
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              className="group relative p-6 rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] hover:border-white/10 transition-all"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} p-[1px] mb-4`}>
                <div className="w-full h-full rounded-[11px] bg-[#0c0c12] flex items-center justify-center">
                  <feature.icon className={`w-5 h-5 bg-gradient-to-br ${feature.gradient} text-transparent bg-clip-text`}
                    style={{ stroke: 'url(#gradient)' }}
                  />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white/90 mb-2">{feature.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-8 py-24">
        <motion.div
          className="relative text-center p-12 rounded-3xl border border-white/10 overflow-hidden"
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-purple-500/10" />

          <div className="relative">
            <Sparkles className="w-10 h-10 mx-auto mb-6 text-orange-400" />
            <h2 className="text-3xl font-bold mb-4 text-white/90">
              Stop guessing. Start understanding.
            </h2>
            <p className="text-white/40 mb-8 text-lg max-w-xl mx-auto">
              Your PostHog data tells you what happened.
              AI interviews tell you why. Together, you fix it.
            </p>
            <Link href="/dashboard" className="group relative inline-flex items-center gap-3 px-8 py-4 text-base font-medium">
              <span className="relative z-10 flex items-center gap-2">
                Connect PostHog Free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 blur-xl opacity-40" />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/40">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center">
              <Activity className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm">trazmit</span>
          </div>
          <p className="text-xs text-white/30">
            Powered by your Voice AI Engine
          </p>
        </div>
      </footer>
    </div>
  );
}
