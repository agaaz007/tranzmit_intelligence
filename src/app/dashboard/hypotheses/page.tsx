'use client';

import { useState } from 'react';
import ChatPanel from '@/components/studies/ChatPanel';
import ResearchPanel, { StudyState } from '@/components/studies/ResearchPanel';
import { simulateAIResponse } from '@/lib/studies/mockAI';
import { callGemini, repromptSingleQuestion, Question } from '@/lib/studies/gemini';

interface Message {
  role: 'ai' | 'user';
  content: string;
}

export default function HypothesesPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: "Hello! To design the most efficient ListenLabs study, I first need to understand your goal. What is the main business decision you need to make based on this research?" }
  ]);

  const [studyState, setStudyState] = useState<StudyState>({
    objective: "",
    audience: [],
    exclusions: [],
    questions: []
  });

  const [isTyping, setIsTyping] = useState(false);
  const [currentStage, setCurrentStage] = useState('objective'); // objective, audience, questions, refinement

  // Question management handlers
  const handleUpdateQuestion = (questionId: number, updates: Partial<Question>) => {
    setStudyState(prev => ({
      ...prev,
      questions: prev.questions.map(q =>
        q.id === questionId ? { ...q, ...updates } : q
      )
    }));
  };

  const handleDeleteQuestion = (questionId: number) => {
    setStudyState(prev => ({
      ...prev,
      questions: prev.questions.filter(q => q.id !== questionId)
    }));
  };

  const handleRepromptQuestion = async (questionId: number, instructions: string) => {
    const question = studyState.questions.find(q => q.id === questionId);
    if (!question) return;

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      console.error('No API key available for reprompting');
      throw new Error('API key required for reprompting');
    }

    const improved = await repromptSingleQuestion(question, instructions, studyState.objective, apiKey);
    handleUpdateQuestion(questionId, improved);
  };

  const handleAddQuestion = () => {
    const maxId = studyState.questions.reduce((max, q) => Math.max(max, q.id || 0), 0);
    setStudyState(prev => ({
      ...prev,
      questions: [...prev.questions, {
        id: maxId + 1,
        text: "New question - click edit to customize",
        followUps: [],
        rationale: "",
        type: "video_response"
      }]
    }));
  };

  const handleSendMessage = async (text: string) => {
    // Add User Message
    setMessages(prev => [...prev, { role: 'user', content: text }]);

    // Set Typing State
    setIsTyping(true);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      let result;

      if (apiKey) {
        try {
          // Use Real API
          // Filter messages for history (simple mapping)
          const history = messages.map(m => ({ role: m.role, content: m.content }));
          const apiResponse = await callGemini(text, history, apiKey);

          result = {
            chat_reply: apiResponse.chat_reply,
            ui_update: apiResponse.ui_update || {},
            next_stage: null // The real AI doesn't need explicit stages, it just flows
          };
        } catch (apiError) {
          console.error("Gemini API failed, falling back to mock:", apiError);
          // Fallback to Mock Logic on error
          result = await simulateAIResponse(text, currentStage, studyState);
        }
      } else {
        // Use Mock Logic
        result = await simulateAIResponse(text, currentStage, studyState);
      }

      // Update UI matching simulation logic
      setMessages(prev => [...prev, { role: 'ai', content: result.chat_reply }]);

      if (result.ui_update) {
        // Merge updates carefully
        setStudyState(prev => {
          const newState = { ...prev };
          if (result.ui_update.objective) newState.objective = result.ui_update.objective;
          if (result.ui_update.audience_tags) newState.audience = result.ui_update.audience_tags;
          if (result.ui_update.exclusions) newState.exclusions = result.ui_update.exclusions;
          if (result.ui_update.questions) newState.questions = result.ui_update.questions;
          return newState;
        });
      }

      if (result.next_stage) {
        setCurrentStage(result.next_stage);
      }

    } catch (error) {
      console.error("Error asking AI:", error);
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-[var(--background)] font-sans">
      <div className="w-2/5 h-full relative z-10 shadow-xl">
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          isTyping={isTyping}
        />
      </div>
      <div className="w-3/5 h-full">
        <ResearchPanel
          studyState={studyState}
          onUpdateQuestion={handleUpdateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onRepromptQuestion={handleRepromptQuestion}
          onAddQuestion={handleAddQuestion}
        />
      </div>
    </div>
  );
}
