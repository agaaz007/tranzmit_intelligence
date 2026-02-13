import type { MixpanelEvent } from './types';

interface RRWebEvent {
  type: number;
  data: Record<string, unknown>;
  timestamp: number;
}

// Generate a pseudo node ID for element tracking
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
  return Math.abs(hash) || 1;
}

/**
 * Convert Mixpanel events to rrweb-compatible format for the parser pipeline.
 */
export function mixpanelToRRWebEvents(events: MixpanelEvent[]): RRWebEvent[] {
  const rrwebEvents: RRWebEvent[] = [];

  const sortedEvents = [...events].sort((a, b) => a.properties.time - b.properties.time);

  if (sortedEvents.length === 0) return rrwebEvents;

  const firstEvent = sortedEvents[0];
  const baseTimestamp = firstEvent.properties.time * 1000;

  const pageUrl = (firstEvent.properties.$current_url || '') as string;
  const width = (firstEvent.properties.$screen_width || 1920) as number;
  const height = (firstEvent.properties.$screen_height || 1080) as number;

  // Meta event (Type 4) for session context
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
                      { type: 3, textContent: 'Mixpanel Session', id: 6 },
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
                        textContent: `Session reconstructed from Mixpanel events — ${pageUrl}`,
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

  for (const event of sortedEvents) {
    const timestamp = event.properties.time * 1000;
    const eventName = event.event;
    const props = event.properties;

    if (eventName === '$mp_web_page_view' || eventName === 'Page View' || eventName === '$pageview') {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: '$pageview',
          payload: {
            $current_url: props.$current_url || props.url || props.$url,
            $referrer: props.$referrer,
            $initial_referrer: props.$initial_referrer,
          },
        },
        timestamp,
      });
    } else if (eventName === '$click' || eventName === 'Click' || eventName.includes('click')) {
      rrwebEvents.push({
        type: 3,
        data: {
          source: 2,
          type: 2,
          id: generateNodeId(props),
          x: props.$click_x || props.x || 0,
          y: props.$click_y || props.y || 0,
          _elementInfo: {
            tagName: props.$element_tag || props.tag_name || 'div',
            textContent: props.$element_text || props.element_text || '',
            className: props.$element_class || props.element_class || '',
            id: props.$element_id || props.element_id || '',
          },
        },
        timestamp,
      });
    } else if (eventName === '$form_submit' || eventName === 'Form Submit' || eventName === 'submit') {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'form_submit',
          payload: {
            type: 'submit',
            formId: props.form_id || props.$form_id,
            formAction: props.form_action || props.$form_action,
          },
        },
        timestamp,
      });
    } else if (eventName === '$input' || eventName === 'Input' || eventName.includes('input')) {
      rrwebEvents.push({
        type: 3,
        data: {
          source: 5,
          id: generateNodeId(props),
          text: '[REDACTED]',
          isChecked: props.checked,
        },
        timestamp,
      });
    } else if (eventName === '$scroll' || eventName === 'Scroll') {
      rrwebEvents.push({
        type: 3,
        data: {
          source: 3,
          id: 1,
          x: props.scroll_x || props.$scroll_x || 0,
          y: props.scroll_y || props.$scroll_y || props.scroll_depth || 0,
        },
        timestamp,
      });
    } else if (eventName === '$exception' || eventName === 'Error' || eventName.includes('error')) {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'console_error',
          payload: {
            level: 'error',
            message: props.error_message || props.$exception_message || props.message || 'Unknown error',
            type: 'error',
          },
        },
        timestamp,
      });
    } else if (eventName === '$session_start') {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'session_start',
          payload: {
            sessionId: props.$session_id,
            userId: props.distinct_id,
          },
        },
        timestamp,
      });
    } else if (eventName === '$session_end') {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: 'session_end',
          payload: {
            sessionId: props.$session_id,
          },
        },
        timestamp,
      });
    } else {
      rrwebEvents.push({
        type: 5,
        data: {
          tag: eventName,
          payload: {
            ...props,
            time: undefined,
            distinct_id: undefined,
            $insert_id: undefined,
          },
        },
        timestamp,
      });
    }
  }

  return rrwebEvents;
}
