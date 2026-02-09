"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Zap, BarChart2 } from "lucide-react";
import AggregateMetrics from "@/components/dashboard/AggregateMetrics";
import InsightAccordion from "@/components/dashboard/InsightAccordion";
import {
  fetchAggregatedDashboardData,
  AggregatedData,
} from "@/lib/services/aggregation-service";

export default function AggregatedDashboardPage() {
  const [data, setData] = useState<AggregatedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const result = await fetchAggregatedDashboardData();
        setData(result);
      } catch (error) {
        console.error("Failed to load aggregated data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)]" />
          <p className="text-[var(--foreground-muted)] text-sm font-medium animate-pulse">
            Synthesizing intelligence from customer reports...
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-[var(--error)]">Failed to load aggregated insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] pb-12">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-8 py-8 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--brand-glow)] rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 opacity-50" />

        <div className="flex items-end justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 text-[var(--foreground-subtle)] text-sm mb-2 font-medium tracking-wide uppercase">
              <BarChart2 className="w-4 h-4" />
              <span>Macro Intelligence</span>
            </div>
            <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight">
              Aggregated Analysis Dashboard
            </h1>
            <p className="text-[var(--foreground-muted)] mt-2 max-w-2xl text-base">
              A macroscopic synthesis of {data.metrics.totalAnalyzed} individual
              customer research reports, surfaced through Juno AI.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="btn-primary flex items-center gap-2 shadow-lg shadow-[var(--brand-glow)]"
          >
            <Zap className="w-4 h-4" />
            Recalculate Averages
          </motion.button>
        </div>
      </div>

      <div className="p-8 max-w-7xl mx-auto space-y-10">
        {/* Metrics Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight">
              Executive Vitals
            </h2>
            <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-widest bg-[var(--muted)] px-3 py-1 rounded-full">
              {data.metrics.timePeriod}
            </span>
          </div>
          <AggregateMetrics metrics={data.metrics} />
        </section>

        {/* Thematic Insights Section */}
        <section>
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[var(--foreground)] tracking-tight mb-2">
              Deep Thematic Insights
            </h2>
            <p className="text-[var(--foreground-muted)] text-sm">
              Click on any macro-insight to drill down into the underlying raw verbatims
              and origin reports from which the conclusion was synthesized.
            </p>
          </div>
          <InsightAccordion insights={data.insights} />
        </section>
      </div>
    </div>
  );
}
