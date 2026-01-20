'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
  MessageSquare,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  Target,
} from 'lucide-react';

interface Hypothesis {
  id: string;
  title: string;
  description: string;
  behaviorPattern: string | null;
  confidence: number;
  evidence: string[];
  status: string;
  questions: Array<{
    question: string;
    purpose: string;
    category: string;
    priority: number;
  }>;
}

interface Cohort {
  id: string;
  name: string;
  type: string;
  size: number;
}

export default function HypothesesPage() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [interviewScript, setInterviewScript] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [projectId, setProjectId] = useState<string>('');
  const [expandedHypothesis, setExpandedHypothesis] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    const initializeProject = async () => {
      let currentProjectId = localStorage.getItem('currentProjectId');

      if (!currentProjectId) {
        try {
          const response = await fetch('/api/projects');
          const data = await response.json();
          if (data.projects && data.projects.length > 0) {
            currentProjectId = data.projects[0].id;
            localStorage.setItem('currentProjectId', currentProjectId as string);
          }
        } catch (err) {
          console.error('Failed to fetch projects:', err);
        }
      }

      if (currentProjectId) {
        setProjectId(currentProjectId);
        loadCohorts(currentProjectId);
      } else {
        setIsLoading(false);
      }
    };

    initializeProject();
  }, []);

  const loadCohorts = async (projId: string) => {
    try {
      const response = await fetch(`/api/cohorts?projectId=${projId}`);
      const data = await response.json();
      setCohorts(data.cohorts || []);

      // Auto-select first cohort
      if (data.cohorts && data.cohorts.length > 0) {
        setSelectedCohortId(data.cohorts[0].id);
        loadHypotheses(data.cohorts[0].id);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to load cohorts:', error);
      setIsLoading(false);
    }
  };

  const loadHypotheses = async (cohortId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/hypotheses?cohortId=${cohortId}&includeScript=true`);
      const data = await response.json();
      setHypotheses(data.hypotheses || []);
      setInterviewScript(data.interviewScript || '');
    } catch (error) {
      console.error('Failed to load hypotheses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateHypotheses = async (regenerate: boolean = false) => {
    if (!selectedCohortId) return;

    setIsGenerating(true);
    setMessage(null);

    try {
      const response = await fetch('/api/hypotheses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohortId: selectedCohortId,
          regenerate,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await loadHypotheses(selectedCohortId);
        setMessage({
          type: 'success',
          text: `Generated ${data.hypothesesGenerated} hypotheses`,
        });
      } else {
        setMessage({ type: 'error', text: data.error || data.message || 'Failed to generate' });
      }
    } catch (error) {
      console.error('Failed to generate hypotheses:', error);
      setMessage({ type: 'error', text: 'Failed to generate hypotheses' });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateHypothesisStatus = async (hypothesisId: string, status: string) => {
    try {
      await fetch('/api/hypotheses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hypothesisId, status }),
      });

      setHypotheses(prev =>
        prev.map(h => h.id === hypothesisId ? { ...h, status } : h)
      );

      setMessage({ type: 'success', text: `Hypothesis marked as ${status}` });
    } catch (error) {
      console.error('Failed to update status:', error);
      setMessage({ type: 'error', text: 'Failed to update status' });
    }
  };

  const copyScript = () => {
    navigator.clipboard.writeText(interviewScript);
    setMessage({ type: 'success', text: 'Interview script copied to clipboard' });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (confidence >= 0.5) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-slate-600 bg-slate-50 border-slate-200';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'validated': return 'bg-emerald-100 text-emerald-700';
      case 'invalidated': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'opening': return 'bg-blue-100 text-blue-700';
      case 'discovery': return 'bg-purple-100 text-purple-700';
      case 'pain_point': return 'bg-rose-100 text-rose-700';
      case 'solution': return 'bg-emerald-100 text-emerald-700';
      case 'closing': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <Lightbulb className="w-10 h-10 text-amber-500" />
              Hypothesis Explorer
            </h1>
            <p className="text-slate-600 mt-2">Evidence-backed hypotheses and interview questions</p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedCohortId}
              onChange={(e) => {
                setSelectedCohortId(e.target.value);
                if (e.target.value) loadHypotheses(e.target.value);
              }}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500 min-w-[200px]"
            >
              <option value="">Select a cohort</option>
              {cohorts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.size} users)
                </option>
              ))}
            </select>

            <button
              onClick={() => generateHypotheses(false)}
              disabled={isGenerating || !selectedCohortId}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-lg hover:shadow-amber-500/30 transition-all font-semibold disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isGenerating ? 'Generating...' : 'Generate Hypotheses'}
            </button>
          </div>
        </div>

        {/* Message */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`p-4 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-slate-600 text-sm mb-1 font-medium">Total Hypotheses</div>
            <div className="text-3xl font-bold text-slate-900">{hypotheses.length}</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl p-5 shadow-sm">
            <div className="text-emerald-700 text-sm mb-1 font-medium">High Confidence (70%+)</div>
            <div className="text-3xl font-bold text-emerald-800">
              {hypotheses.filter(h => h.confidence >= 0.7).length}
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-5 shadow-sm">
            <div className="text-purple-700 text-sm mb-1 font-medium">Validated</div>
            <div className="text-3xl font-bold text-purple-800">
              {hypotheses.filter(h => h.status === 'validated').length}
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-5 shadow-sm">
            <div className="text-blue-700 text-sm mb-1 font-medium">Interview Questions</div>
            <div className="text-3xl font-bold text-blue-800">
              {hypotheses.reduce((sum, h) => sum + h.questions.length, 0)}
            </div>
          </div>
        </div>

        {/* Interview Script Section */}
        {interviewScript && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-slate-900">Generated Interview Script</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
                <button
                  onClick={() => setShowScript(!showScript)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200 transition-colors"
                >
                  {showScript ? 'Hide' : 'Show'} Script
                </button>
              </div>
            </div>

            <AnimatePresence>
              {showScript && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <pre className="bg-slate-50 p-4 rounded-xl text-sm text-slate-700 whitespace-pre-wrap font-mono border border-slate-200">
                    {interviewScript}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Hypotheses List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : hypotheses.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Lightbulb className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600 mb-4">No hypotheses generated yet.</p>
            <p className="text-slate-500 text-sm mb-6">
              Select a cohort and click "Generate Hypotheses" to create evidence-backed hypotheses.
            </p>
            {selectedCohortId && (
              <button
                onClick={() => generateHypotheses()}
                disabled={isGenerating}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold disabled:opacity-50"
              >
                {isGenerating ? 'Generating...' : 'Generate Now'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {hypotheses.map((hypothesis, idx) => (
              <motion.div
                key={hypothesis.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all"
              >
                <div
                  className="p-5 cursor-pointer"
                  onClick={() => setExpandedHypothesis(
                    expandedHypothesis === hypothesis.id ? null : hypothesis.id
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2.5 py-1 rounded-lg text-sm font-medium border ${getConfidenceColor(hypothesis.confidence)}`}>
                          {Math.round(hypothesis.confidence * 100)}% confidence
                        </span>
                        {hypothesis.behaviorPattern && (
                          <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm">
                            {hypothesis.behaviorPattern.replace('_', ' ')}
                          </span>
                        )}
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getStatusColor(hypothesis.status)}`}>
                          {hypothesis.status}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {hypothesis.title}
                      </h3>
                      <p className="text-slate-600 text-sm">
                        {hypothesis.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      {/* Validation buttons */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHypothesisStatus(hypothesis.id, 'validated');
                        }}
                        className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                        title="Mark as Validated"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHypothesisStatus(hypothesis.id, 'invalidated');
                        }}
                        className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                        title="Mark as Invalidated"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>

                      {expandedHypothesis === hypothesis.id ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Question count badge */}
                  <div className="flex items-center gap-2 mt-3">
                    <MessageSquare className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-500">
                      {hypothesis.questions.length} interview questions
                    </span>
                  </div>
                </div>

                {/* Expanded details */}
                <AnimatePresence>
                  {expandedHypothesis === hypothesis.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-slate-200 overflow-hidden"
                    >
                      <div className="p-5 bg-slate-50">
                        {/* Evidence */}
                        {hypothesis.evidence.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                              <Target className="w-4 h-4 text-purple-600" />
                              Evidence
                            </h4>
                            <ul className="space-y-1">
                              {hypothesis.evidence.map((ev, i) => (
                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                  <span className="text-purple-500">•</span>
                                  {ev}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Interview Questions */}
                        <div>
                          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-purple-600" />
                            Interview Questions
                          </h4>
                          <div className="space-y-2">
                            {hypothesis.questions
                              .sort((a, b) => b.priority - a.priority)
                              .map((q, i) => (
                                <div
                                  key={i}
                                  className="p-3 bg-white rounded-xl border border-slate-200"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                      <p className="text-slate-800 font-medium">{q.question}</p>
                                      {q.purpose && (
                                        <p className="text-sm text-slate-500 mt-1">
                                          Purpose: {q.purpose}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs px-2 py-1 rounded-lg ${getCategoryColor(q.category)}`}>
                                        {q.category?.replace('_', ' ') || 'general'}
                                      </span>
                                      <span className="text-xs text-slate-500">
                                        P{q.priority}
                                      </span>
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
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
