'use client';

import { motion } from 'framer-motion';
import { TrendingDown, Users, Mic, Play } from 'lucide-react';
import type { FunnelStep } from '@/lib/types';

interface FunnelVisualizationProps {
    steps: FunnelStep[];
    onTriggerInterview: (step: FunnelStep) => void;
}

export default function FunnelVisualization({ steps, onTriggerInterview }: FunnelVisualizationProps) {
    const getStatus = (dropOffRate: number) => {
        if (dropOffRate >= 40) return 'low';
        if (dropOffRate >= 20) return 'medium';
        return 'high';
    };

    const getDropOffColor = (dropOffRate: number) => {
        if (dropOffRate >= 40) return 'var(--danger)';
        if (dropOffRate >= 20) return 'var(--warning)';
        return 'var(--success)';
    };

    return (
        <div className="space-y-3">
            {steps.map((step, index) => (
                <motion.div
                    key={step.id}
                    className={`funnel-step ${getStatus(step.dropOffRate)} group`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                >
                    <div className="flex items-center justify-between">
                        {/* Step Info */}
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-[var(--foreground-muted)] text-sm">Step {index + 1}</span>
                                <h4 className="font-medium">{step.name}</h4>
                            </div>

                            {/* Progress Bar */}
                            <div className="flex items-center gap-4">
                                <div className="flex-1 progress-bar">
                                    <motion.div
                                        className="progress-fill"
                                        style={{ backgroundColor: getDropOffColor(step.dropOffRate) }}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${step.conversionRate}%` }}
                                        transition={{ delay: index * 0.1 + 0.3, duration: 0.5 }}
                                    />
                                </div>
                                <span className="text-sm font-medium" style={{ color: getDropOffColor(step.dropOffRate) }}>
                                    {step.conversionRate}%
                                </span>
                            </div>
                        </div>

                        {/* Drop-off Stats */}
                        {step.dropOffRate > 0 && (
                            <div className="ml-6 flex items-center gap-4">
                                <div className="text-right">
                                    <div className="flex items-center gap-2 text-[var(--danger)]">
                                        <TrendingDown className="w-4 h-4" />
                                        <span className="font-medium">{step.dropOffRate}% drop</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-sm text-[var(--foreground-muted)]">
                                        <Users className="w-3 h-3" />
                                        <span>{step.userCount} users left</span>
                                    </div>
                                </div>

                                {/* Interview Trigger Button */}
                                <motion.button
                                    className="opacity-0 group-hover:opacity-100 btn btn-accent py-2 px-3"
                                    onClick={() => onTriggerInterview(step)}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Mic className="w-4 h-4" />
                                    <span className="text-sm">Interview</span>
                                </motion.button>
                            </div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
