'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Users, AlertTriangle, Lightbulb, MessageCircle } from 'lucide-react';

interface Archetype {
  id: string;
  name: string;
  tagline: string;
  description: string;
  churnType: string;
  userCount: number;
  color: string;
  icon: string;
  behavioralSignature: string;
  triggerEvents: string;
  conversionBlockers: string | null;
  recoveryStrategy: string | null;
  interviewQuestions: string;
  productFixes: string;
}

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export default function ArchetypeCard({ archetype }: { archetype: Archetype }) {
  const [expanded, setExpanded] = useState(false);

  const signature = parseJSON<Record<string, string>>(archetype.behavioralSignature, {});
  const triggers = parseJSON<string[]>(archetype.triggerEvents, []);
  const blockers = parseJSON<string[]>(archetype.conversionBlockers, []);
  const fixes = parseJSON<string[]>(archetype.productFixes, []);
  const questions = parseJSON<string[]>(archetype.interviewQuestions, []);

  return (
    <div className="bg-white dark:bg-[#141414] rounded-xl border border-gray-200 dark:border-transparent overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full p-5 text-left hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: archetype.color + '20' }}>
            <Users className="w-5 h-5" style={{ color: archetype.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-900 dark:text-white">{archetype.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                archetype.churnType === 'unpaid'
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
              }`}>
                {archetype.churnType}
              </span>
              <span className="text-xs text-gray-400 dark:text-[#666]">{archetype.userCount} users</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-[#888]">{archetype.tagline}</p>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-gray-200 dark:border-[#222] space-y-4">
              <p className="text-sm text-gray-600 dark:text-[#888] mt-4">{archetype.description}</p>

              {/* Behavioral Signature */}
              <div className="grid grid-cols-2 gap-3">
                {signature.engagement_pattern && (
                  <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-3">
                    <p className="text-xs text-gray-400 dark:text-[#666] mb-1">Engagement</p>
                    <p className="text-sm text-gray-700 dark:text-[#ccc]">{signature.engagement_pattern}</p>
                  </div>
                )}
                {signature.frustration_level && (
                  <div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg p-3">
                    <p className="text-xs text-gray-400 dark:text-[#666] mb-1">Frustration</p>
                    <p className="text-sm text-gray-700 dark:text-[#ccc]">{signature.frustration_level}</p>
                  </div>
                )}
              </div>

              {/* Trigger Events */}
              {triggers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide">Triggers</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {triggers.map((t, i) => (
                      <span key={i} className="text-xs bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 px-2 py-1 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversion Blockers (unpaid) */}
              {blockers.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide mb-2">Conversion Blockers</p>
                  <ul className="space-y-1">
                    {blockers.map((b, i) => (
                      <li key={i} className="text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recovery Strategy (paid) */}
              {archetype.recoveryStrategy && (
                <div className="bg-emerald-50 dark:bg-[#0d1f17] rounded-lg p-3">
                  <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide mb-1">Recovery Strategy</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">{archetype.recoveryStrategy}</p>
                </div>
              )}

              {/* Product Fixes */}
              {fixes.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Lightbulb className="w-3.5 h-3.5 text-blue-500" />
                    <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide">Suggested Fixes</p>
                  </div>
                  <ul className="space-y-1">
                    {fixes.map((f, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-[#888]">{i + 1}. {f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Interview Questions */}
              {questions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageCircle className="w-3.5 h-3.5 text-purple-500" />
                    <p className="text-xs text-gray-400 dark:text-[#666] uppercase tracking-wide">Interview Questions</p>
                  </div>
                  <ul className="space-y-1">
                    {questions.map((q, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-[#888] italic">&ldquo;{q}&rdquo;</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
