import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, FileText, Quote } from "lucide-react";
import { useState } from "react";
import { AggregatedInsight } from "@/lib/services/aggregation-service";

interface InsightAccordionProps {
  insights: AggregatedInsight[];
}

export default function InsightAccordion({ insights }: InsightAccordionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "text-[var(--error)] bg-[var(--error-bg)]";
      case "medium":
        return "text-[var(--warning)] bg-[var(--warning-bg)]";
      case "low":
      default:
        return "text-[var(--success)] bg-[var(--success-bg)]";
    }
  };

  return (
    <div className="space-y-4">
      {insights.map((insight) => {
        const isExpanded = expandedId === insight.id;

        return (
          <div
            key={insight.id}
            className="card overflow-hidden border border-[var(--border)] rounded-xl"
          >
            {/* Header / Trigger */}
            <button
              onClick={() => toggleExpand(insight.id)}
              className="w-full flex items-center justify-between p-5 hover:bg-[var(--card-hover)] transition-colors text-left"
            >
              <div className="flex-1 pr-6">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider ${getSeverityColor(
                      insight.severity
                    )}`}
                  >
                    {insight.severity} Priority
                  </span>
                  <span className="text-sm font-medium text-[var(--brand-primary)]">
                    Impact Score: {insight.impactScore}/100
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] leading-tight">
                  {insight.theme}
                </h3>
              </div>
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center shrink-0"
              >
                <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />
              </motion.div>
            </button>

            {/* Expandable Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="border-t border-[var(--border)] bg-[var(--background-subtle)]"
                >
                  <div className="p-6">
                    <p className="text-[var(--foreground)] text-base mb-6 leading-relaxed">
                      {insight.description}
                    </p>

                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-widest text-[var(--foreground-subtle)] mb-4">
                        Supporting Evidence
                      </h4>
                      <div className="space-y-4">
                        {insight.sources.map((source, idx) => (
                          <div
                            key={idx}
                            className="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)] relative"
                          >
                            {/* Decorative Line */}
                            <div className="absolute top-0 bottom-0 left-0 w-1 bg-[var(--brand-primary)] rounded-l-lg opacity-80" />

                            <div className="flex items-start gap-4 ml-2">
                              <Quote className="w-5 h-5 text-[var(--brand-primary)] shrink-0 mt-1" />
                              <div className="flex-1">
                                <p className="italic text-[var(--foreground-muted)] text-[15px] leading-relaxed mb-3">
                                  {source.quote}
                                </p>
                                <div className="text-sm text-[var(--foreground)] bg-[var(--muted)] p-3 rounded-md mb-3 border border-[var(--border)]">
                                  <span className="font-semibold text-xs text-[var(--foreground-muted)] uppercase tracking-wide block mb-1">Context</span>
                                  {source.context}
                                </div>
                                <div className="flex items-center gap-2 text-xs font-medium text-[var(--foreground-subtle)]">
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>From Report: <span className="text-[var(--foreground)]">{source.reportName}</span> ({source.reportId})</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
