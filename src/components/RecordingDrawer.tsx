import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Loader2, User, Clock, MousePointer2 } from 'lucide-react';

interface RecordingDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    stepName: string;
    funnelId: string;
    stepOrder: number;
    credentials: { apiKey: string; projectId: string } | null;
}

interface Recording {
    id: string;
    viewed: boolean;
    recording_duration: number;
    active_seconds: number;
    start_time: string;
}

interface Person {
    id: string;
    name: string;
    email?: string;
}

export default function RecordingDrawer({
    isOpen,
    onClose,
    stepName,
    funnelId,
    stepOrder,
    credentials
}: RecordingDrawerProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [recordings, setRecordings] = useState<{ person: Person, recordings: Recording[] }[]>([]);
    const [selectedRecording, setSelectedRecording] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && funnelId) {
            // Check for Demo Mode
            if (funnelId.startsWith('demo-')) {
                setRecordings([
                    {
                        person: { id: 'demo-user-1', name: 'Sarah (Demo)' },
                        recordings: [{
                            id: 'demo-rec-1', viewed: false, recording_duration: 145, active_seconds: 120, start_time: new Date().toISOString()
                        }]
                    },
                    {
                        person: { id: 'demo-user-2', name: 'Mike (Demo)' },
                        recordings: [{
                            id: 'demo-rec-2', viewed: true, recording_duration: 85, active_seconds: 60, start_time: new Date().toISOString()
                        }]
                    }
                ]);
                return;
            }

            if (credentials && stepOrder !== undefined) {
                fetchRecordings();
            }
        }
    }, [isOpen, funnelId, stepOrder]);

    const fetchRecordings = async () => {
        setIsLoading(true);
        setRecordings([]);
        try {
            // 1. Get dropped people
            const peopleRes = await fetch('/api/posthog?action=dropped-people', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: credentials?.apiKey,
                    projectId: credentials?.projectId,
                    action: 'dropped-people',
                    funnelId: funnelId,
                    stepOrder: stepOrder
                })
            });
            const peopleData = await peopleRes.json();

            if (peopleData.people && Array.isArray(peopleData.people)) {
                // 2. Get recordings for top 3 people
                const topPeople = peopleData.people.slice(0, 3);

                const recordingsPromises = topPeople.map(async (person: any) => {
                    const recRes = await fetch('/api/posthog?action=recordings', {
                        method: 'POST',
                        body: JSON.stringify({
                            apiKey: credentials?.apiKey,
                            projectId: credentials?.projectId,
                            action: 'recordings',
                            personId: person.distinct_ids?.[0] || person.id
                        })
                    });
                    const recData = await recRes.json();
                    return {
                        person: { id: person.id, name: person.name || 'Anonymous User' },
                        recordings: recData.recordings?.results || []
                    };
                });

                const results = await Promise.all(recordingsPromises);
                setRecordings(results.filter(r => r.recordings.length > 0));
            }
        } catch (error) {
            console.error('Failed to fetch recordings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Drawer */}
                    <motion.div
                        className="fixed right-0 top-0 bottom-0 w-[500px] bg-[#0a0a0f] border-l border-white/10 z-50 shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    >
                        <div className="h-full flex flex-col">
                            {/* Header */}
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-semibold text-white/90">Session Analysis</h2>
                                    <p className="text-sm text-white/40 mt-1">
                                        Viewing drop-offs from <span className="text-white/70 font-medium">"{stepName}"</span>
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center h-64">
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                                        <p className="text-sm text-white/40">Fetching failed sessions...</p>
                                    </div>
                                ) : recordings.length > 0 ? (
                                    <div className="space-y-6">
                                        {recordings.map((param, idx) => (
                                            <div key={idx} className="space-y-3">
                                                <div className="flex items-center gap-2 text-sm text-white/60 font-medium">
                                                    <User className="w-4 h-4" />
                                                    {param.person.name}
                                                </div>

                                                <div className="grid gap-3">
                                                    {param.recordings.slice(0, 2).map(rec => (
                                                        <a
                                                            key={rec.id}
                                                            href={`https://us.posthog.com/project/${credentials?.projectId}/replay/${rec.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="block group"
                                                        >
                                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 group-hover:border-blue-500/30 group-hover:bg-blue-500/5 transition-all">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-blue-400">
                                                                            <Play className="w-4 h-4 fill-current" />
                                                                        </div>
                                                                        <div>
                                                                            <div className="text-sm text-white/80 font-medium group-hover:text-blue-400 transition-colors">
                                                                                Watch Session
                                                                            </div>
                                                                            <div className="text-[10px] text-white/30">
                                                                                {new Date(rec.start_time).toLocaleString()}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <div className="flex items-center gap-1.5 text-xs text-white/50 mb-1">
                                                                            <Clock className="w-3 h-3" />
                                                                            {Math.round(rec.recording_duration / 60)}m {rec.recording_duration % 60}s
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
                                                                            <MousePointer2 className="w-3 h-3" />
                                                                            {rec.active_seconds}s active
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <p className="text-white/30">No relevant recordings found for this step.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
