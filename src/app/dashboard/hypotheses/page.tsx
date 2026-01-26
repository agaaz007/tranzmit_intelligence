'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  PenLine,
  ArrowRight,
  Upload,
  Target,
  Users,
  MessageCircle,
  ChevronRight,
  Loader2,
  Check,
} from 'lucide-react';

type StudyMode = null | 'ai' | 'manual';
type ConversationStep = 'initial' | 'goals' | 'audience' | 'questions' | 'complete';

interface Message {
  id: string;
  type: 'assistant' | 'user' | 'action';
  content: string;
  actions?: string[];
}

interface StudyData {
  title: string;
  goals: string[];
  audience: string;
  questions: string[];
}

export default function HypothesesPage() {
  const [mode, setMode] = useState<StudyMode>(null);
  const [step, setStep] = useState<ConversationStep>('initial');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [studyData, setStudyData] = useState<StudyData>({
    title: '',
    goals: [],
    audience: '',
    questions: [],
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (msg: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() }]);
  };

  const startAIMode = () => {
    setMode('ai');
    setStep('initial');
    addMessage({
      type: 'assistant',
      content: "Tell me about your study. What are you trying to learn or understand?",
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleUserInput = async () => {
    if (!inputValue.trim() || isThinking) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    addMessage({ type: 'user', content: userMessage });
    setIsThinking(true);

    // Simulate AI processing
    await new Promise(r => setTimeout(r, 800 + Math.random() * 800));

    if (step === 'initial') {
      // Parse initial input to extract study context
      setStudyData(prev => ({ ...prev, title: userMessage.slice(0, 60) }));
      
      addMessage({ type: 'action', content: 'Updated study title' });
      
      await new Promise(r => setTimeout(r, 400));
      
      addMessage({
        type: 'assistant',
        content: `Great! I'll help you create a study about "${userMessage.slice(0, 40)}${userMessage.length > 40 ? '...' : ''}".\n\nWhat specific questions are you hoping to answer? What decisions will this research inform?`,
      });
      setStep('goals');
    } else if (step === 'goals') {
      const goals = userMessage.split(/[,\n]/).filter(g => g.trim()).map(g => g.trim());
      setStudyData(prev => ({ ...prev, goals }));
      
      addMessage({ type: 'action', content: `Added ${goals.length} study goal${goals.length > 1 ? 's' : ''}` });
      
      await new Promise(r => setTimeout(r, 400));
      
      addMessage({
        type: 'assistant',
        content: "Who should we talk to? Describe your ideal participants (e.g., 'new users who signed up in the last week', 'power users who use the app daily').",
      });
      setStep('audience');
    } else if (step === 'audience') {
      setStudyData(prev => ({ ...prev, audience: userMessage }));
      
      addMessage({ type: 'action', content: 'Defined target audience' });
      
      await new Promise(r => setTimeout(r, 400));
      
      addMessage({
        type: 'assistant',
        content: "Perfect! Any specific topics or questions you definitely want to cover? Or should I generate questions based on your goals?",
      });
      setStep('questions');
    } else if (step === 'questions') {
      const hasQuestions = userMessage.toLowerCase() !== 'generate' && 
                          !userMessage.toLowerCase().includes('generate questions');
      
      if (hasQuestions) {
        const questions = userMessage.split(/[?\n]/).filter(q => q.trim()).map(q => q.trim() + (q.includes('?') ? '' : '?'));
        setStudyData(prev => ({ ...prev, questions }));
        addMessage({ type: 'action', content: `Added ${questions.length} custom question${questions.length > 1 ? 's' : ''}` });
      } else {
        // Generate questions based on goals
        const generatedQuestions = [
          `What motivated you to ${studyData.title.toLowerCase().includes('feedback') ? 'share feedback' : 'try this'}?`,
          "Walk me through your typical experience.",
          "What's the most frustrating part?",
          "What would make this significantly better for you?",
        ];
        setStudyData(prev => ({ ...prev, questions: generatedQuestions }));
        addMessage({ type: 'action', content: 'Generated 4 interview questions' });
      }
      
      await new Promise(r => setTimeout(r, 400));
      
      addMessage({
        type: 'assistant',
        content: "Your study is ready! Review the summary below and click 'Create Study' when you're happy with it.",
      });
      setStep('complete');
    }

    setIsThinking(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleUserInput();
    }
  };

  const resetStudy = () => {
    setMode(null);
    setStep('initial');
    setMessages([]);
    setStudyData({ title: '', goals: [], audience: '', questions: [] });
    setInputValue('');
  };

  // Landing view - choose mode
  if (!mode) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div>
              <h1 className="text-3xl font-semibold text-[#1a1a1a] tracking-tight">
                Create a new study
              </h1>
              <p className="text-[#666] mt-2 text-lg">
                Design interview questions and hypotheses to validate
              </p>
            </div>

            {/* Main input area - decorative */}
            <div className="relative">
              <div className="bg-white rounded-3xl border border-[#e5e5e5] p-6 shadow-sm">
                <div className="text-[#999] text-lg">
                  Describe your research goals...
                </div>
                <div className="h-20"></div>
                <div className="absolute bottom-6 right-6">
                  <div className="w-10 h-10 rounded-full bg-[#1a1a1a] flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center gap-4">
              <button
                onClick={startAIMode}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-[#e5e5e5] rounded-full text-[#1a1a1a] font-medium hover:border-[#1a56db] hover:text-[#1a56db] transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Generate with AI
              </button>
              <button
                onClick={() => setMode('manual')}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-[#e5e5e5] rounded-full text-[#1a1a1a] font-medium hover:border-[#1a56db] hover:text-[#1a56db] transition-colors"
              >
                <PenLine className="w-4 h-4" />
                Create manually
              </button>
            </div>

            {/* Templates */}
            <div>
              <p className="text-[#999] text-sm mb-4">or select a template...</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Target, label: 'User Research', title: 'Product Discovery', desc: 'Understand user needs and pain points' },
                  { icon: MessageCircle, label: 'Feedback', title: 'Feature Feedback', desc: 'Gather feedback on a specific feature' },
                  { icon: Users, label: 'Onboarding', title: 'Onboarding Study', desc: 'Improve new user experience' },
                  { icon: Upload, label: 'Churn', title: 'Churn Analysis', desc: 'Understand why users leave' },
                ].map((template, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => {
                      setStudyData(prev => ({ ...prev, title: template.title }));
                      startAIMode();
                    }}
                    className="group bg-white border border-[#e5e5e5] rounded-2xl p-5 text-left hover:border-[#ccc] transition-colors"
                  >
                    <div className="flex items-center gap-2 text-[#999] text-sm mb-2">
                      <template.icon className="w-4 h-4" />
                      {template.label}
                    </div>
                    <div className="font-semibold text-[#1a1a1a] mb-1">{template.title}</div>
                    <div className="text-sm text-[#666]">{template.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Manual mode - simple form
  if (mode === 'manual') {
    return (
      <div className="min-h-screen bg-[#fafafa] p-8">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={resetStudy}
            className="text-[#666] hover:text-[#1a1a1a] mb-8 flex items-center gap-1"
          >
            ← Back
          </button>
          
          <h1 className="text-2xl font-semibold text-[#1a1a1a] mb-8">Create study manually</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Study Title</label>
              <input
                type="text"
                value={studyData.title}
                onChange={(e) => setStudyData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Onboarding Experience Research"
                className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-xl focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db]"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Study Goals</label>
              <textarea
                value={studyData.goals.join('\n')}
                onChange={(e) => setStudyData(prev => ({ ...prev, goals: e.target.value.split('\n').filter(g => g.trim()) }))}
                placeholder="Enter each goal on a new line..."
                rows={4}
                className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-xl focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db] resize-none"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Target Audience</label>
              <input
                type="text"
                value={studyData.audience}
                onChange={(e) => setStudyData(prev => ({ ...prev, audience: e.target.value }))}
                placeholder="e.g., New users who signed up in the last 7 days"
                className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-xl focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db]"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Interview Questions</label>
              <textarea
                value={studyData.questions.join('\n')}
                onChange={(e) => setStudyData(prev => ({ ...prev, questions: e.target.value.split('\n').filter(q => q.trim()) }))}
                placeholder="Enter each question on a new line..."
                rows={6}
                className="w-full px-4 py-3 bg-white border border-[#e5e5e5] rounded-xl focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db] resize-none"
              />
            </div>
            
            <button
              disabled={!studyData.title || studyData.goals.length === 0}
              className="w-full py-3 bg-[#1a56db] text-white rounded-xl font-medium hover:bg-[#1e40af] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Study
            </button>
          </div>
        </div>
      </div>
    );
  }

  // AI conversational mode
  return (
    <div className="min-h-screen bg-[#fafafa] flex">
      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-3xl mx-auto">
        {/* Header */}
        <div className="p-6 border-b border-[#e5e5e5]">
          <button
            onClick={resetStudy}
            className="text-[#666] hover:text-[#1a1a1a] flex items-center gap-1 text-sm"
          >
            ← Back to options
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`${msg.type === 'user' ? 'flex justify-end' : ''}`}
              >
                {msg.type === 'action' ? (
                  <div className="flex items-center gap-2 text-[#22c55e] text-sm py-2">
                    <div className="flex items-center gap-1">
                      <span className="inline-block w-1 h-1 bg-[#22c55e] rounded-full animate-pulse"></span>
                      <span className="inline-block w-1 h-1 bg-[#22c55e] rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                    </div>
                    {msg.content}
                  </div>
                ) : msg.type === 'user' ? (
                  <div className="bg-[#1a1a1a] text-white px-4 py-3 rounded-2xl rounded-br-md max-w-md">
                    {msg.content}
                  </div>
                ) : (
                  <div className="text-[#1a1a1a] max-w-lg whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isThinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-[#999]"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Study summary when complete */}
        {step === 'complete' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-6 mb-4 p-5 bg-white border border-[#e5e5e5] rounded-2xl"
          >
            <h3 className="font-semibold text-[#1a1a1a] mb-4">Study Summary</h3>
            
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-[#999] mb-1">Title</div>
                <div className="text-[#1a1a1a]">{studyData.title}</div>
              </div>
              
              {studyData.goals.length > 0 && (
                <div>
                  <div className="text-[#999] mb-1">Goals</div>
                  <ul className="space-y-1">
                    {studyData.goals.map((goal, i) => (
                      <li key={i} className="text-[#1a1a1a] flex items-start gap-2">
                        <Check className="w-4 h-4 text-[#22c55e] mt-0.5 shrink-0" />
                        {goal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {studyData.audience && (
                <div>
                  <div className="text-[#999] mb-1">Target Audience</div>
                  <div className="text-[#1a1a1a]">{studyData.audience}</div>
                </div>
              )}
              
              {studyData.questions.length > 0 && (
                <div>
                  <div className="text-[#999] mb-1">Interview Questions</div>
                  <ol className="space-y-1 list-decimal list-inside">
                    {studyData.questions.map((q, i) => (
                      <li key={i} className="text-[#1a1a1a]">{q}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            
            <button className="mt-6 w-full py-3 bg-[#1a56db] text-white rounded-xl font-medium hover:bg-[#1e40af] transition-colors flex items-center justify-center gap-2">
              <ArrowRight className="w-4 h-4" />
              Create Study
            </button>
          </motion.div>
        )}

        {/* Input area */}
        {step !== 'complete' && (
          <div className="p-6 border-t border-[#e5e5e5]">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your response..."
                rows={1}
                className="w-full px-4 py-3 pr-12 bg-white border border-[#e5e5e5] rounded-2xl focus:outline-none focus:border-[#1a56db] focus:ring-1 focus:ring-[#1a56db] resize-none"
              />
              <button
                onClick={handleUserInput}
                disabled={!inputValue.trim() || isThinking}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#333] transition-colors"
              >
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>
            
            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {['initial', 'goals', 'audience', 'questions'].map((s, i) => (
                <div
                  key={s}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    ['initial', 'goals', 'audience', 'questions'].indexOf(step) >= i
                      ? 'bg-[#1a56db]'
                      : 'bg-[#e5e5e5]'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side panel - study info */}
      {(studyData.title || studyData.goals.length > 0) && step !== 'complete' && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-80 border-l border-[#e5e5e5] bg-white p-6 hidden lg:block"
        >
          <h3 className="text-sm font-medium text-[#999] mb-4">Study Preview</h3>
          
          <div className="space-y-4">
            {studyData.title && (
              <div>
                <div className="text-xs text-[#999] mb-1">Title</div>
                <div className="text-sm text-[#1a1a1a] font-medium">{studyData.title}</div>
              </div>
            )}
            
            {studyData.goals.length > 0 && (
              <div>
                <div className="text-xs text-[#999] mb-1">Goals</div>
                <ul className="space-y-1">
                  {studyData.goals.slice(0, 3).map((g, i) => (
                    <li key={i} className="text-sm text-[#1a1a1a] flex items-start gap-1">
                      <ChevronRight className="w-3 h-3 mt-1 text-[#999]" />
                      {g}
                    </li>
                  ))}
                  {studyData.goals.length > 3 && (
                    <li className="text-xs text-[#999]">+{studyData.goals.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
            
            {studyData.audience && (
              <div>
                <div className="text-xs text-[#999] mb-1">Audience</div>
                <div className="text-sm text-[#1a1a1a]">{studyData.audience}</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
