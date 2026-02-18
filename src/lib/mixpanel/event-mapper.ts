import type { MixpanelEvent } from './types';

interface RRWebEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
}

// Generate a pseudo node ID for element tracking in the analysis pipeline
function generateNodeId(props: Record<string, unknown>): number {
  const elementId = props.$element_id || props.element_id || '';
  const elementClass = props.$element_class || props.element_class || '';
  const tagName = props.$element_tag || props.tag_name || '';

  const str = `${tagName}-${elementId}-${elementClass}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Offset by 10000 to avoid colliding with our synthetic DOM node IDs (1-50, 100+)
  return (Math.abs(hash) || 1) + 10000;
}

/**
 * Convert Mixpanel analytics events to rrweb-compatible format.
 *
 * Since Mixpanel provides analytics events (not DOM recordings like PostHog),
 * this builds a rich "Activity Timeline" UI inside the rrweb player that shows
 * every user action as it happens. Each event triggers a DOM mutation that
 * appends an entry to a live feed, so the replay plays like a real session
 * with the timeline building up dynamically.
 *
 * For each Mixpanel event, THREE rrweb events are emitted:
 *   1. DOM mutation (type 3, source 0) — visual timeline entry in the player
 *   2. Interaction event (type 3, source 2/3/5) — for analysis pipeline counters
 *   3. Custom event (type 5) — for analysis pipeline semantic parsing
 */
export function mixpanelToRRWebEvents(events: MixpanelEvent[]): RRWebEvent[] {
  const rrwebEvents: RRWebEvent[] = [];
  const sortedEvents = [...events].sort((a, b) => a.properties.time - b.properties.time);

  if (sortedEvents.length === 0) return rrwebEvents;

  const firstEvent = sortedEvents[0];
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const baseTimestamp = firstEvent.properties.time * 1000;

  const pageUrl = (firstEvent.properties.$current_url || '') as string;
  const width = (firstEvent.properties.$screen_width || 1920) as number;
  const height = (firstEvent.properties.$screen_height || 1080) as number;

  // Compute summary stats for the header
  let clickCount = 0;
  let pageCount = 0;
  let errorCount = 0;
  for (const e of sortedEvents) {
    const n = e.event;
    if (n === '$click' || n === 'Click' || n.includes('click')) clickCount++;
    else if (n === '$mp_web_page_view' || n === 'Page View' || n === '$pageview') pageCount++;
    else if (n === '$exception' || n === 'Error' || n.includes('error')) errorCount++;
  }
  const totalSec = Math.round((lastEvent.properties.time - firstEvent.properties.time));
  const durationStr = totalSec >= 60 ? `${Math.floor(totalSec / 60)}m ${totalSec % 60}s` : `${totalSec}s`;

  // ── NODE IDs ──
  // FullSnapshot uses IDs 1-50. Mutation nodes start at 100.
  // Each feed entry uses 7 IDs (entry, ts, ts-text, badge, badge-text, desc, desc-text).
  const URL_TEXT_NODE_ID = 16; // Text node inside the URL bar (updated on pageview)
  const FEED_PARENT_ID = 47;  // The .feed div where entries are appended
  let nextId = 100;

  // ── CSS ──
  const css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;width:${width}px;height:${height}px;overflow:hidden}`,
    '.url-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#1e293b;border-bottom:1px solid #334155;font-size:13px}',
    '.dots{display:flex;gap:6px}',
    '.dot{width:10px;height:10px;border-radius:50%}',
    '.dot-r{background:#ef4444}.dot-y{background:#eab308}.dot-g{background:#22c55e}',
    '.url{flex:1;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px 12px;color:#94a3b8;font-family:monospace;font-size:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
    '.stat-bar{display:flex;gap:16px;padding:10px 16px;background:#1e293b;border-bottom:1px solid #334155}',
    '.stat{display:flex;align-items:center;gap:5px;font-size:12px;color:#94a3b8}',
    '.stat .n{font-weight:700;color:#e2e8f0;font-size:14px}',
    `.container{padding:16px;overflow-y:auto;height:calc(${height}px - 88px)}`,
    '.section-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #1e293b}',
    '.feed{display:flex;flex-direction:column;gap:2px}',
    '.ev{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;font-size:13px;animation:fadeIn .3s ease}',
    '@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
    '.ev .ts{flex-shrink:0;width:48px;color:#64748b;font-family:monospace;font-size:11px;padding-top:3px;text-align:right}',
    '.ev .badge{flex-shrink:0;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap}',
    '.ev .desc{color:#cbd5e1;line-height:1.5;word-break:break-word}',
    '.b-click{background:#172554;color:#60a5fa}',
    '.b-nav{background:#052e16;color:#4ade80}',
    '.b-scroll{background:#422006;color:#fbbf24}',
    '.b-input{background:#2e1065;color:#a78bfa}',
    '.b-error{background:#450a0a;color:#f87171}',
    '.b-form{background:#0c4a6e;color:#38bdf8}',
    '.b-event{background:#1e293b;color:#94a3b8}',
    '.b-start{background:#052e16;color:#4ade80}',
    '.b-end{background:#450a0a;color:#f87171}',
  ].join('\n');

  // ── 1. Meta event (type 4) ──
  rrwebEvents.push({
    type: 4,
    data: { href: pageUrl, width, height },
    timestamp: baseTimestamp,
  });

  // ── 2. FullSnapshot (type 2) — rich timeline UI ──
  rrwebEvents.push({
    type: 2,
    data: {
      node: {
        type: 0, id: 1, childNodes: [
          { type: 1, name: 'html', publicId: '', systemId: '', id: 2 },
          { type: 2, tagName: 'html', attributes: {}, id: 3, childNodes: [
            { type: 2, tagName: 'head', attributes: {}, id: 4, childNodes: [
              { type: 2, tagName: 'title', attributes: {}, id: 5, childNodes: [
                { type: 3, textContent: pageUrl ? extractPageTitle(pageUrl) : 'Mixpanel Session', id: 6 },
              ]},
              { type: 2, tagName: 'style', attributes: {}, id: 7, childNodes: [
                { type: 3, textContent: css, id: 8 },
              ]},
            ]},
            { type: 2, tagName: 'body', attributes: {}, id: 9, childNodes: [
              // URL bar
              { type: 2, tagName: 'div', attributes: { class: 'url-bar' }, id: 10, childNodes: [
                { type: 2, tagName: 'div', attributes: { class: 'dots' }, id: 11, childNodes: [
                  { type: 2, tagName: 'span', attributes: { class: 'dot dot-r' }, id: 12, childNodes: [] },
                  { type: 2, tagName: 'span', attributes: { class: 'dot dot-y' }, id: 13, childNodes: [] },
                  { type: 2, tagName: 'span', attributes: { class: 'dot dot-g' }, id: 14, childNodes: [] },
                ]},
                { type: 2, tagName: 'div', attributes: { class: 'url' }, id: 15, childNodes: [
                  { type: 3, textContent: pageUrl || 'about:blank', id: URL_TEXT_NODE_ID },
                ]},
              ]},
              // Stats bar
              { type: 2, tagName: 'div', attributes: { class: 'stat-bar' }, id: 17, childNodes: [
                makeStat(18, String(sortedEvents.length), 'events'),
                makeStat(22, durationStr, 'duration'),
                makeStat(26, String(clickCount), 'clicks'),
                makeStat(30, String(pageCount), 'pages'),
                ...(errorCount > 0 ? [makeStat(34, String(errorCount), 'errors')] : []),
              ]},
              // Main container
              { type: 2, tagName: 'div', attributes: { class: 'container' }, id: 44, childNodes: [
                { type: 2, tagName: 'div', attributes: { class: 'section-label' }, id: 45, childNodes: [
                  { type: 3, textContent: 'Activity Timeline', id: 46 },
                ]},
                { type: 2, tagName: 'div', attributes: { class: 'feed' }, id: FEED_PARENT_ID, childNodes: [] },
              ]},
            ]},
          ]},
        ],
      },
      initialOffset: { top: 0, left: 0 },
    },
    timestamp: baseTimestamp,
  });

  // ── 3. Generate events for each Mixpanel event ──
  for (const event of sortedEvents) {
    const timestamp = event.properties.time * 1000;
    const eventName = event.event;
    const props = event.properties;
    const relTime = formatRelativeTime(timestamp - baseTimestamp);

    const { badge, badgeClass, description } = classifyEvent(eventName, props);

    // A. DOM mutation — append entry to the activity feed
    const entryId = nextId++;
    const tsNodeId = nextId++;
    const tsTextId = nextId++;
    const badgeNodeId = nextId++;
    const badgeTextId = nextId++;
    const descNodeId = nextId++;
    const descTextId = nextId++;

    rrwebEvents.push({
      type: 3, // IncrementalSnapshot
      data: {
        source: 0, // Mutation
        texts: [],
        attributes: [],
        removes: [],
        adds: [{
          parentId: FEED_PARENT_ID,
          nextId: null,
          node: {
            type: 2, tagName: 'div', attributes: { class: 'ev' }, id: entryId,
            childNodes: [
              { type: 2, tagName: 'span', attributes: { class: 'ts' }, id: tsNodeId, childNodes: [
                { type: 3, textContent: relTime, id: tsTextId },
              ]},
              { type: 2, tagName: 'span', attributes: { class: `badge ${badgeClass}` }, id: badgeNodeId, childNodes: [
                { type: 3, textContent: badge, id: badgeTextId },
              ]},
              { type: 2, tagName: 'div', attributes: { class: 'desc' }, id: descNodeId, childNodes: [
                { type: 3, textContent: description, id: descTextId },
              ]},
            ],
          },
        }],
      },
      timestamp,
    });

    // B. Interaction events — the analysis pipeline (rrweb-parser.ts) counts
    //    clicks/scrolls/inputs by looking for specific IncrementalSnapshot sources.
    //    Without these, the analyzer reports "no user interactions".
    if (eventName === '$click' || eventName === 'Click' || eventName.includes('click')) {
      rrwebEvents.push({
        type: 3,
        data: {
          source: 2, // MouseInteraction
          type: 2,   // Click
          id: generateNodeId(props),
          x: props.$click_x || props.x || 0,
          y: props.$click_y || props.y || 0,
        },
        timestamp,
      });
    } else if (eventName === '$scroll' || eventName === 'Scroll') {
      rrwebEvents.push({
        type: 3,
        data: {
          source: 3, // Scroll
          id: 9,     // body node
          x: props.scroll_x || props.$scroll_x || 0,
          y: props.scroll_y || props.$scroll_y || props.scroll_depth || 0,
        },
        timestamp,
      });
    } else if (eventName === '$input' || eventName === 'Input' || eventName.includes('input')) {
      rrwebEvents.push({
        type: 3,
        data: {
          source: 5, // Input
          id: generateNodeId(props),
          text: '[REDACTED]',
          isChecked: props.checked,
        },
        timestamp,
      });
    }

    // C. Update URL bar on page navigation
    if (isPageView(eventName)) {
      const newUrl = (props.$current_url || props.url || props.$url || '') as string;
      if (newUrl) {
        rrwebEvents.push({
          type: 3,
          data: {
            source: 0,
            texts: [{ id: URL_TEXT_NODE_ID, value: newUrl }],
            attributes: [],
            removes: [],
            adds: [],
          },
          timestamp,
        });
      }
    }

    // D. Custom event (type 5) — for the analysis pipeline (rrweb-parser.ts)
    rrwebEvents.push(makeCustomEvent(eventName, props, timestamp));
  }

  return rrwebEvents;
}

// ── Helpers ──

function makeStat(startId: number, value: string, label: string) {
  return {
    type: 2, tagName: 'div', attributes: { class: 'stat' }, id: startId, childNodes: [
      { type: 2, tagName: 'span', attributes: { class: 'n' }, id: startId + 1, childNodes: [
        { type: 3, textContent: value, id: startId + 2 },
      ]},
      { type: 3, textContent: ` ${label}`, id: startId + 3 },
    ],
  };
}

function formatRelativeTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function isPageView(name: string): boolean {
  return name === '$mp_web_page_view' || name === 'Page View' || name === '$pageview';
}

function extractPageTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    const lastSegment = path.split('/').pop() || '';
    const host = u.hostname.replace(/^www\./, '');
    if (lastSegment) {
      return `${lastSegment} - ${host}`;
    }
    return host;
  } catch {
    return url.substring(0, 60);
  }
}

function classifyEvent(
  eventName: string,
  props: Record<string, unknown>,
): { badge: string; badgeClass: string; description: string } {
  // Page views
  if (isPageView(eventName)) {
    const url = (props.$current_url || props.url || props.$url || 'unknown page') as string;
    return { badge: 'NAV', badgeClass: 'b-nav', description: url };
  }

  // Clicks
  if (eventName === '$click' || eventName === 'Click' || eventName.includes('click')) {
    const tag = (props.$element_tag || props.tag_name || 'element') as string;
    const text = (props.$element_text || props.element_text || '') as string;
    const cls = (props.$element_class || props.element_class || '') as string;
    const x = props.$click_x || props.x || 0;
    const y = props.$click_y || props.y || 0;

    let target = tag;
    if (cls) target += `.${String(cls).split(' ')[0]}`;
    let desc = target;
    if (text) desc += ` "${String(text).substring(0, 40)}"`;
    desc += ` at (${x}, ${y})`;
    return { badge: 'CLICK', badgeClass: 'b-click', description: desc };
  }

  // Scroll
  if (eventName === '$scroll' || eventName === 'Scroll') {
    const y = props.scroll_y || props.$scroll_y || props.scroll_depth || 0;
    return { badge: 'SCROLL', badgeClass: 'b-scroll', description: `Scrolled to ${y}px` };
  }

  // Input
  if (eventName === '$input' || eventName === 'Input' || eventName.includes('input')) {
    const tag = (props.$element_tag || props.tag_name || 'input') as string;
    return { badge: 'INPUT', badgeClass: 'b-input', description: `Text entered in <${tag}> [redacted]` };
  }

  // Form submit
  if (eventName === '$form_submit' || eventName === 'Form Submit' || eventName === 'submit') {
    return { badge: 'FORM', badgeClass: 'b-form', description: 'Form submitted' };
  }

  // Errors
  if (eventName === '$exception' || eventName === 'Error' || eventName.includes('error')) {
    const msg = (props.error_message || props.$exception_message || props.message || 'Unknown error') as string;
    return { badge: 'ERROR', badgeClass: 'b-error', description: String(msg).substring(0, 120) };
  }

  // Session lifecycle
  if (eventName === '$session_start') {
    return { badge: 'START', badgeClass: 'b-start', description: 'Session started' };
  }
  if (eventName === '$session_end') {
    return { badge: 'END', badgeClass: 'b-end', description: 'Session ended' };
  }

  // Generic / custom event
  return { badge: 'EVENT', badgeClass: 'b-event', description: eventName };
}

/**
 * Create a type-5 Custom event so the analysis pipeline (rrweb-parser)
 * can still extract semantic meaning from Mixpanel events.
 */
function makeCustomEvent(
  eventName: string,
  props: Record<string, unknown>,
  timestamp: number,
): RRWebEvent {
  // Map to the tags the parser already understands
  let tag = eventName;
  const payload: Record<string, unknown> = {};

  if (isPageView(eventName)) {
    tag = '$pageview';
    payload.$current_url = props.$current_url || props.url || props.$url;
    payload.$referrer = props.$referrer;
  } else if (eventName === '$form_submit' || eventName === 'Form Submit' || eventName === 'submit') {
    tag = 'form_submit';
    payload.type = 'submit';
  } else if (eventName === '$exception' || eventName === 'Error' || eventName.includes('error')) {
    tag = 'console_error';
    payload.level = 'error';
    payload.message = props.error_message || props.$exception_message || props.message || 'Unknown error';
    payload.type = 'error';
  } else if (eventName === '$session_start') {
    tag = 'session_start';
    payload.sessionId = props.$session_id;
    payload.userId = props.distinct_id;
  } else if (eventName === '$session_end') {
    tag = 'session_end';
    payload.sessionId = props.$session_id;
  } else {
    // Pass through sanitized properties
    Object.assign(payload, props);
    delete payload.time;
    delete payload.distinct_id;
    delete payload.$insert_id;
  }

  return { type: 5, data: { tag, payload }, timestamp };
}
