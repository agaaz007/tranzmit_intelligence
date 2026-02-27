/**
 * PostHogRateLimiter — Rate-limit-aware wrapper around PostHog API calls.
 *
 * Fixes the silent data loss bug where 429 responses were indistinguishable
 * from "person not found" (both returned null). This class:
 * - Tracks global rate limit state across all calls
 * - Pauses ALL processing when any call hits 429
 * - Uses exponential backoff for consecutive rate limits
 * - Returns discriminated results so callers can distinguish rate_limited from not_found
 */

export type RateLimitedResult =
  | { ok: true; response: Response }
  | { ok: false; reason: 'rate_limited'; retryAfter: Date; detail: string }
  | { ok: false; reason: 'error'; detail: string };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class PostHogRateLimiter {
  private rateLimitedUntil: Date | null = null;
  private consecutiveRateLimits: number = 0;

  private static readonly DEFAULT_WAIT_SECONDS = 10;
  private static readonly MAX_WAIT_SECONDS = 60;
  private static readonly MAX_RETRIES = 3;

  // Injectable sleep function for testing
  private sleepFn: (ms: number) => Promise<void>;

  constructor(opts?: { sleepFn?: (ms: number) => Promise<void> }) {
    this.sleepFn = opts?.sleepFn ?? sleep;
  }

  /**
   * Fetch from PostHog with rate-limit awareness.
   * Tries both /api/environments/ and /api/projects/ URL patterns.
   * If rate limited, sets global cooldown and returns a discriminated result.
   */
  async fetch(
    host: string,
    projectId: string,
    endpoint: string,
    headers: Record<string, string>,
  ): Promise<RateLimitedResult> {
    // Check if we're currently in a rate limit cooldown
    if (this.rateLimitedUntil && new Date() < this.rateLimitedUntil) {
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfter: this.rateLimitedUntil,
        detail: `Rate limited until ${this.rateLimitedUntil.toISOString()}`,
      };
    }

    const urlPatterns = [
      `${host}/api/environments/${projectId}${endpoint}`,
      `${host}/api/projects/${projectId}${endpoint}`,
    ];

    for (let attempt = 0; attempt <= PostHogRateLimiter.MAX_RETRIES; attempt++) {
      for (const url of urlPatterns) {
        try {
          const response = await fetch(url, { headers });

          if (response.ok) {
            // Success — reset consecutive rate limit counter
            this.consecutiveRateLimits = 0;
            this.rateLimitedUntil = null;
            return { ok: true, response };
          }

          if (response.status === 429) {
            const waitSeconds = await this.parseRateLimitWait(response);
            this.consecutiveRateLimits++;

            // Apply exponential backoff for consecutive rate limits
            const backoffMultiplier = Math.min(
              Math.pow(2, this.consecutiveRateLimits - 1),
              4 // cap multiplier at 4x
            );
            const effectiveWait = Math.min(
              waitSeconds * backoffMultiplier,
              PostHogRateLimiter.MAX_WAIT_SECONDS
            );

            const retryAfter = new Date(Date.now() + effectiveWait * 1000);
            this.rateLimitedUntil = retryAfter;

            if (attempt < PostHogRateLimiter.MAX_RETRIES) {
              console.log(
                `[PostHogRateLimiter] Rate limited (429), waiting ${effectiveWait}s ` +
                `(attempt ${attempt + 1}/${PostHogRateLimiter.MAX_RETRIES}, ` +
                `consecutive: ${this.consecutiveRateLimits})`
              );
              await this.sleepFn(effectiveWait * 1000);
              break; // Break inner URL loop to retry
            }

            // All retries exhausted — return rate_limited (NOT an error/null)
            console.log(
              `[PostHogRateLimiter] Rate limited, all retries exhausted. ` +
              `Cooldown until ${retryAfter.toISOString()}`
            );
            return {
              ok: false,
              reason: 'rate_limited',
              retryAfter,
              detail: `Rate limited after ${PostHogRateLimiter.MAX_RETRIES} retries`,
            };
          }

          // Non-429, non-200 — try next URL pattern
          const errorText = await response.text().catch(() => 'No error body');
          console.log(
            `[PostHogRateLimiter] Failed (${response.status}): ${url} - ${errorText.substring(0, 200)}`
          );
        } catch (err) {
          console.log(`[PostHogRateLimiter] Network error for ${url}:`, err);
        }
      }
    }

    return {
      ok: false,
      reason: 'error',
      detail: 'All PostHog API patterns and retries failed',
    };
  }

  /**
   * Check if we're currently rate-limited.
   */
  isRateLimited(): boolean {
    if (!this.rateLimitedUntil) return false;
    return new Date() < this.rateLimitedUntil;
  }

  /**
   * Get the time until which we're rate-limited, or null if not.
   */
  getRateLimitedUntil(): Date | null {
    if (!this.rateLimitedUntil) return null;
    if (new Date() >= this.rateLimitedUntil) {
      this.rateLimitedUntil = null;
      return null;
    }
    return this.rateLimitedUntil;
  }

  /**
   * Reset rate limit state (e.g., when starting a new processing run).
   */
  reset(): void {
    this.rateLimitedUntil = null;
    this.consecutiveRateLimits = 0;
  }

  /**
   * Parse wait time from a 429 response body.
   */
  private async parseRateLimitWait(response: Response): Promise<number> {
    let waitSeconds = PostHogRateLimiter.DEFAULT_WAIT_SECONDS;
    try {
      const body = await response.text();
      const parsed = JSON.parse(body);
      if (parsed.detail) {
        const match = parsed.detail.match(/(\d+)\s*seconds/);
        if (match) {
          waitSeconds = Math.min(
            parseInt(match[1], 10),
            PostHogRateLimiter.MAX_WAIT_SECONDS
          );
        }
      }
    } catch {
      // Ignore parse errors, use default
    }
    return waitSeconds;
  }
}
