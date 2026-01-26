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
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#dcfce7] text-[#166534]">Completed</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#dbeafe] text-[#1e40af]">In Progress</span>;
      case 'scheduled':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#fef3c7] text-[#92400e]">Scheduled</span>;
      case 'failed':
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#fee2e2] text-[#991b1b]">Failed</span>;
      default:
        return <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#f3f4f6] text-[#6b7280]">Draft</span>;
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
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e5e5e5] px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[#999] text-sm mb-0.5">Tranzmit / Interviews</div>
            <h1 className="text-2xl font-semibold text-[#1a1a1a]">Interviews</h1>
          </div>
        </div>
      </div>

      <div className="p-8">
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
            <div className="text-[#999] text-xs mb-1">Total</div>
            <div className="text-2xl font-semibold text-[#1a1a1a]">{stats.total}</div>
          </div>
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
            <div className="text-[#166534] text-xs mb-1">Completed</div>
            <div className="text-2xl font-semibold text-[#166534]">{stats.completed}</div>
          </div>
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
            <div className="text-[#92400e] text-xs mb-1">Scheduled</div>
            <div className="text-2xl font-semibold text-[#92400e]">{stats.scheduled}</div>
          </div>
          <div className="bg-white border border-[#e5e5e5] rounded-xl p-4">
            <div className="text-[#1e40af] text-xs mb-1">In Progress</div>
            <div className="text-2xl font-semibold text-[#1e40af]">{stats.inProgress}</div>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]" />
              <input
                type="text"
                placeholder="Search interviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e5e5e5] rounded-lg text-sm focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db]"
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
                  : 'bg-white text-[#666] border border-[#e5e5e5] hover:border-[#1a56db] hover:text-[#1a56db]'
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
          <div className="text-center py-20 bg-white rounded-xl border border-[#e5e5e5]">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-[#d1d5db]" />
            <p className="text-[#666] mb-2">No interviews found</p>
            <p className="text-[#999] text-sm">Schedule your first interview to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {interviews.map(interview => (
              <motion.div
                key={interview.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-[#e5e5e5] rounded-xl p-5 hover:border-[#1a56db] hover:shadow-sm transition-all cursor-pointer group"
                whileHover={{ y: -2 }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                      <User className="w-4 h-4 text-[#666]" />
                    </div>
                    <div>
                      <span className="font-medium text-[#1a1a1a] text-sm">{interview.userName || interview.userId}</span>
                      {interview.userEmail && (
                        <p className="text-xs text-[#999]">{interview.userEmail}</p>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(interview.status)}
                </div>

                {interview.cohort && (
                  <div className="mb-3">
                    <span className="text-xs text-[#666] bg-[#f3f4f6] px-2 py-1 rounded">
                      {interview.cohort.name}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-[#f3f4f6]">
                  <div className="flex items-center gap-3">
                    {interview.scheduledAt && (
                      <div className="flex items-center gap-1 text-xs text-[#999]">
                        <Calendar className="w-3 h-3" />
                        {new Date(interview.scheduledAt).toLocaleDateString()}
                      </div>
                    )}
                    {interview.completedAt && (
                      <div className="flex items-center gap-1 text-xs text-[#166534]">
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
                    <button className="p-1.5 rounded-lg hover:bg-[#f5f5f5] text-[#999] opacity-0 group-hover:opacity-100 transition-opacity">
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
