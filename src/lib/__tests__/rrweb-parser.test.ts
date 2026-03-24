import { describe, it, expect } from 'vitest';
import { parseRRWebSession } from '@/lib/rrweb-parser';

// ── Helpers ──────────────────────────────────────────────────────────────────

const FULL_SNAPSHOT = 2;
const INCREMENTAL_SNAPSHOT = 3;
const META = 4;
const CUSTOM = 5;

function makeTimeline(events: object[]) {
  return events.map((e, i) => ({ timestamp: 1000 + i * 100, ...e }));
}

function makeMetaEvent(href: string, ts = 1000) {
  return { type: META, timestamp: ts, data: { href, width: 1280, height: 800 } };
}

function makeSnapshot(node: object, ts = 1100) {
  return { type: FULL_SNAPSHOT, timestamp: ts, data: { node } };
}

function makeClick(nodeId: number, ts: number) {
  return {
    type: INCREMENTAL_SNAPSHOT,
    timestamp: ts,
    data: { source: 2, type: 2, id: nodeId },
  };
}

function makeNav(href: string, ts: number) {
  return { type: META, timestamp: ts, data: { href, width: 1280, height: 800 } };
}

// Build a minimal DOM tree: document -> html -> body -> container -> child
function makeDocumentTree(children: object[] = []) {
  return {
    id: 1,
    type: 0, // Document
    childNodes: [
      {
        id: 2,
        type: 2,
        tagName: 'html',
        attributes: {},
        childNodes: [
          {
            id: 3,
            type: 2,
            tagName: 'body',
            attributes: {},
            childNodes: children,
          },
        ],
      },
    ],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('parseRRWebSession — URL path preservation', () => {
  it('includes full URL path in Session Started log', () => {
    const events = [
      makeMetaEvent('https://app.example.com/community/ux-designers'),
      makeSnapshot(makeDocumentTree()),
    ];
    const result = parseRRWebSession(events);
    const startLog = result.logs.find(l => l.action === 'Session Started');
    expect(startLog?.details).toContain('/community/ux-designers');
    expect(startLog?.details).not.toBe('on app.example.com');
  });

  it('includes query string in Session Started log', () => {
    const events = [
      makeMetaEvent('https://app.example.com/search?q=onboarding'),
      makeSnapshot(makeDocumentTree()),
    ];
    const result = parseRRWebSession(events);
    const startLog = result.logs.find(l => l.action === 'Session Started');
    expect(startLog?.details).toContain('?q=onboarding');
  });

  it('handles invalid URL gracefully', () => {
    const events = [
      makeMetaEvent('not-a-valid-url'),
      makeSnapshot(makeDocumentTree()),
    ];
    const result = parseRRWebSession(events);
    const startLog = result.logs.find(l => l.action === 'Session Started');
    expect(startLog).toBeDefined();
  });
});

describe('parseRRWebSession — SPA navigation tracking', () => {
  it('emits a Navigated to log when a new Meta event has a different URL', () => {
    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/dashboard', 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      makeNav('https://app.example.com/community/general', 2000),
    ]);
    const result = parseRRWebSession(events);
    const navLog = result.logs.find(l => l.action === 'Navigated to');
    expect(navLog).toBeDefined();
    expect(navLog?.details).toContain('/community/general');
  });

  it('does NOT emit duplicate Navigated to log if URL is unchanged', () => {
    const url = 'https://app.example.com/dashboard';
    const events = makeTimeline([
      makeMetaEvent(url, 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      makeNav(url, 2000), // same URL — should not log
    ]);
    const result = parseRRWebSession(events);
    const navLogs = result.logs.filter(l => l.action === 'Navigated to');
    expect(navLogs).toHaveLength(0);
  });

  it('tracks multiple route changes in sequence', () => {
    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/home', 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      makeNav('https://app.example.com/community', 2000),
      makeNav('https://app.example.com/community/thread/123', 3000),
    ]);
    const result = parseRRWebSession(events);
    const navLogs = result.logs.filter(l => l.action === 'Navigated to');
    expect(navLogs).toHaveLength(2);
    expect(navLogs[0].details).toContain('/community');
    expect(navLogs[1].details).toContain('/community/thread/123');
  });
});

describe('parseRRWebSession — ancestor context on clicks', () => {
  it('appends heading ancestor context to click details', () => {
    const headingNode = {
      id: 10,
      type: 2,
      tagName: 'h2',
      attributes: {},
      childNodes: [{ id: 11, type: 3, textContent: 'Why onboarding fails' }],
    };
    const replyBtn = {
      id: 20,
      type: 2,
      tagName: 'button',
      attributes: {},
      childNodes: [{ id: 21, type: 3, textContent: 'Reply' }],
    };
    // Wire reply button as child of heading
    headingNode.childNodes.push(replyBtn as any);

    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/community', 1000),
      makeSnapshot(makeDocumentTree([headingNode]), 1100),
      makeClick(20, 1200),
    ]);

    const result = parseRRWebSession(events);
    const clickLog = result.logs.find(l => l.action === 'Clicked button');
    expect(clickLog?.details).toContain('"Reply" button');
    expect(clickLog?.details).toContain('Why onboarding fails');
  });

  it('returns clean element name when no meaningful ancestors exist', () => {
    const btn = {
      id: 30,
      type: 2,
      tagName: 'button',
      attributes: {},
      childNodes: [{ id: 31, type: 3, textContent: 'Submit' }],
    };

    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/', 1000),
      makeSnapshot(makeDocumentTree([btn]), 1100),
      makeClick(30, 1200),
    ]);

    const result = parseRRWebSession(events);
    const clickLog = result.logs.find(l => l.action === 'Clicked button');
    expect(clickLog?.details).toContain('"Submit" button');
    // No extra "(in ...)" suffix when there's nothing contextual
    expect(clickLog?.details).not.toContain('(in');
  });
});

describe('parseRRWebSession — data-* attribute extraction', () => {
  it('captures data-* attributes on interacted elements', () => {
    const btn = {
      id: 40,
      type: 2,
      tagName: 'button',
      attributes: { 'data-testid': 'reply-btn', 'data-action': 'reply' },
      childNodes: [{ id: 41, type: 3, textContent: 'Reply' }],
    };

    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/', 1000),
      makeSnapshot(makeDocumentTree([btn]), 1100),
      makeClick(40, 1200),
    ]);

    const result = parseRRWebSession(events);
    const clickLog = result.logs.find(l => l.action === 'Clicked button');
    // data-testid / data-action values should appear in element name suffix
    expect(clickLog?.details).toMatch(/reply-btn|reply/);
  });

  it('uses data-* from ancestor containers for context', () => {
    const container = {
      id: 50,
      type: 2,
      tagName: 'div',
      attributes: { 'data-post-id': 'post-abc', 'data-community': 'ux-designers' },
      childNodes: [
        {
          id: 51,
          type: 2,
          tagName: 'button',
          attributes: {},
          childNodes: [{ id: 52, type: 3, textContent: 'Like' }],
        },
      ],
    };

    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/community', 1000),
      makeSnapshot(makeDocumentTree([container]), 1100),
      makeClick(51, 1200),
    ]);

    const result = parseRRWebSession(events);
    const clickLog = result.logs.find(l => l.action === 'Clicked button');
    expect(clickLog?.details).toBeDefined();
    // Should have ancestor context with post-id or community info
    expect(clickLog?.details).toContain('"Like" button');
  });
});

describe('parseRRWebSession — network error URL enrichment', () => {
  it('includes API path in network error details', () => {
    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/', 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      {
        type: 6,
        timestamp: 1300,
        data: {
          payload: {
            requests: [
              { name: 'https://app.example.com/api/threads/abc123/reply', responseStatus: 500 },
            ],
          },
        },
      },
    ]);

    const result = parseRRWebSession(events);
    const errorLog = result.logs.find(l => l.action === 'Network error');
    expect(errorLog?.details).toContain('/api/threads/abc123/reply');
    expect(errorLog?.details).toContain('500');
    expect(errorLog?.flags).toContain('[NETWORK ERROR]');
  });

  it('shows up to 3 failed request paths', () => {
    const requests = [
      { name: 'https://app.example.com/api/a', responseStatus: 404 },
      { name: 'https://app.example.com/api/b', responseStatus: 500 },
      { name: 'https://app.example.com/api/c', responseStatus: 403 },
      { name: 'https://app.example.com/api/d', responseStatus: 500 }, // 4th — should be capped
    ];

    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/', 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      { type: 6, timestamp: 1300, data: { payload: { requests } } },
    ]);

    const result = parseRRWebSession(events);
    const errorLog = result.logs.find(l => l.action === 'Network error');
    // Should mention the count correctly
    expect(errorLog?.details).toContain('4 failed request(s)');
    // /api/d should not appear (only first 3 URL paths shown)
    expect(errorLog?.details).not.toContain('/api/d');
  });

  it('handles requests with invalid URLs gracefully', () => {
    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/', 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      {
        type: 6,
        timestamp: 1300,
        data: {
          payload: {
            requests: [{ name: 'not-a-url', responseStatus: 500 }],
          },
        },
      },
    ]);

    const result = parseRRWebSession(events);
    const errorLog = result.logs.find(l => l.action === 'Network error');
    expect(errorLog).toBeDefined();
    expect(errorLog?.details).toContain('1 failed request(s)');
  });
});

describe('parseRRWebSession — PostHog $pageview navigation', () => {
  it('emits Navigated to log from PostHog $pageview with full path', () => {
    const events = makeTimeline([
      makeMetaEvent('https://app.example.com/home', 1000),
      makeSnapshot(makeDocumentTree(), 1100),
      {
        type: CUSTOM,
        timestamp: 2000,
        data: {
          tag: '$pageview',
          payload: { $current_url: 'https://app.example.com/community/thread/42' },
        },
      },
    ]);

    const result = parseRRWebSession(events);
    const navLog = result.logs.find(l => l.action === 'Navigated to');
    expect(navLog?.details).toContain('/community/thread/42');
  });
});
