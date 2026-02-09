'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Phone, PhoneOff, Volume2 } from 'lucide-react';
import type { TranscriptEntry } from '@/lib/types';

interface VoiceInterviewWidgetProps {
    isActive: boolean;
    userName?: string;
    dropOffContext?: string;
    onEnd: () => void;
}

export default function VoiceInterviewWidget({
    isActive,
    userName = 'User',
    dropOffContext = 'checkout',
    onEnd
}: VoiceInterviewWidgetProps) {
    const [status, setStatus] = useState<'connecting' | 'active' | 'ended'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [duration, setDuration] = useState(0);

    // Simulate connection
    useEffect(() => {
        if (isActive) {
            const timer = setTimeout(() => {
                setStatus('active');
                // Add initial AI greeting
                setTranscript([{
                    speaker: 'ai',
                    content: `Hi ${userName}! Thanks for taking my call. I noticed you were checking out our product earlier but didn't complete the process. I'd love to understand what happened - can you tell me about your experience?`,
                    timestamp: new Date()
                }]);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isActive, userName]);

    // Duration timer
    useEffect(() => {
        if (status === 'active') {
            const interval = setInterval(() => {
                setDuration(d => d + 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [status]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (!isActive) return null;

    return (
        <motion.div
            className="fixed bottom-6 right-6 w-96 card overflow-hidden z-50"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
        >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-[var(--accent)] to-[#ea580c] text-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center voice-pulse">
                            <Phone className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-medium">Voice Interview</p>
                            <p className="text-sm text-white/80">
                                {status === 'connecting' ? 'Connecting...' : formatDuration(duration)}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onEnd}
                        className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                    >
                        <PhoneOff className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Waveform Animation */}
            <AnimatePresence>
                {status === 'active' && (
                    <motion.div
                        className="p-4 bg-[var(--background)] flex items-center justify-center gap-2"
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                    >
                        <Volume2 className="w-4 h-4 text-[var(--accent)]" />
                        <div className="waveform">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="waveform-bar" />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Transcript */}
            <div className="max-h-64 overflow-y-auto p-4 space-y-3">
                {transcript.map((entry, index) => (
                    <motion.div
                        key={index}
                        className={`flex ${entry.speaker === 'ai' ? 'justify-start' : 'justify-end'}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className={`max-w-[85%] p-3 rounded-xl text-sm ${entry.speaker === 'ai'
                                ? 'bg-[var(--background)] border border-[var(--border)]'
                                : 'bg-[var(--primary)] text-white'
                            }`}>
                            {entry.content}
                        </div>
                    </motion.div>
                ))}

                {status === 'connecting' && (
                    <div className="text-center text-[var(--foreground-muted)] py-4">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                            className="inline-block"
                        >
                            <Phone className="w-6 h-6" />
                        </motion.div>
                        <p className="mt-2 text-sm">Connecting to {userName}...</p>
                    </div>
                )}
            </div>

            {/* Controls */}
            {status === 'active' && (
                <div className="p-4 border-t border-[var(--border)] flex items-center justify-center gap-4">
                    <button
                        onClick={() => setIsMuted(!isMuted)}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted
                                ? 'bg-[var(--danger)] text-white'
                                : 'bg-[var(--background-hover)] text-[var(--foreground)]'
                            }`}
                    >
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                        onClick={onEnd}
                        className="w-12 h-12 rounded-full bg-[var(--danger)] text-white flex items-center justify-center"
                    >
                        <PhoneOff className="w-5 h-5" />
                    </button>
                </div>
            )}
        </motion.div>
    );
}
