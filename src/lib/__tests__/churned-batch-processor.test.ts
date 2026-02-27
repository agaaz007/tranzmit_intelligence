import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the module under test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    churnedSessionBatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session-sync', () => ({
  fetchSessionEvents: vi.fn(),
}));

vi.mock('@/lib/session-analysis', () => ({
  analyzeSession: vi.fn(),
}));

vi.mock('@/lib/session-synthesize', () => ({
  synthesizeInsightsWithSessionLinkage: vi.fn(),
}));

// Mock PostHogRateLimiter — must be a real class for `new` to work
const mockRateLimiterFetch = vi.fn();
vi.mock('@/lib/posthog-rate-limiter', () => {
  return {
    PostHogRateLimiter: class {
      fetch = mockRateLimiterFetch;
      isRateLimited = vi.fn().mockReturnValue(false);
      getRateLimitedUntil = vi.fn().mockReturnValue(null);
      reset = vi.fn();
    },
  };
});

import { prisma } from '@/lib/prisma';
import { fetchSessionEvents } from '@/lib/session-sync';
import { analyzeSession } from '@/lib/session-analysis';
import { synthesizeInsightsWithSessionLinkage } from '@/lib/session-synthesize';
import { processNextEmails, analyzePendingSessions, runSynthesis } from '../churned-batch-processor';

const mockPrisma = prisma as unknown as {
  churnedSessionBatch: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

function makeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    projectId: 'proj-1',
    status: 'pending',
    totalEmails: 2,
    processedEmails: 0,
    emailsFound: 0,
    emailsNotFound: 0,
    sessionsImported: 0,
    rateLimitedUntil: null,
    lastProcessedAt: null,
    emailResults: JSON.stringify([
      { email: 'alice@example.com', status: 'pending', recordingCount: 0, personName: null },
      { email: 'bob@example.com', status: 'pending', recordingCount: 0, personName: null },
    ]),
    project: {
      id: 'proj-1',
      posthogKey: 'phc_test',
      posthogHost: 'https://us.posthog.com',
      posthogProjId: '12345',
    },
    ...overrides,
  };
}

function makePersonResponse(email: string) {
  return new Response(JSON.stringify({
    results: [{
      uuid: `uuid-${email}`,
      distinct_ids: [`did-${email}`],
      properties: { name: email.split('@')[0] },
    }],
  }), { status: 200 });
}

function makeRecordingsResponse(count: number = 1) {
  const results = Array.from({ length: count }, (_, i) => ({
    id: `rec-${i}`,
    distinct_id: 'did-1',
    start_time: '2025-01-01T10:00:00Z',
    end_time: '2025-01-01T10:05:00Z',
    recording_duration: 300,
    click_count: 10,
    keypress_count: 5,
    active_seconds: 200,
  }));
  return new Response(JSON.stringify({ results }), { status: 200 });
}

describe('processNextEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.churnedSessionBatch.update.mockResolvedValue({});
    mockPrisma.session.create.mockResolvedValue({ id: 'session-1' });
    mockPrisma.session.findUnique.mockResolvedValue(null); // No existing sessions (no dedup)
    (fetchSessionEvents as ReturnType<typeof vi.fn>).mockResolvedValue([{ type: 1, data: {}, timestamp: 1 }]);
  });

  it('returns early for completed batch', async () => {
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(
      makeBatch({ status: 'completed' })
    );

    const result = await processNextEmails('batch-1');

    expect(result.processed).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.batchCompleted).toBe(true);
  });

  it('returns early for paused batch without processing', async () => {
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(
      makeBatch({ status: 'paused' })
    );

    const result = await processNextEmails('batch-1');

    expect(result.processed).toBe(0);
    expect(result.hasMore).toBe(true);
    expect(result.batchCompleted).toBe(false);
  });

  it('processes email and marks as found when person exists', async () => {
    const batch = makeBatch();
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: true, response: makePersonResponse('alice@example.com') })
      .mockResolvedValueOnce({ ok: true, response: makeRecordingsResponse(1) });

    const result = await processNextEmails('batch-1', 1);

    expect(result.processed).toBe(1);
    expect(mockPrisma.session.create).toHaveBeenCalled();
  });

  it('marks email as not_found when person does not exist', async () => {
    const batch = makeBatch();
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    const emptyPersonResponse = new Response(JSON.stringify({ results: [] }), { status: 200 });
    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: true, response: emptyPersonResponse });

    const result = await processNextEmails('batch-1', 1);

    expect(result.processed).toBe(1);
    // Check that emailResults was updated with not_found
    // Find the update call that contains emailResults (skip the status transition call)
    const updateCalls = mockPrisma.churnedSessionBatch.update.mock.calls;
    const progressCall = updateCalls.find(
      (call: Array<{ data: { emailResults?: string } }>) => call[0].data.emailResults !== undefined
    );
    expect(progressCall).toBeDefined();
    const updatedResults = JSON.parse(progressCall![0].data.emailResults);
    expect(updatedResults[0].status).toBe('not_found');
  });

  it('stops and returns rate_limited when PostHog returns 429', async () => {
    const batch = makeBatch();
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    const retryAfter = new Date(Date.now() + 30000);
    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: false, reason: 'rate_limited', retryAfter, detail: 'Rate limited' });

    const result = await processNextEmails('batch-1');

    expect(result.hasMore).toBe(true);
    expect(result.rateLimitedUntil).toEqual(retryAfter);
    // Should save rateLimitedUntil to DB
    expect(mockPrisma.churnedSessionBatch.update).toHaveBeenCalled();
  });

  it('skips duplicate sessions (deduplication)', async () => {
    const batch = makeBatch();
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: true, response: makePersonResponse('alice@example.com') })
      .mockResolvedValueOnce({ ok: true, response: makeRecordingsResponse(1) });

    // Session already exists
    mockPrisma.session.findUnique.mockResolvedValue({ id: 'existing-session' });

    const result = await processNextEmails('batch-1', 1);

    expect(result.processed).toBe(1);
    // Should NOT create a new session
    expect(mockPrisma.session.create).not.toHaveBeenCalled();
  });

  it('retries rate_limited emails on subsequent runs', async () => {
    const batch = makeBatch({
      status: 'processing',
      emailResults: JSON.stringify([
        { email: 'alice@example.com', status: 'rate_limited', recordingCount: 0, personName: null },
        { email: 'bob@example.com', status: 'pending', recordingCount: 0, personName: null },
      ]),
    });
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: true, response: makePersonResponse('alice@example.com') })
      .mockResolvedValueOnce({ ok: true, response: makeRecordingsResponse(1) });

    const result = await processNextEmails('batch-1', 1);

    expect(result.processed).toBe(1);
    // The rate_limited email should have been picked up for retry
    expect(mockRateLimiterFetch).toHaveBeenCalled();
  });

  it('counts emailsFound correctly when retrying after person-lookup rate limit', async () => {
    // Simulate retry: email was rate-limited at person-lookup step (personName still null)
    const batch = makeBatch({
      status: 'processing',
      emailsFound: 0,
      emailsNotFound: 0,
      emailResults: JSON.stringify([
        { email: 'alice@example.com', status: 'rate_limited', recordingCount: 0, personName: null },
      ]),
    });
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: true, response: makePersonResponse('alice@example.com') })
      .mockResolvedValueOnce({ ok: true, response: makeRecordingsResponse(1) });

    await processNextEmails('batch-1', 1);

    // emailsFound should be incremented even though wasPreviouslyRateLimited is true
    const updateCalls = mockPrisma.churnedSessionBatch.update.mock.calls;
    const progressCall = updateCalls.find(
      (call: Array<{ data: { emailsFound?: number } }>) => call[0].data.emailsFound !== undefined
    );
    expect(progressCall).toBeDefined();
    expect(progressCall![0].data.emailsFound).toBe(1);
  });

  it('completes batch when all emails are processed', async () => {
    const batch = makeBatch({
      status: 'processing',
      totalEmails: 1,
      emailResults: JSON.stringify([
        { email: 'alice@example.com', status: 'pending', recordingCount: 0, personName: null },
      ]),
    });
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(batch);

    const emptyPersonResponse = new Response(JSON.stringify({ results: [] }), { status: 200 });
    mockRateLimiterFetch
      .mockResolvedValueOnce({ ok: true, response: emptyPersonResponse });

    const result = await processNextEmails('batch-1');

    expect(result.batchCompleted).toBe(true);
    expect(result.hasMore).toBe(false);
    // Should update batch status to completed
    const updateCalls = mockPrisma.churnedSessionBatch.update.mock.calls;
    const completedCall = updateCalls.find(
      (call: Array<{ data: { status?: string } }>) => call[0].data.status === 'completed'
    );
    expect(completedCall).toBeDefined();
  });

  it('throws for non-existent batch', async () => {
    mockPrisma.churnedSessionBatch.findUnique.mockResolvedValue(null);

    await expect(processNextEmails('non-existent')).rejects.toThrow('Batch not found');
  });
});

describe('analyzePendingSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes pending sessions up to the limit', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      { id: 'session-1' },
      { id: 'session-2' },
    ]);
    (analyzeSession as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await analyzePendingSessions('proj-1', 10);

    expect(result.analyzed).toBe(2);
    expect(result.failed).toBe(0);
    expect(analyzeSession).toHaveBeenCalledTimes(2);
  });

  it('counts failed analyses without stopping', async () => {
    mockPrisma.session.findMany.mockResolvedValue([
      { id: 'session-1' },
      { id: 'session-2' },
    ]);
    (analyzeSession as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('LLM failed'));

    const result = await analyzePendingSessions('proj-1', 10);

    expect(result.analyzed).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('returns zeros when no pending sessions exist', async () => {
    mockPrisma.session.findMany.mockResolvedValue([]);

    const result = await analyzePendingSessions('proj-1', 10);

    expect(result.analyzed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.pending).toBe(0);
  });
});

describe('runSynthesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs synthesis when analyzed sessions exist', async () => {
    mockPrisma.session.count.mockResolvedValue(5);
    (synthesizeInsightsWithSessionLinkage as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await runSynthesis('proj-1');

    expect(synthesizeInsightsWithSessionLinkage).toHaveBeenCalledWith('proj-1');
  });

  it('skips synthesis when no analyzed sessions exist', async () => {
    mockPrisma.session.count.mockResolvedValue(0);

    await runSynthesis('proj-1');

    expect(synthesizeInsightsWithSessionLinkage).not.toHaveBeenCalled();
  });

  it('does not throw on synthesis failure', async () => {
    mockPrisma.session.count.mockResolvedValue(5);
    (synthesizeInsightsWithSessionLinkage as ReturnType<typeof vi.fn>)
      .mockRejectedValue(new Error('Synthesis failed'));

    // Should not throw
    await expect(runSynthesis('proj-1')).resolves.toBeUndefined();
  });
});
