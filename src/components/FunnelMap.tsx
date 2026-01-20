'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, TrendingDown, ArrowRight, Zap, Plus, ChevronDown } from 'lucide-react';

interface FunnelStep {
  name: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
  dropOffCount: number;
  avgTimeToConvert?: number;
}

interface FunnelMapProps {
  steps: FunnelStep[];
  onAnalyzeDropOff: (step: FunnelStep, stepIndex: number) => void;
}

// Simulated breakdown data based on step name
const getBreakdownForStep = (stepName: string | undefined) => {
  const breakdowns: Record<string, { name: string; type: string; percentage: number }[]> = {
    default: [
      { name: 'Primary Path', type: 'Event', percentage: 55 },
      { name: 'Secondary Path', type: 'Event', percentage: 30 },
      { name: 'Other', type: 'Event', percentage: 15 },
    ],
  };
  
  if (!stepName) return breakdowns.default;
  
  // Generate some realistic-looking breakdown based on step name
  const hash = stepName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const variations = [
    [
      { name: 'Form', type: 'Event', percentage: 45 },
      { name: 'Survey', type: 'Event', percentage: 25 },
      { name: 'Quiz', type: 'Event', percentage: 20 },
      { name: 'Test', type: 'Event', percentage: 5 },
      { name: 'Poll', type: 'Event', percentage: 5 },
    ],
    [
      { name: 'Desktop', type: 'Device', percentage: 62 },
      { name: 'Mobile', type: 'Device', percentage: 35 },
      { name: 'Tablet', type: 'Device', percentage: 3 },
    ],
    [
      { name: 'Direct', type: 'Source', percentage: 48 },
      { name: 'Organic', type: 'Source', percentage: 32 },
      { name: 'Referral', type: 'Source', percentage: 15 },
      { name: 'Paid', type: 'Source', percentage: 5 },
    ],
  ];
  
  return variations[hash % variations.length] || breakdowns.default;
};

// Determine step type based on name
const getStepType = (name: string | undefined): string => {
  if (!name) return 'Event';
  const lowerName = name.toLowerCase();
  if (lowerName.includes('click') || lowerName.includes('select') || lowerName.includes('submit') || lowerName.includes('button')) {
    return 'Action';
  }
  if (lowerName.includes('view') || lowerName.includes('page') || lowerName.includes('screen')) {
    return 'Pageview';
  }
  return 'Event';
};

export default function FunnelMap({ steps, onAnalyzeDropOff }: FunnelMapProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <div className="w-full overflow-x-auto py-4">
      <div className="flex items-start min-w-max gap-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isActive = activeStep === index;
          const stepType = getStepType(step.name);
          const breakdown = getBreakdownForStep(step.name);
          const nextStepConversion = !isLast ? steps[index + 1]?.conversionRate || 0 : 0;
          
          // Calculate conversion to next step
          const conversionToNext = index === 0 
            ? 100 
            : step.count > 0 && steps[index - 1].count > 0
              ? (step.count / steps[index - 1].count * 100)
              : step.conversionRate;

          return (
            <React.Fragment key={index}>
              {/* Step Card */}
              <div className="relative">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`
                    w-52 bg-white rounded-xl border-2 transition-all duration-200 cursor-pointer
                    ${isActive 
                      ? 'border-slate-400 shadow-lg' 
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    }
                  `}
                  onClick={() => setActiveStep(isActive ? null : index)}
                >
                  {/* Card Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-base truncate" title={step.name || 'Unnamed Step'}>
                          {step.name || 'Unnamed Step'}
                        </h3>
                        <span className="text-xs text-slate-500 font-medium">
                          {stepType}
                        </span>
                      </div>
                      <ChevronDown 
                        className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ml-2 ${isActive ? 'rotate-180' : ''}`} 
                      />
                    </div>
                    
                    {/* Separator */}
                    <div className="h-px bg-slate-100 my-3" />
                    
                    {/* User Count */}
                    <div className="flex items-center gap-2 text-slate-600">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">{formatNumber(step.count)} users</span>
                    </div>
                  </div>
                </motion.div>

                {/* Dropdown Panel */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -10, height: 0 }}
                      className="absolute top-full left-0 right-0 mt-1 z-50"
                    >
                      <div className="bg-white rounded-xl border-2 border-slate-200 shadow-xl overflow-hidden">
                        {/* Breakdown Items */}
                        <div className="py-2">
                          {breakdown.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 cursor-default"
                            >
                              <div>
                                <div className="font-medium text-slate-900 text-sm">{item.name}</div>
                                <div className="text-xs text-slate-500">{item.type}</div>
                              </div>
                              <div className="text-sm font-semibold text-slate-700">
                                {item.percentage}%
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Add More Button */}
                        <div className="px-4 py-2 border-t border-slate-100">
                          <button className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {/* Analyze Drop-off */}
                        {step.dropOffRate > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnalyzeDropOff(step, index);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 border-t border-slate-100 hover:bg-gradient-to-r hover:from-purple-50 hover:to-indigo-50 text-slate-700 transition-all group"
                          >
                            <Zap className="w-4 h-4 text-purple-600" />
                            <span className="font-medium text-sm">Analyze Drop-off</span>
                            <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-purple-600" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connector Line with Percentage */}
              {!isLast && (
                <div className="relative flex items-center justify-center w-20 self-center" style={{ marginTop: '2rem' }}>
                  {/* Line */}
                  <div className="h-[2px] bg-slate-200 w-full" />
                  
                  {/* Percentage Badge */}
                  <div 
                    className={`
                      absolute px-2 py-1 rounded-md text-xs font-bold
                      ${conversionToNext >= 70 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : conversionToNext >= 40
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }
                    `}
                  >
                    {conversionToNext.toFixed(0)}%
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-6 mt-8 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
          <span>High conversion (70%+)</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
          <span>Medium (40-70%)</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
          <span>Low (&lt;40%)</span>
        </div>
      </div>
    </div>
  );
}
