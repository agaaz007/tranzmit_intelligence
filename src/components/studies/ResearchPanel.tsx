'use client';

import React, { useState, useEffect } from 'react';
import { Target, Users, MessageSquareMore, Ban, ChevronDown, ChevronRight, Trash2, Plus, Copy, GripVertical, Settings, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question } from '@/lib/studies/gemini';

interface CardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  isEmpty: boolean;
  action?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ title, icon: Icon, children, isEmpty, action }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
  >
    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
      <div className="flex items-center space-x-2">
        <Icon size={18} className="text-slate-400" />
        <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">{title}</h3>
      </div>
      {action}
    </div>
    <div className="p-5">
      {isEmpty ? (
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-slate-100 rounded w-3/4"></div>
          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
        </div>
      ) : (
        children
      )}
    </div>
  </motion.div>
);

interface QuestionCardProps {
  question: Question;
  index: number;
  onUpdate: (id: number, updates: Partial<Question>) => void;
  onDelete: (id: number) => void;
  onReprompt: (id: number, instructions: string) => Promise<void>;
}

const QuestionCard: React.FC<QuestionCardProps> = ({ question, index, onUpdate, onDelete, onReprompt }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReprompting, setIsReprompting] = useState(false);
  const [repromptInput, setRepromptInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Local state for form fields
  const [questionType, setQuestionType] = useState('open-ended');
  const [followUpMode, setFollowUpMode] = useState('if-short');
  const [inputType, setInputType] = useState('voice');
  const [editedText, setEditedText] = useState(question.text || '');
  const [guidelines, setGuidelines] = useState(
    (question.followUps || []).join('\n') || ''
  );

  const handleSave = () => {
    onUpdate(question.id, {
      text: editedText,
      followUps: guidelines.split('\n').filter(f => f.trim()),
      questionType,
      followUpMode,
      inputType
    });
  };

  const handleReprompt = async () => {
    if (!repromptInput.trim()) return;
    setIsLoading(true);
    try {
      await onReprompt(question.id, repromptInput);
      setRepromptInput('');
      setIsReprompting(false);
    } catch (error) {
      console.error('Reprompt failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(question.text || '');
  };

  // Update local state when question prop changes
  useEffect(() => {
    setEditedText(question.text || '');
    setGuidelines((question.followUps || []).join('\n') || '');
  }, [question.text, question.followUps]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="border border-slate-200 rounded-lg overflow-hidden bg-white"
    >
      {/* Collapsed Row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand Icon */}
        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        {/* Question Badge */}
        <span className="flex-shrink-0 px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded text-xs font-semibold">
          Q{index + 1}
        </span>

        {/* Question Text (truncated) */}
        <p className="flex-1 text-slate-700 text-sm truncate">
          {question.text}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onDelete(question.id)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
            title="Copy"
          >
            <Copy size={16} />
          </button>
          <button
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-grab"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 pt-2 border-t border-slate-100 space-y-4 bg-slate-50/50">
              {/* Question Type */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Question type</label>
                <select
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
                >
                  <option value="open-ended">Open-ended</option>
                  <option value="multiple-choice">Multiple choice</option>
                  <option value="rating">Rating scale</option>
                  <option value="yes-no">Yes/No</option>
                </select>
              </div>

              {/* Question Text */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Question</label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  onBlur={handleSave}
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                />
              </div>

              {/* Follow-up questions */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Follow-up questions</label>
                <select
                  value={followUpMode}
                  onChange={(e) => setFollowUpMode(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
                >
                  <option value="if-short">If short answer</option>
                  <option value="always">Always</option>
                  <option value="never">Never</option>
                </select>
              </div>

              {/* Preferred input type */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Preferred input type</label>
                <select
                  value={inputType}
                  onChange={(e) => setInputType(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
                >
                  <option value="voice">Default (voice)</option>
                  <option value="text">Text only</option>
                  <option value="video">Video response</option>
                </select>
              </div>

              {/* Guidelines for follow-up questions */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">Guidelines for follow-up questions</label>
                <textarea
                  value={guidelines}
                  onChange={(e) => setGuidelines(e.target.value)}
                  onBlur={handleSave}
                  placeholder="If they mention A, understand why."
                  className="w-full p-3 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={2}
                />
              </div>

              {/* AI Reprompt Section */}
              {!isReprompting ? (
                <button
                  onClick={() => setIsReprompting(true)}
                  className="flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 font-medium transition-colors"
                >
                  <Sparkles size={16} />
                  Regenerate with AI
                </button>
              ) : (
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-3">
                  <label className="text-xs font-semibold text-purple-600 uppercase block">
                    How should I improve this question?
                  </label>
                  <textarea
                    value={repromptInput}
                    onChange={(e) => setRepromptInput(e.target.value)}
                    className="w-full p-2 border border-purple-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    rows={2}
                    placeholder="e.g., Make it more specific, add emotional probes..."
                    disabled={isLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleReprompt}
                      disabled={isLoading || !repromptInput.trim()}
                      className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Regenerating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} /> Regenerate
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setRepromptInput('');
                        setIsReprompting(false);
                      }}
                      disabled={isLoading}
                      className="px-3 py-1.5 text-slate-600 text-sm font-medium hover:bg-slate-100 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface DiscussionGuideSectionProps {
  questions: Question[];
  onUpdateQuestion: (id: number, updates: Partial<Question>) => void;
  onDeleteQuestion: (id: number) => void;
  onRepromptQuestion: (id: number, instructions: string) => Promise<void>;
  onAddQuestion: () => void;
}

const DiscussionGuideSection: React.FC<DiscussionGuideSectionProps> = ({
  questions,
  onUpdateQuestion,
  onDeleteQuestion,
  onRepromptQuestion,
  onAddQuestion
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
    >
      {/* Section Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <button className="text-slate-400 hover:text-slate-600 cursor-grab">
            <GripVertical size={18} />
          </button>
          <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Discussion Guide</h3>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
            <Trash2 size={16} />
          </button>
          <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
            <Settings size={16} />
          </button>
          <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-grab">
            <GripVertical size={16} />
          </button>
        </div>
      </div>

      {/* Questions Count */}
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <span className="text-sm font-medium text-slate-600">Questions</span>
        <span className="ml-2 text-sm text-slate-400">{questions.length}</span>
      </div>

      {/* Questions List */}
      <div className="p-4 space-y-2">
        {questions.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <MessageSquareMore size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No questions yet. Add your first question below.</p>
          </div>
        ) : (
          questions.map((q, i) => (
            <QuestionCard
              key={q.id || i}
              question={q}
              index={i}
              onUpdate={onUpdateQuestion}
              onDelete={onDeleteQuestion}
              onReprompt={onRepromptQuestion}
            />
          ))
        )}

        {/* Add Question Button */}
        <button
          onClick={onAddQuestion}
          className="w-full py-3 border-2 border-dashed border-slate-200 rounded-lg text-sm font-medium text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors flex items-center justify-center gap-2 mt-3"
        >
          <Plus size={18} />
          Add Question
        </button>
      </div>
    </motion.div>
  );
};

export interface StudyState {
  objective: string;
  audience: string[];
  exclusions: string[];
  questions: Question[];
}

interface ResearchPanelProps {
  studyState: StudyState;
  onUpdateQuestion: (id: number, updates: Partial<Question>) => void;
  onDeleteQuestion: (id: number) => void;
  onRepromptQuestion: (id: number, instructions: string) => Promise<void>;
  onAddQuestion: () => void;
}

const ResearchPanel: React.FC<ResearchPanelProps> = ({
  studyState,
  onUpdateQuestion,
  onDeleteQuestion,
  onRepromptQuestion,
  onAddQuestion
}) => {
  const { objective, audience, exclusions, questions } = studyState;

  // Calculate progress roughly based on filled fields
  const getProgress = () => {
    let score = 0;
    if (objective) score += 25;
    if (audience.length) score += 25;
    if (exclusions.length) score += 25;
    if (questions.length) score += 25;
    return score;
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-800">Research Blueprint</h1>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            getProgress() < 100
              ? 'bg-amber-100 text-amber-700'
              : 'bg-green-100 text-green-700'
          }`}>
            {getProgress() < 100 ? "Drafting..." : "Ready to Launch"}
          </span>
        </div>
        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
          <motion.div
            className="bg-indigo-600 h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${getProgress()}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <Card title="Objective" icon={Target} isEmpty={!objective}>
          <p className="text-base font-medium text-slate-800 leading-relaxed">
            {objective}
          </p>
        </Card>

        <Card title="Audience & Panel" icon={Users} isEmpty={!audience.length && !exclusions.length}>
          <div className="space-y-4">
            {audience.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase mb-2 block">Target Segment</span>
                <div className="flex flex-wrap gap-2">
                  {audience.map((tag, i) => (
                    <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium border border-indigo-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {exclusions.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-red-400 uppercase mb-2 block mt-4">Exclusions</span>
                <div className="flex flex-wrap gap-2">
                  {exclusions.map((tag, i) => (
                    <div key={i} className="flex items-center space-x-1.5 text-red-600 bg-red-50 px-3 py-1.5 rounded-full text-sm font-medium border border-red-100">
                      <Ban size={14} />
                      <span>{tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <DiscussionGuideSection
          questions={questions}
          onUpdateQuestion={onUpdateQuestion}
          onDeleteQuestion={onDeleteQuestion}
          onRepromptQuestion={onRepromptQuestion}
          onAddQuestion={onAddQuestion}
        />
      </div>
    </div>
  );
};

export default ResearchPanel;
