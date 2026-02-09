#!/usr/bin/env npx ts-node
/**
 * Session Extractor Script
 *
 * Pulls up to 1000 session replays from PostHog, extracts rrweb data,
 * parses it into the format sent to the AI model, and saves each session
 * to a separate file.
 *
 * Usage:
 *   npx ts-node scripts/extract-sessions.ts
 *
 * Environment variables (or edit defaults below):
 *   POSTHOG_API_KEY - Your PostHog Personal API key
 *   POSTHOG_PROJECT_ID - Your PostHog project ID
 *   POSTHOG_HOST - PostHog host (default: https://us.posthog.com)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ============================================================================
// CONFIGURATION - Edit these or set environment variables
// ============================================================================
const CONFIG = {
    POSTHOG_HOST: process.env.POSTHOG_HOST || 'https://us.posthog.com',
    POSTHOG_PROJECT_ID: process.env.POSTHOG_PROJECT_ID || '202631',
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY || 'phx_ERxH2QO0CCTu2qPUp3TBlVZzMdSL3dbESqK8EGLjuNljgR4',
    START_FROM: 40, // Skip first N sessions (resume from this index)
    MAX_SESSIONS: 1000,
    OUTPUT_DIR: path.join(process.cwd(), 'extracted-sessions'),
    BATCH_SIZE: 100, // PostHog max per request
    DELAY_BETWEEN_SESSIONS: 1000, // ms delay to avoid rate limiting
    MAX_RETRIES: 5,
    RETRY_DELAY: 5000, // ms to wait on rate limit
};

// ============================================================================
// TYPES
// ============================================================================
interface RRWebEvent {
    type: number;
    data: Record<string, unknown>;
    timestamp: number;
    windowId?: string;
}

interface PostHogSession {
    id: string;
    distinct_id: string;
    start_time: string;
    end_time: string;
    recording_duration: number;
    click_count: number;
    keypress_count: number;
    active_seconds: number;
}

interface SemanticLog {
    timestamp: string;
    action: string;
    details: string;
    flags: string[];
    rawTimestamp?: number;
}

interface InputDiff {
    fieldName: string;
    fieldType: string;
    timestamp: string;
    rawTimestamp: number;
    previousValue: string;
    newValue: string;
    changeType: 'typed' | 'deleted' | 'corrected' | 'cleared' | 'pasted';
    charactersAdded: number;
    charactersRemoved: number;
}

interface InputFieldSummary {
    fieldName: string;
    fieldType: string;
    focusTime: string;
    blurTime: string | null;
    timeSpentMs: number;
    finalValue: string;
    totalChanges: number;
    totalCorrections: number;
    wasAbandoned: boolean;
    wasCleared: boolean;
    diffs: InputDiff[];
}

interface SemanticSession {
    totalDuration: string;
    eventCount: number;
    pageUrl: string;
    pageTitle: string;
    viewportSize: { width: number; height: number };
    logs: SemanticLog[];
    summary: {
        totalClicks: number;
        rageClicks: number;
        deadClicks: number;
        doubleClicks: number;
        rightClicks: number;
        totalInputs: number;
        abandonedInputs: number;
        clearedInputs: number;
        totalScrolls: number;
        scrollDepthMax: number;
        rapidScrolls: number;
        scrollReversals: number;
        totalHovers: number;
        hesitations: number;
        hoverTime: number;
        totalTouches: number;
        swipes: number;
        pinchZooms: number;
        totalMediaInteractions: number;
        videoPlays: number;
        videoPauses: number;
        totalSelections: number;
        copyEvents: number;
        pasteEvents: number;
        consoleErrors: number;
        networkErrors: number;
        tabSwitches: number;
        idleTime: number;
        formSubmissions: number;
        resizeEvents: number;
        orientationChanges: number;
    };
    behavioralSignals: {
        isExploring: boolean;
        isFrustrated: boolean;
        isEngaged: boolean;
        isConfused: boolean;
        isMobile: boolean;
        completedGoal: boolean;
    };
    rawInputDiffs: InputFieldSummary[];
}

// ============================================================================
// CONSTANTS
// ============================================================================
const EventType = {
    DomContentLoaded: 0,
    Load: 1,
    FullSnapshot: 2,
    IncrementalSnapshot: 3,
    Meta: 4,
    Custom: 5,
    Plugin: 6,
} as const;

const NodeType = {
    Document: 0,
    DocumentType: 1,
    Element: 2,
    Text: 3,
    CDATA: 4,
    Comment: 5,
} as const;

const IncrementalSource = {
    Mutation: 0,
    MouseMove: 1,
    MouseInteraction: 2,
    Scroll: 3,
    ViewportResize: 4,
    Input: 5,
    TouchMove: 6,
    MediaInteraction: 7,
    StyleSheetRule: 8,
    CanvasMutation: 9,
    Font: 10,
    Log: 11,
    Drag: 12,
} as const;

const MouseInteractionType = {
    MouseUp: 0,
    MouseDown: 1,
    Click: 2,
    ContextMenu: 3,
    DblClick: 4,
    Focus: 5,
    Blur: 6,
    TouchStart: 7,
    TouchMove_Departed: 8,
    TouchEnd: 9,
    TouchCancel: 10,
} as const;

const PII_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\d[ -]*?){13,16}/g;

// ============================================================================
// DECOMPRESSION UTILITIES
// ============================================================================
function tryDecompressString(str: string): unknown | null {
    if (str.length < 2) return null;
    const firstTwo = str.charCodeAt(0) === 0x1f && str.charCodeAt(1) === 0x8b;
    if (!firstTwo) return null;

    try {
        const buf = Buffer.from(str, 'binary');
        const decompressed = zlib.gunzipSync(buf).toString('utf8');
        return JSON.parse(decompressed);
    } catch {
        try {
            const buf = Buffer.from(str, 'base64');
            const decompressed = zlib.gunzipSync(buf).toString('utf8');
            return JSON.parse(decompressed);
        } catch {
            return null;
        }
    }
}

function decompressNestedFields(obj: unknown): unknown {
    if (typeof obj === 'string') {
        const decompressed = tryDecompressString(obj);
        return decompressed !== null ? decompressed : obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => decompressNestedFields(item));
    }

    if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = decompressNestedFields(value);
        }
        return result;
    }

    return obj;
}

function decompressEvent(event: unknown): RRWebEvent | null {
    if (typeof event === 'string') {
        try {
            return JSON.parse(event);
        } catch {
            return null;
        }
    }

    if (event && typeof event === 'object') {
        const evt = event as Record<string, unknown>;

        if (evt.cv && typeof evt.data === 'string') {
            try {
                const buf = Buffer.from(evt.data, 'base64');
                const parsedData = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
                const fullyDecompressed = decompressNestedFields(parsedData);
                return {
                    type: evt.type as number,
                    timestamp: evt.timestamp as number,
                    data: fullyDecompressed as Record<string, unknown>,
                };
            } catch {
                try {
                    const buf = Buffer.from(evt.data as string, 'binary');
                    const parsedData = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
                    const fullyDecompressed = decompressNestedFields(parsedData);
                    return {
                        type: evt.type as number,
                        timestamp: evt.timestamp as number,
                        data: fullyDecompressed as Record<string, unknown>,
                    };
                } catch {
                    return evt as unknown as RRWebEvent;
                }
            }
        }

        if (evt.data && typeof evt.data === 'object') {
            const decompressedData = decompressNestedFields(evt.data);
            return {
                ...evt,
                data: decompressedData as Record<string, unknown>,
            } as RRWebEvent;
        }

        return evt as unknown as RRWebEvent;
    }

    return null;
}

function parseEncodedSnapshots(items: unknown[]): RRWebEvent[] {
    const parsedLines: RRWebEvent[] = [];
    let lastWindowId: string | null = null;

    for (const item of items) {
        if (!item) continue;

        try {
            const snapshotLine = typeof item === 'string' ? JSON.parse(item) : item;
            let resolvedWindowId: string | null = null;
            let eventData: unknown = null;

            if (Array.isArray(snapshotLine)) {
                resolvedWindowId = snapshotLine[0] as string;
                eventData = snapshotLine[1];
            } else if (typeof snapshotLine === 'object' && snapshotLine !== null) {
                const line = snapshotLine as Record<string, unknown>;
                if (line.type !== undefined) {
                    eventData = snapshotLine;
                    resolvedWindowId = (line.windowId as string) || null;
                } else if (line.data) {
                    resolvedWindowId = (line.window_id as string) || (line.windowId as string) || null;
                    eventData = line.data;
                }
            }

            if (!eventData) continue;

            if (resolvedWindowId) {
                lastWindowId = resolvedWindowId;
            } else if (lastWindowId) {
                resolvedWindowId = lastWindowId;
            } else {
                resolvedWindowId = 'default';
            }

            const events = Array.isArray(eventData) ? eventData : [eventData];

            for (const evt of events) {
                const decompressed = decompressEvent(evt);
                if (decompressed && decompressed.type !== undefined) {
                    parsedLines.push({
                        ...decompressed,
                        windowId: resolvedWindowId,
                    });
                }
            }
        } catch {
            continue;
        }
    }

    return parsedLines;
}

// ============================================================================
// RRWEB PARSER (Simplified version of rrweb-parser.ts)
// ============================================================================
interface NodeInfo {
    tagName: string;
    id?: string;
    className?: string;
    type?: string;
    placeholder?: string;
    name?: string;
    role?: string;
    ariaLabel?: string;
    textContent?: string;
    href?: string;
    src?: string;
}

function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `[${m}:${s}]`;
}

function redact(text: string): string {
    if (!text) return '';
    return text.replace(PII_REGEX, '[REDACTED]');
}

function getSemanticName(info: NodeInfo): string {
    const { tagName, id, className, type, placeholder, name, role, ariaLabel, textContent, href } = info;
    const tag = tagName?.toLowerCase() || 'element';

    if (tag === 'button' || role === 'button') {
        if (textContent) return `"${redact(textContent)}" button`;
        if (ariaLabel) return `"${ariaLabel}" button`;
        return 'button';
    }

    if (tag === 'a') {
        if (textContent) return `"${redact(textContent)}" link`;
        if (ariaLabel) return `"${ariaLabel}" link`;
        if (href) return `link to ${href.split('/').pop() || href}`;
        return 'link';
    }

    if (tag === 'input') {
        const inputType = type || 'text';
        if (placeholder) return `"${placeholder}" ${inputType} field`;
        if (name) return `"${name}" ${inputType} field`;
        if (ariaLabel) return `"${ariaLabel}" ${inputType} field`;
        return `${inputType} input field`;
    }

    if (tag === 'textarea') {
        if (placeholder) return `"${placeholder}" text area`;
        if (name) return `"${name}" text area`;
        return 'text area';
    }

    if (tag === 'select') {
        if (name) return `"${name}" dropdown`;
        return 'dropdown';
    }

    if (tag === 'img') {
        if (info.src) {
            const filename = info.src.split('/').pop()?.split('?')[0] || 'image';
            return `image (${filename})`;
        }
        return 'image';
    }

    if ((tag === 'div' || tag === 'span') && textContent && textContent.length < 50) {
        return `"${redact(textContent)}"`;
    }

    if (ariaLabel) return `"${ariaLabel}" ${tag}`;
    if (id && !id.match(/^[a-z0-9]{8,}$/i) && !id.startsWith(':r')) return `#${id} ${tag}`;

    if (className) {
        const classes = className.split(' ').filter(c =>
            c.length > 2 && !c.startsWith('_') && !c.match(/^[a-z0-9]{8,}$/i)
        );
        if (classes.length > 0) return `.${classes[0]} ${tag}`;
    }

    return tag;
}

function buildNodeMap(node: any, map: Map<number, NodeInfo>) {
    if (!node) return;

    if (node.id) {
        const info: NodeInfo = { tagName: node.tagName || '' };

        if (node.type === NodeType.Element) {
            if (node.attributes) {
                info.id = node.attributes.id;
                info.className = node.attributes.class;
                info.type = node.attributes.type;
                info.placeholder = node.attributes.placeholder;
                info.name = node.attributes.name;
                info.role = node.attributes.role;
                info.ariaLabel = node.attributes['aria-label'];
                info.href = node.attributes.href;
                info.src = node.attributes.src;
            }

            if (node.childNodes) {
                const textNodes = node.childNodes.filter((c: any) => c.type === NodeType.Text);
                if (textNodes.length > 0) {
                    const text = textNodes
                        .map((t: any) => t.textContent?.trim())
                        .filter(Boolean)
                        .join(' ')
                        .trim();
                    if (text && text.length < 100) {
                        info.textContent = text;
                    }
                }
            }

            map.set(node.id, info);
        }
    }

    if (node.childNodes) {
        node.childNodes.forEach((child: any) => buildNodeMap(child, map));
    }
}

function parseRRWebSession(events: RRWebEvent[]): SemanticSession {
    const emptySummary = {
        totalClicks: 0, rageClicks: 0, deadClicks: 0, doubleClicks: 0, rightClicks: 0,
        totalInputs: 0, abandonedInputs: 0, clearedInputs: 0,
        totalScrolls: 0, scrollDepthMax: 0, rapidScrolls: 0, scrollReversals: 0,
        totalHovers: 0, hesitations: 0, hoverTime: 0,
        totalTouches: 0, swipes: 0, pinchZooms: 0,
        totalMediaInteractions: 0, videoPlays: 0, videoPauses: 0,
        totalSelections: 0, copyEvents: 0, pasteEvents: 0,
        consoleErrors: 0, networkErrors: 0,
        tabSwitches: 0, idleTime: 0, formSubmissions: 0,
        resizeEvents: 0, orientationChanges: 0,
    };

    const emptySignals = {
        isExploring: false, isFrustrated: false, isEngaged: false,
        isConfused: false, isMobile: false, completedGoal: false,
    };

    if (!events || events.length === 0) {
        return {
            totalDuration: '00:00',
            eventCount: 0,
            pageUrl: '',
            pageTitle: '',
            viewportSize: { width: 0, height: 0 },
            logs: [],
            summary: emptySummary,
            behavioralSignals: emptySignals,
            rawInputDiffs: [],
        };
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    const startTime = events[0].timestamp;
    const nodeMap = new Map<number, NodeInfo>();
    const clickHistory: { id: number; timestamp: number; nodeName: string }[] = [];
    const logs: SemanticLog[] = [];

    let pageUrl = '';
    let pageTitle = '';
    let viewportSize = { width: 0, height: 0 };

    let totalClicks = 0, rageClicks = 0, deadClicks = 0, doubleClicks = 0, rightClicks = 0;
    let totalInputs = 0, abandonedInputs = 0, clearedInputs = 0;
    let totalScrolls = 0, scrollDepthMax = 0, rapidScrolls = 0, scrollReversals = 0;
    let totalHovers = 0, hesitations = 0, hoverTime = 0;
    let totalTouches = 0, swipes = 0, pinchZooms = 0;
    let totalMediaInteractions = 0, videoPlays = 0, videoPauses = 0;
    let totalSelections = 0, copyEvents = 0, pasteEvents = 0;
    let consoleErrors = 0, networkErrors = 0;
    let tabSwitches = 0, formSubmissions = 0;
    let resizeEvents = 0, orientationChanges = 0;

    let lastInteractionTime = startTime;
    let totalIdleTime = 0;
    const IDLE_THRESHOLD = 5000;

    let lastScrollLog = 0;
    let lastMouseMoveLog = 0;
    let lastScrollY = 0;
    let lastScrollTime = 0;

    const hoverState = new Map<number, number>();
    const inputState = new Map<number, { lastText: string; lastTimestamp: number; hadContent: boolean }>();
    const inputFieldTracking = new Map<number, {
        fieldName: string;
        fieldType: string;
        focusTimestamp: number;
        blurTimestamp: number | null;
        values: string[];
        diffs: InputDiff[];
        corrections: number;
    }>();
    let touchStartPos: { x: number; y: number; time: number } | null = null;

    // Extract Meta info
    const metaEvent = events.find((e) => e.type === EventType.Meta);
    if (metaEvent?.data) {
        pageUrl = (metaEvent.data as any).href || '';
        viewportSize = {
            width: (metaEvent.data as any).width || 0,
            height: (metaEvent.data as any).height || 0
        };
    }

    // Build Node Map from FullSnapshot
    const snapshotEvent = events.find((e) => e.type === EventType.FullSnapshot);
    if (snapshotEvent?.data) {
        let snapshotData = snapshotEvent.data as any;

        if (typeof snapshotData === 'string') {
            try {
                const buffer = Buffer.from(snapshotData, 'binary');
                const decompressed = zlib.gunzipSync(buffer);
                snapshotData = JSON.parse(decompressed.toString('utf-8'));
            } catch {
                try {
                    snapshotData = JSON.parse(snapshotData);
                } catch {
                    // Could not parse
                }
            }
        }

        if (snapshotData?.node) {
            buildNodeMap(snapshotData.node, nodeMap);

            const findTitle = (node: any): string | null => {
                if (!node) return null;
                if (node.tagName === 'title' && node.childNodes?.[0]?.textContent) {
                    return node.childNodes[0].textContent;
                }
                if (node.childNodes) {
                    for (const child of node.childNodes) {
                        const title = findTitle(child);
                        if (title) return title;
                    }
                }
                return null;
            };
            pageTitle = findTitle(snapshotData.node) || '';
        }
    }

    // Add initial context log
    if (pageUrl) {
        try {
            logs.push({
                timestamp: '[00:00]',
                action: 'Session Started',
                details: `on ${new URL(pageUrl).hostname}${pageTitle ? ` - "${pageTitle}"` : ''}`,
                flags: [],
                rawTimestamp: startTime,
            });
        } catch {
            logs.push({
                timestamp: '[00:00]',
                action: 'Session Started',
                details: pageUrl,
                flags: [],
                rawTimestamp: startTime,
            });
        }
    }

    // Process Events
    events.forEach((event, index) => {
        const timeOffset = event.timestamp - startTime;
        const timeStr = formatTime(timeOffset);
        const flags: string[] = [];
        let action = '';
        let details = '';

        if (event.timestamp - lastInteractionTime > IDLE_THRESHOLD) {
            totalIdleTime += event.timestamp - lastInteractionTime - IDLE_THRESHOLD;
        }

        // Handle mutations
        if (event.type === EventType.IncrementalSnapshot && (event.data as any)?.source === IncrementalSource.Mutation) {
            if ((event.data as any).adds && Array.isArray((event.data as any).adds)) {
                for (const add of (event.data as any).adds) {
                    if (add.node) {
                        buildNodeMap(add.node, nodeMap);
                    }
                }
            }

            const addedNodes = (event.data as any).adds?.length || 0;
            if (addedNodes > 10) {
                action = 'Content loaded';
                details = `${addedNodes} elements added`;
            }
        }

        if (event.type === EventType.IncrementalSnapshot) {
            const data = event.data as any;
            lastInteractionTime = event.timestamp;

            // Mouse Interaction
            if (data.source === IncrementalSource.MouseInteraction) {
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `element #${nodeId}`;

                if (data.type === MouseInteractionType.Click) {
                    totalClicks++;
                    action = 'Clicked';
                    details = nodeName;

                    const recentClicks = clickHistory.filter(
                        (c) => c.id === nodeId && event.timestamp - c.timestamp < 2000
                    );
                    if (recentClicks.length >= 2) {
                        flags.push('[RAGE CLICK]');
                        rageClicks++;
                    }

                    const veryRecentClicks = clickHistory.filter(
                        (c) => event.timestamp - c.timestamp < 1500
                    );
                    if (veryRecentClicks.length >= 3) {
                        const uniqueElements = new Set(veryRecentClicks.map(c => c.id));
                        if (uniqueElements.size >= 3) {
                            flags.push('[CLICK THRASHING]');
                        }
                    }

                    clickHistory.push({ id: nodeId, timestamp: event.timestamp, nodeName });

                    const lookAheadLimit = Math.min(index + 100, events.length);
                    let responseFound = false;
                    for (let i = index + 1; i < lookAheadLimit; i++) {
                        const nextEvent = events[i];
                        if (nextEvent.timestamp - event.timestamp > 1000) break;
                        if (
                            nextEvent.type === EventType.IncrementalSnapshot &&
                            (nextEvent.data as any).source === IncrementalSource.Mutation
                        ) {
                            responseFound = true;
                            break;
                        }
                    }
                    if (!responseFound) {
                        flags.push('[NO RESPONSE]');
                        deadClicks++;
                    }

                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'a' || nodeInfo?.href) {
                        action = 'Clicked link';
                    } else if (tag === 'button' || nodeInfo?.role === 'button') {
                        action = 'Clicked button';
                    } else if (tag === 'input' && nodeInfo?.type === 'submit') {
                        action = 'Clicked submit';
                        formSubmissions++;
                    }
                }

                if (data.type === MouseInteractionType.DblClick) {
                    doubleClicks++;
                    action = 'Double-clicked';
                    details = nodeName;
                }

                if (data.type === MouseInteractionType.ContextMenu) {
                    rightClicks++;
                    action = 'Right-clicked';
                    details = nodeName;
                }

                if (data.type === MouseInteractionType.Focus) {
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                        action = 'Focused on';
                        details = nodeName;
                        if (!inputState.has(nodeId)) {
                            inputState.set(nodeId, { lastText: '', lastTimestamp: event.timestamp, hadContent: false });
                        }
                    }
                }

                if (data.type === MouseInteractionType.Blur) {
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'input' || tag === 'textarea') {
                        // Track blur time for input field tracking
                        const fieldTrack = inputFieldTracking.get(nodeId);
                        if (fieldTrack) {
                            fieldTrack.blurTimestamp = event.timestamp;
                        }

                        const inputVal = inputState.get(nodeId);
                        if (inputVal) {
                            if (inputVal.lastText.length === 0 && !inputVal.hadContent) {
                                action = 'Abandoned';
                                details = `${nodeName} without entering anything`;
                                flags.push('[ABANDONED INPUT]');
                                abandonedInputs++;
                            } else if (inputVal.lastText.length === 0 && inputVal.hadContent) {
                                action = 'Cleared and left';
                                details = nodeName;
                                flags.push('[CLEARED INPUT]');
                                clearedInputs++;
                            }
                        }
                    }
                }

                if (data.type === MouseInteractionType.TouchStart) {
                    totalTouches++;
                    touchStartPos = { x: data.x || 0, y: data.y || 0, time: event.timestamp };
                    action = 'Touched';
                    details = nodeName;
                }

                if (data.type === MouseInteractionType.TouchEnd) {
                    if (touchStartPos) {
                        const dx = (data.x || 0) - touchStartPos.x;
                        const dy = (data.y || 0) - touchStartPos.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const duration = event.timestamp - touchStartPos.time;

                        if (distance < 10 && duration < 300) {
                            action = 'Tapped';
                            details = nodeName;
                        } else if (distance > 50) {
                            swipes++;
                            const direction = Math.abs(dx) > Math.abs(dy)
                                ? (dx > 0 ? 'right' : 'left')
                                : (dy > 0 ? 'down' : 'up');
                            action = 'Swiped';
                            details = direction;
                            flags.push('[SWIPE]');
                        } else if (duration > 500) {
                            action = 'Long pressed';
                            details = nodeName;
                            flags.push('[LONG PRESS]');
                        }
                        touchStartPos = null;
                    }
                }
            }

            // Mouse Move
            if (data.source === IncrementalSource.MouseMove) {
                const positions = data.positions || [];
                if (positions.length > 0) {
                    const lastPos = positions[positions.length - 1];
                    const nodeId = lastPos?.id;

                    if (nodeId && event.timestamp - lastMouseMoveLog > 3000) {
                        const nodeInfo = nodeMap.get(nodeId);
                        if (nodeInfo) {
                            const nodeName = getSemanticName(nodeInfo);
                            const tag = nodeInfo.tagName?.toLowerCase();
                            if (tag === 'button' || tag === 'a' || tag === 'input' ||
                                nodeInfo.role === 'button' || tag === 'select') {
                                totalHovers++;

                                const prevHover = hoverState.get(nodeId);
                                if (prevHover) {
                                    const hoverDuration = event.timestamp - prevHover;
                                    hoverTime += hoverDuration;

                                    if (hoverDuration > 2000) {
                                        hesitations++;
                                        action = 'Hesitated over';
                                        details = nodeName;
                                        flags.push('[HESITATION]');
                                    }
                                }
                                hoverState.set(nodeId, event.timestamp);
                                lastMouseMoveLog = event.timestamp;
                            }
                        }
                    }
                }
            }

            // Touch Move
            if (data.source === IncrementalSource.TouchMove) {
                if (data.positions && data.positions.length >= 2) {
                    pinchZooms++;
                    action = 'Pinch zoomed';
                    details = '';
                    flags.push('[PINCH ZOOM]');
                }
            }

            // Media Interaction
            if (data.source === IncrementalSource.MediaInteraction) {
                totalMediaInteractions++;
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `media #${nodeId}`;

                switch (data.type) {
                    case 0:
                        videoPlays++;
                        action = 'Played';
                        details = nodeName;
                        break;
                    case 1:
                        videoPauses++;
                        action = 'Paused';
                        details = nodeName;
                        break;
                    case 2:
                        action = 'Seeked';
                        details = `${nodeName} to ${Math.round(data.currentTime || 0)}s`;
                        flags.push('[VIDEO SEEK]');
                        break;
                }
            }

            // Log events
            if (data.source === IncrementalSource.Log) {
                if (data.level === 'error') {
                    consoleErrors++;
                    action = 'Console Error';
                    details = redact(String(data.payload?.join(' ') || data.trace?.[0] || 'Unknown error').substring(0, 100));
                    flags.push('[CONSOLE ERROR]');
                }
            }

            // Input
            if (data.source === IncrementalSource.Input) {
                totalInputs++;
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `input #${nodeId}`;
                const inputText = redact(data.text || '');
                const isPassword = nodeInfo?.type === 'password' || inputText.match(/^\*+$/) !== null;

                const prevState = inputState.get(nodeId);
                const timeSinceLast = prevState ? event.timestamp - prevState.lastTimestamp : Infinity;
                const hadContent = prevState?.hadContent || inputText.length > 0;
                const previousValue = prevState?.lastText || '';

                // Initialize field tracking if not exists
                if (!inputFieldTracking.has(nodeId)) {
                    inputFieldTracking.set(nodeId, {
                        fieldName: nodeName,
                        fieldType: nodeInfo?.type || 'text',
                        focusTimestamp: event.timestamp,
                        blurTimestamp: null,
                        values: [],
                        diffs: [],
                        corrections: 0,
                    });
                }

                const fieldTrack = inputFieldTracking.get(nodeId)!;

                // Track the diff
                if (previousValue !== inputText) {
                    const charsAdded = Math.max(0, inputText.length - previousValue.length);
                    const charsRemoved = Math.max(0, previousValue.length - inputText.length);

                    let changeType: InputDiff['changeType'] = 'typed';
                    if (inputText.length === 0 && previousValue.length > 0) {
                        changeType = 'cleared';
                    } else if (charsRemoved > 0 && charsAdded > 0) {
                        changeType = 'corrected';
                        fieldTrack.corrections++;
                    } else if (charsRemoved > 0) {
                        changeType = 'deleted';
                    } else if (charsAdded > 3 && timeSinceLast < 100) {
                        changeType = 'pasted';
                    }

                    const diff: InputDiff = {
                        fieldName: nodeName,
                        fieldType: nodeInfo?.type || 'text',
                        timestamp: timeStr,
                        rawTimestamp: event.timestamp,
                        previousValue: isPassword ? '*'.repeat(previousValue.length) : previousValue,
                        newValue: isPassword ? '*'.repeat(inputText.length) : inputText,
                        changeType,
                        charactersAdded: charsAdded,
                        charactersRemoved: charsRemoved,
                    };

                    fieldTrack.diffs.push(diff);
                    fieldTrack.values.push(inputText);
                }

                if (!prevState || prevState.lastText !== inputText) {
                    if (!prevState || timeSinceLast > 500 || Math.abs(inputText.length - prevState.lastText.length) > 3) {
                        if (inputText.length > 0) {
                            action = 'Typed';
                            if (isPassword) {
                                details = `in ${nodeName} (${inputText.length} characters, masked)`;
                            } else {
                                details = `"${inputText.substring(0, 50)}${inputText.length > 50 ? '...' : ''}" in ${nodeName}`;
                            }

                            if (prevState && inputText.length < prevState.lastText.length) {
                                flags.push('[CORRECTION]');
                            }
                        } else if (prevState && prevState.lastText.length > 0) {
                            action = 'Cleared';
                            details = nodeName;
                            clearedInputs++;
                        }
                    }
                    inputState.set(nodeId, { lastText: inputText, lastTimestamp: event.timestamp, hadContent });
                }
            }

            // Scroll
            if (data.source === IncrementalSource.Scroll) {
                totalScrolls++;
                const scrollY = data.y || 0;

                const pageHeight = viewportSize.height * 3;
                const currentDepth = Math.min(100, Math.round((scrollY / pageHeight) * 100));
                if (currentDepth > scrollDepthMax) {
                    scrollDepthMax = currentDepth;
                }

                if (lastScrollTime > 0) {
                    const scrollSpeed = Math.abs(scrollY - lastScrollY) / (event.timestamp - lastScrollTime);
                    if (scrollSpeed > 5) {
                        rapidScrolls++;
                        if (event.timestamp - lastScrollLog > 2000) {
                            flags.push('[RAPID SCROLL]');
                        }
                    }
                }

                if (lastScrollY > 0 && scrollY !== lastScrollY) {
                    scrollReversals++;
                }

                lastScrollY = scrollY;
                lastScrollTime = event.timestamp;

                if (event.timestamp - lastScrollLog > 2000) {
                    if (scrollY > 100) {
                        action = 'Scrolled';
                        if (scrollY > viewportSize.height * 2) {
                            details = 'deep into page';
                        } else if (scrollY > viewportSize.height) {
                            details = 'down the page';
                        } else {
                            details = 'near top';
                        }
                        lastScrollLog = event.timestamp;
                    }
                }
            }

            // Viewport Resize
            if (data.source === IncrementalSource.ViewportResize) {
                const oldWidth = viewportSize.width;
                const oldHeight = viewportSize.height;
                viewportSize = { width: data.width, height: data.height };
                resizeEvents++;

                const wasPortrait = oldHeight > oldWidth;
                const isPortrait = data.height > data.width;
                if (wasPortrait !== isPortrait) {
                    orientationChanges++;
                    action = 'Rotated device';
                    details = isPortrait ? 'to portrait' : 'to landscape';
                    flags.push('[ORIENTATION CHANGE]');
                }
            }
        }

        // Custom events
        if (event.type === EventType.Custom) {
            const payload = (event.data as any)?.payload;
            const tag = (event.data as any)?.tag;

            if (payload) {
                if (payload.level === 'error' || payload.type === 'error') {
                    consoleErrors++;
                    action = 'Console Error';
                    details = redact(String(payload.message || payload.content || 'Unknown error').substring(0, 100));
                    flags.push('[CONSOLE ERROR]');
                }

                if (payload.type === 'visibilitychange') {
                    tabSwitches++;
                    if (payload.hidden) {
                        action = 'Switched away';
                        details = 'from tab';
                        flags.push('[TAB SWITCH]');
                    } else {
                        action = 'Returned';
                        details = 'to tab';
                    }
                }

                if (payload.type === 'submit' || payload.type === 'form_submit') {
                    formSubmissions++;
                    action = 'Submitted';
                    details = 'form';
                    flags.push('[FORM SUBMIT]');
                }

                if (tag === '$pageview') {
                    action = 'Viewed page';
                    details = payload.$current_url || '';
                }
            }
        }

        // Plugin events
        if (event.type === 6) {
            const payload = (event.data as any)?.payload;
            if (payload) {
                if (payload.requests && Array.isArray(payload.requests)) {
                    const failedRequests = payload.requests.filter((r: any) =>
                        r.responseStatus >= 400 || r.responseStatus === 0
                    );
                    if (failedRequests.length > 0) {
                        networkErrors += failedRequests.length;
                        action = 'Network error';
                        const errorCodes = Array.from(new Set(failedRequests.map((r: any) => r.responseStatus)));
                        details = `${failedRequests.length} failed request(s) - ${errorCodes.join(', ')}`;
                        flags.push('[NETWORK ERROR]');
                    }
                }
            }
        }

        if (action) {
            logs.push({
                timestamp: timeStr,
                action,
                details,
                flags: Array.from(new Set(flags)),
                rawTimestamp: event.timestamp,
            });
        }
    });

    const totalDuration = formatTime(events[events.length - 1].timestamp - startTime);
    const sessionDurationMs = events[events.length - 1].timestamp - startTime;

    const behavioralSignals = {
        isExploring: totalScrolls > 20 && totalClicks < 5,
        isFrustrated: rageClicks > 0 || deadClicks > 2 || rapidScrolls > 3 || consoleErrors > 0 || networkErrors > 0,
        isEngaged: totalClicks > 3 && totalInputs > 0 && sessionDurationMs > 30000,
        isConfused: hesitations > 2 || scrollReversals > 5 || abandonedInputs > 0,
        isMobile: totalTouches > 0 || swipes > 0 || orientationChanges > 0,
        completedGoal: formSubmissions > 0,
    };

    // Build raw input diffs summary
    const rawInputDiffs: InputFieldSummary[] = [];
    Array.from(inputFieldTracking.entries()).forEach(([nodeId, tracking]) => {
        const lastInputState = inputState.get(nodeId);
        const finalValue = lastInputState?.lastText || '';
        const wasAbandoned = tracking.diffs.length === 0 || (!lastInputState?.hadContent && tracking.blurTimestamp !== null);
        const wasCleared = finalValue.length === 0 && tracking.values.some(v => v.length > 0);

        rawInputDiffs.push({
            fieldName: tracking.fieldName,
            fieldType: tracking.fieldType,
            focusTime: formatTime(tracking.focusTimestamp - startTime),
            blurTime: tracking.blurTimestamp ? formatTime(tracking.blurTimestamp - startTime) : null,
            timeSpentMs: (tracking.blurTimestamp || events[events.length - 1].timestamp) - tracking.focusTimestamp,
            finalValue: tracking.fieldType === 'password' ? '*'.repeat(finalValue.length) : finalValue,
            totalChanges: tracking.diffs.length,
            totalCorrections: tracking.corrections,
            wasAbandoned,
            wasCleared,
            diffs: tracking.diffs,
        });
    });

    return {
        totalDuration,
        eventCount: events.length,
        pageUrl,
        pageTitle,
        viewportSize,
        logs,
        summary: {
            totalClicks, rageClicks, deadClicks, doubleClicks, rightClicks,
            totalInputs, abandonedInputs, clearedInputs,
            totalScrolls, scrollDepthMax, rapidScrolls, scrollReversals,
            totalHovers, hesitations, hoverTime,
            totalTouches, swipes, pinchZooms,
            totalMediaInteractions, videoPlays, videoPauses,
            totalSelections, copyEvents, pasteEvents,
            consoleErrors, networkErrors,
            tabSwitches, idleTime: Math.round(totalIdleTime / 1000), formSubmissions,
            resizeEvents, orientationChanges,
        },
        behavioralSignals,
        rawInputDiffs,
    };
}

// ============================================================================
// BUILD AI PROMPT DATA (What gets sent to the model)
// ============================================================================
function buildAIPromptData(semanticSession: SemanticSession, sessionId: string) {
    const sessionLog = semanticSession.logs
        .map(log => {
            const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
            return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
        })
        .join('\n');

    const s = semanticSession.summary;
    const signals = semanticSession.behavioralSignals;

    const sessionContext = [
        `Page: ${semanticSession.pageUrl || 'Unknown'}`,
        semanticSession.pageTitle ? `Title: "${semanticSession.pageTitle}"` : null,
        `Duration: ${semanticSession.totalDuration}`,
        `Total Events: ${semanticSession.eventCount}`,
        `Viewport: ${semanticSession.viewportSize.width}x${semanticSession.viewportSize.height}`,
        '',
        '=== CLICK METRICS ===',
        `- Total Clicks: ${s.totalClicks}`,
        `- Rage Clicks: ${s.rageClicks}`,
        `- Dead/Unresponsive Clicks: ${s.deadClicks}`,
        `- Double Clicks: ${s.doubleClicks}`,
        `- Right Clicks: ${s.rightClicks}`,
        '',
        '=== INPUT METRICS ===',
        `- Total Input Events: ${s.totalInputs}`,
        `- Abandoned Inputs: ${s.abandonedInputs}`,
        `- Cleared Inputs: ${s.clearedInputs}`,
        '',
        '=== SCROLL METRICS ===',
        `- Total Scrolls: ${s.totalScrolls}`,
        `- Max Scroll Depth: ${s.scrollDepthMax}%`,
        `- Rapid Scrolls (frustration): ${s.rapidScrolls}`,
        `- Scroll Reversals (searching): ${s.scrollReversals}`,
        '',
        '=== ATTENTION METRICS ===',
        `- Hover Events: ${s.totalHovers}`,
        `- Hesitations: ${s.hesitations}`,
        `- Idle Time: ${s.idleTime}s`,
        `- Tab Switches: ${s.tabSwitches}`,
        '',
        '=== MOBILE/TOUCH METRICS ===',
        `- Touch Events: ${s.totalTouches}`,
        `- Swipes: ${s.swipes}`,
        `- Pinch Zooms: ${s.pinchZooms}`,
        `- Orientation Changes: ${s.orientationChanges}`,
        '',
        '=== MEDIA METRICS ===',
        `- Media Interactions: ${s.totalMediaInteractions}`,
        `- Video Plays: ${s.videoPlays}`,
        `- Video Pauses: ${s.videoPauses}`,
        '',
        '=== CLIPBOARD METRICS ===',
        `- Text Selections: ${s.totalSelections}`,
        `- Copy Events: ${s.copyEvents}`,
        `- Paste Events: ${s.pasteEvents}`,
        '',
        '=== ERROR METRICS ===',
        `- Console Errors: ${s.consoleErrors}`,
        `- Network Errors: ${s.networkErrors}`,
        '',
        '=== CONVERSION METRICS ===',
        `- Form Submissions: ${s.formSubmissions}`,
        `- Resize Events: ${s.resizeEvents}`,
        '',
        '=== BEHAVIORAL SIGNALS (Auto-detected) ===',
        signals.isExploring ? '- User appears to be EXPLORING (lots of scrolling, few clicks)' : null,
        signals.isFrustrated ? '- User appears FRUSTRATED (rage clicks, dead clicks, errors detected)' : null,
        signals.isEngaged ? '- User appears ENGAGED (good interaction patterns)' : null,
        signals.isConfused ? '- User appears CONFUSED (hesitations, back-and-forth behavior)' : null,
        signals.isMobile ? '- User is on MOBILE device (touch events detected)' : null,
        signals.completedGoal ? '- User COMPLETED GOAL (form submission detected)' : null,
    ].filter(Boolean).join('\n');

    // Build raw input diffs log for AI
    const inputDiffsLog = semanticSession.rawInputDiffs.length > 0
        ? semanticSession.rawInputDiffs.map(field => {
            const lines = [
                `\n--- Field: ${field.fieldName} (${field.fieldType}) ---`,
                `Focus: ${field.focusTime}${field.blurTime ? ` | Blur: ${field.blurTime}` : ''}`,
                `Time spent: ${Math.round(field.timeSpentMs / 1000)}s | Changes: ${field.totalChanges} | Corrections: ${field.totalCorrections}`,
                `Final value: "${field.finalValue}"`,
                field.wasAbandoned ? '[ABANDONED]' : null,
                field.wasCleared ? '[CLEARED]' : null,
                '',
                'Change history:',
                ...field.diffs.map(d =>
                    `  ${d.timestamp} [${d.changeType.toUpperCase()}] "${d.previousValue}" → "${d.newValue}" (+${d.charactersAdded}/-${d.charactersRemoved})`
                ),
            ];
            return lines.filter(Boolean).join('\n');
        }).join('\n')
        : 'No input field interactions recorded.';

    return {
        sessionId,
        extractedAt: new Date().toISOString(),
        sessionContext,
        sessionLog,
        logs: semanticSession.logs, // Raw logs array
        inputDiffsLog,
        rawInputDiffs: semanticSession.rawInputDiffs,
        summary: semanticSession.summary,
        behavioralSignals: semanticSession.behavioralSignals,
        metadata: {
            pageUrl: semanticSession.pageUrl,
            pageTitle: semanticSession.pageTitle,
            duration: semanticSession.totalDuration,
            eventCount: semanticSession.eventCount,
            viewportSize: semanticSession.viewportSize,
            logCount: semanticSession.logs.length,
            inputFieldCount: semanticSession.rawInputDiffs.length,
        }
    };
}

// ============================================================================
// POSTHOG API FUNCTIONS
// ============================================================================
// Helper for fetch with retry on rate limit
async function fetchWithRetry(url: string, options: RequestInit, retries = CONFIG.MAX_RETRIES): Promise<Response> {
    const res = await fetch(url, options);

    if (res.status === 429 && retries > 0) {
        // Cap wait time at 30 seconds max
        const retryAfter = Math.min(30, parseInt(res.headers.get('retry-after') || '') || (CONFIG.RETRY_DELAY / 1000));
        const waitMs = retryAfter * 1000;
        process.stdout.write(`\n  Rate limited, waiting ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        return fetchWithRetry(url, options, retries - 1);
    }

    return res;
}

async function fetchSessionsList(offset: number = 0): Promise<PostHogSession[]> {
    const url = `${CONFIG.POSTHOG_HOST}/api/environments/${CONFIG.POSTHOG_PROJECT_ID}/session_recordings?limit=${CONFIG.BATCH_SIZE}&offset=${offset}`;

    const res = await fetchWithRetry(url, {
        headers: {
            Authorization: `Bearer ${CONFIG.POSTHOG_API_KEY}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return data.results || [];
}

async function fetchSessionEvents(sessionId: string): Promise<RRWebEvent[]> {
    const headers = {
        Authorization: `Bearer ${CONFIG.POSTHOG_API_KEY}`,
        'Content-Type': 'application/json',
    };

    // Step 1: Get blob sources
    const sourcesUrl = `${CONFIG.POSTHOG_HOST}/api/environments/${CONFIG.POSTHOG_PROJECT_ID}/session_recordings/${sessionId}/snapshots?blob_v2=true`;

    const sourcesRes = await fetchWithRetry(sourcesUrl, { headers });

    if (!sourcesRes.ok) {
        throw new Error(`Failed to fetch session sources: ${sourcesRes.status}`);
    }

    const sourcesData = await sourcesRes.json();
    const sources = sourcesData.sources || [];

    if (sources.length === 0) {
        return [];
    }

    // Step 2: Fetch each blob
    const allSnapshots: unknown[] = [];
    const blobKeys = sources.map((s: { blob_key: string }) => s.blob_key);

    for (const blobKey of blobKeys) {
        const blobUrl = `${CONFIG.POSTHOG_HOST}/api/environments/${CONFIG.POSTHOG_PROJECT_ID}/session_recordings/${sessionId}/snapshots?source=blob_v2&start_blob_key=${blobKey}&end_blob_key=${blobKey}`;

        try {
            const blobRes = await fetchWithRetry(blobUrl, { headers });

            if (!blobRes.ok) continue;

            const text = await blobRes.text();
            const lines = text.trim().split('\n').filter(line => line.trim());
            const snapshots = lines.map(line => JSON.parse(line));
            allSnapshots.push(...snapshots);
        } catch {
            continue;
        }
    }

    // Step 3: Parse and decompress
    return parseEncodedSnapshots(allSnapshots);
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================
async function main() {
    console.log('='.repeat(60));
    console.log('Session Extractor - PostHog to AI Training Data');
    console.log('='.repeat(60));
    console.log(`Host: ${CONFIG.POSTHOG_HOST}`);
    console.log(`Project: ${CONFIG.POSTHOG_PROJECT_ID}`);
    console.log(`Max Sessions: ${CONFIG.MAX_SESSIONS}`);
    console.log(`Output Dir: ${CONFIG.OUTPUT_DIR}`);
    console.log('='.repeat(60));

    // Create output directory
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }

    // Fetch all sessions
    console.log('\n[1/3] Fetching session list from PostHog...');
    const allSessions: PostHogSession[] = [];
    let offset = 0;

    while (allSessions.length < CONFIG.MAX_SESSIONS) {
        const batch = await fetchSessionsList(offset);
        if (batch.length === 0) break;

        allSessions.push(...batch);
        offset += batch.length;
        process.stdout.write(`\r  Fetched ${allSessions.length} sessions...`);

        if (batch.length < CONFIG.BATCH_SIZE) break;
    }

    const sessionsToProcess = allSessions.slice(CONFIG.START_FROM, CONFIG.MAX_SESSIONS);
    console.log(`\n  Total sessions to process: ${sessionsToProcess.length} (starting from index ${CONFIG.START_FROM})`);

    // Process each session
    console.log('\n[2/3] Processing sessions and extracting AI data...');
    let successCount = 0;
    let errorCount = 0;
    let emptyCount = 0;

    for (let i = 0; i < sessionsToProcess.length; i++) {
        const session = sessionsToProcess[i];
        const progress = `[${i + 1}/${sessionsToProcess.length}]`;

        try {
            process.stdout.write(`\r${progress} Processing ${session.id}...                    `);

            // Fetch rrweb events
            const events = await fetchSessionEvents(session.id);

            if (events.length === 0) {
                emptyCount++;
                continue;
            }

            // Parse into semantic session
            const semanticSession = parseRRWebSession(events);

            if (semanticSession.logs.length === 0) {
                emptyCount++;
                continue;
            }

            // Build AI prompt data
            const aiData = buildAIPromptData(semanticSession, session.id);

            // Add session metadata from PostHog
            const outputData = {
                ...aiData,
                posthogMetadata: {
                    distinctId: session.distinct_id,
                    startTime: session.start_time,
                    endTime: session.end_time,
                    recordingDuration: session.recording_duration,
                    clickCount: session.click_count,
                    keypressCount: session.keypress_count,
                    activeSeconds: session.active_seconds,
                }
            };

            // Save to file
            const filename = `${session.id}.json`;
            const filepath = path.join(CONFIG.OUTPUT_DIR, filename);
            fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));

            successCount++;

            // Small delay to avoid rate limiting
            if (CONFIG.DELAY_BETWEEN_SESSIONS > 0) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_SESSIONS));
            }
        } catch (err) {
            errorCount++;
            console.error(`\n  Error processing ${session.id}: ${err}`);
        }
    }

    // Summary
    console.log('\n\n[3/3] Extraction Complete!');
    console.log('='.repeat(60));
    console.log(`  Successful: ${successCount}`);
    console.log(`  Empty/No Logs: ${emptyCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Output: ${CONFIG.OUTPUT_DIR}`);
    console.log('='.repeat(60));

    // Create summary file
    const summaryPath = path.join(CONFIG.OUTPUT_DIR, '_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
        extractedAt: new Date().toISOString(),
        config: {
            host: CONFIG.POSTHOG_HOST,
            projectId: CONFIG.POSTHOG_PROJECT_ID,
            maxSessions: CONFIG.MAX_SESSIONS,
        },
        results: {
            totalProcessed: sessionsToProcess.length,
            successful: successCount,
            empty: emptyCount,
            errors: errorCount,
        },
        sessions: sessionsToProcess.map(s => ({
            id: s.id,
            startTime: s.start_time,
            duration: s.recording_duration,
        })),
    }, null, 2));

    console.log(`\nSummary saved to: ${summaryPath}`);
}

// Run
main().catch(console.error);
