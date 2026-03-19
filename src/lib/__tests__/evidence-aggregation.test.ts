import { describe, it, expect } from 'vitest';
import {
  aggregateSessionEvidence,
  aggregateConversationEvidence,
  buildNumberedPromptEntries,
  resolveEntryNumbers,
  ParsedSession,
  ParsedConversation,
  EntryReference,
  FrictionEntry,
} from '@/lib/evidence-aggregation';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: overrides.id ?? 'sess-1',
    name: overrides.name ?? 'Session 1',
    distinctId: overrides.distinctId,
    startTime: overrides.startTime,
    analysis: overrides.analysis ?? {},
  };
}

function makeConversation(
  overrides: Partial<ParsedConversation> = {},
): ParsedConversation {
  return {
    id: overrides.id ?? 'conv-1',
    name: overrides.name ?? 'User A',
    participantEmail: overrides.participantEmail,
    conversedAt: overrides.conversedAt,
    analysis: overrides.analysis ?? {},
  };
}

// ── aggregateSessionEvidence ─────────────────────────────────────────────────

describe('aggregateSessionEvidence', () => {
  it('returns empty maps and null rating for empty sessions array', () => {
    const result = aggregateSessionEvidence([]);
    expect(result.frictionMap.size).toBe(0);
    expect(result.intentMap.size).toBe(0);
    expect(result.tagMap.size).toBe(0);
    expect(result.avgRating).toBeNull();
  });

  it('skips sessions with no analysis', () => {
    const session = makeSession({
      analysis: undefined as unknown as ParsedSession['analysis'],
    });
    const result = aggregateSessionEvidence([session]);
    expect(result.frictionMap.size).toBe(0);
    expect(result.avgRating).toBeNull();
  });

  it('aggregates friction points from multiple sessions sharing the same issue', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        analysis: {
          frustration_points: [{ timestamp: 't1', issue: 'slow loading' }],
        },
      }),
      makeSession({
        id: 's2',
        name: 'S2',
        analysis: {
          frustration_points: [{ timestamp: 't2', issue: 'slow loading' }],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    const entry = frictionMap.get('slow loading')!;
    expect(entry.count).toBe(2);
    expect(entry.sessionIds).toEqual(['s1', 's2']);
    expect(entry.sessionNames).toEqual(['S1', 'S2']);
  });

  it('deduplicates sessionIds when the same session has the same friction issue twice', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        analysis: {
          frustration_points: [
            { timestamp: 't1', issue: 'crash' },
            { timestamp: 't2', issue: 'crash' },
          ],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    const entry = frictionMap.get('crash')!;
    expect(entry.count).toBe(2);
    expect(entry.sessionIds).toEqual(['s1']);
  });

  it('keeps different friction points as separate entries', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        analysis: {
          frustration_points: [
            { timestamp: 't1', issue: 'slow loading' },
            { timestamp: 't2', issue: 'button missing' },
          ],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    expect(frictionMap.size).toBe(2);
    expect(frictionMap.has('slow loading')).toBe(true);
    expect(frictionMap.has('button missing')).toBe(true);
  });

  it('tracks latestDate as the most recent startTime among sessions for a friction issue', () => {
    const earlier = new Date('2026-01-01');
    const later = new Date('2026-03-01');
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        startTime: earlier,
        analysis: {
          frustration_points: [{ timestamp: 't1', issue: 'bug' }],
        },
      }),
      makeSession({
        id: 's2',
        name: 'S2',
        startTime: later,
        analysis: {
          frustration_points: [{ timestamp: 't2', issue: 'bug' }],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    expect(frictionMap.get('bug')!.latestDate).toEqual(later);
  });

  it('leaves latestDate undefined when sessions have no startTime', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        analysis: {
          frustration_points: [{ timestamp: 't1', issue: 'bug' }],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    expect(frictionMap.get('bug')!.latestDate).toBeUndefined();
  });

  it('computes avgRating correctly', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', analysis: { ux_rating: 3 } }),
      makeSession({ id: 's2', analysis: { ux_rating: 5 } }),
    ];
    const { avgRating } = aggregateSessionEvidence(sessions);
    expect(avgRating).toBe(4);
  });

  it('returns null avgRating when no sessions have ux_rating', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', analysis: {} }),
    ];
    expect(aggregateSessionEvidence(sessions).avgRating).toBeNull();
  });

  it('aggregates user intents and deduplicates sessionIds', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', analysis: { user_intent: 'checkout' } }),
      makeSession({ id: 's2', analysis: { user_intent: 'checkout' } }),
      makeSession({ id: 's3', analysis: { user_intent: 'browse' } }),
    ];
    const { intentMap } = aggregateSessionEvidence(sessions);
    expect(intentMap.get('checkout')!.count).toBe(2);
    expect(intentMap.get('checkout')!.sessionIds).toEqual(['s1', 's2']);
    expect(intentMap.get('browse')!.count).toBe(1);
  });

  it('aggregates tags with correct counts', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', analysis: { tags: ['mobile', 'ios'] } }),
      makeSession({ id: 's2', analysis: { tags: ['mobile'] } }),
    ];
    const { tagMap } = aggregateSessionEvidence(sessions);
    expect(tagMap.get('mobile')).toBe(2);
    expect(tagMap.get('ios')).toBe(1);
  });
});

// ── aggregateConversationEvidence ────────────────────────────────────────────

describe('aggregateConversationEvidence', () => {
  it('returns empty structures for empty conversations array', () => {
    const result = aggregateConversationEvidence([]);
    expect(result.painPointMap.size).toBe(0);
    expect(result.featureRequestMap.size).toBe(0);
    expect(result.quotes).toEqual([]);
    expect(result.avgSatisfaction).toBeNull();
    expect(result.sentimentCounts).toEqual({});
  });

  it('skips conversations with no analysis', () => {
    const convo = makeConversation({
      analysis: undefined as unknown as ParsedConversation['analysis'],
    });
    const result = aggregateConversationEvidence([convo]);
    expect(result.painPointMap.size).toBe(0);
  });

  it('aggregates pain points from multiple conversations', () => {
    const convos: ParsedConversation[] = [
      makeConversation({
        id: 'c1',
        analysis: { pain_points: ['slow UI', 'crashes'] },
      }),
      makeConversation({
        id: 'c2',
        analysis: { pain_points: ['slow UI'] },
      }),
    ];
    const { painPointMap } = aggregateConversationEvidence(convos);
    expect(painPointMap.get('slow UI')!.count).toBe(2);
    expect(painPointMap.get('slow UI')!.convoIds).toEqual(['c1', 'c2']);
    expect(painPointMap.get('crashes')!.count).toBe(1);
  });

  it('deduplicates convoIds when a conversation lists the same pain point twice', () => {
    const convos: ParsedConversation[] = [
      makeConversation({
        id: 'c1',
        analysis: { pain_points: ['slow UI', 'slow UI'] },
      }),
    ];
    const { painPointMap } = aggregateConversationEvidence(convos);
    expect(painPointMap.get('slow UI')!.count).toBe(2);
    expect(painPointMap.get('slow UI')!.convoIds).toEqual(['c1']);
  });

  it('collects key_quotes from all conversations', () => {
    const convos: ParsedConversation[] = [
      makeConversation({ id: 'c1', analysis: { key_quotes: ['quote1'] } }),
      makeConversation({
        id: 'c2',
        analysis: { key_quotes: ['quote2', 'quote3'] },
      }),
    ];
    const { quotes } = aggregateConversationEvidence(convos);
    expect(quotes).toEqual(['quote1', 'quote2', 'quote3']);
  });

  it('computes avgSatisfaction correctly', () => {
    const convos: ParsedConversation[] = [
      makeConversation({ id: 'c1', analysis: { satisfaction_score: 2 } }),
      makeConversation({ id: 'c2', analysis: { satisfaction_score: 8 } }),
    ];
    expect(aggregateConversationEvidence(convos).avgSatisfaction).toBe(5);
  });

  it('returns null avgSatisfaction when no scores present', () => {
    const convos: ParsedConversation[] = [
      makeConversation({ id: 'c1', analysis: {} }),
    ];
    expect(aggregateConversationEvidence(convos).avgSatisfaction).toBeNull();
  });

  it('counts sentiments correctly', () => {
    const convos: ParsedConversation[] = [
      makeConversation({ id: 'c1', analysis: { sentiment: 'positive' } }),
      makeConversation({ id: 'c2', analysis: { sentiment: 'negative' } }),
      makeConversation({ id: 'c3', analysis: { sentiment: 'positive' } }),
    ];
    const { sentimentCounts } = aggregateConversationEvidence(convos);
    expect(sentimentCounts).toEqual({ positive: 2, negative: 1 });
  });

  it('aggregates feature requests with correct counts', () => {
    const convos: ParsedConversation[] = [
      makeConversation({
        id: 'c1',
        analysis: { feature_requests: ['dark mode', 'export CSV'] },
      }),
      makeConversation({
        id: 'c2',
        analysis: { feature_requests: ['dark mode'] },
      }),
    ];
    const { featureRequestMap } = aggregateConversationEvidence(convos);
    expect(featureRequestMap.get('dark mode')).toBe(2);
    expect(featureRequestMap.get('export CSV')).toBe(1);
  });
});

// ── buildNumberedPromptEntries ───────────────────────────────────────────────

describe('buildNumberedPromptEntries', () => {
  it('produces numbered entries starting at [1]', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        analysis: {
          frustration_points: [{ timestamp: 't', issue: 'bug' }],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    const { promptText } = buildNumberedPromptEntries(
      frictionMap,
      new Map(),
      sessions,
      [],
    );
    expect(promptText).toContain('[1]');
  });

  it('sorts sessions by total friction count descending', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's-low',
        name: 'Low',
        analysis: {
          frustration_points: [{ timestamp: 't', issue: 'minor' }],
        },
      }),
      makeSession({
        id: 's-high',
        name: 'High',
        analysis: {
          frustration_points: [
            { timestamp: 't', issue: 'major1' },
            { timestamp: 't', issue: 'major2' },
          ],
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    const { promptText } = buildNumberedPromptEntries(
      frictionMap,
      new Map(),
      sessions,
      [],
    );
    const lines = promptText.split('\n').filter((l) => l.startsWith('['));
    expect(lines[0]).toContain('High');
    expect(lines[1]).toContain('Low');
  });

  it('sorts conversations by pain point count descending', () => {
    const convos: ParsedConversation[] = [
      makeConversation({
        id: 'c-low',
        name: 'Low',
        analysis: { pain_points: ['one'] },
      }),
      makeConversation({
        id: 'c-high',
        name: 'High',
        analysis: { pain_points: ['a', 'b', 'c'] },
      }),
    ];
    const { painPointMap } = aggregateConversationEvidence(convos);
    const { promptText } = buildNumberedPromptEntries(
      new Map(),
      painPointMap,
      [],
      convos,
    );
    const lines = promptText.split('\n').filter((l) => l.startsWith('['));
    expect(lines[0]).toContain('High');
    expect(lines[1]).toContain('Low');
  });

  it('limits sessions to 30 and conversations to 20', () => {
    const sessions: ParsedSession[] = Array.from({ length: 35 }, (_, i) =>
      makeSession({
        id: `s${i}`,
        name: `S${i}`,
        analysis: {
          frustration_points: [{ timestamp: 't', issue: `issue-${i}` }],
        },
      }),
    );
    const convos: ParsedConversation[] = Array.from({ length: 25 }, (_, i) =>
      makeConversation({
        id: `c${i}`,
        name: `C${i}`,
        analysis: { pain_points: [`pain-${i}`] },
      }),
    );
    const { frictionMap } = aggregateSessionEvidence(sessions);
    const { painPointMap } = aggregateConversationEvidence(convos);
    const { entryIndex } = buildNumberedPromptEntries(
      frictionMap,
      painPointMap,
      sessions,
      convos,
    );

    const sessionEntries = [...entryIndex.values()].filter(
      (e) => e.type === 'session',
    );
    const convoEntries = [...entryIndex.values()].filter(
      (e) => e.type === 'conversation',
    );
    expect(sessionEntries.length).toBe(30);
    expect(convoEntries.length).toBe(20);
  });

  it('entryIndex maps correctly to session and conversation type+id', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', name: 'S1', analysis: {} }),
    ];
    const convos: ParsedConversation[] = [
      makeConversation({ id: 'c1', name: 'C1', analysis: {} }),
    ];
    const { entryIndex } = buildNumberedPromptEntries(
      new Map(),
      new Map(),
      sessions,
      convos,
    );
    expect(entryIndex.get(1)).toEqual({ type: 'session', id: 's1' });
    expect(entryIndex.get(2)).toEqual({ type: 'conversation', id: 'c1' });
  });

  it('prompt text includes session names and IDs', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', name: 'My Session', analysis: {} }),
    ];
    const { promptText } = buildNumberedPromptEntries(
      new Map(),
      new Map(),
      sessions,
      [],
    );
    expect(promptText).toContain('My Session');
    expect(promptText).toContain('s1');
  });

  it('includes === SESSIONS === and === CONVERSATIONS === headers', () => {
    const sessions: ParsedSession[] = [
      makeSession({ id: 's1', name: 'S1', analysis: {} }),
    ];
    const convos: ParsedConversation[] = [
      makeConversation({ id: 'c1', name: 'C1', analysis: {} }),
    ];
    const { promptText } = buildNumberedPromptEntries(
      new Map(),
      new Map(),
      sessions,
      convos,
    );
    expect(promptText).toContain('=== SESSIONS ===');
    expect(promptText).toContain('=== CONVERSATIONS ===');
  });

  it('returns empty promptText when no sessions and no conversations', () => {
    const { promptText, entryIndex } = buildNumberedPromptEntries(
      new Map(),
      new Map(),
      [],
      [],
    );
    expect(promptText).toBe('');
    expect(entryIndex.size).toBe(0);
  });

  it('shows friction info and intent in session entries', () => {
    const sessions: ParsedSession[] = [
      makeSession({
        id: 's1',
        name: 'S1',
        analysis: {
          frustration_points: [{ timestamp: 't', issue: 'slow page' }],
          user_intent: 'checkout',
        },
      }),
    ];
    const { frictionMap } = aggregateSessionEvidence(sessions);
    const { promptText } = buildNumberedPromptEntries(
      frictionMap,
      new Map(),
      sessions,
      [],
    );
    expect(promptText).toContain('slow page');
    expect(promptText).toContain('Intent: "checkout"');
  });
});

// ── resolveEntryNumbers ──────────────────────────────────────────────────────

describe('resolveEntryNumbers', () => {
  const entryIndex = new Map<number, EntryReference>([
    [1, { type: 'session', id: 's1' }],
    [2, { type: 'session', id: 's2' }],
    [3, { type: 'conversation', id: 'c1' }],
    [4, { type: 'conversation', id: 'c2' }],
  ]);

  it('resolves valid session entry numbers to sessionIds', () => {
    const result = resolveEntryNumbers([1, 2], entryIndex);
    expect(result.sessionIds).toEqual(['s1', 's2']);
    expect(result.conversationIds).toEqual([]);
  });

  it('resolves valid conversation entry numbers to conversationIds', () => {
    const result = resolveEntryNumbers([3, 4], entryIndex);
    expect(result.sessionIds).toEqual([]);
    expect(result.conversationIds).toEqual(['c1', 'c2']);
  });

  it('resolves mixed session and conversation numbers', () => {
    const result = resolveEntryNumbers([1, 3], entryIndex);
    expect(result.sessionIds).toEqual(['s1']);
    expect(result.conversationIds).toEqual(['c1']);
  });

  it('filters out invalid entry numbers', () => {
    const result = resolveEntryNumbers([1, 99, 200], entryIndex);
    expect(result.sessionIds).toEqual(['s1']);
    expect(result.conversationIds).toEqual([]);
  });

  it('deduplicates IDs when duplicate numbers are provided', () => {
    const result = resolveEntryNumbers([1, 1, 3, 3], entryIndex);
    expect(result.sessionIds).toEqual(['s1']);
    expect(result.conversationIds).toEqual(['c1']);
  });

  it('returns empty arrays for an empty entry numbers array', () => {
    const result = resolveEntryNumbers([], entryIndex);
    expect(result.sessionIds).toEqual([]);
    expect(result.conversationIds).toEqual([]);
  });

  it('returns empty arrays when entryIndex is empty', () => {
    const result = resolveEntryNumbers([1, 2], new Map());
    expect(result.sessionIds).toEqual([]);
    expect(result.conversationIds).toEqual([]);
  });
});
