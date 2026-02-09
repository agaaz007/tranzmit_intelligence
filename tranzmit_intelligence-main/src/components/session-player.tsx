"use client";

import { useEffect, useRef, useCallback, memo, useState, useMemo } from 'react';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

// rrweb event types
const EventType = {
    DomContentLoaded: 0,
    Load: 1,
    FullSnapshot: 2,
    IncrementalSnapshot: 3,
    Meta: 4,
    Custom: 5,
    Plugin: 6,
} as const;

interface RRWebEvent {
    type: number;
    data: Record<string, unknown>;
    timestamp: number;
}

interface SessionPlayerProps {
    events: RRWebEvent[];
    width?: number;
    height?: number;
    autoPlay?: boolean;
    onReady?: (player: rrwebPlayer) => void;
}

type PlayerState = 'idle' | 'validating' | 'initializing' | 'ready' | 'error';

/**
 * Validates and preprocesses rrweb events to ensure they can be played back
 */
function preprocessEvents(rawEvents: RRWebEvent[]): { events: RRWebEvent[]; error: string | null } {
    if (!rawEvents || !Array.isArray(rawEvents)) {
        return { events: [], error: 'No events provided' };
    }

    if (rawEvents.length === 0) {
        return { events: [], error: 'Empty events array' };
    }

    // Filter and validate events
    const validEvents: RRWebEvent[] = [];
    for (const event of rawEvents) {
        // Must have type and timestamp
        if (typeof event?.type !== 'number' || typeof event?.timestamp !== 'number') {
            continue; // Skip invalid events
        }
        // Must have data (can be empty object but must exist)
        if (event.data === undefined) {
            continue;
        }
        validEvents.push(event as RRWebEvent);
    }

    if (validEvents.length === 0) {
        return { events: [], error: 'No valid events found' };
    }

    // Sort by timestamp (critical for rrweb playback)
    validEvents.sort((a, b) => a.timestamp - b.timestamp);

    // Check for required event types
    const hasFullSnapshot = validEvents.some(e => e.type === EventType.FullSnapshot);
    const hasMeta = validEvents.some(e => e.type === EventType.Meta);

    if (!hasFullSnapshot) {
        return { events: [], error: 'Missing FullSnapshot event - cannot replay session' };
    }

    // rrweb requires Meta event before FullSnapshot for proper playback
    // If missing, we can try to construct one from the FullSnapshot
    if (!hasMeta) {
        const fullSnapshot = validEvents.find(e => e.type === EventType.FullSnapshot);
        if (fullSnapshot) {
            // Insert a synthetic Meta event before everything else
            const metaEvent: RRWebEvent = {
                type: EventType.Meta,
                data: {
                    href: fullSnapshot.data?.href || 'about:blank',
                    width: fullSnapshot.data?.width || 1920,
                    height: fullSnapshot.data?.height || 1080,
                },
                timestamp: validEvents[0].timestamp - 1,
            };
            validEvents.unshift(metaEvent);
        }
    }

    // Ensure proper event ordering: Meta should come before FullSnapshot
    const metaIndex = validEvents.findIndex(e => e.type === EventType.Meta);
    const snapshotIndex = validEvents.findIndex(e => e.type === EventType.FullSnapshot);

    if (metaIndex > snapshotIndex && metaIndex !== -1 && snapshotIndex !== -1) {
        // Swap them - Meta must come first
        const meta = validEvents[metaIndex];
        validEvents.splice(metaIndex, 1);
        validEvents.splice(snapshotIndex, 0, meta);
    }

    // Normalize timestamps to start from 0 if they're very large (prevents playback issues)
    const baseTimestamp = validEvents[0].timestamp;
    if (baseTimestamp > 1e12) { // Likely epoch milliseconds
        for (const event of validEvents) {
            event.timestamp = event.timestamp - baseTimestamp;
        }
    }

    return { events: validEvents, error: null };
}

/**
 * Generates a stable hash from events for memoization
 */
function getEventsHash(events: RRWebEvent[]): string {
    if (!events || events.length === 0) return 'empty';
    const first = events[0];
    const last = events[events.length - 1];
    return `${events.length}-${first?.timestamp}-${last?.timestamp}-${first?.type}-${last?.type}`;
}

// Memoized component to prevent unnecessary re-renders
export const SessionPlayer = memo(function SessionPlayer({
    events: rawEvents,
    width = 800,
    height = 450,
    autoPlay = false,
    onReady
}: SessionPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<rrwebPlayer | null>(null);
    const initAttemptRef = useRef(0);
    const mountedRef = useRef(true);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [initError, setInitError] = useState<string | null>(null);

    // Memoize preprocessed events to avoid reprocessing on every render
    const { processedEvents, preprocessError } = useMemo(() => {
        const result = preprocessEvents(rawEvents);
        return { processedEvents: result.events, preprocessError: result.error };
    }, [rawEvents]);

    // Derive final error state - preprocess errors take precedence
    const error = preprocessError || initError;

    // Stable cleanup function
    const destroyPlayer = useCallback(() => {
        if (playerRef.current) {
            try {
                playerRef.current.pause();
                // @ts-expect-error - rrweb-player has $destroy method but types don't expose it
                if (typeof playerRef.current.$destroy === 'function') {
                    // @ts-expect-error - calling internal destroy method
                    playerRef.current.$destroy();
                }
            } catch {
                // Ignore cleanup errors
            }
            playerRef.current = null;
        }
    }, []);

    // Main initialization effect
    useEffect(() => {
        mountedRef.current = true;
        initAttemptRef.current = 0;

        // Skip if preprocess errors - error is derived from preprocessError
        if (preprocessError || processedEvents.length === 0) {
            return;
        }

        // Cleanup previous player synchronously
        destroyPlayer();

        // Schedule state updates via microtask to avoid synchronous setState in effect
        queueMicrotask(() => {
            if (!mountedRef.current) return;
            setPlayerState('validating');
            setInitError(null);
        });

        const initPlayer = (attempt: number) => {
            if (!mountedRef.current) return;
            if (!containerRef.current) {
                // Container not ready, retry with requestAnimationFrame
                if (attempt < 10) {
                    requestAnimationFrame(() => initPlayer(attempt + 1));
                } else {
                    setInitError('Failed to initialize - container not available');
                    setPlayerState('error');
                }
                return;
            }

            initAttemptRef.current = attempt;
            setPlayerState('initializing');

            // Clear container
            containerRef.current.innerHTML = '';

            try {
                const player = new rrwebPlayer({
                    target: containerRef.current,
                    props: {
                        events: processedEvents,
                        width,
                        height,
                        autoPlay: false, // Always start paused initially
                        showController: true,
                        skipInactive: true,
                        showWarning: false,
                        showDebug: false,
                        speedOption: [1, 2, 4, 8],
                        UNSAFE_replayCanvas: false,
                        mouseTail: {
                            duration: 500,
                            strokeStyle: 'rgba(59, 130, 246, 0.5)',
                        },
                    },
                });

                playerRef.current = player;

                // Attach to container for external access (jumpToTime)
                if (containerRef.current) {
                    (containerRef.current as HTMLDivElement & { player?: rrwebPlayer }).player = player;
                }

                // Use requestAnimationFrame for more reliable frame rendering
                const waitForRender = (frameCount: number) => {
                    if (!mountedRef.current) return;

                    if (frameCount > 30) {
                        // Max wait exceeded, but player is created - mark as ready anyway
                        finalizePlayer();
                        return;
                    }

                    // Check if player has rendered content
                    const iframe = containerRef.current?.querySelector('iframe');
                    if (iframe) {
                        // Give one more frame for the iframe content to render
                        requestAnimationFrame(() => {
                            if (mountedRef.current) {
                                finalizePlayer();
                            }
                        });
                    } else {
                        requestAnimationFrame(() => waitForRender(frameCount + 1));
                    }
                };

                const finalizePlayer = () => {
                    if (!mountedRef.current) return;

                    try {
                        // Seek to start to ensure first frame is rendered
                        player.goto(0);

                        // Use double RAF to ensure DOM updates are flushed
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                if (!mountedRef.current) return;

                                setPlayerState('ready');

                                if (autoPlay) {
                                    try {
                                        player.play();
                                    } catch {
                                        // Autoplay might fail due to browser policies, but player is still ready
                                    }
                                }

                                onReady?.(player);
                            });
                        });
                    } catch (e) {
                        console.error('Error finalizing player:', e);
                        // Player was created but had issues - still mark as ready
                        setPlayerState('ready');
                        onReady?.(player);
                    }
                };

                // Start waiting for render
                requestAnimationFrame(() => waitForRender(0));

            } catch (e) {
                console.error('Failed to initialize rrweb player:', e);

                // Retry logic - sometimes first attempt fails due to timing
                if (attempt < 3 && mountedRef.current) {
                    setTimeout(() => {
                        if (mountedRef.current) {
                            initPlayer(attempt + 1);
                        }
                    }, 100 * (attempt + 1)); // Exponential backoff
                } else {
                    setInitError(`Failed to load session replay: ${e instanceof Error ? e.message : 'Unknown error'}`);
                    setPlayerState('error');
                }
            }
        };

        // Start initialization after a brief delay to ensure DOM is ready
        requestAnimationFrame(() => {
            if (mountedRef.current) {
                initPlayer(0);
            }
        });

        return () => {
            mountedRef.current = false;
            destroyPlayer();
        };
    }, [processedEvents, width, height, autoPlay, destroyPlayer, onReady, preprocessError]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            mountedRef.current = false;
            destroyPlayer();
        };
    }, [destroyPlayer]);

    // Show error state if there's any error or no valid events
    const showError = error || processedEvents.length === 0;
    const displayError = error || 'No events to replay';

    if (showError) {
        return (
            <div
                className="flex flex-col items-center justify-center bg-slate-100 rounded-lg border border-slate-200 gap-2 p-4"
                style={{ width, height }}
            >
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-slate-500 text-center">{displayError}</p>
            </div>
        );
    }

    // Controller bar adds ~80px to the height
    const totalHeight = height + 80;
    const isLoading = playerState !== 'ready';

    return (
        <div
            className="relative rounded-lg border border-slate-200 shadow-sm overflow-hidden"
            style={{ width, minHeight: totalHeight, backgroundColor: '#f8fafc' }}
        >
            {/* Loading overlay - shows until player has rendered */}
            {isLoading && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-slate-100 z-20 rounded-lg"
                    style={{ height: totalHeight }}
                >
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-sm text-slate-500">
                            {playerState === 'validating' && 'Validating session...'}
                            {playerState === 'initializing' && 'Loading replay...'}
                            {playerState === 'idle' && 'Preparing...'}
                        </span>
                    </div>
                </div>
            )}

            {/* Player container */}
            <div
                ref={containerRef}
                id="rrweb-player-container"
                className="rrweb-player-container"
                style={{
                    opacity: isLoading ? 0 : 1,
                    transition: 'opacity 0.2s ease',
                    visibility: isLoading ? 'hidden' : 'visible',
                }}
            />
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison using stable hash instead of reference equality
    const prevHash = getEventsHash(prevProps.events);
    const nextHash = getEventsHash(nextProps.events);
    return (
        prevHash === nextHash &&
        prevProps.width === nextProps.width &&
        prevProps.height === nextProps.height &&
        prevProps.autoPlay === nextProps.autoPlay
    );
});
