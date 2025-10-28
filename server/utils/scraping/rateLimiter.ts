/**
 * Rate Limiter for Ethical Web Scraping
 * 
 * Enforces minimum delay between requests to the same domain.
 * Prevents overwhelming target servers and respects crawl-delay directives.
 */

export class RateLimiter {
  private lastRequest: Map<string, number> = new Map();
  private readonly delayMs: number;

  /**
   * Create a new RateLimiter
   * @param delayMs Minimum delay between requests to same domain (default: 2000ms)
   */
  constructor(delayMs: number = 2000) {
    this.delayMs = delayMs;
  }

  /**
   * Wait if necessary to respect rate limit for a domain
   * @param domain The domain to check (e.g., "www.espn.com")
   */
  async waitIfNeeded(domain: string): Promise<void> {
    const lastTime = this.lastRequest.get(domain) || 0;
    const now = Date.now();
    const timeSinceLastRequest = now - lastTime;

    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequest.set(domain, Date.now());
  }

  /**
   * Reset rate limit tracking for a domain or all domains
   * @param domain Optional domain to reset, or undefined to reset all
   */
  reset(domain?: string): void {
    if (domain) {
      this.lastRequest.delete(domain);
    } else {
      this.lastRequest.clear();
    }
  }

  /**
   * Get the time until next allowed request for a domain
   * @param domain The domain to check
   * @returns Milliseconds until next request, or 0 if can request now
   */
  getTimeUntilNextRequest(domain: string): number {
    const lastTime = this.lastRequest.get(domain) || 0;
    const timeSinceLastRequest = Date.now() - lastTime;
    return Math.max(0, this.delayMs - timeSinceLastRequest);
  }
}

/**
 * Global rate limiter instance with 2-second delay
 * Use this for all web scraping operations
 */
export const globalRateLimiter = new RateLimiter(2000);
