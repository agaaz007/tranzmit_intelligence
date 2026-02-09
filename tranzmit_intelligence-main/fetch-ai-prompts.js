#!/usr/bin/env node
/**
 * PostHog Session AI Prompt Extractor
 * 
 * Fetches session recordings from PostHog, extracts rrweb data,
 * and saves the exact data that would be sent to the AI model.
 * 
 * Usage: node fetch-ai-prompts.js [count]
 * Example: node fetch-ai-prompts.js 1000
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import zlib from "zlib";

// Configuration
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.posthog.com";
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || "291254";
const API_KEY = process.env.POSTHOG_API_KEY || "phx_4KTJ8qIDpnr2U9NUwLAvbol6WeDaXaxKE0Og4DgzBs7gIqU";
const OUTPUT_DIR = "./ai-prompts";

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// ============================================
// Enums (matching rrweb)
// ============================================
const EventType = { DomContentLoaded: 0, Load: 1, FullSnapshot: 2, IncrementalSnapshot: 3, Meta: 4, Custom: 5 };
const NodeType = { Document: 0, DocumentType: 1, Element: 2, Text: 3, CDATA: 4, Comment: 5 };
const IncrementalSource = { Mutation: 0, MouseMove: 1, MouseInteraction: 2, Scroll: 3, ViewportResize: 4, Input: 5, TouchMove: 6, MediaInteraction: 7, StyleSheetRule: 8, CanvasMutation: 9, Font: 10, Log: 11, Drag: 12 };
const MouseInteractionType = { MouseUp: 0, MouseDown: 1, Click: 2, ContextMenu: 3, DblClick: 4, Focus: 5, Blur: 6, TouchStart: 7, TouchMove_Departed: 8, TouchEnd: 9, TouchCancel: 10 };

// ============================================
// Utility Functions
// ============================================
const PII_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\d[ -]*?){13,16}/g;
const formatTime = (ms) => { const s = Math.floor(ms / 1000); return `[${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}]`; };
const redact = (text) => text ? text.replace(PII_REGEX, '[REDACTED]') : '';

function getSemanticName(info) {
    const { tagName, id, className, type, placeholder, name, role, ariaLabel, textContent, href } = info;
    const tag = tagName?.toLowerCase() || 'element';
    
    if (tag === 'button' || role === 'button') return textContent ? `"${redact(textContent)}" button` : ariaLabel ? `"${ariaLabel}" button` : 'button';
    if (tag === 'a') return textContent ? `"${redact(textContent)}" link` : ariaLabel ? `"${ariaLabel}" link` : href ? `link to ${href.split('/').pop() || href}` : 'link';
    if (tag === 'input') { const t = type || 'text'; return placeholder ? `"${placeholder}" ${t} field` : name ? `"${name}" ${t} field` : ariaLabel ? `"${ariaLabel}" ${t} field` : `${t} input field`; }
    if (tag === 'textarea') return placeholder ? `"${placeholder}" text area` : name ? `"${name}" text area` : 'text area';
    if (tag === 'select') return name ? `"${name}" dropdown` : 'dropdown';
    if (tag === 'img') return info.src ? `image (${info.src.split('/').pop()?.split('?')[0] || 'image'})` : 'image';
    if ((tag === 'div' || tag === 'span') && textContent && textContent.length < 50) return `"${redact(textContent)}"`;
    if (ariaLabel) return `"${ariaLabel}" ${tag}`;
    if (id && !id.match(/^[a-z0-9]{8,}$/i) && !id.startsWith(':r')) return `#${id} ${tag}`;
    if (className) { const c = className.split(' ').filter(c => c.length > 2 && !c.startsWith('_') && !c.match(/^[a-z0-9]{8,}$/i)); if (c.length > 0) return `.${c[0]} ${tag}`; }
    return tag;
}

function buildNodeMap(node, map) {
    if (!node) return;
    if (node.id && node.type === NodeType.Element) {
        const info = { tagName: node.tagName || '' };
        if (node.attributes) {
            info.id = node.attributes.id; info.className = node.attributes.class; info.type = node.attributes.type;
            info.placeholder = node.attributes.placeholder; info.name = node.attributes.name; info.role = node.attributes.role;
            info.ariaLabel = node.attributes['aria-label']; info.href = node.attributes.href; info.src = node.attributes.src;
        }
        if (node.childNodes) {
            const textNodes = node.childNodes.filter(c => c.type === NodeType.Text);
            if (textNodes.length > 0) {
                const text = textNodes.map(t => t.textContent?.trim()).filter(Boolean).join(' ').trim();
                if (text && text.length < 100) info.textContent = text;
            }
        }
        map.set(node.id, info);
    }
    if (node.childNodes) node.childNodes.forEach(child => buildNodeMap(child, map));
}

// ============================================
// RRWeb Parser (parseRRWebSession)
// ============================================
function parseRRWebSession(events) {
    const emptySummary = { totalClicks: 0, rageClicks: 0, deadClicks: 0, doubleClicks: 0, rightClicks: 0, totalInputs: 0, abandonedInputs: 0, clearedInputs: 0, totalScrolls: 0, scrollDepthMax: 0, rapidScrolls: 0, scrollReversals: 0, totalHovers: 0, hesitations: 0, hoverTime: 0, totalTouches: 0, swipes: 0, pinchZooms: 0, totalMediaInteractions: 0, videoPlays: 0, videoPauses: 0, totalSelections: 0, copyEvents: 0, pasteEvents: 0, consoleErrors: 0, networkErrors: 0, tabSwitches: 0, idleTime: 0, formSubmissions: 0, resizeEvents: 0, orientationChanges: 0 };
    const emptySignals = { isExploring: false, isFrustrated: false, isEngaged: false, isConfused: false, isMobile: false, completedGoal: false };
    
    if (!events || events.length === 0) return { totalDuration: '00:00', eventCount: 0, pageUrl: '', pageTitle: '', viewportSize: { width: 0, height: 0 }, logs: [], summary: emptySummary, behavioralSignals: emptySignals };

    events.sort((a, b) => a.timestamp - b.timestamp);
    const startTime = events[0].timestamp;
    const nodeMap = new Map();
    const clickHistory = [];
    const logs = [];
    
    let pageUrl = '', pageTitle = '', viewportSize = { width: 0, height: 0 };
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
    
    let lastInteractionTime = startTime, totalIdleTime = 0;
    const IDLE_THRESHOLD = 5000;
    let lastScrollLog = 0, lastMouseMoveLog = 0, lastScrollY = 0, lastScrollTime = 0;
    const hoverState = new Map();
    const inputState = new Map();
    let touchStartPos = null;

    // Extract Meta info
    const metaEvent = events.find(e => e.type === EventType.Meta);
    if (metaEvent?.data) { pageUrl = metaEvent.data.href || ''; viewportSize = { width: metaEvent.data.width || 0, height: metaEvent.data.height || 0 }; }

    // Build Node Map from FullSnapshot
    const snapshotEvent = events.find(e => e.type === EventType.FullSnapshot);
    if (snapshotEvent?.data) {
        let snapshotData = snapshotEvent.data;
        if (typeof snapshotData === 'string') {
            try { const buf = Buffer.from(snapshotData, 'binary'); snapshotData = JSON.parse(zlib.gunzipSync(buf).toString('utf-8')); }
            catch { try { snapshotData = JSON.parse(snapshotData); } catch {} }
        }
        if (snapshotData?.node) {
            buildNodeMap(snapshotData.node, nodeMap);
            const findTitle = (node) => { if (!node) return null; if (node.tagName === 'title' && node.childNodes?.[0]?.textContent) return node.childNodes[0].textContent; if (node.childNodes) for (const c of node.childNodes) { const t = findTitle(c); if (t) return t; } return null; };
            pageTitle = findTitle(snapshotData.node) || '';
        }
    }

    if (pageUrl) logs.push({ timestamp: '[00:00]', action: 'Session Started', details: `on ${new URL(pageUrl).hostname}${pageTitle ? ` - "${pageTitle}"` : ''}`, flags: [], rawTimestamp: startTime });

    // Process Events
    events.forEach((event, index) => {
        const timeOffset = event.timestamp - startTime;
        const timeStr = formatTime(timeOffset);
        const flags = [];
        let action = '', details = '';
        
        if (event.timestamp - lastInteractionTime > IDLE_THRESHOLD) totalIdleTime += event.timestamp - lastInteractionTime - IDLE_THRESHOLD;

        // Handle mutations
        if (event.type === EventType.IncrementalSnapshot && event.data?.source === IncrementalSource.Mutation) {
            if (event.data.adds && Array.isArray(event.data.adds)) for (const add of event.data.adds) if (add.node) buildNodeMap(add.node, nodeMap);
            const addedNodes = event.data.adds?.length || 0;
            if (addedNodes > 10) { action = 'Content loaded'; details = `${addedNodes} elements added`; }
        }

        if (event.type === EventType.IncrementalSnapshot) {
            const data = event.data;
            lastInteractionTime = event.timestamp;

            // Mouse Interaction
            if (data.source === IncrementalSource.MouseInteraction) {
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `element #${nodeId}`;
                
                if (data.type === MouseInteractionType.Click) {
                    totalClicks++; action = 'Clicked'; details = nodeName;
                    const recentClicks = clickHistory.filter(c => c.id === nodeId && event.timestamp - c.timestamp < 2000);
                    if (recentClicks.length >= 2) { flags.push('[RAGE CLICK]'); rageClicks++; }
                    const veryRecentClicks = clickHistory.filter(c => event.timestamp - c.timestamp < 1500);
                    if (veryRecentClicks.length >= 3 && new Set(veryRecentClicks.map(c => c.id)).size >= 3) flags.push('[CLICK THRASHING]');
                    clickHistory.push({ id: nodeId, timestamp: event.timestamp, nodeName });
                    
                    let responseFound = false;
                    for (let i = index + 1; i < Math.min(index + 100, events.length); i++) {
                        const nextEvent = events[i];
                        if (nextEvent.timestamp - event.timestamp > 1000) break;
                        if (nextEvent.type === EventType.IncrementalSnapshot && nextEvent.data.source === IncrementalSource.Mutation) { responseFound = true; break; }
                    }
                    if (!responseFound) { flags.push('[NO RESPONSE]'); deadClicks++; }
                    
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'a' || nodeInfo?.href) action = 'Clicked link';
                    else if (tag === 'button' || nodeInfo?.role === 'button') action = 'Clicked button';
                    else if (tag === 'input' && nodeInfo?.type === 'submit') { action = 'Clicked submit'; formSubmissions++; }
                    else if (tag === 'input' && (nodeInfo?.type === 'checkbox' || nodeInfo?.type === 'radio')) action = nodeInfo.type === 'checkbox' ? 'Toggled checkbox' : 'Selected radio';
                }
                if (data.type === MouseInteractionType.DblClick) { doubleClicks++; action = 'Double-clicked'; details = nodeName; }
                if (data.type === MouseInteractionType.ContextMenu) { rightClicks++; action = 'Right-clicked'; details = nodeName; }
                if (data.type === MouseInteractionType.Focus) {
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'input' || tag === 'textarea' || tag === 'select') { action = 'Focused on'; details = nodeName; if (!inputState.has(nodeId)) inputState.set(nodeId, { lastText: '', lastTimestamp: event.timestamp, hadContent: false }); }
                }
                if (data.type === MouseInteractionType.Blur) {
                    const tag = nodeInfo?.tagName?.toLowerCase();
                    if (tag === 'input' || tag === 'textarea') {
                        const inputVal = inputState.get(nodeId);
                        if (inputVal) {
                            if (inputVal.lastText.length === 0 && !inputVal.hadContent) { action = 'Abandoned'; details = `${nodeName} without entering anything`; flags.push('[ABANDONED INPUT]'); abandonedInputs++; }
                            else if (inputVal.lastText.length === 0 && inputVal.hadContent) { action = 'Cleared and left'; details = nodeName; flags.push('[CLEARED INPUT]'); clearedInputs++; }
                        }
                    }
                }
                if (data.type === MouseInteractionType.TouchStart) { totalTouches++; touchStartPos = { x: data.x || 0, y: data.y || 0, time: event.timestamp }; action = 'Touched'; details = nodeName; }
                if (data.type === MouseInteractionType.TouchEnd && touchStartPos) {
                    const dx = (data.x || 0) - touchStartPos.x, dy = (data.y || 0) - touchStartPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy), duration = event.timestamp - touchStartPos.time;
                    if (distance < 10 && duration < 300) { action = 'Tapped'; details = nodeName; }
                    else if (distance > 50) { swipes++; action = 'Swiped'; details = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); flags.push('[SWIPE]'); }
                    else if (duration > 500) { action = 'Long pressed'; details = nodeName; flags.push('[LONG PRESS]'); }
                    touchStartPos = null;
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
                            if (tag === 'button' || tag === 'a' || tag === 'input' || nodeInfo.role === 'button' || tag === 'select') {
                                totalHovers++;
                                const prevHover = hoverState.get(nodeId);
                                if (prevHover) {
                                    const hoverDuration = event.timestamp - prevHover;
                                    hoverTime += hoverDuration;
                                    if (hoverDuration > 2000) { hesitations++; action = 'Hesitated over'; details = nodeName; flags.push('[HESITATION]'); }
                                    else { action = 'Hovered over'; details = nodeName; }
                                } else { action = 'Hovered over'; details = nodeName; }
                                hoverState.set(nodeId, event.timestamp);
                                lastMouseMoveLog = event.timestamp;
                            }
                        }
                    }
                }
            }

            // Touch Move
            if (data.source === IncrementalSource.TouchMove && data.positions && data.positions.length >= 2) {
                pinchZooms++; action = 'Pinch zoomed'; details = ''; flags.push('[PINCH ZOOM]');
            }

            // Media Interaction
            if (data.source === IncrementalSource.MediaInteraction) {
                totalMediaInteractions++;
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `media #${nodeId}`;
                switch (data.type) {
                    case 0: videoPlays++; action = 'Played'; details = nodeName; break;
                    case 1: videoPauses++; action = 'Paused'; details = nodeName; break;
                    case 2: action = 'Seeked'; details = `${nodeName} to ${Math.round(data.currentTime || 0)}s`; flags.push('[VIDEO SEEK]'); break;
                    case 3: action = data.muted ? 'Muted' : 'Changed volume'; details = data.muted ? nodeName : `on ${nodeName} to ${Math.round((data.volume || 0) * 100)}%`; break;
                    case 4: action = 'Changed playback speed'; details = `on ${nodeName} to ${data.playbackRate || 1}x`; break;
                    default: action = 'Interacted with'; details = nodeName;
                }
            }

            // Drag
            if (data.source === IncrementalSource.Drag) {
                const positions = data.positions || [];
                if (positions.length > 0) {
                    const start = positions[0], end = positions[positions.length - 1];
                    const distance = Math.sqrt(Math.pow((end.x || 0) - (start.x || 0), 2) + Math.pow((end.y || 0) - (start.y || 0), 2));
                    action = 'Dragged'; details = `${Math.round(distance)}px`;
                }
            }

            // Canvas
            if (data.source === IncrementalSource.CanvasMutation) { action = 'Drew on canvas'; details = 'interactive element'; }

            // Log events
            if (data.source === IncrementalSource.Log) {
                if (data.level === 'error') { consoleErrors++; action = 'Console Error'; details = redact(String(data.payload?.join(' ') || data.trace?.[0] || 'Unknown error').substring(0, 100)); flags.push('[CONSOLE ERROR]'); }
                else if (data.level === 'warn') { action = 'Console Warning'; details = redact(String(data.payload?.join(' ') || '').substring(0, 100)); flags.push('[CONSOLE WARNING]'); }
            }

            // Input
            if (data.source === IncrementalSource.Input) {
                totalInputs++;
                const nodeId = data.id;
                const nodeInfo = nodeMap.get(nodeId);
                const nodeName = nodeInfo ? getSemanticName(nodeInfo) : `input #${nodeId}`;
                const inputText = redact(data.text || '');
                const prevState = inputState.get(nodeId);
                const timeSinceLast = prevState ? event.timestamp - prevState.lastTimestamp : Infinity;
                const hadContent = prevState?.hadContent || inputText.length > 0;
                
                if (!prevState || prevState.lastText !== inputText) {
                    if (!prevState || timeSinceLast > 500 || Math.abs(inputText.length - prevState.lastText.length) > 3) {
                        const isPassword = nodeInfo?.type === 'password' || inputText.match(/^\*+$/) !== null;
                        if (inputText.length > 0) {
                            action = 'Typed';
                            details = isPassword ? `in ${nodeName} (${inputText.length} characters, masked)` : `"${inputText.substring(0, 50)}${inputText.length > 50 ? '...' : ''}" in ${nodeName}`;
                            if (prevState && inputText.length < prevState.lastText.length) flags.push('[CORRECTION]');
                        } else if (prevState && prevState.lastText.length > 0) { action = 'Cleared'; details = nodeName; clearedInputs++; }
                    }
                    inputState.set(nodeId, { lastText: inputText, lastTimestamp: event.timestamp, hadContent });
                }
                if (data.isChecked !== undefined) { action = data.isChecked ? 'Checked' : 'Unchecked'; details = nodeName; }
            }

            // Scroll
            if (data.source === IncrementalSource.Scroll) {
                totalScrolls++;
                const scrollY = data.y || 0, scrollX = data.x || 0;
                const pageHeight = viewportSize.height * 3;
                const currentDepth = Math.min(100, Math.round((scrollY / pageHeight) * 100));
                if (currentDepth > scrollDepthMax) scrollDepthMax = currentDepth;
                
                if (lastScrollTime > 0) {
                    const scrollSpeed = Math.abs(scrollY - lastScrollY) / (event.timestamp - lastScrollTime);
                    if (scrollSpeed > 5) { rapidScrolls++; if (event.timestamp - lastScrollLog > 2000) flags.push('[RAPID SCROLL]'); }
                }
                if (lastScrollY > 0 && scrollY !== lastScrollY) scrollReversals++;
                lastScrollY = scrollY; lastScrollTime = event.timestamp;
                
                if (event.timestamp - lastScrollLog > 2000 && scrollY > 100) {
                    action = 'Scrolled';
                    details = scrollY > viewportSize.height * 2 ? 'deep into page' : scrollY > viewportSize.height ? 'down the page' : 'near top';
                    if (scrollX > 100) { details += ` (horizontal: ${scrollX}px)`; flags.push('[HORIZONTAL SCROLL]'); }
                    lastScrollLog = event.timestamp;
                }
            }

            // Viewport Resize
            if (data.source === IncrementalSource.ViewportResize) {
                const oldWidth = viewportSize.width, oldHeight = viewportSize.height;
                viewportSize = { width: data.width, height: data.height }; resizeEvents++;
                const wasPortrait = oldHeight > oldWidth, isPortrait = data.height > data.width;
                if (wasPortrait !== isPortrait) { orientationChanges++; action = 'Rotated device'; details = isPortrait ? 'to portrait' : 'to landscape'; flags.push('[ORIENTATION CHANGE]'); }
                else { action = 'Resized window'; details = `to ${data.width}x${data.height}`; }
            }
        }

        // Custom events
        if (event.type === EventType.Custom) {
            const payload = event.data?.payload;
            const tag = event.data?.tag;
            if (payload) {
                if (payload.level === 'error' || payload.type === 'error') { consoleErrors++; action = 'Console Error'; details = redact(String(payload.message || payload.content || 'Unknown error').substring(0, 100)); flags.push('[CONSOLE ERROR]'); }
                if (payload.level === 'warn' || payload.type === 'warning') { action = 'Console Warning'; details = redact(String(payload.message || payload.content || '').substring(0, 100)); flags.push('[CONSOLE WARNING]'); }
                if (payload.type === 'navigation' || payload.href) { action = 'Navigated'; details = `to ${payload.href || payload.url || 'new page'}`; }
                if (payload.type === 'selection' || payload.selection) { totalSelections++; const t = payload.selection || payload.text || ''; if (t.length > 0) { action = 'Selected text'; details = `"${redact(t.substring(0, 50))}${t.length > 50 ? '...' : ''}"`; } }
                if (payload.type === 'copy') { copyEvents++; action = 'Copied'; details = 'text to clipboard'; }
                if (payload.type === 'paste') { pasteEvents++; action = 'Pasted'; details = 'from clipboard'; }
                if (payload.type === 'cut') { action = 'Cut'; details = 'text to clipboard'; }
                if (payload.type === 'submit' || payload.type === 'form_submit') { formSubmissions++; action = 'Submitted'; details = 'form'; flags.push('[FORM SUBMIT]'); }
                if (payload.type === 'visibilitychange') { tabSwitches++; if (payload.hidden) { action = 'Switched away'; details = 'from tab'; flags.push('[TAB SWITCH]'); } else { action = 'Returned'; details = 'to tab'; } }
                if (payload.type === 'beforeunload') { action = 'Attempted to leave'; details = 'page'; flags.push('[EXIT INTENT]'); }
                if (payload.type === 'offline') { action = 'Went offline'; details = ''; flags.push('[OFFLINE]'); }
                if ((payload.type === 'keydown' || payload.type === 'keypress') && (payload.ctrlKey || payload.metaKey || payload.altKey)) {
                    const key = payload.key || payload.code || '';
                    if (key) { const mods = [payload.ctrlKey && 'Ctrl', payload.metaKey && 'Cmd', payload.altKey && 'Alt', payload.shiftKey && 'Shift'].filter(Boolean).join('+'); action = 'Pressed'; details = `${mods}+${key}`; flags.push('[KEYBOARD SHORTCUT]'); }
                }
                if (tag === '$pageview') { action = 'Viewed page'; details = payload.$current_url || ''; }
                if (tag === '$pageleave') { action = 'Left page'; details = ''; }
            }
        }

        // Plugin events (Type 6)
        if (event.type === 6) {
            const payload = event.data?.payload;
            if (payload?.requests && Array.isArray(payload.requests)) {
                const failedReqs = payload.requests.filter(r => r.responseStatus >= 400 || r.responseStatus === 0);
                if (failedReqs.length > 0) { networkErrors += failedReqs.length; action = 'Network error'; details = `${failedReqs.length} failed request(s)`; flags.push('[NETWORK ERROR]'); }
                const slowReqs = payload.requests.filter(r => r.duration > 3000 && r.responseStatus < 400);
                if (slowReqs.length > 0) { action = 'Slow network'; details = `${slowReqs.length} slow request(s)`; flags.push('[SLOW NETWORK]'); }
            }
            if (payload?.type === 'performance' || payload?.performanceEntries) {
                const lcp = payload.largestContentfulPaint || payload.lcp;
                if (lcp && lcp > 4000) { action = 'Slow page load'; details = `LCP: ${Math.round(lcp)}ms`; flags.push('[SLOW LOAD]'); }
            }
        }

        if (action) logs.push({ timestamp: timeStr, action, details, flags: [...new Set(flags)], rawTimestamp: event.timestamp });
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

    return {
        totalDuration, eventCount: events.length, pageUrl, pageTitle, viewportSize, logs,
        summary: { totalClicks, rageClicks, deadClicks, doubleClicks, rightClicks, totalInputs, abandonedInputs, clearedInputs, totalScrolls, scrollDepthMax, rapidScrolls, scrollReversals, totalHovers, hesitations, hoverTime, totalTouches, swipes, pinchZooms, totalMediaInteractions, videoPlays, videoPauses, totalSelections, copyEvents, pasteEvents, consoleErrors, networkErrors, tabSwitches, idleTime: Math.round(totalIdleTime / 1000), formSubmissions, resizeEvents, orientationChanges },
        behavioralSignals,
    };
}

// ============================================
// Generate AI Prompt (same as route.ts)
// ============================================
function generateAIPrompt(semanticSession) {
    const sessionLog = semanticSession.logs.map(log => {
        const flagStr = log.flags.length > 0 ? ` ${log.flags.join(' ')}` : '';
        return `${log.timestamp} ${log.action}: ${log.details}${flagStr}`;
    }).join('\n');

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
        `- Total Clicks: ${s.totalClicks}`, `- Rage Clicks: ${s.rageClicks}`, `- Dead/Unresponsive Clicks: ${s.deadClicks}`,
        `- Double Clicks: ${s.doubleClicks}`, `- Right Clicks: ${s.rightClicks}`,
        '', '=== INPUT METRICS ===',
        `- Total Input Events: ${s.totalInputs}`, `- Abandoned Inputs: ${s.abandonedInputs}`, `- Cleared Inputs: ${s.clearedInputs}`,
        '', '=== SCROLL METRICS ===',
        `- Total Scrolls: ${s.totalScrolls}`, `- Max Scroll Depth: ${s.scrollDepthMax}%`, `- Rapid Scrolls (frustration): ${s.rapidScrolls}`, `- Scroll Reversals (searching): ${s.scrollReversals}`,
        '', '=== ATTENTION METRICS ===',
        `- Hover Events: ${s.totalHovers}`, `- Hesitations: ${s.hesitations}`, `- Idle Time: ${s.idleTime}s`, `- Tab Switches: ${s.tabSwitches}`,
        '', '=== MOBILE/TOUCH METRICS ===',
        `- Touch Events: ${s.totalTouches}`, `- Swipes: ${s.swipes}`, `- Pinch Zooms: ${s.pinchZooms}`, `- Orientation Changes: ${s.orientationChanges}`,
        '', '=== MEDIA METRICS ===',
        `- Media Interactions: ${s.totalMediaInteractions}`, `- Video Plays: ${s.videoPlays}`, `- Video Pauses: ${s.videoPauses}`,
        '', '=== CLIPBOARD METRICS ===',
        `- Text Selections: ${s.totalSelections}`, `- Copy Events: ${s.copyEvents}`, `- Paste Events: ${s.pasteEvents}`,
        '', '=== ERROR METRICS ===',
        `- Console Errors: ${s.consoleErrors}`, `- Network Errors: ${s.networkErrors}`,
        '', '=== CONVERSION METRICS ===',
        `- Form Submissions: ${s.formSubmissions}`, `- Resize Events: ${s.resizeEvents}`,
        '', '=== BEHAVIORAL SIGNALS (Auto-detected) ===',
        signals.isExploring ? '- User appears to be EXPLORING (lots of scrolling, few clicks)' : null,
        signals.isFrustrated ? '- User appears FRUSTRATED (rage clicks, dead clicks, errors detected)' : null,
        signals.isEngaged ? '- User appears ENGAGED (good interaction patterns)' : null,
        signals.isConfused ? '- User appears CONFUSED (hesitations, back-and-forth behavior)' : null,
        signals.isMobile ? '- User is on MOBILE device (touch events detected)' : null,
        signals.completedGoal ? '- User COMPLETED GOAL (form submission detected)' : null,
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are an expert UX Researcher analyzing a recorded user session. Your job is to identify what the user was trying to do, what problems they encountered, and rate the overall experience.

IMPORTANT RULES:
1. ONLY reference events that actually appear in the session log - do not invent or hallucinate actions
2. Use the EXACT timestamps from the logs when referencing events
3. Pay special attention to these friction indicators:
   - [RAGE CLICK] - User clicked rapidly on same element (frustrated)
   - [NO RESPONSE] - Click had no effect (broken element)
   - [CLICK THRASHING] - Rapid clicks on different elements (confused)
   - [CONSOLE ERROR] - JavaScript error occurred
   - [NETWORK ERROR] - API/network request failed
   - [SLOW NETWORK] - Slow API responses
   - [SLOW LOAD] - Page loaded slowly
   - [ABANDONED INPUT] - User focused on input but left without typing
   - [CLEARED INPUT] - User typed then deleted everything
   - [CORRECTION] - User made typing corrections
   - [HESITATION] - User hovered over element for a long time (uncertain)
   - [RAPID SCROLL] - Fast scrolling (frustrated or searching)
   - [TAB SWITCH] - User switched to another tab
   - [EXIT INTENT] - User tried to leave the page
   - [SWIPE] - Mobile swipe gesture
   - [LONG PRESS] - Mobile long press
   - [HORIZONTAL SCROLL] - Unusual horizontal scrolling
   - [ORIENTATION CHANGE] - Device rotation
   - [OFFLINE] - User went offline
   - [KEYBOARD SHORTCUT] - Power user behavior
   - [FORM SUBMIT] - Form was submitted
   - [VIDEO SEEK] - User skipped in video
4. Consider the behavioral signals section - these are auto-detected patterns
5. Be specific about element names - use the exact descriptions from the logs

SESSION CONTEXT:
${sessionContext}`;

    const userPrompt = `Analyze this user session log and provide insights:

SESSION LOG:
${sessionLog}

Based on this log, analyze:
1. What was the user trying to accomplish?
2. What friction points did they encounter? (Reference specific timestamps)
3. What worked well?
4. Overall UX rating (1-10)

Remember: Only reference events that actually appear in the log above.`;

    return { systemPrompt, userPrompt, sessionLog, sessionContext };
}

// ============================================
// PostHog API Functions
// ============================================
function decompressEvent(event) {
    if (typeof event === "string") { try { return JSON.parse(event); } catch { return event; } }
    if (event && typeof event === "object" && event.cv && typeof event.data === "string") {
        try { const buf = Buffer.from(event.data, "base64"); return { ...event, data: JSON.parse(zlib.gunzipSync(buf).toString("utf8")) }; }
        catch { try { const buf = Buffer.from(event.data, "binary"); return { type: event.type, timestamp: event.timestamp, data: JSON.parse(zlib.gunzipSync(buf).toString("utf8")) }; } catch { return event; } }
    }
    return event;
}

function parseEncodedSnapshots(items) {
    const parsedLines = [];
    let lastWindowId = null;
    for (const item of items) {
        if (!item) continue;
        try {
            let snapshotLine = typeof item === "string" ? JSON.parse(item) : item;
            let resolvedWindowId = null, eventData = null;
            if (Array.isArray(snapshotLine)) { resolvedWindowId = snapshotLine[0]; eventData = snapshotLine[1]; }
            else if (snapshotLine.type !== undefined) { eventData = snapshotLine; resolvedWindowId = snapshotLine.windowId || null; }
            else if (snapshotLine.data) { resolvedWindowId = snapshotLine.window_id || snapshotLine.windowId || null; eventData = snapshotLine.data; }
            if (!eventData) continue;
            if (resolvedWindowId) lastWindowId = resolvedWindowId; else if (lastWindowId) resolvedWindowId = lastWindowId; else continue;
            const events = Array.isArray(eventData) ? eventData : [eventData];
            parsedLines.push(...events.map(evt => { const d = decompressEvent(evt); return d && d.type !== undefined ? { ...d, windowId: resolvedWindowId } : null; }).filter(Boolean));
        } catch { continue; }
    }
    return parsedLines;
}

async function fetchSessionList(limit = 1000) {
    console.log(`📋 Fetching session recordings list (up to ${limit})...\n`);
    let allSessions = [];
    let nextUrl = `${POSTHOG_HOST}/api/projects/${PROJECT_ID}/session_recordings/?limit=100`;
    
    while (nextUrl && allSessions.length < limit) {
        const res = await fetch(nextUrl, { headers });
        if (!res.ok) throw new Error(`Failed to fetch sessions (${res.status})`);
        const json = await res.json();
        allSessions.push(...(json.results || []));
        nextUrl = json.next;
        if (allSessions.length < limit && nextUrl) {
            process.stdout.write(`\r   Fetched ${allSessions.length} sessions...`);
        }
    }
    console.log(`\r   Fetched ${allSessions.length} sessions total.`);
    return allSessions.slice(0, limit);
}

async function getSnapshotSources(sessionId) {
    const url = `${POSTHOG_HOST}/api/environments/${PROJECT_ID}/session_recordings/${sessionId}/snapshots?blob_v2=true`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Failed to list sources (${res.status})`);
    return (await res.json()).sources || [];
}

async function fetchSingleBlob(sessionId, blobKey) {
    const url = `${POSTHOG_HOST}/api/environments/${PROJECT_ID}/session_recordings/${sessionId}/snapshots?source=blob_v2&start_blob_key=${blobKey}&end_blob_key=${blobKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const text = await res.text();
    return text.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
}

async function fetchSessionSnapshots(sessionId) {
    const sources = await getSnapshotSources(sessionId);
    if (sources.length === 0) return [];
    let allSnapshots = [];
    for (const s of sources) {
        const snapshots = await fetchSingleBlob(sessionId, parseInt(s.blob_key));
        allSnapshots.push(...snapshots);
    }
    return allSnapshots;
}

// ============================================
// Main Processing
// ============================================
async function processSession(session, index, total) {
    const sessionId = session.id;
    const startTime = session.start_time ? new Date(session.start_time).toISOString() : 'unknown';
    const duration = session.recording_duration ? `${Math.round(session.recording_duration)}s` : 'unknown';
    
    console.log(`\n[${index + 1}/${total}] 📹 Processing: ${sessionId.substring(0, 20)}...`);
    console.log(`    Started: ${startTime} | Duration: ${duration}`);
    
    try {
        process.stdout.write("    Fetching snapshots... ");
        const rawSnapshots = await fetchSessionSnapshots(sessionId);
        if (rawSnapshots.length === 0) { console.log("⚠️  No data"); return null; }
        console.log(`✓ ${rawSnapshots.length} raw`);

        process.stdout.write("    Processing rrweb... ");
        const events = parseEncodedSnapshots(rawSnapshots);
        console.log(`✓ ${events.length} events`);

        process.stdout.write("    Parsing session... ");
        const semanticSession = parseRRWebSession(events);
        
        if (semanticSession.logs.length === 0) { console.log("⚠️  No meaningful interactions"); return null; }
        console.log(`✓ ${semanticSession.logs.length} logs`);

        process.stdout.write("    Generating prompt... ");
        const promptData = generateAIPrompt(semanticSession);
        console.log("✓");

        // Save to file
        const filename = `session_${sessionId}_ai-prompt.json`;
        const filepath = path.join(OUTPUT_DIR, filename);
        
        const outputData = {
            sessionId,
            metadata: {
                startTime: session.start_time,
                duration: session.recording_duration,
                fetchedAt: new Date().toISOString(),
                eventCount: events.length,
                logCount: semanticSession.logs.length,
            },
            prompt: {
                systemPrompt: promptData.systemPrompt,
                userPrompt: promptData.userPrompt,
            },
            sessionContext: promptData.sessionContext,
            sessionLog: promptData.sessionLog,
            summary: semanticSession.summary,
            behavioralSignals: semanticSession.behavioralSignals,
        };
        
        fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));
        console.log(`    ✅ Saved: ${filename}`);
        
        return { sessionId, filename, logCount: semanticSession.logs.length };
    } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║      PostHog Session AI Prompt Extractor                  ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    if (!API_KEY || !PROJECT_ID) { console.error("❌ Missing POSTHOG_API_KEY or POSTHOG_PROJECT_ID"); process.exit(1); }

    console.log(`🔧 Configuration:`);
    console.log(`   Host: ${POSTHOG_HOST}`);
    console.log(`   Project ID: ${PROJECT_ID}`);
    console.log(`   Output Directory: ${OUTPUT_DIR}\n`);

    if (!fs.existsSync(OUTPUT_DIR)) { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); console.log(`📁 Created: ${OUTPUT_DIR}\n`); }

    // Get count from args
    const count = parseInt(process.argv[2] || '1000', 10);
    if (isNaN(count) || count < 1) { console.error("❌ Invalid count"); process.exit(1); }

    // Fetch sessions
    let sessions;
    try { sessions = await fetchSessionList(count); }
    catch (error) { console.error("❌ Failed to fetch sessions:", error.message); process.exit(1); }

    if (sessions.length === 0) { console.log("❌ No sessions found."); process.exit(0); }

    sessions.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    console.log(`\n📊 Found ${sessions.length} sessions. Processing...\n`);
    console.log("─".repeat(60));

    const results = [];
    for (let i = 0; i < sessions.length; i++) {
        const result = await processSession(sessions[i], i, sessions.length);
        if (result) results.push(result);
        if (i < sessions.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    console.log("\n" + "─".repeat(60));
    console.log("\n📊 Summary:");
    console.log(`   Sessions processed: ${sessions.length}`);
    console.log(`   Successfully extracted: ${results.length}`);
    console.log(`   Failed/Empty: ${sessions.length - results.length}`);
    
    if (results.length > 0) {
        const totalLogs = results.reduce((sum, r) => sum + r.logCount, 0);
        console.log(`   Total interaction logs: ${totalLogs}`);
        console.log(`\n📁 Files saved to: ${path.resolve(OUTPUT_DIR)}`);
    }
}

main().catch(error => { console.error("\n❌ Unexpected error:", error); process.exit(1); });
