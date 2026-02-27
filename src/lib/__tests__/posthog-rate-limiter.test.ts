import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostHogRateLimiter } from '../posthog-rate-limiter';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// No-op sleep for tests — avoids real delays
const noopSleep = vi.fn().mockResolvedValue(undefined);

function makeOkResponse(body: object = {}): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function make429Response(waitSeconds: number = 10): Response {
  return new Response(
    JSON.stringify({ detail: `Request was throttled. Expected available in ${waitSeconds} seconds.` }),
    { status: 429 }
  );
}

function make500Response(): Response {
  return new Response('Internal Server Error', { status: 500 });
}

describe('PostHogRateLimiter', () => {
  let limiter: PostHogRateLimiter;

  beforeEach(() => {
    limiter = new PostHogRateLimiter({ sleepFn: noopSleep });
    mockFetch.mockReset();
    noopSleep.mockClear();
  });

  it('returns ok:true with response on successful fetch', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [{ id: 1 }] }));

    const result = await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = await result.response.json();
      expect(data.results).toHaveLength(1);
    }
  });

  it('tries both URL patterns before giving up', async () => {
    mockFetch.mockResolvedValue(make500Response());

    const result = await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('error');
    }
    // 2 URL patterns × (MAX_RETRIES + 1) = 2 × 4 = 8
    expect(mockFetch).toHaveBeenCalledTimes(8);
  });

  it('returns rate_limited on 429 after retries exhausted', async () => {
    mockFetch.mockResolvedValue(make429Response(10));

    const result = await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('rate_limited');
      expect(result).toHaveProperty('retryAfter');
    }
  });

  it('blocks subsequent calls during rate limit cooldown', async () => {
    // First call hits 429 — sets rateLimitedUntil in the future
    mockFetch.mockResolvedValue(make429Response(10));
    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    // Reset mock — second call should be blocked without calling fetch
    mockFetch.mockReset();

    const result = await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/recordings', { Authorization: 'Bearer key' }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('rate_limited');
    }
    // Should NOT have called fetch — blocked by cooldown
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows calls after reset() (simulating cooldown expiry)', async () => {
    mockFetch.mockResolvedValue(make429Response(10));
    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(limiter.isRateLimited()).toBe(true);

    // Reset clears the cooldown
    limiter.reset();
    expect(limiter.isRateLimited()).toBe(false);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [] }));

    const result = await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('resets consecutive rate limit counter on success', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse());

    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(limiter.isRateLimited()).toBe(false);
    expect(limiter.getRateLimitedUntil()).toBeNull();
  });

  it('isRateLimited returns true during cooldown', async () => {
    mockFetch.mockResolvedValue(make429Response(30));

    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(limiter.isRateLimited()).toBe(true);
    expect(limiter.getRateLimitedUntil()).not.toBeNull();
  });

  it('reset() clears all rate limit state', async () => {
    mockFetch.mockResolvedValue(make429Response(30));

    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(limiter.isRateLimited()).toBe(true);

    limiter.reset();

    expect(limiter.isRateLimited()).toBe(false);
    expect(limiter.getRateLimitedUntil()).toBeNull();
  });

  it('parses wait time from 429 response body', async () => {
    mockFetch.mockResolvedValue(make429Response(25));

    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    const until = limiter.getRateLimitedUntil();
    expect(until).not.toBeNull();
    if (until) {
      const waitMs = until.getTime() - Date.now();
      expect(waitMs).toBeGreaterThan(0);
    }
  });

  it('calls sleepFn during retries', async () => {
    mockFetch.mockResolvedValue(make429Response(10));

    await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    // Should have called sleep during retries
    expect(noopSleep).toHaveBeenCalled();
    expect(noopSleep.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Sleep should be called with milliseconds
    expect(noopSleep.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('uses first successful URL pattern', async () => {
    // First pattern (environments) fails, second (projects) succeeds
    mockFetch
      .mockResolvedValueOnce(make500Response())
      .mockResolvedValueOnce(makeOkResponse({ results: [] }));

    const result = await limiter.fetch(
      'https://us.posthog.com', 'proj123', '/persons', { Authorization: 'Bearer key' }
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('/api/environments/');
    expect(mockFetch.mock.calls[1][0]).toContain('/api/projects/');
  });
});
