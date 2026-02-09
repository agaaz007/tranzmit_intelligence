import { Activity, Star, AlertTriangle, TrendingUp } from "lucide-react";
import { AggregatedMetrics } from "@/lib/services/aggregation-service";
import { motion } from "framer-motion";

interface AggregateMetricsProps {
  metrics: AggregatedMetrics;
}

export default function AggregateMetrics({ metrics }: AggregateMetricsProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
    >
      <motion.div variants={item} className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-[var(--foreground-muted)] mb-1 font-medium">
              Total Reports Analyzed
            </p>
            <h3 className="text-3xl font-bold text-[var(--foreground)]">
              {metrics.totalAnalyzed}
            </h3>
            <p className="text-xs text-[var(--success)] mt-2 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +14% since last week
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--brand-light)] flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-[var(--brand-primary)]" />
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-[var(--foreground-muted)] mb-1 font-medium">
              Average Satisfaction
            </p>
            <h3 className="text-3xl font-bold text-[var(--foreground)]">
              {metrics.averageSatisfaction}/100
            </h3>
            <p className="text-xs text-[var(--warning)] mt-2 font-medium flex items-center gap-1">
              Stable
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--brand-light)] flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-[var(--brand-primary)]" />
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-[var(--foreground-muted)] mb-1 font-medium">
              Core Friction Points
            </p>
            <h3 className="text-3xl font-bold text-[var(--foreground)]">
              {metrics.commonFrictionPoints}
            </h3>
            <p className="text-xs text-[var(--error)] mt-2 font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +2 High Priority
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--error-bg)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-[var(--foreground-muted)] mb-1 font-medium">
              Premium WTP Index
            </p>
            <h3 className="text-3xl font-bold text-[var(--foreground)]">
              {metrics.willingnessToPayAvg}%
            </h3>
            <p className="text-xs text-[var(--success)] mt-2 font-medium flex items-center gap-1">
              Highly Monetizable Audience
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-[var(--success-bg)] flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-[var(--success)]" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
