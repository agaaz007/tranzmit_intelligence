'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, User, MessageCircle, TrendingUp, Clock, CheckCircle, Loader2, Plus } from 'lucide-react';

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
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const initializeProject = async () => {
      let currentProjectId = localStorage.getItem('currentProjectId');

      // If no project in localStorage, try to fetch and auto-select one
      if (!currentProjectId) {
        try {
          const response = await fetch('/api/projects');
          const data = await response.json();
          if (data.projects && data.projects.length > 0) {
            currentProjectId = data.projects[0].id;
            localStorage.setItem('currentProjectId', currentProjectId as string);
            console.log('Auto-selected project:', currentProjectId);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 border-green-300';
      case 'in_progress': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'scheduled': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'failed': return 'bg-red-100 text-red-700 border-red-300';
      case 'cancelled': return 'bg-slate-100 text-slate-700 border-slate-300';
      default: return 'bg-slate-100 text-slate-600 border-slate-300';
    }
  };

  const getSentimentEmoji = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      case 'neutral': return '😐';
      case 'mixed': return '🤔';
      default: return '—';
    }
  };

  const stats = {
    total: interviews.length,
    completed: interviews.filter(i => i.status === 'completed').length,
    scheduled: interviews.filter(i => i.status === 'scheduled').length,
    inProgress: interviews.filter(i => i.status === 'in_progress').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">User Interviews</h1>
            <p className="text-slate-600 mt-2">Manage and analyze user feedback sessions</p>
          </div>
          <button className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-600 to-pink-600 text-white rounded-2xl hover:shadow-lg hover:shadow-orange-500/30 transition-all font-semibold">
            <Plus className="w-4 h-4" />
            Schedule Interview
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-slate-600 text-sm mb-1 font-medium">Total</div>
            <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 shadow-sm">
            <div className="text-green-700 text-sm mb-1 font-medium">Completed</div>
            <div className="text-3xl font-bold text-green-800">{stats.completed}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 shadow-sm">
            <div className="text-amber-700 text-sm mb-1 font-medium">Scheduled</div>
            <div className="text-3xl font-bold text-amber-800">{stats.scheduled}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-5 shadow-sm">
            <div className="text-blue-700 text-sm mb-1 font-medium">In Progress</div>
            <div className="text-3xl font-bold text-blue-800">{stats.inProgress}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {['all', 'scheduled', 'in_progress', 'completed', 'failed'].map(status => (
            <button
              key={status}
              onClick={() => handleStatusFilter(status)}
              className={`px-4 py-2 rounded-xl capitalize text-sm font-medium transition-all ${
                statusFilter === status
                  ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-md'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Interviews List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : interviews.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-600">No interviews found. Schedule your first interview to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {interviews.map(interview => (
              <motion.div
                key={interview.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer"
                onClick={() => setSelectedInterview(interview)}
                whileHover={{ y: -4 }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-600" />
                    <span className="font-semibold text-slate-900">{interview.userName || interview.userId}</span>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-xs border font-medium ${getStatusColor(interview.status)}`}>
                    {interview.status}
                  </span>
                </div>

                {interview.userEmail && (
                  <p className="text-sm text-slate-600 mb-3">{interview.userEmail}</p>
                )}

                {interview.cohort && (
                  <div className="text-xs text-slate-600 mb-2 bg-blue-50 px-2 py-1 rounded-lg inline-block border border-blue-200">
                    Cohort: {interview.cohort.name}
                  </div>
                )}

                {interview.campaign && (
                  <div className="text-xs text-slate-600 mb-2 bg-purple-50 px-2 py-1 rounded-lg inline-block border border-purple-200">
                    Campaign: {interview.campaign.name}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                  {interview.scheduledAt && (
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <Calendar className="w-3 h-3" />
                      {new Date(interview.scheduledAt).toLocaleDateString()}
                    </div>
                  )}

                  {interview.completedAt && (
                    <div className="flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle className="w-3 h-3" />
                      {new Date(interview.completedAt).toLocaleDateString()}
                    </div>
                  )}

                  {interview.insights.length > 0 && interview.insights[0].sentiment && (
                    <div className="text-lg">
                      {getSentimentEmoji(interview.insights[0].sentiment)}
                    </div>
                  )}

                  {interview.insights.length > 0 && interview.insights[0].satisfaction && (
                    <div className="flex items-center gap-1 text-xs text-orange-700 font-semibold">
                      <TrendingUp className="w-3 h-3" />
                      {interview.insights[0].satisfaction.toFixed(1)}/10
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
