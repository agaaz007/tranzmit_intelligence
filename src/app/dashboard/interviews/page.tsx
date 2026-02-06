'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
    FolderPlus,
} from 'lucide-react';

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

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  const stats = {
    total: interviews.length,
    completed: interviews.filter(i => i.status === 'completed').length,
    scheduled: interviews.filter(i => i.status === 'scheduled').length,
    inProgress: interviews.filter(i => i.status === 'in_progress').length,
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[var(--muted-foreground)] text-sm mb-0.5">Tranzmit / Interviews</div>
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">Interviews</h1>
          </div>
        </div>
      </div>

      <div className="p-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-[var(--muted-foreground)] text-xs mb-1">Total</div>
            <div className="text-2xl font-semibold text-[var(--foreground)]">{stats.total}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-emerald-600 dark:text-emerald-400 text-xs mb-1">Completed</div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{stats.completed}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-amber-600 dark:text-amber-400 text-xs mb-1">Scheduled</div>
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{stats.scheduled}</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-blue-600 dark:text-blue-400 text-xs mb-1">In Progress</div>
            <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{stats.inProgress}</div>
          </div>
        </div>

        {/* Search and Actions */}
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
          <button className="px-4 py-2.5 text-sm font-medium text-white bg-[#1a56db] rounded-lg hover:bg-[#1e40af] transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Schedule Interview
          </button>
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
      </div>
    </div>
  );
}
