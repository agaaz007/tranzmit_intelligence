import type { AmplitudeEvent } from './types';

interface RRWebEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
}

// Generate a pseudo node ID for element tracking (same approach as mixpanel-sync)
function generateNodeId(props: Record<string, unknown>): number {
  const tag = (props['[Amplitude] Element Tag'] || props.element_tag || '') as string;
  const id = (props['[Amplitude] Element ID'] || props.element_id || '') as string;
  const cls = (props['[Amplitude] Element Class'] || props.element_class || '') as string;

  const str = `${tag}-${id}-${cls}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) || 1;
}

// Extract the page URL from an Amplitude event
function getPageUrl(event: AmplitudeEvent): string {
  const props = event.event_properties;
  return (
    props['[Amplitude] Page URL'] ||
    props['$current_url'] ||
    props['page_url'] ||
    props['url'] ||
    ''
  ) as string;
}

// Parse Amplitude event_time string to epoch ms
function parseEventTime(eventTime: string): number {
  // Amplitude format: "2024-01-15 10:30:00.000000"
  return new Date(eventTime.replace(' ', 'T') + 'Z').getTime();
}

/**
 * Convert an array of Amplitude events into rrweb-compatible events
 * for the downstream parser pipeline.
 *
 * Handles both Amplitude auto-tracked events ([Amplitude] prefix)
 * and custom events.
 */
export function amplitudeToRRWebEvents(events: AmplitudeEvent[]): RRWebEvent[] {
  const rrwebEvents: RRWebEvent[] = [];

  const sorted = [...events].sort(
    (a, b) => parseEventTime(a.event_time) - parseEventTime(b.event_time)
  );

  if (sorted.length === 0) return rrwebEvents;

  const firstEvent = sorted[0];
  const baseTimestamp = parseEventTime(firstEvent.event_time);

  const pageUrl = getPageUrl(firstEvent);
  const width = (firstEvent.event_properties['$screen_width'] as number) || 1920;
  const height = (firstEvent.event_properties['$screen_height'] as number) || 1080;

  // Meta event (Type 4) — session context
  rrwebEvents.push({
    type: 4,
    data: { href: pageUrl, width, height },
    timestamp: baseTimestamp,
  });

  // FullSnapshot (Type 2) — synthetic minimal DOM so rrweb player can initialize
  rrwebEvents.push({
    type: 2,
    data: {
      node: {
        type: 0, // Document
        childNodes: [
          {
            type: 1, // DocumentType
            name: 'html',
            publicId: '',
            systemId: '',
            id: 2,
          },
          {
            type: 2, // Element
            tagName: 'html',
            attributes: {},
            id: 3,
            childNodes: [
              {
                type: 2,
                tagName: 'head',
                attributes: {},
                id: 4,
                childNodes: [
                  {
                    type: 2,
                    tagName: 'title',
                    attributes: {},
                    id: 5,
                    childNodes: [
                      { type: 3, textContent: 'Amplitude Session', id: 6 },
                    ],
                  },
                ],
              },
              {
                type: 2,
                tagName: 'body',
                attributes: {
                  style: `margin:0;width:${width}px;height:${height}px;background:#f8fafc;font-family:system-ui,sans-serif;`,
                },
                id: 7,
                childNodes: [
                  {
                    type: 2,
                    tagName: 'div',
                    attributes: {
                      id: 'app',
                      style: 'padding:40px;color:#334155;',
                    },
                    id: 8,
                    childNodes: [
                      {
                        type: 3,
                        textContent: `Session reconstructed from Amplitude events — ${pageUrl}`,
                        id: 9,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        id: 1,
      },
      initialOffset: { top: 0, left: 0 },
    },
    timestamp: baseTimestamp,
  });

  for (const event of sorted) {
    const timestamp = parseEventTime(event.event_time);
    const eventType = event.event_type;
    const props = event.event_properties;

    // ── Amplitude auto-tracked: Page View ──
    if (
      eventType === '[Amplitude] Page Viewed' ||
      eventType === 'Page View' ||
      eventType === '$pageview' ||
      eventType === 'page_view'
    ) {
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: '$pageview',
          payload: {
            $current_url: getPageUrl(event),
            $referrer: props['[Amplitude] Page Referrer'] || props['referrer'] || '',
            page_title: props['[Amplitude] Page Title'] || props['page_title'] || '',
            page_path: props['[Amplitude] Page Path'] || props['page_path'] || '',
          },
        },
        timestamp,
      });

    // ── Amplitude auto-tracked: Click ──
    } else if (
      eventType === '[Amplitude] Element Clicked' ||
      eventType === 'click' ||
      eventType === '$click' ||
      eventType.toLowerCase().includes('click')
    ) {
      rrwebEvents.push({
        type: 3, // IncrementalSnapshot
        data: {
          source: 2, // MouseInteraction
          type: 2,   // Click
          id: generateNodeId(props),
          x: (props['[Amplitude] Element Position X'] || props['x'] || 0) as number,
          y: (props['[Amplitude] Element Position Y'] || props['y'] || 0) as number,
          _elementInfo: {
            tagName: props['[Amplitude] Element Tag'] || props['tag_name'] || 'div',
            textContent: props['[Amplitude] Element Text'] || props['element_text'] || '',
            className: props['[Amplitude] Element Class'] || props['element_class'] || '',
            id: props['[Amplitude] Element ID'] || props['element_id'] || '',
            href: props['[Amplitude] Element Href'] || '',
          },
        },
        timestamp,
      });

    // ── Amplitude auto-tracked: Form Submit ──
    } else if (
      eventType === '[Amplitude] Form Submitted' ||
      eventType === 'form_submit' ||
      eventType === '$form_submit' ||
      eventType === 'submit'
    ) {
      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: 'form_submit',
          payload: {
            type: 'submit',
            formId: props['[Amplitude] Form ID'] || props['form_id'] || '',
            formAction: props['[Amplitude] Form Action'] || props['form_action'] || '',
            pageUrl: getPageUrl(event),
          },
        },
        timestamp,
      });

    // ── Amplitude auto-tracked: Input Change ──
    } else if (
      eventType === '[Amplitude] Element Changed' ||
      eventType === 'input' ||
      eventType === '$input' ||
      eventType.toLowerCase().includes('input')
    ) {
      rrwebEvents.push({
        type: 3, // IncrementalSnapshot
        data: {
          source: 5, // Input
          id: generateNodeId(props),
          text: '[REDACTED]',
          isChecked: props['checked'] ?? undefined,
        },
        timestamp,
      });

    // ── Scroll ──
    } else if (
      eventType === 'scroll' ||
      eventType === '$scroll' ||
      eventType === '[Amplitude] Scroll'
    ) {
      rrwebEvents.push({
        type: 3, // IncrementalSnapshot
        data: {
          source: 3, // Scroll
          id: 1,     // Document
          x: (props['scroll_x'] || 0) as number,
          y: (props['scroll_y'] || props['scroll_depth'] || 0) as number,
        },
        timestamp,
      });

    // ── Session Start ──
    } else if (
      eventType === '[Amplitude] Start Session' ||
      eventType === 'session_start'
    ) {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'session_start',
          payload: {
            sessionId: event.session_id,
            userId: event.user_id || event.device_id,
          },
        },
        timestamp,
      });

    // ── Session End ──
    } else if (
      eventType === '[Amplitude] End Session' ||
      eventType === 'session_end'
    ) {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'session_end',
          payload: {
            sessionId: event.session_id,
          },
        },
        timestamp,
      });

    // ── Error / Exception ──
    } else if (
      eventType === '$exception' ||
      eventType === 'error' ||
      eventType.toLowerCase().includes('error') ||
      eventType.toLowerCase().includes('exception')
    ) {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'console_error',
          payload: {
            level: 'error',
            message: (props['error_message'] || props['message'] || props['$exception_message'] || 'Unknown error') as string,
            type: 'error',
          },
        },
        timestamp,
      });

    // ── Search ──
    } else if (
      eventType === 'search' ||
      eventType === 'Search' ||
      eventType.toLowerCase().includes('search')
    ) {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'search',
          payload: {
            query: props['search_query'] || props['query'] || props['term'] || '',
            results_count: props['results_count'] || props['num_results'],
            pageUrl: getPageUrl(event),
          },
        },
        timestamp,
      });

    // ── Generic / Custom events ──
    } else {
      // Strip internal Amplitude fields, pass everything else through
      const cleanProps: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (!key.startsWith('$') && key !== 'amplitude_event_type') {
          cleanProps[key] = value;
        }
      }
      cleanProps['_page_url'] = getPageUrl(event);

      rrwebEvents.push({
        type: 5, // Custom
        data: {
          tag: eventType,
          payload: cleanProps,
        },
        timestamp,
      });
    }
  }

  return rrwebEvents;
}
