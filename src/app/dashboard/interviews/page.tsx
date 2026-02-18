'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Calendar,
    User,
    MessageCircle,
    TrendingUp,
    CheckCircle,
    Loader2,
    Plus,
    Search,
    MoreHorizontal,
    Upload,
    FileText,
    X,
    Eye,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    Lightbulb,
    Quote,
    Target,
    BarChart3,
    Phone,
    Clock,
} from 'lucide-react';
import { parseHTMLReport, type ParsedReport, type ParsedIssue } from '@/lib/report-parser';

interface Interview {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  status: string;
  scheduledAt?: string;
  completedAt?: string;
  cohort?: { id: string; name: string };
  campaign?: { id: string; name: string };
  insights: Array<{
    sentiment?: string;
    satisfaction?: number;
  }>;
}

interface UploadedReport {
  id: string;
  name: string;
  htmlContent: string;
  uploadedAt: string;
  parsed: ParsedReport;
}

interface Conversation {
  id: string;
  participantName: string;
  status: string;
  duration: number;
  analysisStatus: string;
  metadata?: {
    call_number?: number;
    user_type?: string;
    conditions?: string[];
  };
  analysis?: {
    summary: string;
    sentiment: string;
    pain_points: string[];
    feature_requests: string[];
    key_quotes: string[];
    churn_status: 'churned' | 'active';
    winback_outcome?: 'accepted' | 'declined';
  };
  transcript?: Array<{ role: 'agent' | 'user'; message: string }>;
  conversedAt: string;
}

export default function InterviewsPage() {
  const searchParams = useSearchParams();
  const conversationIdParam = searchParams.get('conversationId');

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadedReports, setUploadedReports] = useState<UploadedReport[]>([]);
  const [viewingReport, setViewingReport] = useState<UploadedReport | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'interviews' | 'conversations'>('dashboard');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

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
        loadInterviews(currentProjectId);
      } else {
        setIsLoading(false);
      }
    };

    initializeProject();
  }, []);

  // Load conversations when project is set
  useEffect(() => {
    if (!projectId) return;

    const loadConversations = async () => {
      setIsLoadingConversations(true);
      try {
        const response = await fetch(`/api/conversations?projectId=${projectId}`);
        const data = await response.json();
        setConversations(data.conversations || []);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      } finally {
        setIsLoadingConversations(false);
      }
    };

    loadConversations();
  }, [projectId]);

  // Handle conversationId URL parameter - auto-open the conversation
  useEffect(() => {
    if (!conversationIdParam) return;

    // Switch to conversations tab
    setActiveTab('conversations');

    const loadConversationFromParam = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationIdParam}`);
        if (response.ok) {
          const { conversation } = await response.json();
          if (conversation) {
            setSelectedConversation(conversation);
          }
        }
      } catch (error) {
        console.error('Failed to load conversation from URL param:', error);
      }
    };

    loadConversationFromParam();
  }, [conversationIdParam]);

  const loadInterviews = async (projId: string, status?: string) => {
    setIsLoading(true);
    try {
      const url = `/api/interviews?projectId=${projId}${status && status !== 'all' ? `&status=${status}` : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      setInterviews(data.interviews || []);
    } catch (error) {
      console.error('Failed to load interviews:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    loadInterviews(projectId, status);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">Completed</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">In Progress</span>;
      case 'scheduled':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">Scheduled</span>;
      case 'failed':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">Failed</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[var(--muted)] text-[var(--muted-foreground)]">Draft</span>;
    }
  };

  const getSentimentEmoji = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      case 'neutral': return '😐';
      case 'mixed': return '🤔';
      default: return null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.html')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const htmlContent = event.target?.result as string;
      const parsed = parseHTMLReport(htmlContent);
      const newReport: UploadedReport = {
        id: crypto.randomUUID(),
        name: file.name,
        htmlContent,
        uploadedAt: new Date().toISOString(),
        parsed,
      };
      setUploadedReports(prev => [newReport, ...prev]);
      setActiveTab('dashboard');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Aggregate all parsed data across uploaded reports
  const aggregatedIssues: ParsedIssue[] = uploadedReports
    .flatMap(r => r.parsed.issues)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const aggregatedVerbatims = aggregatedIssues.flatMap(i => i.verbatims);
  const aggregatedRecommendations = uploadedReports.flatMap(r => r.parsed.recommendations);
  const aggregatedKpis = uploadedReports.flatMap(r => r.parsed.kpis);

  const totalIssues = aggregatedIssues.length;
  const totalVerbatims = aggregatedVerbatims.length;
  const avgSentiment = aggregatedIssues.length > 0
    ? aggregatedIssues.reduce((s, i) => s + i.sentiment, 0) / aggregatedIssues.length
    : 0;
  const topPriority = aggregatedIssues.length > 0 ? aggregatedIssues[0].priorityScore : 0;

  const interviewStats = {
    total: interviews.length,
    completed: interviews.filter(i => i.status === 'completed').length,
    scheduled: interviews.filter(i => i.status === 'scheduled').length,
    inProgress: interviews.filter(i => i.status === 'in_progress').length,
  };

  const getPriorityColor = (score: number) => {
    if (score >= 70) return 'text-red-600 dark:text-red-400';
    if (score >= 40) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  const getPriorityBg = (score: number) => {
    if (score >= 70) return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    if (score >= 40) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
  };

  const getPriorityIcon = (score: number) => {
    if (score >= 70) return '🔴';
    if (score >= 40) return '🟠';
    return '🟡';
  };

  const getInsightTypeBadge = (type: string) => {
    switch (type) {
      case 'pain':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 uppercase tracking-wide">Pain Point</span>;
      case 'gap':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 uppercase tracking-wide">Opportunity</span>;
      case 'behavior':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Behavior</span>;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[var(--muted-foreground)] text-sm mb-0.5">Tranzmit / Voice of Customer</div>
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">Voice of Customer</h1>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".html"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 text-sm font-medium text-[var(--foreground)] bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[#1a56db] hover:text-[#1a56db] transition-colors flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload HTML Report
            </button>
            <button className="px-4 py-2.5 text-sm font-medium text-white bg-[#1a56db] rounded-lg hover:bg-[#1e40af] transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Schedule Interview
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 mt-4">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'dashboard'
                ? 'bg-[#1a56db] text-white'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <span className="flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Insights Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('conversations')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'conversations'
                ? 'bg-[#1a56db] text-white'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <span className="flex items-center gap-2"><Phone className="w-4 h-4" /> Conversations {conversations.length > 0 && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-white/20">{conversations.length}</span>}</span>
          </button>
          <button
            onClick={() => setActiveTab('interviews')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'interviews'
                ? 'bg-[#1a56db] text-white'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Interviews</span>
          </button>
        </div>
      </div>

      <div className="p-8">
        {activeTab === 'dashboard' ? (
          <>
            {/* Dashboard Stats Row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-[var(--muted-foreground)] text-xs mb-1">Issues Detected</div>
                <div className="text-2xl font-semibold text-[var(--foreground)]">{totalIssues}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-[var(--muted-foreground)] text-xs mb-1">Customer Verbatims</div>
                <div className="text-2xl font-semibold text-[#1a56db]">{totalVerbatims}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-[var(--muted-foreground)] text-xs mb-1">Avg. Sentiment</div>
                <div className={`text-2xl font-semibold ${avgSentiment < -0.3 ? 'text-red-600 dark:text-red-400' : avgSentiment < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {avgSentiment.toFixed(2)}
                </div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-[var(--muted-foreground)] text-xs mb-1">Top Priority Score</div>
                <div className={`text-2xl font-semibold ${getPriorityColor(topPriority)}`}>{topPriority}</div>
              </div>
            </div>

            {uploadedReports.length === 0 ? (
              <div className="text-center py-20 bg-[var(--card)] rounded-xl border border-[var(--border)]">
                <Upload className="w-12 h-12 mx-auto mb-4 text-[var(--muted-foreground)]" />
                <p className="text-[var(--foreground)] font-medium mb-2">No reports uploaded yet</p>
                <p className="text-[var(--muted-foreground)] text-sm mb-6">Upload an HTML report to see parsed customer insights here.</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#1a56db] rounded-lg hover:bg-[#1e40af] transition-colors inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Your First Report
                </button>
              </div>
            ) : (
              <>
                {/* KPI Badges */}
                {aggregatedKpis.length > 0 && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {aggregatedKpis.map((kpi, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border p-4 ${
                          kpi.type === 'risk' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' :
                          kpi.type === 'positive' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' :
                          'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                          kpi.type === 'risk' ? 'text-red-600 dark:text-red-400' :
                          kpi.type === 'positive' ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-amber-600 dark:text-amber-400'
                        }`}>
                          {kpi.label}
                        </div>
                        <div className="text-sm font-medium text-[var(--foreground)]">{kpi.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Executive Summary */}
                {uploadedReports[0]?.parsed.executiveSummary && (
                  <div className="bg-[#0F172A] rounded-xl p-6 mb-6 text-white">
                    <div className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2 flex items-center gap-2">
                      <Lightbulb className="w-3.5 h-3.5" /> Executive Summary
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {uploadedReports[0].parsed.executiveSummary}
                    </p>
                  </div>
                )}

                {/* Prioritized Issues Table */}
                <div className="mb-8">
                  <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#1a56db]" /> Prioritized Issues
                  </h2>
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                    {/* Table Header */}
                    <div className="grid grid-cols-[50px_1fr_120px_100px_100px] gap-4 px-5 py-3 bg-[var(--muted)] text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide border-b border-[var(--border)]">
                      <div>Priority</div>
                      <div>Issue</div>
                      <div>Category</div>
                      <div>Verbatims</div>
                      <div>Sentiment</div>
                    </div>

                    {/* Issue Rows */}
                    {aggregatedIssues.map((issue, idx) => (
                      <div key={issue.id}>
                        <button
                          onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                          className="w-full grid grid-cols-[50px_1fr_120px_100px_100px] gap-4 px-5 py-4 text-left hover:bg-[var(--muted)] transition-colors border-b border-[var(--border)] items-center"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{getPriorityIcon(issue.priorityScore)}</span>
                            <span className={`text-xs font-bold ${getPriorityColor(issue.priorityScore)}`}>{issue.priorityScore}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--foreground)]">{issue.title}</span>
                            {expandedIssue === issue.id ? (
                              <ChevronUp className="w-4 h-4 text-[var(--muted-foreground)]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                            )}
                          </div>
                          <div>
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                              {issue.category}
                            </span>
                          </div>
                          <div className="text-sm text-[var(--foreground)]">{issue.verbatims.length}</div>
                          <div className={`text-sm font-medium ${issue.sentiment < -0.3 ? 'text-red-600 dark:text-red-400' : issue.sentiment < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {issue.sentiment.toFixed(2)}
                          </div>
                        </button>

                        {/* Expanded Issue Panel */}
                        <AnimatePresence>
                          {expandedIssue === issue.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden border-b border-[var(--border)]"
                            >
                              <div className="px-6 py-5 bg-[var(--muted)]/30">
                                {/* Verbatims */}
                                {issue.verbatims.length > 0 && (
                                  <div className="mb-5">
                                    <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                      <Quote className="w-3.5 h-3.5" /> What customers are saying
                                    </h4>
                                    <div className="space-y-3">
                                      {issue.verbatims.map((v, vIdx) => (
                                        <div key={vIdx} className="bg-[var(--card)] border-l-4 border-[#1a56db] rounded-r-lg p-4">
                                          <p className="text-sm text-[var(--foreground)] italic leading-relaxed">&ldquo;{v.text}&rdquo;</p>
                                          {v.context && (
                                            <p className="text-xs text-[var(--muted-foreground)] mt-2">{v.context}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Insight Cards */}
                                {issue.insights.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                      <Lightbulb className="w-3.5 h-3.5" /> Analysis
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {issue.insights.map((insight, iIdx) => (
                                        <div
                                          key={iIdx}
                                          className={`rounded-lg border p-4 ${
                                            insight.type === 'pain' ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' :
                                            insight.type === 'gap' ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10' :
                                            'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 mb-2">
                                            {getInsightTypeBadge(insight.type)}
                                            <span className="text-[10px] text-[var(--muted-foreground)]">{insight.label}</span>
                                          </div>
                                          <h5 className="text-sm font-semibold text-[var(--foreground)] mb-1">{insight.title}</h5>
                                          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{insight.body}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommendations */}
                {aggregatedRecommendations.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" /> Strategic Recommendations
                    </h2>
                    <div className="space-y-3">
                      {aggregatedRecommendations.map((rec, idx) => (
                        <div key={idx} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#1a56db] text-white text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                            {rec.title}
                          </h3>
                          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed pl-8">{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Uploaded Reports List */}
                <div>
                  <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--muted-foreground)]" /> Source Reports
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {uploadedReports.map(report => (
                      <div
                        key={report.id}
                        className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[#1a56db] hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-[#1a56db]" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-[var(--foreground)] text-sm truncate">{report.name}</p>
                              <p className="text-[11px] text-[var(--muted-foreground)]">
                                {report.parsed.issues.length} issues &middot; {report.parsed.totalVerbatims} verbatims
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setUploadedReports(prev => prev.filter(r => r.id !== report.id))}
                            className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-[var(--muted-foreground)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          onClick={() => setViewingReport(report)}
                          className="w-full mt-1 px-3 py-1.5 text-xs font-medium text-[#1a56db] bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Original
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        ) : activeTab === 'conversations' ? (
          /* Conversations Tab - Qualitative Research Transcripts */
          <>
            {selectedConversation ? (
              /* Full Transcript View */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Transcript */}
                <div className="lg:col-span-2">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        <Phone className="w-5 h-5 text-[#1a56db]" />
                        <div>
                          <h3 className="font-semibold text-[var(--foreground)]">{selectedConversation.participantName}</h3>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {selectedConversation.metadata?.user_type || 'Interview'} &middot; {Math.floor(selectedConversation.duration / 60)}m {selectedConversation.duration % 60}s
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedConversation(null)}
                        className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-6 max-h-[600px] overflow-y-auto">
                      <div className="space-y-4">
                        {selectedConversation.transcript?.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                              msg.role === 'agent'
                                ? 'bg-[var(--muted)] text-[var(--foreground)]'
                                : 'bg-[#1a56db] text-white'
                            }`}>
                              <p className="text-xs font-semibold mb-1 opacity-70">
                                {msg.role === 'agent' ? 'Maya (Researcher)' : 'User'}
                              </p>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Analysis Sidebar */}
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
                    <h4 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">Summary</h4>
                    <p className="text-sm text-[var(--foreground)] leading-relaxed">{selectedConversation.analysis?.summary}</p>
                    <div className="flex items-center gap-2 mt-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        selectedConversation.analysis?.churn_status === 'churned'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {selectedConversation.analysis?.churn_status === 'churned' ? 'Churned' : 'Active'}
                      </span>
                      {selectedConversation.analysis?.winback_outcome && (
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          selectedConversation.analysis.winback_outcome === 'accepted'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}>
                          Win-back: {selectedConversation.analysis.winback_outcome}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pain Points */}
                  {selectedConversation.analysis?.pain_points && selectedConversation.analysis.pain_points.length > 0 && (
                    <div className="bg-[var(--card)] border border-red-200 dark:border-red-800 rounded-xl p-5">
                      <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Pain Points
                      </h4>
                      <ul className="space-y-2">
                        {selectedConversation.analysis.pain_points.map((point, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Key Quotes */}
                  {selectedConversation.analysis?.key_quotes && selectedConversation.analysis.key_quotes.length > 0 && (
                    <div className="bg-[var(--card)] border border-[#1a56db]/20 rounded-xl p-5">
                      <h4 className="text-xs font-semibold text-[#1a56db] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Quote className="w-3.5 h-3.5" /> Key Quotes
                      </h4>
                      <div className="space-y-3">
                        {selectedConversation.analysis.key_quotes.map((quote, i) => (
                          <blockquote key={i} className="border-l-2 border-[#1a56db] pl-3 italic text-sm text-[var(--muted-foreground)]">
                            &ldquo;{quote}&rdquo;
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feature Requests */}
                  {selectedConversation.analysis?.feature_requests && selectedConversation.analysis.feature_requests.length > 0 && (
                    <div className="bg-[var(--card)] border border-emerald-200 dark:border-emerald-800 rounded-xl p-5">
                      <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Lightbulb className="w-3.5 h-3.5" /> Feature Requests
                      </h4>
                      <ul className="space-y-2">
                        {selectedConversation.analysis.feature_requests.map((fr, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-[var(--foreground)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                            {fr}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Conversations List */
              <>
                {isLoadingConversations ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-[#1a56db]" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-20 bg-[var(--card)] rounded-xl border border-[var(--border)]">
                    <Phone className="w-12 h-12 mx-auto mb-4 text-[var(--muted-foreground)]" />
                    <p className="text-[var(--foreground)] font-medium mb-2">No conversations yet</p>
                    <p className="text-[var(--muted-foreground)] text-sm">Conversations from voice research calls will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conversations.map(convo => (
                      <button
                        key={convo.id}
                        onClick={async () => {
                          const response = await fetch(`/api/conversations/${convo.id}`);
                          if (response.ok) {
                            const { conversation } = await response.json();
                            setSelectedConversation(conversation);
                          }
                        }}
                        className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[#1a56db] hover:shadow-sm transition-all text-left group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center shrink-0">
                              <Phone className="w-5 h-5 text-[var(--muted-foreground)]" />
                            </div>
                            <div>
                              <h3 className="font-medium text-[var(--foreground)] group-hover:text-[#1a56db] transition-colors">
                                {convo.participantName}
                              </h3>
                              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                {convo.metadata?.user_type || 'Interview'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                              <Clock className="w-3.5 h-3.5" />
                              {Math.floor(convo.duration / 60)}m
                            </div>
                            <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[#1a56db] transition-colors" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          /* Interviews Tab */
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-[var(--muted-foreground)] text-xs mb-1">Total</div>
                <div className="text-2xl font-semibold text-[var(--foreground)]">{interviewStats.total}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-emerald-600 dark:text-emerald-400 text-xs mb-1">Completed</div>
                <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{interviewStats.completed}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-amber-600 dark:text-amber-400 text-xs mb-1">Scheduled</div>
                <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{interviewStats.scheduled}</div>
              </div>
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">In Progress</div>
                <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{interviewStats.inProgress}</div>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3 flex-1 max-w-xl">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    placeholder="Search interviews..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db]"
                  />
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6">
              {['all', 'scheduled', 'in_progress', 'completed', 'failed'].map(status => (
                <button
                  key={status}
                  onClick={() => handleStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    statusFilter === status
                      ? 'bg-[#1a56db] text-white'
                      : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] hover:border-[#1a56db] hover:text-[#1a56db]'
                  }`}
                >
                  {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>

            {/* Interviews Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#1a56db]" />
              </div>
            ) : interviews.length === 0 ? (
              <div className="text-center py-20 bg-[var(--card)] rounded-xl border border-[var(--border)]">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 text-[var(--muted-foreground)]" />
                <p className="text-[var(--muted-foreground)] mb-2">No interviews found</p>
                <p className="text-[var(--muted-foreground)] text-sm">Schedule your first interview to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {interviews.map(interview => (
                  <motion.div
                    key={interview.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[#1a56db] hover:shadow-sm transition-all cursor-pointer group"
                    whileHover={{ y: -2 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                          <User className="w-4 h-4 text-[var(--muted-foreground)]" />
                        </div>
                        <div>
                          <span className="font-medium text-[var(--foreground)] text-sm">{interview.userName || interview.userId}</span>
                          {interview.userEmail && (
                            <p className="text-xs text-[var(--muted-foreground)]">{interview.userEmail}</p>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(interview.status)}
                    </div>

                    {interview.cohort && (
                      <div className="mb-3">
                        <span className="text-xs text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-1 rounded">
                          {interview.cohort.name}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                      <div className="flex items-center gap-3">
                        {interview.scheduledAt && (
                          <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                            <Calendar className="w-3 h-3" />
                            {new Date(interview.scheduledAt).toLocaleDateString()}
                          </div>
                        )}
                        {interview.completedAt && (
                          <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="w-3 h-3" />
                            Done
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {interview.insights.length > 0 && interview.insights[0].sentiment && (
                          <span className="text-base">{getSentimentEmoji(interview.insights[0].sentiment)}</span>
                        )}
                        {interview.insights.length > 0 && interview.insights[0].satisfaction && (
                          <div className="flex items-center gap-1 text-xs text-[#1a56db] font-medium">
                            <TrendingUp className="w-3 h-3" />
                            {interview.insights[0].satisfaction.toFixed(1)}
                          </div>
                        )}
                        <button className="p-1.5 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Report Viewer Modal */}
      <AnimatePresence>
        {viewingReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setViewingReport(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#1a56db]" />
                  <span className="font-semibold text-gray-900">{viewingReport.name}</span>
                </div>
                <button
                  onClick={() => setViewingReport(null)}
                  className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <iframe
                  srcDoc={viewingReport.htmlContent}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title={viewingReport.name}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
